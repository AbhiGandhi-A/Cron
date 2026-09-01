import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { logError } from "@/lib/security";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const startTime = Date.now();
  const checks: Record<string, unknown> = {
    timestamp: new Date(),
    services: {},
  };

  // Check MongoDB
  try {
    await connectDb();
    const elapsed = Date.now() - startTime;
    checks.services = {
      ...((checks.services as Record<string, unknown>) || {}),
      mongodb: {
        status: "ok",
        responseTime: elapsed,
      },
    };
  } catch (error) {
    logError("admin-health", "MongoDB check failed", error);
    checks.services = {
      ...((checks.services as Record<string, unknown>) || {}),
      mongodb: {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }

  // Check Cloudflare Worker (via temp-mail API)
  try {
    const workerUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.cronjobs.site";
    const start = Date.now();
    const res = await fetch(`${workerUrl}/api/temp-mail/usage`, {
      headers: {
        "x-temp-mail-service": process.env.TEMP_MAIL_SERVICE_SECRET || "",
      },
      signal: AbortSignal.timeout(5000),
    });
    const elapsed = Date.now() - start;

    checks.services = {
      ...((checks.services as Record<string, unknown>) || {}),
      cloudflareWorker: {
        status: res.ok ? "ok" : "error",
        statusCode: res.status,
        responseTime: elapsed,
      },
    };
  } catch (error) {
    checks.services = {
      ...((checks.services as Record<string, unknown>) || {}),
      cloudflareWorker: {
        status: "error",
        error: error instanceof Error ? error.message : "Request timeout",
      },
    };
  }

  // Check Next.js API (self check)
  checks.services = {
    ...((checks.services as Record<string, unknown>) || {}),
    nextjsApi: {
      status: "ok",
      responseTime: Date.now() - startTime,
    },
  };

  const allHealthy = Object.values(
    (checks.services as Record<string, Record<string, unknown>>) || {}
  ).every((s) => s.status === "ok");

  return NextResponse.json({
    ...checks,
    healthy: allHealthy,
  });
}
