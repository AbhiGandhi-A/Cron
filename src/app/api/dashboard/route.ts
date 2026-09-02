import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution, User } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`dashboard:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const userJobIds = await CronJob.distinct("_id", { userId });

    const [totalJobs, activeJobs, failedJobCount, recentExecutions] =
      await Promise.all([
        CronJob.countDocuments({ userId }),
        CronJob.countDocuments({ userId, isActive: true }),
        JobExecution.distinct("jobId", {
          status: "FAILED",
          jobId: { $in: userJobIds },
        }).then((ids) => ids.length),
        JobExecution.aggregate([
          {
            $lookup: {
              from: "cronjobs",
              localField: "jobId",
              foreignField: "_id",
              as: "job",
            },
          },
          { $unwind: "$job" },
          { $match: { "job.userId": new mongoose.Types.ObjectId(userId) } },
          { $sort: { startedAt: -1 } },
          { $limit: 10 },
          {
            $project: {
              id: "$_id",
              status: 1,
              httpStatus: 1,
              responseTime: 1,
              startedAt: 1,
              "job.name": 1,
              "job.url": 1,
              "job.method": 1,
            },
          },
        ]),
      ]);

    const user = await User.findById(userId).lean();
    let lifetimeTotal = user?.totalRuns ?? 0;
    let lifetimeSuccess = user?.successfulRuns ?? 0;
    if (lifetimeTotal === 0) {
      const legacyTotal = await JobExecution.countDocuments({
        jobId: { $in: userJobIds },
      });
      if (legacyTotal > 0) {
        const legacySuccess = await JobExecution.countDocuments({
          jobId: { $in: userJobIds },
          status: "SUCCESS",
        });
        await User.updateOne(
          { _id: userId, totalRuns: 0 },
          { $set: { totalRuns: legacyTotal, successfulRuns: legacySuccess } }
        );
        lifetimeTotal = legacyTotal;
        lifetimeSuccess = legacySuccess;
      }
    }

    // compute daily executions for the current user
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const dailyExecutions = await JobExecution.countDocuments({
      jobId: { $in: userJobIds },
      startedAt: { $gte: startOfDay },
    });

    const maxExecutions = user?.maxExecutions ?? 1000;
    const maxJobs = user?.maxJobs ?? 10;
    const dailyRemaining = Math.max(0, maxExecutions - dailyExecutions);
    const remainingJobs = Math.max(0, maxJobs - totalJobs);

    return NextResponse.json(
      {
        totalJobs,
        activeJobs,
        failedJobs: failedJobCount,
        successfulExecutions: lifetimeSuccess,
        totalExecutions: lifetimeTotal,
        successRate:
          lifetimeTotal > 0
            ? Math.round((lifetimeSuccess / lifetimeTotal) * 100)
            : 0,
        recentExecutions,
        dailyExecutions,
        dailyRemaining,
        maxExecutions,
        maxJobs,
        remainingJobs,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logError("dashboard", "Failed to load dashboard", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
