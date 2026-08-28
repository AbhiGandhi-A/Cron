import { CronJobModel } from "./models";
import { JobExecutionModel } from "./jobExecutionModel";
import { SchedulerHeartbeatModel } from "./heartbeatModel";
import { executeWithRetry } from "./retry";
import { logger } from "./logger";
import { computeNextRunAt } from "../src/lib/cron";
import { checkMonthlyExecutionLimit } from "./limits";
import { checkAndNotify } from "./notifications";

const LOCK_EXPIRY_MS = parseInt(process.env.SCHEDULER_LOCK_EXPIRY_MS || "900000", 10);

function schedulerId(): string {
  return process.env.SCHEDULER_INSTANCE_ID || "scheduler";
}

async function releaseJobLock(
  jobId: string,
  nextRunAt: Date | null,
  status: string,
  httpStatus: number | null
): Promise<void> {
  await CronJobModel.findByIdAndUpdate(jobId, {
    $set: {
      isRunning: false,
      lockedAt: null,
      lockedBy: null,
      lastRunAt: new Date(),
      nextRunAt,
    },
  });

  try {
    await SchedulerHeartbeatModel.findByIdAndUpdate(
      "scheduler",
      {
        $inc: { jobsProcessed: 1 },
        lastExecutionAt: new Date(),
        lastExecutionStatus: status,
        lastExecutionHttpStatus: httpStatus,
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error("worker", "Failed to update heartbeat execution stats", error);
  }
}

export async function processJob(jobId: string, isCatchUp = false): Promise<void> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - LOCK_EXPIRY_MS);

  // Atomic claim: only succeeds if not currently locked (or lock expired).
  const claimResult = await CronJobModel.findOneAndUpdate(
    {
      _id: jobId,
      isActive: true,
      $or: [{ lockedAt: null }, { lockedAt: { $lte: lockExpiry } }],
    },
    {
      $set: {
        isRunning: true,
        lockedAt: now,
        lockedBy: schedulerId(),
      },
    },
    { new: true }
  ).lean();

  if (!claimResult) {
    logger.debug("worker", "Job " + jobId + " is already locked, skipping");
    return;
  }

  const job = claimResult;

  // Initialize nextRunAt for legacy jobs that never had one computed.
  if (!job.nextRunAt) {
    try {
      await CronJobModel.findByIdAndUpdate(jobId, {
        nextRunAt: computeNextRunAt(job.schedule, job.timezone || "UTC"),
      });
    } catch {
      // Leave null; it will be computed on the next cycle.
    }
  }

  try {
    const limitCheck = await checkMonthlyExecutionLimit(job.userId);
    if (!limitCheck.allowed) {
      logger.warn("limits", "Job " + job.name + " skipped: monthly execution limit reached (" + limitCheck.current + "/" + limitCheck.max + ")");
      await releaseJobLock(jobId, null, "SKIPPED_LIMIT", null);
      return;
    }

    logger.info(
      "worker",
      "Claimed job " + jobId + (isCatchUp ? " (catch-up)" : "") + ": " + job.name
    );
    logger.info("worker", "Executing job " + jobId + " -> " + job.method + " " + job.url);

    const result = await executeWithRetry({
      jobId,
      url: job.url,
      method: job.method,
      headers: job.headers,
      body: job.body,
      bodyType: job.bodyType,
      queryParams: job.queryParams || null,
      timeout: job.timeout,
      retryCount: job.retryCount,
      expectedStatus: job.expectedStatus ?? null,
      expectedResponseRegex: job.expectedResponseRegex ?? null,
    });

    const status = result.status;

    let nextRunAt: Date | null = null;
    try {
      nextRunAt = computeNextRunAt(job.schedule, job.timezone || "UTC");
    } catch (error) {
      logger.error("worker", "Failed to parse cron for " + job.name + ", retrying in 60s", error);
      nextRunAt = new Date(Date.now() + 60 * 1000);
    }

    await releaseJobLock(jobId, nextRunAt, status, result.httpStatus);

    logger.info(
      "worker",
      "Job " + jobId + " completed: " + status + " (HTTP " + (result.httpStatus || "N/A") + " in " + result.responseTime + "ms)"
    );
    logger.info("worker", "Next run for " + jobId + ": " + (nextRunAt ? nextRunAt.toISOString() : "unknown"));

    try {
      await checkAndNotify(
        {
          _id: job._id.toString(),
          name: job.name,
          notifications: job.notifications,
          consecutiveFailures: job.consecutiveFailures ?? 0,
        },
        status,
        result.httpStatus ?? null
      );
    } catch (error) {
      logger.error("worker", "Notification handling failed (isolated)", error);
    }
  } catch (error) {
    logger.error("worker", "Unexpected error processing " + job.name + " (isolated, scheduler continues)", error);

    let nextRunAt: Date | null = null;
    try {
      nextRunAt = computeNextRunAt(job.schedule, job.timezone || "UTC");
    } catch {
      nextRunAt = new Date(Date.now() + 60 * 1000);
    }

    try {
      await releaseJobLock(jobId, nextRunAt, "FAILED", null);
    } catch (releaseError) {
      logger.error("worker", "Failed to release lock for " + jobId + " after error", releaseError);
    }

    try {
      await checkAndNotify(
        {
          _id: job._id.toString(),
          name: job.name,
          notifications: job.notifications,
          consecutiveFailures: job.consecutiveFailures ?? 0,
        },
        "FAILED",
        null
      );
    } catch (notifyError) {
      logger.error("worker", "Notification handling failed (isolated)", notifyError);
    }
  }
}