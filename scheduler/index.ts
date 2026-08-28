import "dotenv/config";
import { createServer } from "http";

import { startScheduler, stopScheduler } from "./scheduler";
import { logger } from "./logger";

let isShuttingDown = false;

async function shutdown(code: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("index", "Shutting down...");
  try {
    await stopScheduler();
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

  // Optional health endpoint. OFF by default so it never conflicts with the
  // Next.js dev server on port 3000. Enable explicitly with:
  //   SCHEDULER_HEALTH_ENABLED=true (listens on PORT, default 3000)
  // Render workers do not need this; the MongoDB heartbeat is the liveness
  // signal shown on the dashboard.
  if (process.env.SCHEDULER_HEALTH_ENABLED === "true") {
    const port = parseInt(process.env.PORT || "3000", 10);
    try {
      const server = createServer((req, res) => {
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(port, () => {
        logger.info("index", "Health server listening on port " + port);
      });
      server.on("error", (error) => {
        logger.warn("index", "Health server failed to bind to port " + port + ": " + error.message);
      });
    } catch (error) {
      logger.warn("index", "Health server skipped due to error: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  await startScheduler();
}

main().catch(async (error) => {
  logger.error("index", "Failed to start scheduler", error);
  await shutdown(1);
});