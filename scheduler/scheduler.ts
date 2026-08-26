import { connectDb, closeDb } from "./database";
import { CronJobModel } from "./models";
import { processJob } from "./worker";
import { SchedulerHeartbeatModel } from "./heartbeatModel";
import { logger } from "./logger";

const POLL_INTERVAL = parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS || "10000");
const HEARTBEAT_INTERVAL = parseInt(process.env.SCHEDULER_HEARTBEAT_INTERVAL_MS || "30000");
const MAX_CONCURRENT_JOBS = parseInt(process.env.SCHEDULER_MAX_CONCURRENT_JOBS || "5", 10);

let isPolling = false;
let shouldStop = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let activeJobs = 0;
const pendingJobs: string[] = [];

async function handleMissedJobs(): Promise<void> {
  const now = new Date();

  const missedJobs = await CronJobModel.find({
    isActive: true,
    isRunning: false,
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1 })
    .lean();

  if (missedJobs.length > 0) {
    logger.info(
      "scheduler",
      "Found " + missedJobs.length + " missed job(s), running once after recovery"
    );
  }

  for (const job of missedJobs) {
    if (shouldStop) break;
    logger.info(
      "scheduler",
      "Missed job: " + job.name + " (was due at " + (job.nextRunAt ? job.nextRunAt.toISOString() : "unknown") + ")"
    );
    await processJobWithConcurrency(job._id.toString());
  }
}

async function processJobWithConcurrency(jobId: string): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    pendingJobs.push(jobId);
    return;
  }

  activeJobs++;
  try {
    await processJob(jobId);
  } finally {
    activeJobs--;
    if (pendingJobs.length > 0 && activeJobs < MAX_CONCURRENT_JOBS) {
      const nextJobId = pendingJobs.shift()!;
      processJobWithConcurrency(nextJobId);
    }
  }
}

const STALE_RUNNING_MS = 5 * 60 * 1000;

async function recoverStaleJobs(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS);
  const result = await CronJobModel.updateMany(
    {
      isRunning: true,
      $or: [
        { lastRunAt: { $lt: staleThreshold } },
        { lastRunAt: { $eq: null } },
      ],
    },
    { $set: { isRunning: false } }
  );
  if (result.modifiedCount > 0) {
    logger.warn("scheduler", "Recovered " + result.modifiedCount + " stale job(s) stuck in running state");
  }
}

async function pollJobs(): Promise<void> {
  if (isPolling || shouldStop) return;
  isPolling = true;

  try {
    await recoverStaleJobs();

    const now = new Date();

    const dueJobs = await CronJobModel.find({
      isActive: true,
      isRunning: false,
      nextRunAt: { $lte: now },
    })
      .sort({ nextRunAt: 1 })
      .limit(MAX_CONCURRENT_JOBS * 2)
      .lean();

    if (dueJobs.length > 0) {
      logger.info("scheduler", "Processing " + dueJobs.length + " due job(s)");
    }

    for (const job of dueJobs) {
      if (shouldStop) break;
      await processJobWithConcurrency(job._id.toString());
    }
  } catch (error) {
    logger.error("scheduler", "Error polling jobs", error);
  } finally {
    isPolling = false;
  }
}

async function updateHeartbeat(): Promise<void> {
  try {
    await SchedulerHeartbeatModel.findByIdAndUpdate(
      "scheduler",
      {
        status: "ONLINE",
        lastHeartbeat: new Date(),
        $setOnInsert: { startedAt: new Date() },
      },
      { upsert: true }
    );
    logger.debug("scheduler", "Heartbeat updated");
  } catch (error) {
    logger.error("scheduler", "Failed to update heartbeat", error);
  }
}

export async function startScheduler(): Promise<void> {
  await connectDb();

  logger.info("scheduler", "Starting scheduler...");
  logger.info(
    "scheduler",
    "Poll interval: " + POLL_INTERVAL + "ms, Heartbeat interval: " + HEARTBEAT_INTERVAL + "ms, Max concurrent: " + MAX_CONCURRENT_JOBS
  );

  await updateHeartbeat();
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
  logger.info("scheduler", "Scheduler started successfully");
}

export async function stopScheduler(): Promise<void> {
  logger.info("scheduler", "Stopping scheduler...");
  shouldStop = true;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  let waitCount = 0;
  while (activeJobs > 0 && waitCount < 30) {
    logger.info("scheduler", "Waiting for " + activeJobs + " active job(s) to finish...");
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
    logger.error("scheduler", "Failed to update heartbeat on shutdown", error);
  }

  await closeDb();
  logger.info("scheduler", "Scheduler stopped");
}
