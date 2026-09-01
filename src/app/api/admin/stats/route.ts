import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, getClientIp } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { User, CronJob, TemporaryMailbox, TemporaryEmail, AdminAuditLog, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();

    // Get total users
    const totalUsers = await User.countDocuments();

    // Get active users (logged in within last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = await User.countDocuments({
      lastLoginAt: { $gte: sevenDaysAgo },
    });

    // Get blocked users
    const blockedUsers = await User.countDocuments({ status: "blocked" });

    // Get total temp mailboxes
    const totalMailboxes = await TemporaryMailbox.countDocuments({
      status: "active",
    });

    const expiredMailboxes = 0;

    // Get total emails
    const totalEmails = await TemporaryEmail.countDocuments();

    // Get emails today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const emailsToday = await TemporaryEmail.countDocuments({
      createdAt: { $gte: today },
    });

    // Get mailboxes created today
    const mailboxesToday = await TemporaryMailbox.countDocuments({
      createdAt: { $gte: today },
    });

    // Get total cron jobs
    const totalJobs = await CronJob.countDocuments();

    // Get active jobs
    const activeJobs = await CronJob.countDocuments({ isActive: true });

    // Get today's executions
    const executionsToday = await JobExecution.countDocuments({
      startedAt: { $gte: today },
    });

    // Get failed executions today
    const failedToday = await JobExecution.countDocuments({
      startedAt: { $gte: today },
      status: "FAILED",
    });

    return NextResponse.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        blocked: blockedUsers,
      },
      tempMail: {
        mailboxes: totalMailboxes,
        expiredMailboxes: expiredMailboxes,
        totalEmails: totalEmails,
        emailsToday: emailsToday,
        mailboxesToday: mailboxesToday,
      },
      jobs: {
        total: totalJobs,
        active: activeJobs,
        executionsToday: executionsToday,
        failedToday: failedToday,
      },
      lastUpdated: new Date(),
    });
  } catch (error) {
    logError("admin-stats", "Failed to fetch stats", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
