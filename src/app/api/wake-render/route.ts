import { NextResponse } from "next/server";
import {
  isWakeRateLimited,
  extractQueryToken,
  wakeTokenMatches,
  resolveWakeUrl,
} from "@/lib/wake-render";

/**
 * Vercel -> Render wake relay.
 *
 * EasyCron (free tier) cannot target `*.onrender.com` directly, so EasyCron
 * calls THIS endpoint every ~10 minutes, and this handler performs a
 * server-to-server GET against the fixed Render Web Service /health route.
 * That inbound traffic is what keeps/wakes the free Render Web Service.
 *
 * This endpoint ONLY causes inbound traffic to Render. It never queries
 * MongoDB, never lists jobs, never triggers executions, and never writes
 * JobExecution records. Scheduling stays entirely in the Render process.
 */

// Fire the outbound wake and give Render's cold start room to answer.
export const maxDuration = 60;

const WAKE_TIMEOUT_MS = 50_000;

export async function GET(req: Request): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isWakeRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!process.env.RENDER_WAKE_TOKEN) {
    return NextResponse.json(
      { error: "Wake endpoint is not configured" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const queryToken = extractQueryToken(req.url);
  const supplied = bearer || queryToken || "";

  if (!wakeTokenMatches(supplied)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wakeUrl = resolveWakeUrl();
  if (!wakeUrl) {
    return NextResponse.json(
      { error: "Wake endpoint is misconfigured" },
      { status: 500 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);

  try {
    const res = await fetch(wakeUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        renderStatus: res.status,
        message: "Render wake request completed",
      });
    }

    // Render answered but returned an error status (e.g. 5xx) — the inbound
    // request still happened, so it still counts as a wake.
    return NextResponse.json(
      {
        ok: false,
        renderStatus: res.status,
        message: "Render wake request did not complete",
      },
      { status: 502 }
    );
  } catch {
    clearTimeout(timeout);
    // Render was sleeping/cold-starting, timeout, DNS failure, or connection
    // reset. Never crash the function: the connection attempt may already have
    // woken Render, so just report the controlled failure.
    return NextResponse.json(
      {
        ok: false,
        message: "Render wake request did not complete",
      },
      { status: 502 }
    );
  }
}