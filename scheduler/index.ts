import "dotenv/config";

import { startScheduler, stopScheduler } from "./scheduler";
import { logger } from "./logger";

process.on("SIGINT", async () => {
  logger.info("index", "Received SIGINT, shutting down...");
  await stopScheduler();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("index", "Received SIGTERM, shutting down...");
  await stopScheduler();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  logger.error("index", "Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error("index", "Unhandled rejection", reason);
});

async function main() {
  logger.info("index", "CronJob.io Scheduler starting...");
  logger.info("index", "Node.js " + process.version);
  logger.info("index", "PID: " + process.pid);

  if (!process.env.MONGODB_URI) {
    logger.error("index", "MONGODB_URI is not set. Make sure .env contains MONGODB_URI and you run from the project root.");
    throw new Error("MONGODB_URI is not set");
  }

  await startScheduler();
}

main().catch(async (error) => {
  logger.error("index", "Failed to start scheduler", error);
  await stopScheduler();
  process.exit(1);
});
