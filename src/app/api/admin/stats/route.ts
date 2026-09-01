import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { User, CronJob, TemporaryMailbox, TemporaryEmail, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";
import { getCloudflareUsageData } from "@/lib/cloudflare-usage";

function safeNumber(value: unknown, fallback: number | null = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function fetchCloudflareUsage() {
  return getCloudflareUsageData();
}

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();

    const totalUsers = await User.countDocuments();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = await User.countDocuments({
      lastLoginAt: { $gte: sevenDaysAgo },
    });
    const blockedUsers = await User.countDocuments({ status: "blocked" });

    const totalMailboxes = await TemporaryMailbox.countDocuments({ status: "active" });
    const expiredMailboxes = 0;
    const totalEmails = await TemporaryEmail.countDocuments();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const emailsToday = await TemporaryEmail.countDocuments({
      createdAt: { $gte: today },
    });
    const mailboxesToday = await TemporaryMailbox.countDocuments({
      createdAt: { $gte: today },
      status: { $ne: "deleted" },
    });

    const totalJobs = await CronJob.countDocuments();
    const activeJobs = await CronJob.countDocuments({ isActive: true });
    const executionsToday = await JobExecution.countDocuments({
      startedAt: { $gte: today },
    });
    const failedToday = await JobExecution.countDocuments({
      startedAt: { $gte: today },
      status: "FAILED",
    });
    const totalExecutions = await JobExecution.countDocuments();

    const cloudflare = await fetchCloudflareUsage();

    return NextResponse.json({
      users: {
        total: safeNumber(totalUsers),
        active: safeNumber(activeUsers),
        blocked: safeNumber(blockedUsers),
      },
      tempMail: {
        mailboxes: safeNumber(totalMailboxes),
        expiredMailboxes: safeNumber(expiredMailboxes),
        totalEmails: safeNumber(totalEmails),
        emailsToday: safeNumber(emailsToday),
        mailboxesToday: safeNumber(mailboxesToday),
      },
      jobs: {
        total: safeNumber(totalJobs),
        active: safeNumber(activeJobs),
        executionsToday: safeNumber(executionsToday),
        failedToday: safeNumber(failedToday),
        totalExecutions: safeNumber(totalExecutions),
      },
      cloudflare: {
        ...cloudflare,
        healthy: cloudflare.resources.filter((m) => m.status === "healthy").length,
        warning: cloudflare.resources.filter((m) => m.status === "warning").length,
        critical: cloudflare.resources.filter((m) => m.status === "critical").length,
        unavailable: cloudflare.resources.filter((m) => m.status === "unavailable").length,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logError("admin-stats", "Failed to fetch stats", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
