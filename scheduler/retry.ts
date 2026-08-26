import { JobExecutionModel } from "./jobExecutionModel";
import { executeJobRequest, ExecutionResult } from "./executor";
import { logger } from "./logger";
import mongoose from "mongoose";
import { sanitizeForLog, sanitizeUrlForLog } from "../src/lib/security-core";

export interface RetryConfig {
  jobId: string;
  url: string;
  method: string;
  headers: unknown;
  body: unknown;
  timeout: number;
  retryCount: number;
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
        { status: "RETRY" }
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    const sanitizedBody = sanitizeBodyForStorage(config.body);
    const execution = await JobExecutionModel.create({
      jobId: new mongoose.Types.ObjectId(config.jobId),
      status: "RUNNING",
      requestUrl: sanitizeUrlForLog(config.url),
      requestBody: sanitizedBody,
      retryNumber: attempt,
    });

    const result = await executeJobRequest({
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: config.body,
      timeout: config.timeout,
    });

    const status = result.httpStatus && result.httpStatus < 400
      ? "SUCCESS"
      : "FAILED";

    const sanitizedErrorMessage = result.errorMessage
      ? sanitizeForLog(result.errorMessage, 1000)
      : null;

    await JobExecutionModel.findByIdAndUpdate(execution._id, {
      status,
      httpStatus: result.httpStatus,
      responseTime: result.responseTime,
      errorMessage: sanitizedErrorMessage,
      responseBody: result.responseBody,
      completedAt: new Date(),
    });

    lastResult = result;

    if (status === "SUCCESS") {
      return result;
    }

    if (attempt < config.retryCount) {
      logger.warn(
        "retry",
        "Job " + config.jobId + " failed (attempt " + (attempt + 1) + "), retrying..."
      );
    }
  }

  return lastResult!;
}

function sanitizeBodyForStorage(body: unknown): unknown {
  if (!body) return null;
  if (typeof body === "string") {
    return sanitizeForLog(body, 2048);
  }
  if (typeof body === "object") {
    try {
      return JSON.parse(sanitizeForLog(JSON.stringify(body), 2048));
    } catch {
      return null;
    }
  }
  return body;
}
