import { createServer, type Server } from "http";
import { logger } from "./logger";

/**
 * Render Web Service ingress: the scheduler must bind an HTTP server to
 * 0.0.0.0:$PORT so Render marks the instance as healthy and can route inbound
 * traffic to it. We also expose a tiny route surface (no job data, no secrets,
 * no execution) that cron-job.org uses as a keep-alive/wake request on the free
 * tier, and a self keep-alive so the free instance never idles out between
 * external pings (which would hand cron-job.org a verbose HTML 502 cold-start
 * page and trigger its "output too large" failure).
 *
 * The health/wake endpoint ONLY proves the process is alive. It never triggers
 * a job, never calls "Run Now", never writes a JobExecution, and never starts
 * a scheduler. The scheduler loop — started exactly once in index.ts —
 * independently determines what is due from MongoDB.
 */

let schedulerRunning = false;
let healthServer: Server | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

const KEEP_ALIVE_INTERVAL = Math.max(
  30000,
  parseInt(process.env.SCHEDULER_KEEPALIVE_INTERVAL_MS || "120000", 10) || 120000
);

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

    // Also answer the bare domain with a tiny success so a cron-job.org job
    // pointed at https://<app>.onrender.com (no path) stays within its tiny
    // output limit instead of receiving anything large.
    if (path === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
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

  healthServer = server;
  return server;
}

/**
 * Graceful shutdown: stop accepting new connections so in-flight health/wake
 * responses finish before the process exits. Called from index.ts shutdown.
 */
export function stopHealthServer(): void {
  if (healthServer) {
    healthServer.close(() => {
      logger.info("health", "Health/wake server closed");
    });
    healthServer = null;
  }
}

/**
 * Agent owns this app's public URL: Render injects RENDER_EXTERNAL_URL
 * automatically for every web service.
 */
export function buildKeepAliveUrl(): string | null {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base) return null;
  return base.replace(/\/+$/, "") + "/health";
}

/**
 * Fire a lightweight GET at our own public /health through Render's proxy.
 * This resets the free-tier ~15-minute idle timer, so the instance stays warm
 * and the (30-minute) cron-job.org wake request always reaches this process
 * instead of being answered by a cold-start HTML error page. The request is
 * fully isolated: it never touches jobs, MongoDB, locks, executions, or auth,
 * and any failure is just logged at debug level.
 */
function pingSelf(): void {
  const url = buildKeepAliveUrl();
  if (!url) return;
  fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) })
    .then((res) => {
      if (res.status !== 200) {
        logger.debug("health", "Self keep-alive returned HTTP " + res.status);
      }
    })
    .catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug("health", "Self keep-alive ping failed (isolated): " + msg);
    });
}

/**
 * Start the self keep-alive loop. Only active on Render (or when the health
 * server is force-enabled); a no-op locally so no local/CI pinging happens.
 */
export function startKeepAlive(): void {
  if (!healthServerEnabled()) return;
  if (keepAliveTimer) return;
  const url = buildKeepAliveUrl();
  if (!url) {
    logger.info("health", "Self keep-alive disabled: RENDER_EXTERNAL_URL is not set");
    return;
  }
  // Prime immediately so the very first idle window is already covered.
  pingSelf();
  keepAliveTimer = setInterval(pingSelf, KEEP_ALIVE_INTERVAL);
  logger.info("health", "Self keep-alive enabled: pinging " + url + " every " + KEEP_ALIVE_INTERVAL + "ms");
}

export function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}