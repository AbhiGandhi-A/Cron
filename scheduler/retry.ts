import { JobExecutionModel } from "./jobExecutionModel";
import { logger } from "./logger";
import mongoose from "mongoose";
import {
  executeHttpRequest,
  sanitizeRequestBodyForStorage,
  type ExecutionResult,
} from "../src/lib/execution-core";
import { redactHeaders, sanitizeForLog, sanitizeUrlForLog } from "../src/lib/security-core";

export interface RetryConfig {
  jobId: string;
  url: string;
  method: string;
  headers: Record<string, string> | null;
  body: unknown;
  bodyType: "none" | "json" | "form" | "text" | null;
  queryParams: Record<string, string> | null;
  timeout: number;
  retryCount: number;
  expectedStatus?: number | null;
  expectedResponseRegex?: string | null;
}

const MAX_EXECUTION_LOGS = 20;

async function pruneExecutionLogs(jobId: string): Promise<void> {
  try {
    const keep = await JobExecutionModel.find({ jobId })
      .sort({ startedAt: -1 })
      .limit(MAX_EXECUTION_LOGS)
      .select("_id")
      .lean();
    if (keep.length >= MAX_EXECUTION_LOGS) {
      const keepIds = keep.map((e) => e._id);
      await JobExecutionModel.deleteMany({ jobId, _id: { $nin: keepIds } });
    }
  } catch (error) {
    logger.error("retry", "Failed to prune execution logs for job " + jobId, error);
  }
}

export async function executeWithRetry(
  config: RetryConfig
): Promise<ExecutionResult> {
  let lastResult: ExecutionResult | null = null;

  for (let attempt = 0; attempt <= config.retryCount; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      logger.info(
        "retry",
        "Retry " + attempt + "/" + config.retryCount + " for job " + config.jobId + " after " + waitTime + "ms"
      );

      await JobExecutionModel.updateMany(
        {
          jobId: new mongoose.Types.ObjectId(config.jobId),
          status: "RUNNING",
          retryNumber: attempt - 1,
        },
        { $set: { status: "RETRY" } }
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    const execution = await JobExecutionModel.create({
      jobId: new mongoose.Types.ObjectId(config.jobId),
      status: "RUNNING",
      requestUrl: sanitizeUrlForLog(config.url),
      requestBody: sanitizeRequestBodyForStorage(config.body),
      requestMethod: config.method,
      requestHeaders: redactHeaders(config.headers),
      queryParams: config.queryParams || null,
      retryNumber: attempt,
      triggeredBy: "schedule",
    });

    const result = await executeHttpRequest({
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: config.body,
      bodyType: config.bodyType,
      queryParams: config.queryParams,
      timeout: config.timeout,
      expectedStatus: config.expectedStatus,
      expectedResponseRegex: config.expectedResponseRegex,
    });

    const sanitizedErrorMessage = result.errorMessage
      ? sanitizeForLog(result.errorMessage, 1000)
      : null;

    await JobExecutionModel.findByIdAndUpdate(execution._id, {
      $set: {
        status: result.status,
        httpStatus: result.httpStatus,
        responseTime: result.responseTime,
        errorMessage: sanitizedErrorMessage,
        responseBody: result.responseBody
          ? result.responseBody.substring(0, 20000)
          : null,
        responseHeaders: result.responseHeaders,
        responseSize: result.responseSize,
        completedAt: new Date(),
      },
    });

    lastResult = result;

    if (result.status === "SUCCESS") {
      await pruneExecutionLogs(config.jobId);
      return result;
    }

    if (attempt < config.retryCount) {
      logger.warn(
        "retry",
        "Job " + config.jobId + " failed (" + result.status + ", attempt " + (attempt + 1) + "), retrying..."
      );
    }
  }

  await pruneExecutionLogs(config.jobId);
  return lastResult!;
}