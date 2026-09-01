import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { User, CronJob, TemporaryMailbox, TemporaryEmail, JobExecution } from "@/lib/models";
import { User, CronJob, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";
import { getCloudflareUsageData } from "@/lib/cloudflare-usage";
import { getRealtimeTempMailStats } from "@/lib/temp-mail/admin-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeNumber(value: unknown, fallback: number | null = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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
    const expiredMailboxes = await TemporaryMailbox.countDocuments({ status: "expired" });
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let cloudflare;
    try {
      cloudflare = await getCloudflareUsageData();
    } catch (cfErr) {
      logError("admin-stats", "Cloudflare usage fetch failed", cfErr);
      cloudflare = {
        connected: false,
        available: false,
        configured: false,
        account: null,
        zone: null,
        worker: null,
        d1: null,
        lastUpdated: new Date().toISOString(),
        message: "Failed to fetch Cloudflare usage",
        resources: [],
      };
    }
    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      totalJobs,
      activeJobs,
      executionsToday,
      failedToday,
      totalExecutions,
      tempMailStats,
      cloudflareData,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLoginAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ status: "blocked" }),
      CronJob.countDocuments(),
      CronJob.countDocuments({ isActive: true }),
      JobExecution.countDocuments({ startedAt: { $gte: today } }),
      JobExecution.countDocuments({ startedAt: { $gte: today }, status: "FAILED" }),
      JobExecution.countDocuments(),
      getRealtimeTempMailStats(),
      getCloudflareUsageData().catch((cfErr) => {
        logError("admin-stats", "Cloudflare usage fetch failed", cfErr);
        return null;
      }),
    ]);

    const cloudflare = cloudflareData || {
      connected: false,
      available: false,
      configured: false,
      account: null,
      zone: null,
      worker: null,
      d1: null,
      lastUpdated: new Date().toISOString(),
      message: "Failed to fetch Cloudflare usage",
      resources: [],
    };

    const resources = Array.isArray(cloudflare.resources) ? cloudflare.resources : [];

    return NextResponse.json({
      users: {
        total: safeNumber(totalUsers, 0),
        active: safeNumber(activeUsers, 0),
        blocked: safeNumber(blockedUsers, 0),
      },
      tempMail: {
        mailboxes: safeNumber(totalMailboxes, 0),
        expiredMailboxes: safeNumber(expiredMailboxes, 0),
        totalEmails: safeNumber(totalEmails, 0),
        emailsToday: safeNumber(emailsToday, 0),
        mailboxesToday: safeNumber(mailboxesToday, 0),
        mailboxes: safeNumber(tempMailStats.mailboxes.active, 0),
        totalMailboxes: safeNumber(tempMailStats.mailboxes.total, 0),
        expiredMailboxes: safeNumber(tempMailStats.mailboxes.expired, 0),
        deletedMailboxes: safeNumber(tempMailStats.mailboxes.deleted, 0),
        mailboxesToday: safeNumber(tempMailStats.mailboxes.createdToday, 0),
        totalEmails: safeNumber(tempMailStats.emails.total, 0),
        emailsToday: safeNumber(tempMailStats.emails.createdToday, 0),
        storageBytes: safeNumber(tempMailStats.storage.totalBytes, 0),
      },
      jobs: {
        total: safeNumber(totalJobs, 0),
        active: safeNumber(activeJobs, 0),
        executionsToday: safeNumber(executionsToday, 0),
        failedToday: safeNumber(failedToday, 0),
        totalExecutions: safeNumber(totalExecutions, 0),
      },
      cloudflare: {
        ...cloudflare,
        healthy: resources.filter((m) => m.status === "healthy").length,
        warning: resources.filter((m) => m.status === "warning").length,
        critical: resources.filter((m) => m.status === "critical").length,
        unavailable: resources.filter((m) => m.status === "unavailable").length,
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

