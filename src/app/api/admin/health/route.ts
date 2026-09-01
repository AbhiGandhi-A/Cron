import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import mongoose from "mongoose";
import { getCloudflareConfigFromEnv } from "@/lib/cloudflare-config";
import { logError } from "@/lib/security";

export interface ServiceHealthReport {
  name: string;
  status: "ok" | "warning" | "error" | "not_configured";
  responseTimeMs?: number;
  message?: string;
  error?: string | null;
  lastChecked: string;
}

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const now = new Date().toISOString();
  const cfConfig = getCloudflareConfigFromEnv();
  const services: Record<string, ServiceHealthReport> = {};

  // 1. Check MongoDB
  const mongoStart = Date.now();
  try {
    await connectDb();
    const db = mongoose.connection.db;
    if (db) {
      await db.admin().ping();
    }
    const mongoElapsed = Date.now() - mongoStart;
    services.mongodb = {
      name: "MongoDB Database",
      status: "ok",
      responseTimeMs: mongoElapsed,
      message: "Database connection active and responsive.",
      error: null,
      lastChecked: now,
    };
  } catch (error) {
    const mongoElapsed = Date.now() - mongoStart;
    logError("admin-health", "MongoDB health check failed", error);
    services.mongodb = {
      name: "MongoDB Database",
      status: "error",
      responseTimeMs: mongoElapsed,
      message: "Failed to communicate with MongoDB database.",
      error: error instanceof Error ? error.message : "Unknown database error",
      lastChecked: now,
    };
  }

  // 2. Check Cloudflare API
  const cfStart = Date.now();
  if (!cfConfig.accountId || !cfConfig.apiToken) {
    services.cloudflare = {
      name: "Cloudflare API",
      status: "not_configured",
      responseTimeMs: 0,
      message: "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not configured in environment.",
      error: null,
      lastChecked: now,
    };
  } else {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfConfig.accountId)}`, {
        headers: {
          Authorization: `Bearer ${cfConfig.apiToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      const cfElapsed = Date.now() - cfStart;

      if (res.ok) {
        services.cloudflare = {
          name: "Cloudflare API",
          status: "ok",
          responseTimeMs: cfElapsed,
          message: "Cloudflare API authenticated and responsive.",
          error: null,
          lastChecked: now,
        };
      } else if (res.status === 401 || res.status === 403) {
        services.cloudflare = {
          name: "Cloudflare API",
          status: "error",
          responseTimeMs: cfElapsed,
          message: "Cloudflare API token unauthorized or permissions insufficient.",
          error: `HTTP ${res.status}: ${res.statusText}`,
          lastChecked: now,
        };
      } else {
        services.cloudflare = {
          name: "Cloudflare API",
          status: "warning",
          responseTimeMs: cfElapsed,
          message: `Cloudflare API returned status ${res.status}.`,
          error: `HTTP ${res.status}`,
          lastChecked: now,
        };
      }
    } catch (err) {
      const cfElapsed = Date.now() - cfStart;
      services.cloudflare = {
        name: "Cloudflare API",
        status: "error",
        responseTimeMs: cfElapsed,
        message: "Failed to connect to Cloudflare API.",
        error: err instanceof Error ? err.message : "Network error",
        lastChecked: now,
      };
    }
  }

  // 3. Check Cloudflare Worker (via worker URL or Cloudflare API)
  const workerStart = Date.now();
  const workerServiceUrl = process.env.TEMP_MAIL_SERVICE_URL;
  if (workerServiceUrl) {
    try {
      const cleanUrl = workerServiceUrl.replace(/\/+$/, "");
      const res = await fetch(`${cleanUrl}/api/temp-mail/usage`, {
        headers: {
          "x-temp-mail-service": process.env.TEMP_MAIL_SERVICE_SECRET || "",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      const workerElapsed = Date.now() - workerStart;

      services.cloudflareWorker = {
        name: "Cloudflare Worker",
        status: res.ok ? "ok" : "warning",
        responseTimeMs: workerElapsed,
        message: res.ok
          ? "Worker microservice responding via HTTPS."
          : `Worker returned HTTP ${res.status}.`,
        error: res.ok ? null : `HTTP ${res.status}`,
        lastChecked: now,
      };
    } catch (err) {
      const workerElapsed = Date.now() - workerStart;
      services.cloudflareWorker = {
        name: "Cloudflare Worker",
        status: "error",
        responseTimeMs: workerElapsed,
        message: "Failed to reach Cloudflare Worker service URL.",
        error: err instanceof Error ? err.message : "Worker connection timeout",
        lastChecked: now,
      };
    }
  } else if (cfConfig.accountId && cfConfig.apiToken && cfConfig.workerName) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfConfig.accountId)}/workers/scripts/${encodeURIComponent(cfConfig.workerName)}`,
        {
          headers: {
            Authorization: `Bearer ${cfConfig.apiToken}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        }
      );
      const workerElapsed = Date.now() - workerStart;
      services.cloudflareWorker = {
        name: "Cloudflare Worker",
        status: res.ok ? "ok" : res.status === 404 ? "warning" : "error",
        responseTimeMs: workerElapsed,
        message: res.ok
          ? `Worker script '${cfConfig.workerName}' verified active on Cloudflare.`
          : res.status === 404
          ? `Worker '${cfConfig.workerName}' not found in account.`
          : `Worker check returned HTTP ${res.status}.`,
        error: res.ok ? null : `HTTP ${res.status}`,
        lastChecked: now,
      };
    } catch (err) {
      const workerElapsed = Date.now() - workerStart;
      services.cloudflareWorker = {
        name: "Cloudflare Worker",
        status: "error",
        responseTimeMs: workerElapsed,
        message: "Failed to verify Cloudflare Worker script.",
        error: err instanceof Error ? err.message : "Network error",
        lastChecked: now,
      };
    }
  } else {
    services.cloudflareWorker = {
      name: "Cloudflare Worker",
      status: "not_configured",
      responseTimeMs: 0,
      message: "TEMP_MAIL_SERVICE_URL or CLOUDFLARE_WORKER_NAME is not configured.",
      error: null,
      lastChecked: now,
    };
  }

  // 4. Check Cloudflare D1 Database
  const d1Start = Date.now();
  if (cfConfig.accountId && cfConfig.apiToken && cfConfig.d1DatabaseId) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfConfig.accountId)}/d1/database/${encodeURIComponent(cfConfig.d1DatabaseId)}`,
        {
          headers: {
            Authorization: `Bearer ${cfConfig.apiToken}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        }
      );
      const d1Elapsed = Date.now() - d1Start;

      services.cloudflareD1 = {
        name: "Cloudflare D1 Database",
        status: res.ok ? "ok" : res.status === 404 ? "error" : "warning",
        responseTimeMs: d1Elapsed,
        message: res.ok
          ? "D1 database verified and accessible."
          : res.status === 404
          ? "D1 database ID not found in account."
          : `D1 API returned HTTP ${res.status}.`,
        error: res.ok ? null : `HTTP ${res.status}`,
        lastChecked: now,
      };
    } catch (err) {
      const d1Elapsed = Date.now() - d1Start;
      services.cloudflareD1 = {
        name: "Cloudflare D1 Database",
        status: "error",
        responseTimeMs: d1Elapsed,
        message: "Failed to connect to Cloudflare D1 API.",
        error: err instanceof Error ? err.message : "D1 connection timeout",
        lastChecked: now,
      };
    }
  } else {
    services.cloudflareD1 = {
      name: "Cloudflare D1 Database",
      status: "not_configured",
      responseTimeMs: 0,
      message: "CLOUDFLARE_D1_DATABASE_ID is not configured in environment.",
      error: null,
      lastChecked: now,
    };
  }

  // 5. Check Next.js API (self check)
  services.nextjsApi = {
    name: "Next.js Application API",
    status: "ok",
    responseTimeMs: 1,
    message: "Next.js App Router API runtime operational.",
    error: null,
    lastChecked: now,
  };

  const activeServices = Object.values(services).filter((s) => s.status !== "not_configured");
  const allHealthy = activeServices.length > 0 && activeServices.every((s) => s.status === "ok");

  return NextResponse.json({
    timestamp: now,
    healthy: allHealthy,
    services,
  });
}

