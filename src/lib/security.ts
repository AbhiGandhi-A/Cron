import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkRateLimit as checkRateLimitCore, rateLimitWindowMs as rlWindow } from "./security-core";
import crypto from "node:crypto";

export {
  sensitiveHeaderNames,
  objectIdSchema,
  validateObjectId,
  validatePaginationParams,
  sanitizeForLog,
  sanitizeUrlForLog,
  redactHeaders,
  sanitizeForResponse,
  escapeHtml,
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedAddress,
  isBlockedHostname,
  validateCronExpression,
  getCronMinInterval,
  validateOutboundUrl,
  assertAllowedRedirect,
  rateLimitWindowMs,
  checkRateLimit,
  generateCsrfToken,
  verifyCsrfToken,
  sanitizeObjectForStorage,
  encryptSensitiveValue,
  decryptSensitiveValue,
  encryptHeaders,
  decryptHeaders,
  logError,
} from "./security-core";

export function getUserIdFromSession(): Promise<string | null> {
  return (async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    return (session.user as { id?: string }).id ?? null;
  })();
}

export function safeJsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function safeServerError(context?: string) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  return NextResponse.json({ error: `Internal server error${context ? `: ${context}` : ""}` }, { status: 500 });
}

export async function requireCsrf(req: Request, sessionId: string): Promise<NextResponse | null> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return null;
}

export function requireSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin && !host) {
    return true;
  }

  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      const sameHost = host ? parsedOrigin.host === host : true;
      return sameHost;
    } catch {
      return false;
    }
  }

  return true;
}

export async function readJsonBody(req: Request, maxBytes = 256 * 1024) {
  const contentLengthHeader = req.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Request body is too large");
  }

  const rawText = await req.text();
  if (rawText.length > maxBytes) {
    throw new Error("Request body is too large");
  }

  if (!rawText.trim()) {
    throw new Error("Request body is required");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Malformed JSON request body");
  }
}

export function enforceRateLimit(key: string, limit: number, windowMs: number = rlWindow) {
  const result = checkRateLimitCore(key, limit, windowMs);
  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(result.resetInMs / 1000)) } }
    );
  }
  return null;
}

function getHmacKey(): string {
  const secret = process.env.RATELIMIT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("RATELIMIT_SECRET or NEXTAUTH_SECRET required for rate limiting");
  return crypto.createHmac("sha256", secret).update("rate-limit-key").digest("hex").slice(0, 32);
}

export function getAuthenticatedIdentifier(userId: string): string {
  const hmac = crypto.createHmac("sha256", getHmacKey()).update(userId).digest("hex").slice(0, 16);
  return `user:${hmac}`;
}

function getSafeClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  if (process.env.TRUSTED_PROXY === "true") {
    const ip = forwarded?.split(",")[0]?.trim() || realIp || null;
    if (ip) return ip;
  }

  try {
    const anyReq = req as unknown as { socket?: { remoteAddress?: string } };
    const remoteIp = anyReq.socket?.remoteAddress;
    if (remoteIp) {
      return remoteIp.replace(/^::ffff:/, "");
    }
  } catch {}

  return "no-ip-available";
}

export function getClientIdentifier(req: Request): string {
  return getSafeClientIp(req);
}
