import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution, User } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, redactHeaders, sanitizeObjectForStorage, sanitizeUrlForLog, validateObjectId, validateOutboundUrl } from "@/lib/security";
import cronParser from "cron-parser";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

const STALE_RUNNING_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_RESPONSE_BODY_BYTES = 50_000;
const MAX_ERROR_MESSAGE_BYTES = 1000;

async function executeJobRequest(config: {
  url: string;
  method: string;
  headers: unknown;
  body: unknown;
  timeout: number;
  queryParams: Record<string, string> | null;
}): Promise<{
  httpStatus: number | null;
  responseTime: number;
  errorMessage: string | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  responseSize: number;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  const headers: Record<string, string> = {};
  if (config.headers && typeof config.headers === "object") {
    Object.entries(config.headers as Record<string, string>).forEach(
      ([key, value]) => {
        headers[key] = String(value);
      }
    );
    if (!headers["Content-Type"] && config.method !== "GET") {
      headers["Content-Type"] = "application/json";
    }
  }

  let fullUrl = config.url;
  if (config.queryParams && Object.keys(config.queryParams).length > 0) {
    const urlObj = new URL(config.url);
    for (const [key, value] of Object.entries(config.queryParams)) {
      urlObj.searchParams.set(key, value);
    }
    fullUrl = urlObj.toString();
  }

  const startTime = Date.now();
  try {
    const fetchOptions: RequestInit = {
      method: config.method,
      headers,
      signal: controller.signal,
      redirect: "manual",
    };

    if (config.method !== "GET" && config.body) {
      fetchOptions.body = JSON.stringify(config.body);
    }

    const response = await fetch(fullUrl, fetchOptions);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        try {
          const redirectUrl = new URL(location, fullUrl);
          await validateOutboundUrl(redirectUrl.toString());
        } catch {
          clearTimeout(timeoutId);
          return {
            httpStatus: response.status,
            responseTime: Date.now() - startTime,
            errorMessage: "Redirect to blocked destination",
            responseBody: null,
            responseHeaders: null,
            responseSize: 0,
          };
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const rawBody = await response.text();
    const responseBody = rawBody.length > MAX_RESPONSE_BODY_BYTES
      ? rawBody.substring(0, MAX_RESPONSE_BODY_BYTES)
      : rawBody;

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    clearTimeout(timeoutId);

    return {
      httpStatus: response.status,
      responseTime,
      errorMessage: null,
      responseBody,
      responseHeaders: respHeaders,
      responseSize: rawBody.length,
    };
  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;
    clearTimeout(timeoutId);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      httpStatus: null,
      responseTime,
      errorMessage: errorMessage.substring(0, MAX_ERROR_MESSAGE_BYTES),
      responseBody: null,
      responseHeaders: null,
      responseSize: 0,
    };
  }
}

async function executeWithRetry(
  job: {
    _id: string;
    url: string;
    method: string;
    headers: unknown;
    body: unknown;
    timeout: number;
    retryCount: number;
    queryParams: Record<string, string> | null;
  },
  retryNumber: number = 0
): Promise<{
  httpStatus: number | null;
  responseTime: number;
  errorMessage: string | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  responseSize: number;
}> {
  await connectDb();

  const execution = await JobExecution.create({
    jobId: job._id,
    status: "RUNNING",
    requestUrl: sanitizeUrlForLog(job.url),
    requestBody: sanitizeObjectForStorage(job.body),
    requestMethod: job.method,
    requestHeaders: redactHeaders(job.headers as Record<string, string> | null),
    queryParams: job.queryParams || null,
    retryNumber,
  });

  const result = await executeJobRequest({
    url: job.url,
    method: job.method,
    headers: job.headers,
    body: job.body,
    timeout: job.timeout,
    queryParams: job.queryParams,
  });

  const status = result.httpStatus && result.httpStatus < 400 ? "SUCCESS" : "FAILED";

  await JobExecution.findByIdAndUpdate(execution._id, {
    status,
    httpStatus: result.httpStatus,
    responseTime: result.responseTime,
    errorMessage: result.errorMessage,
    responseBody: result.responseBody ? result.responseBody.substring(0, 20000) : null,
    responseHeaders: redactHeaders(result.responseHeaders),
    responseSize: result.responseSize,
    completedAt: new Date(),
  });

  if (status === "FAILED" && retryNumber < job.retryCount) {
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

    const staleThreshold = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS);
    const lock = await CronJob.findOneAndUpdate(
      {
        _id: id,
        userId,
        $or: [
          { isRunning: false },
          { isRunning: true, lastRunAt: { $lt: staleThreshold } },
        ],
      },
      { $set: { isRunning: true, lastRunAt: new Date() } },
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
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const user = await User.findById(userId).lean();
    const maxExecutions = user?.maxExecutions ?? 1000;
    const currentMonthCount = await JobExecution.countDocuments({
      startedAt: { $gte: monthStart },
      status: { $in: ["SUCCESS", "FAILED"] },
    });
    if (currentMonthCount >= maxExecutions) {
      await CronJob.findByIdAndUpdate(id, { isRunning: false });
      return NextResponse.json(
        { error: "Monthly execution limit reached", current: currentMonthCount, max: maxExecutions },
        { status: 429 }
      );
    }

    const result = await executeWithRetry({
      _id: lock._id.toString(),
      url: lock.url,
      method: lock.method,
      headers: lock.headers,
      body: sanitizeObjectForStorage(lock.body),
      timeout: lock.timeout,
      retryCount: lock.retryCount,
      queryParams: lock.queryParams || null,
    });

    const finalStatus = result.httpStatus && result.httpStatus < 400 ? "SUCCESS" : "FAILED";

    let nextRunAt: Date | null = null;
    try {
      const interval = cronParser.parseExpression(lock.schedule);
      nextRunAt = interval.next().toDate();
    } catch {
      nextRunAt = null;
    }

    await CronJob.findByIdAndUpdate(id, {
      isRunning: false,
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
        requestHeaders: redactHeaders(lock.headers as Record<string, string> | null),
        queryParams: lock.queryParams || null,
        requestBody: lock.body,
        startedAt: new Date(Date.now() - result.responseTime).toISOString(),
        completedAt: new Date().toISOString(),
      },
      usage: {
        current: currentMonthCount + 1,
        max: maxExecutions,
      },
    });
  } catch (error) {
    logError("job-trigger", "Failed to trigger job", error);
    try {
      const { id } = await params;
      if (validateObjectId(id)) {
        await connectDb();
        await CronJob.findByIdAndUpdate(id, { isRunning: false });
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
