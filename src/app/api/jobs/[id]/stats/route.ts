import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`jobs:stats:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const job = await CronJob.findOne({ _id: id, userId }).lean();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobId = new mongoose.Types.ObjectId(id);

    const [buckets, avgResult, lastSuccess, lastFailure] = await Promise.all([
      JobExecution.aggregate([
        { $match: { jobId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      JobExecution.aggregate([
        { $match: { jobId, status: { $in: ["SUCCESS", "FAILED", "TIMEOUT"] } } },
        {
          $group: {
            _id: null,
            avgResponseTime: { $avg: "$responseTime" },
            total: { $sum: 1 },
          },
        },
      ]),
      JobExecution.findOne({ jobId: id, status: "SUCCESS" })
        .sort({ startedAt: -1 })
        .select({ startedAt: 1 })
        .lean(),
      JobExecution.findOne({ jobId: id, status: { $in: ["FAILED", "TIMEOUT"] } })
        .sort({ startedAt: -1 })
        .select({ startedAt: 1 })
        .lean(),
    ]);

    const countOf = (status: string): number => {
      const bucket = buckets.find((b) => b._id === status);
      return bucket ? bucket.count : 0;
    };

    const totalFinished = avgResult.length > 0 ? avgResult[0].total : 0;
    const success = countOf("SUCCESS");
    const failed = countOf("FAILED");
    const timeouts = countOf("TIMEOUT");

    return NextResponse.json({
      stats: {
        totalExecutions: countOf("RUNNING") + countOf("PENDING") + countOf("RETRY") + totalFinished,
        totalFinished,
        success,
        failed,
        timeouts,
        retries: countOf("RETRY"),
        successRate: totalFinished > 0 ? Math.round((success / totalFinished) * 1000) / 10 : null,
        avgResponseTime: avgResult.length > 0 && avgResult[0].avgResponseTime != null
          ? Math.round(avgResult[0].avgResponseTime)
          : null,
        lastExecutionAt: job.lastRunAt ? job.lastRunAt.toISOString() : null,
        lastSuccessAt: lastSuccess ? lastSuccess.startedAt.toISOString() : null,
        lastFailureAt: lastFailure ? lastFailure.startedAt.toISOString() : null,
        consecutiveFailures: job.consecutiveFailures || 0,
      },
    });
  } catch (error) {
    logError("job-stats", "Failed to get job stats", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}