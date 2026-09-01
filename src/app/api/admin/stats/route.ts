import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { User, CronJob, TemporaryMailbox, TemporaryEmail, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";

function safeNumber(value: unknown, fallback: number | null = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

interface CloudflareResourceMetric {
  name: string;
  label: string;
  current: number | null;
  limit: number;
  remaining: number;
  percentage: number;
  status: "healthy" | "warning" | "critical" | "unavailable";
  resetPeriod: string;
  unit?: string;
}

interface CloudflareUsageResponse {
  resources: CloudflareResourceMetric[];
  healthy: number;
  warning: number;
  critical: number;
  unavailable: number;
  timestamp: string;
}

function formatCloudflareUsage(rawData: any): CloudflareUsageResponse | null {
  if (!rawData || typeof rawData !== "object" || !rawData.resources) {
    return null;
  }

  const metrics: CloudflareResourceMetric[] = [];
  let healthy = 0, warning = 0, critical = 0, unavailable = 0;

  if (rawData.resources.worker_requests) {
    const wr = rawData.resources.worker_requests;
    const current = safeNumber(wr.used, null);
    const limit = safeNumber(wr.actualLimit, 100000) || 100000;
    const remaining = Math.max(0, limit - (current ?? 0));
    const percentage = limit > 0 ? ((current ?? 0) / limit) * 100 : 0;
    let status: "healthy" | "warning" | "critical" | "unavailable" = "healthy";
    
    if (current === null) {
      status = "unavailable";
      unavailable += 1;
    } else if (percentage >= 95) {
      status = "critical";
      critical += 1;
    } else if (percentage >= 90) {
      status = "warning";
      warning += 1;
    } else {
      healthy += 1;
    }

    metrics.push({
      name: "worker_requests",
      label: "Worker Requests",
      current,
      limit,
      remaining,
      percentage,
      status,
      resetPeriod: "Daily",
      unit: "/day",
    });
  }

  if (rawData.resources.d1_reads) {
    const d1r = rawData.resources.d1_reads;
    const current = safeNumber(d1r.used, null);
    const limit = safeNumber(d1r.actualLimit, 5000000) || 5000000;
    const remaining = Math.max(0, limit - (current ?? 0));
    const percentage = limit > 0 ? ((current ?? 0) / limit) * 100 : 0;
    let status: "healthy" | "warning" | "critical" | "unavailable" = "healthy";
    
    if (current === null) {
      status = "unavailable";
      unavailable += 1;
    } else if (percentage >= 95) {
      status = "critical";
      critical += 1;
    } else if (percentage >= 90) {
      status = "warning";
      warning += 1;
    } else {
      healthy += 1;
    }

    metrics.push({
      name: "d1_reads",
      label: "D1 Rows Read",
      current,
      limit,
      remaining,
      percentage,
      status,
      resetPeriod: "Daily",
      unit: "/day",
    });
  }

  if (rawData.resources.d1_writes) {
    const d1w = rawData.resources.d1_writes;
    const current = safeNumber(d1w.used, null);
    const limit = safeNumber(d1w.actualLimit, 100000) || 100000;
    const remaining = Math.max(0, limit - (current ?? 0));
    const percentage = limit > 0 ? ((current ?? 0) / limit) * 100 : 0;
    let status: "healthy" | "warning" | "critical" | "unavailable" = "healthy";
    
    if (current === null) {
      status = "unavailable";
      unavailable += 1;
    } else if (percentage >= 95) {
      status = "critical";
      critical += 1;
    } else if (percentage >= 90) {
      status = "warning";
      warning += 1;
    } else {
      healthy += 1;
    }

    metrics.push({
      name: "d1_writes",
      label: "D1 Rows Written",
      current,
      limit,
      remaining,
      percentage,
      status,
      resetPeriod: "Daily",
      unit: "/day",
    });
  }

  return {
    resources: metrics,
    healthy,
    warning,
    critical,
    unavailable,
    timestamp: new Date().toISOString(),
  };
}

async function fetchCloudflareUsage(): Promise<CloudflareUsageResponse | null> {
  const workerUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.cronjobs.site";
  const secret = process.env.TEMP_MAIL_SERVICE_SECRET;

  if (!secret) return null;

  try {
    const res = await fetch(`${workerUrl}/api/temp-mail/usage`, {
      headers: {
        "x-temp-mail-service": secret,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    return formatCloudflareUsage(data);
  } catch {
    return null;
  }
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
      cloudflare,
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
