import crypto from "node:crypto";
import type { GeneratedApiAnalytics } from "@/lib/ai/types";

export function generateAgentId(): string {
  return `api_${crypto.randomBytes(16).toString("hex")}`;
}

export function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function secretPrefix(secret: string): string {
  return secret.slice(0, 4);
}

export function currentDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function rolloverAnalytics(analytics: GeneratedApiAnalytics, now = new Date()): GeneratedApiAnalytics {
  if (analytics.dayKey === currentDayKey(now)) return analytics;
  return {
    dayKey: currentDayKey(now),
    requestsToday: 0,
    successCount: 0,
    errorCount: 0,
    totalResponseTimeMs: 0,
    lastRequestAt: null,
  };
}

export function auditSecretCompare(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(hashSecret(provided), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildCorsHeaders(
  apiCors: { enabled: boolean; origins: string[] },
  methods: string[],
  requestOrigin: string | null
): Record<string, string> {
  if (!apiCors.enabled) return {};

  let allowOrigin = "";
  if (apiCors.origins.includes("*")) {
    allowOrigin = "*";
  } else if (requestOrigin && apiCors.origins.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
  }

  if (!allowOrigin) return {};

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": [...new Set([...methods, "OPTIONS"])].join(", "),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": "600",
  };
  if (allowOrigin !== "*") {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}