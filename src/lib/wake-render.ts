import crypto from "node:crypto";

/**
 * Server-only helpers for the Vercel -> Render wake relay (see
 * src/app/api/wake-render/route.ts). Kept out of the route module so the route
 * file only exports Next.js route/segment config symbols.
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateLimitAttempts = new Map<string, { count: number; resetAt: number }>();

export function resetWakeRateLimiter(): void {
  rateLimitAttempts.clear();
}

export function isWakeRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Validate RENDER_WAKE_URL at request time. Only an https URL on
 * *.onrender.com with path /health is accepted — the relay is never a generic
 * proxy and cannot be pointed at an arbitrary destination (no SSRF).
 */
export function resolveWakeUrl(): string | null {
  const raw = process.env.RENDER_WAKE_URL || "";
  try {
    const url = new URL(raw);
    const host = url.host.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (url.pathname !== "/health") return null;
    if (!host.endsWith(".onrender.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractQueryToken(url: string): string | null {
  try {
    return new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
}

export function wakeTokenMatches(supplied: string): boolean {
  const expected = process.env.RENDER_WAKE_TOKEN || "";
  if (!expected || !supplied) return false;
  const bufA = Buffer.from(supplied);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}