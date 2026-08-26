import { CronJobModel } from "./models";
import { JobExecutionModel } from "./jobExecutionModel";
import { SchedulerHeartbeatModel } from "./heartbeatModel";
import { executeWithRetry } from "./retry";
import { logger } from "./logger";
import cronParser from "cron-parser";
import { checkMonthlyExecutionLimit } from "./limits";
import { checkAndNotify } from "./notifications";

export async function processJob(jobId: string): Promise<void> {
  const lock = await CronJobModel.findOneAndUpdate(
    { _id: jobId, isActive: true, isRunning: false },
    { $set: { isRunning: true } },
    { new: true }
  ).lean();

  if (!lock) {
    return;
  }

  try {
    const limitCheck = await checkMonthlyExecutionLimit(lock.userId);
    if (!limitCheck.allowed) {
      logger.warn("limits", "Job " + lock.name + " skipped: monthly execution limit reached (" + limitCheck.current + "/" + limitCheck.max + ")");
      await CronJobModel.findByIdAndUpdate(jobId, {
        isRunning: false,
        lastRunAt: new Date(),
      });
      return;
    }

    logger.info("worker", "Processing job: " + lock.name);

    const result = await executeWithRetry({
      jobId: lock._id.toString(),
      url: lock.url,
      method: lock.method,
      headers: lock.headers,
      body: lock.body,
      timeout: lock.timeout,
      retryCount: lock.retryCount,
    });

    const status = result.httpStatus && result.httpStatus < 400 ? "SUCCESS" : "FAILED";

    let nextRunAt: Date | null = null;
    try {
      const interval = cronParser.parseExpression(lock.schedule);
      nextRunAt = interval.next().toDate();
    } catch (e) {
      logger.error("worker", "Failed to parse cron for " + lock.name + ", retrying in 60s", e);
      nextRunAt = new Date(Date.now() + 60 * 1000);
    }

    await CronJobModel.findByIdAndUpdate(jobId, {
      isRunning: false,
      lastRunAt: new Date(),
      nextRunAt,
    });

    logger.info(
      "worker",
      "Job " + lock.name + " completed: " + status + " (HTTP " + (result.httpStatus || "N/A") + ")"
    );

    try {
      await checkAndNotify(
        {
          _id: lock._id.toString(),
          name: lock.name,
          notifications: (lock as unknown as Record<string, unknown>).notifications as {
            enabled: boolean;
            url: string;
            failureThreshold: number;
            notifyOnRecovery: boolean;
          },
          consecutiveFailures: ((lock as unknown as Record<string, unknown>).consecutiveFailures as number) ?? 0,
        },
        status,
        result.httpStatus ?? null
      );
    } catch {}

    await SchedulerHeartbeatModel.findByIdAndUpdate(
      "scheduler",
      {
        $inc: { jobsProcessed: 1 },
        lastExecutionAt: new Date(),
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error("worker", "Unexpected error processing " + lock.name, error);

    let nextRunAt: Date | null = null;
    try {
      const interval = cronParser.parseExpression(lock.schedule);
      nextRunAt = interval.next().toDate();
    } catch (e) {
      nextRunAt = new Date(Date.now() + 60 * 1000);
    }

    await CronJobModel.findByIdAndUpdate(jobId, {
      isRunning: false,
      lastRunAt: new Date(),
      nextRunAt,
    });

    try {
      await checkAndNotify(
        {
          _id: lock._id.toString(),
          name: lock.name,
          notifications: (lock as unknown as Record<string, unknown>).notifications as {
            enabled: boolean;
            url: string;
            failureThreshold: number;
            notifyOnRecovery: boolean;
          },
          consecutiveFailures: ((lock as unknown as Record<string, unknown>).consecutiveFailures as number) ?? 0,
        },
        "FAILED",
        null
      );
    } catch {}
  }
}
