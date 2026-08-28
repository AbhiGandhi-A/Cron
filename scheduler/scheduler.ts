import os from "node:os";
import { connectDb, closeDb, mongoose } from "./database";
import { CronJobModel } from "./models";
import { processJob } from "./worker";
import { SchedulerHeartbeatModel } from "./heartbeatModel";
import { JobExecutionModel } from "./jobExecutionModel";
import { logger } from "./logger";
import { computeNextRunAt } from "../src/lib/cron";

const POLL_INTERVAL = parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS || "10000", 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.SCHEDULER_HEARTBEAT_INTERVAL_MS || "30000", 10);
const MAX_CONCURRENT_JOBS = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_JOBS || "5", 10);
const LOCK_EXPIRY_MS = parseInt(process.env.SCHEDULER_LOCK_EXPIRY_MS || "900000", 10);
const MAX_CATCHUP_JOBS = parseInt(process.env.SCHEDULER_MAX_CATCHUP_JOBS || "50", 10);

const schedulerId = process.env.SCHEDULER_INSTANCE_ID || "scheduler-" + Date.now().toString(36);
const hostname = os.hostname();

let isPolling = false;
let shouldStop = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let activeJobs = 0;
const pendingJobs: string[] = [];

function log(component: string, message: string): void {
  logger.info(component, message);
}

async function updateHeartbeat(): Promise<void> {
  try {
    await SchedulerHeartbeatModel.findByIdAndUpdate(
      "scheduler",
      {
        status: "ONLINE",
        lastHeartbeat: new Date(),
        schedulerId,
        hostname,
        pid: process.pid,
        nodeVersion: process.version,
        $setOnInsert: { startedAt: new Date(), jobsProcessed: 0 },
      },
      { upsert: true }
    );
    logger.debug("scheduler", "Heartbeat updated");
  } catch (error) {
    logger.error("scheduler", "Failed to update heartbeat (isolated)", error);
  }
}

/**
 * Mark any JobExecution stuck in RUNNING/RETRY (from a crashed worker) as
 * FAILED so the execution history never shows a permanently-running job.
 */
async function recoverStuckExecutions(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - LOCK_EXPIRY_MS);
    const result = await JobExecutionModel.updateMany(
      {
        status: { $in: ["RUNNING", "RETRY"] },
        $or: [{ startedAt: { $lt: cutoff } }, { startedAt: { $exists: false } }],
      },
      {
        $set: {
          status: "FAILED",
          errorMessage: "Worker restarted; execution abandoned",
          completedAt: new Date(),
        },
      }
    );
    if (result.modifiedCount > 0) {
      logger.warn("scheduler", "Recovered " + result.modifiedCount + " stale execution record(s)");
    }
  } catch (error) {
    logger.error("scheduler", "Failed to recover stuck executions (isolated)", error);
  }
}

async function recoverStaleLocks(): Promise<void> {
  try {
    const staleThreshold = new Date(Date.now() - LOCK_EXPIRY_MS);
    const result = await CronJobModel.updateMany(
      {
        isRunning: true,
        $or: [{ lockedAt: { $lt: staleThreshold } }, { lockedAt: { $eq: null } }],
      },
      { $set: { isRunning: false, lockedAt: null, lockedBy: null } }
    );
    if (result.modifiedCount > 0) {
      logger.warn("scheduler", "Recovered " + result.modifiedCount + " stale job lock(s)");
    }
  } catch (error) {
    logger.error("scheduler", "Failed to recover stale locks (isolated)", error);
  }
}

/**
 * Initial missed-job sweep after startup. Runs at most MAX_CATCHUP_JOBS jobs
 * once each; any additional overdue jobs are rescheduled to their next
 * occurrence WITHOUT executing, avoiding an execution flood after a long outage.
 */
async function handleMissedJobs(): Promise<void> {
  try {
    const now = new Date();

    const dueJobs = await CronJobModel.find({
      isActive: true,
      $or: [{ nextRunAt: { $lte: now } }, { nextRunAt: null }],
    })
      .sort({ nextRunAt: 1 })
      .limit(MAX_CATCHUP_JOBS + 1)
      .lean();

    if (dueJobs.length === 0) return;

    const toRun = dueJobs.slice(0, MAX_CATCHUP_JOBS);
    const toReschedule = dueJobs.slice(MAX_CATCHUP_JOBS);

    log("scheduler", "Recovery: " + toRun.length + " job(s) to run once, " + toReschedule.length + " rescheduled without running");
    logger.info(
      "scheduler",
      "Recovery cap: " + MAX_CATCHUP_JOBS + " (set SCHEDULER_MAX_CATCHUP_JOBS to change)"
    );

    for (const job of toReschedule) {
      if (shouldStop) break;
      try {
        const next = computeNextRunAt(job.schedule, job.timezone || "UTC");
        await CronJobModel.findByIdAndUpdate(job._id, { nextRunAt: next });
        logger.info("scheduler", "Skipped missed job " + job.name + " (rescheduled to " + next.toISOString() + ")");
      } catch {
        // Leave nextRunAt as-is; normal cycle handles it.
      }
    }

    for (const job of toRun) {
      if (shouldStop) break;
      await processJobWithConcurrency(job._id.toString(), true);
    }
  } catch (error) {
    logger.error("scheduler", "Missed-job recovery failed (isolated)", error);
  }
}

async function processJobWithConcurrency(jobId: string, isCatchUp = false): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    pendingJobs.push(jobId);
    return;
  }

  activeJobs++;
  try {
    await processJob(jobId, isCatchUp);
  } catch (error) {
    logger.error("scheduler", "Job " + jobId + " processing failed (isolated)", error);
  } finally {
    activeJobs--;
    if (pendingJobs.length > 0 && activeJobs < MAX_CONCURRENT_JOBS) {
      const nextJobId = pendingJobs.shift()!;
      void processJobWithConcurrency(nextJobId);
    }
  }
}

export async function pollJobs(): Promise<void> {
  if (isPolling || shouldStop) return;
  isPolling = true;

  try {
    await recoverStaleLocks();

    const now = new Date();

    const dueJobs = await CronJobModel.find({
      isActive: true,
      $or: [{ nextRunAt: { $lte: now } }, { nextRunAt: null }],
    })
      .sort({ nextRunAt: 1 })
      .limit(MAX_CONCURRENT_JOBS * 4)
      .lean();

    if (dueJobs.length > 0) {
      log("scheduler", "Found " + dueJobs.length + " due job(s)");
    }

    for (const job of dueJobs) {
      if (shouldStop) break;
      await processJobWithConcurrency(job._id.toString());
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("scheduler", "Error polling jobs (isolated, loop continues)", error);

    // Surface the failure in the heartbeat so the dashboard can show it.
    try {
      await SchedulerHeartbeatModel.findByIdAndUpdate(
        "scheduler",
        {
          lastHeartbeat: new Date(),
          status: "ONLINE",
          lastError: msg.slice(0, 500),
        },
        { upsert: true }
      );
    } catch {}
  } finally {
    isPolling = false;
  }
}

export async function startScheduler(): Promise<void> {
  log("scheduler", "Starting");
  log("scheduler", "Connecting to MongoDB...");

  await connectDb();

  log("scheduler", "MongoDB connected");
  log("scheduler", "Worker started (id=" + schedulerId + ", host=" + hostname + ", pid=" + process.pid + ")");
  log(
    "scheduler",
    "Config: poll=" + POLL_INTERVAL + "ms, heartbeat=" + HEARTBEAT_INTERVAL + "ms, concurrent=" + MAX_CONCURRENT_JOBS + ", lockExpiry=" + LOCK_EXPIRY_MS + "ms, catchupCap=" + MAX_CATCHUP_JOBS
  );

  await updateHeartbeat();

  // Mark executions that may have been left running by a previous worker.
  await recoverStuckExecutions();
  await recoverStaleLocks();

  await handleMissedJobs();

  heartbeatTimer = setInterval(() => {
    updateHeartbeat().catch(() => {});
  }, HEARTBEAT_INTERVAL);

  const poll = async () => {
    if (shouldStop) return;
    await pollJobs();
    if (!shouldStop) {
      setTimeout(poll, POLL_INTERVAL);
    }
  };

  await poll();
  log("scheduler", "Scheduler loop started");
}

export async function stopScheduler(): Promise<void> {
  log("scheduler", "Graceful shutdown");
  shouldStop = true;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  let waitCount = 0;
  while (activeJobs > 0 && waitCount < 30) {
    log("scheduler", "Waiting for " + activeJobs + " active job(s) to finish...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    waitCount++;
  }

  if (activeJobs > 0) {
    logger.warn("scheduler", "Force stopping with " + activeJobs + " job(s) still active");
  }

  try {
    await SchedulerHeartbeatModel.findByIdAndUpdate("scheduler", {
      status: "OFFLINE",
      lastHeartbeat: new Date(),
    });
  } catch (error) {
    logger.error("scheduler", "Failed to update heartbeat on shutdown (isolated)", error);
  }

  await closeDb();
  log("scheduler", "Scheduler stopped");
}

export { mongoose };