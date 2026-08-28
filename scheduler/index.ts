import "dotenv/config";

import { startScheduler, stopScheduler } from "./scheduler";
import { healthServerEnabled, startHealthServer, stopHealthServer, markSchedulerRunning } from "./health";
import { logger } from "./logger";

let isShuttingDown = false;

async function shutdown(code: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("index", "Shutting down...");
  try {
    // Stop the scheduler loop first (stop polling, drain active executions,
    // heartbeat OFFLINE, close Mongo), then stop accepting new HTTP requests
    // to the health/wake server before the process exits.
    await stopScheduler();
    stopHealthServer();
  } catch (error) {
    logger.error("index", "Error during shutdown", error);
  }
  process.exit(code);
}

async function handleSignal(signal: string): Promise<void> {
  logger.info("index", "Received " + signal);
  await shutdown(0);
}

process.on("SIGINT", () => {
  handleSignal("SIGINT").catch(() => {});
});

process.on("SIGTERM", () => {
  handleSignal("SIGTERM").catch(() => {});
});

// Crash isolation: if something unexpectedly throws, log loudly and exit so
// the process is restarted by the host (Render, PM2, docker) instead of
// lingering in a broken state while the heartbeat still claims to be ONLINE.
process.on("uncaughtException", (error) => {
  logger.error("index", "Uncaught exception, exiting (will be restarted by host)", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("index", "Unhandled rejection, exiting (will be restarted by host)", reason);
  process.exit(1);
});

async function main(): Promise<void> {
  logger.info("index", "CronJob.io Scheduler starting...");
  logger.info("index", "Node.js " + process.version);
  logger.info("index", "PID: " + process.pid);

  if (!process.env.MONGODB_URI) {
    logger.error(
      "index",
      "MONGODB_URI is not set. Make sure the environment contains MONGODB_URI (or a local .env at the project root)."
    );
    throw new Error("MONGODB_URI is not set");
  }

  // Render Web Service ingress: bind a minimal HTTP server to 0.0.0.0:$PORT.
  // It must be up quickly so Render marks the instance healthy, and it doubles
  // as the way cron-job.org wakes/keeps the free Web Service alive (~6 min).
  // Automatically ON under Render (RENDER=true); also forceable with
  // SCHEDULER_HEALTH_ENABLED=true. Routes: GET /health, GET /wake.
  if (healthServerEnabled()) {
    startHealthServer();
  }

  await startScheduler();

  // /health now reports scheduler: "running".
  markSchedulerRunning(true);
}

main().catch(async (error) => {
  logger.error("index", "Failed to start scheduler", error);
  await shutdown(1);
});