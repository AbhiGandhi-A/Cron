import { createServer, type Server } from "http";
import { logger } from "./logger";

/**
 * Render Web Service ingress: the scheduler must bind an HTTP server to
 * 0.0.0.0:$PORT so Render marks the instance as healthy and can route inbound
 * traffic to it. We also expose a tiny two-route surface (no job data, no
 * secrets, no execution) that EasyCron can use as a ~10-minute keep-alive/wake
 * request on the free tier.
 *
 * The wake endpoint ONLY proves the process is alive. It never triggers a job,
 * never calls "Run Now", and never writes a JobExecution. The scheduler loop
 * independently determines what is due from MongoDB.
 */

let schedulerRunning = false;

export function markSchedulerRunning(running: boolean): void {
  schedulerRunning = running;
}

export function isSchedulerRunning(): boolean {
  return schedulerRunning;
}

/**
 * Enabled by default on Render (Render sets RENDER=true on every service).
 * Local/CI runs stay off unless SCHEDULER_HEALTH_ENABLED=true, so the port
 * never collides with the Next.js dev server on 3000.
 */
export function healthServerEnabled(): boolean {
  return process.env.RENDER === "true" || process.env.SCHEDULER_HEALTH_ENABLED === "true";
}

export function startHealthServer(): Server {
  const port = parseInt(process.env.PORT || "10000", 10);

  const server = createServer((req, res) => {
    const path = (req.url || "/").split("?")[0];

    if (path === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          scheduler: schedulerRunning ? "running" : "starting",
          uptime: process.uptime(),
        })
      );
      return;
    }

    if (path === "/wake") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "awake" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info("health", "Health/wake server listening on 0.0.0.0:" + port);
  });

  server.on("error", (error) => {
    logger.warn("health", "Health/wake server failed to bind on 0.0.0.0:" + port + " (" + error.message + "); continuing without it");
  });

  return server;
}