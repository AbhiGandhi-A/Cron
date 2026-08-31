import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution, User } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, redactHeaders, sanitizeUrlForLog, validateObjectId, validateOutboundUrl } from "@/lib/security";
import { executeHttpRequest, sanitizeRequestBodyForStorage, ExecutionResult } from "@/lib/execution-core";
import { computeNextRunAt } from "@/lib/cron";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

const LOCK_EXPIRY_MS = 5 * 60 * 1000;
const STORED_RESPONSE_BODY_BYTES = 20_000;

async function executeWithRetry(
  job: {
    _id: string;
    url: string;
    method: string;
    headers: Record<string, string> | null;
    body: unknown;
    bodyType: "none" | "json" | "form" | "text" | null;
    queryParams: Record<string, string> | null;
    timeout: number;
    retryCount: number;
    expectedStatus: number | null;
    expectedResponseRegex: string | null;
    timezone: string;
    schedule: string;
  },
  retryNumber: number = 0
): Promise<ExecutionResult> {
  await connectDb();

  const execution = await JobExecution.create({
    jobId: job._id,
    status: "RUNNING",
    requestUrl: sanitizeUrlForLog(job.url),
    requestBody: sanitizeRequestBodyForStorage(job.body),
    requestMethod: job.method,
    requestHeaders: redactHeaders(job.headers),
    queryParams: job.queryParams || null,
    retryNumber,
    triggeredBy: "manual",
  });

  const result = await executeHttpRequest({
    url: job.url,
    method: job.method,
    headers: job.headers,
    body: job.body,
    bodyType: job.bodyType,
    queryParams: job.queryParams,
    timeout: job.timeout,
    expectedStatus: job.expectedStatus,
    expectedResponseRegex: job.expectedResponseRegex,
  });

  const status = result.status;

  await JobExecution.findByIdAndUpdate(execution._id, {
    status,
    httpStatus: result.httpStatus,
    responseTime: result.responseTime,
    errorMessage: result.errorMessage,
    responseBody: result.responseBody
      ? result.responseBody.substring(0, STORED_RESPONSE_BODY_BYTES)
      : null,
    responseHeaders: result.responseHeaders,
    responseSize: result.responseSize,
    completedAt: new Date(),
  });

  if (result.status !== "SUCCESS" && retryNumber < job.retryCount) {
    const waitTime = Math.min(1000 * Math.pow(2, retryNumber), 30000);

    await JobExecution.updateMany(
      { jobId: job._id, status: "RUNNING", retryNumber },
      { status: "RETRY" }
    );

    await new Promise((resolve) => setTimeout(resolve, waitTime));
    return executeWithRetry(job, retryNumber + 1);
  }

  return result;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = enforceRateLimit(`jobs:trigger:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (rateLimited) return rateLimited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    // Atomic claim — same lock semantics the scheduler uses. If the job is
    // locked by a running scheduled execution, this returns null and the
    // manual run is rejected instead of double-executing.
    const staleThreshold = new Date(Date.now() - LOCK_EXPIRY_MS);
    const lock = await CronJob.findOneAndUpdate(
      {
        _id: id,
        userId,
        $or: [{ lockedAt: null }, { lockedAt: { $lt: staleThreshold } }],
      },
      {
        $set: {
          isRunning: true,
          lockedAt: new Date(),
          lockedBy: "manual",
          lastRunAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    if (!lock) {
      const current = await CronJob.findOne({ _id: id, userId }).lean();
      if (!current) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Job is already running" },
        { status: 409 }
      );
    }

    await validateOutboundUrl(lock.url);

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const user = await User.findById(userId).lean();
    const maxExecutions = user?.maxExecutions ?? 1000;
    const currentDayCount = await JobExecution.countDocuments({
      startedAt: { $gte: dayStart },
      status: { $in: ["SUCCESS", "FAILED"] },
    });
    if (currentDayCount >= maxExecutions) {
      await CronJob.findByIdAndUpdate(id, {
        isRunning: false,
        lockedAt: null,
        lockedBy: null,
      });
      return NextResponse.json(
        { error: "Daily execution limit reached", current: currentDayCount, max: maxExecutions },
        { status: 429 }
      );
    }

    const result = await executeWithRetry({
      _id: lock._id.toString(),
      url: lock.url,
      method: lock.method,
      headers: lock.headers,
      body: lock.body,
      bodyType: lock.bodyType,
      queryParams: lock.queryParams || null,
      timeout: lock.timeout,
      retryCount: lock.retryCount,
      expectedStatus: lock.expectedStatus ?? null,
      expectedResponseRegex: lock.expectedResponseRegex ?? null,
      timezone: lock.timezone || "UTC",
      schedule: lock.schedule,
    });

    const finalStatus = result.status;

    let nextRunAt: Date | null = null;
    try {
      nextRunAt = computeNextRunAt(lock.schedule, lock.timezone || "UTC");
    } catch {
      nextRunAt = null;
    }

    await CronJob.findByIdAndUpdate(id, {
      isRunning: false,
      lockedAt: null,
      lockedBy: null,
      lastRunAt: new Date(),
      nextRunAt,
    });

    return NextResponse.json({
      execution: {
        status: finalStatus,
        httpStatus: result.httpStatus,
        responseTime: result.responseTime,
        errorMessage: result.errorMessage,
        responseBody: result.responseBody,
        responseHeaders: result.responseHeaders,
        responseSize: result.responseSize,
        requestUrl: lock.url,
        requestMethod: lock.method,
        requestHeaders: redactHeaders(lock.headers),
        queryParams: lock.queryParams || null,
        requestBody: lock.body,
        startedAt: new Date(Date.now() - result.responseTime).toISOString(),
        completedAt: new Date().toISOString(),
      },
      usage: {
        current: currentDayCount + 1,
        max: maxExecutions,
      },
    });
  } catch (error) {
    logError("job-trigger", "Failed to trigger job", error);
    try {
      const { id } = await params;
      if (validateObjectId(id)) {
        await connectDb();
        await CronJob.findByIdAndUpdate(id, {
          isRunning: false,
          lockedAt: null,
          lockedBy: null,
        });
      }
    } catch {
      // Best effort reset
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}