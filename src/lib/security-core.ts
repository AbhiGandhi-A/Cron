import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";
import cronParser from "cron-parser";

export const sensitiveHeaderNames = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-csrf-token",
  "secret",
  "token",
  "x-access-token",
  "x-api-token",
  "www-authenticate",
];

export const objectIdSchema = /^[0-9a-fA-F]{24}$/u;

export function validateObjectId(id: string): boolean {
  return objectIdSchema.test(id);
}

export function validatePaginationParams(searchParams: URLSearchParams): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.min(1000, parseInt(searchParams.get("page") || "1", 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20", 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function sanitizeForLog(value: string | null | undefined, maxLength = 2000): string {
  if (!value) return "";
  let normalized = value.replace(/\r\n/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/(authorization|proxy-authorization)\s*:\s*Bearer\s+\S+/giu, "$1: Bearer [REDACTED]");
  normalized = normalized.replace(/(authorization|proxy-authorization)\s*:\s*Basic\s+\S+/giu, "$1: Basic [REDACTED]");
  normalized = normalized.replace(/(authorization|proxy-authorization)\s*[:=]\s*\S+/giu, "$1=[REDACTED]");
  normalized = normalized.replace(/(set-cookie|x-api-key|api-key|x-auth-token|x-csrf-token|x-access-token|x-api-token)\s*[:=]\s*[^\s;,]+/giu, "$1=[REDACTED]");
  normalized = normalized.replace(/(cookie)\s*[:=]\s*[^\s;,]+/giu, "$1=[REDACTED]");
  normalized = normalized.replace(/(token|secret|password)\s*[:=]\s*[^\s;,]+/giu, "$1=[REDACTED]");
  if (normalized.length > maxLength) {
    normalized = `${normalized.slice(0, maxLength - 3)}...`;
  }
  return normalized;
}

export function sanitizeUrlForLog(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    const keysToStrip = [
      "authorization",
      "api_key",
      "api-key",
      "apikey",
      "token",
      "secret",
      "password",
      "cookie",
      "session",
      "access_token",
      "x-api-key",
      "key",
    ];

    for (const key of keysToStrip) {
      url.searchParams.delete(key);
    }

    if (url.username || url.password) {
      url.username = "***";
      url.password = "***";
    }

    return url.toString();
  } catch {
    return sanitizeForLog(rawUrl, 512);
  }
}

export function redactHeaders(headers: Record<string, unknown> | null | undefined): Record<string, string> {
  const safe: Record<string, string> = {};
  if (!headers || typeof headers !== "object") {
    return safe;
  }

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    safe[key] = sensitiveHeaderNames.includes(normalizedKey)
      ? "***REDACTED***"
      : typeof value === "string"
        ? value
        : String(value);
  }

  return safe;
}

export function sanitizeForResponse<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForResponse(entry)) as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === "string" && sensitiveHeaderNames.includes(key.toLowerCase())) {
      sanitized[key] = "***REDACTED***";
      continue;
    }
    sanitized[key] = sanitizeForResponse(entryValue as never);
  }

  return sanitized as T;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function isBlockedIPv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = octets;
  const isLoopback = a === 127;
  const isPrivateA = a === 10;
  const isPrivateB = a === 172 && b >= 16 && b <= 31;
  const isPrivateC = a === 192 && b === 168;
  const isLinkLocal = a === 169 && b === 254;
  const isCarrierGrade = a === 100 && b >= 64 && b <= 127;
  const isMulticast = a >= 224 && a <= 239;
  const isReserved = a === 0 || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2);
  const isLocalNetwork = ip === "192.0.0.0";
  const isNAT = a === 198 && (b === 18 || b === 19);

  return isLoopback || isPrivateA || isPrivateB || isPrivateC || isLinkLocal || isCarrierGrade || isMulticast || isReserved || isLocalNetwork || isNAT || ip === "0.0.0.0";
}

export function validateCronExpression(schedule: string, minIntervalMs: number = 60_000): boolean {
  if (!schedule || !schedule.trim()) return false;
  const trimmed = schedule.trim();
  if (trimmed.length > 255) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;

  try {
    const parsed = cronParser.parseExpression(trimmed);
    if (!parsed?.next) return false;

    const first = parsed.next().toDate();
    const second = parsed.next().toDate();
    const intervalMs = second.getTime() - first.getTime();

    if (intervalMs < minIntervalMs) return false;

    return true;
  } catch {
    return false;
  }
}

export function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized === "::" || normalized === "::ffff:0.0.0.0") return true;
  if (normalized.startsWith("::ffff:")) {
    const ipv4 = normalized.replace(/^::ffff:/u, "");
    return net.isIP(ipv4) === 4 && isBlockedIPv4(ipv4);
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fe") && normalized.length > 2 && normalized[2] >= "8" && normalized[2] <= "f") return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  if (normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:172.") || normalized.startsWith("::ffff:192.168.")) return true;
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "instance-data",
  "100.100.100.200",
  "metadata.tencentyun.com",
  "metadata.goo.cl",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".internal",
  ".local",
  ".localdomain",
  ".lan",
  ".home.arpa",
  ".invalid",
];

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  for (const suffix of BLOCKED_SUFFIXES) {
    if (host.endsWith(suffix)) return true;
  }
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized === "localhost" || normalized === "localhost.localdomain") return true;
  if (isBlockedHostname(normalized)) return true;
  if (normalized === "169.254.169.254" || normalized === "100.100.100.200") return true;
  if (normalized === "metadata.google.internal") return true;

  if (net.isIP(normalized) === 4) return isBlockedIPv4(normalized);
  if (net.isIP(normalized) === 6) return isBlockedIPv6(normalized);

  return false;
}

function isLikelyMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  if (isBlockedHostname(host)) return true;

  const blockedExact = [
    "metadata",
    "metadata.google.internal",
    "metadata.google",
    "169.254.169.254",
    "100.100.100.200",
    "localhost",
    "localhost.localdomain",
    "instance-data",
    "metadata.tencentyun.com",
  ];
  if (blockedExact.includes(host)) return true;

  return false;
}

export async function validateOutboundUrl(rawUrl: string): Promise<URL> {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("URL is required");
  }

  if (rawUrl.length > 2048) {
    throw new Error("URL is too long");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol.toLowerCase())) {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Credentials in URLs are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (!hostname || isLikelyMetadataHost(hostname)) {
    throw new Error("Blocked destination host");
  }

  if (["localhost", "0.0.0.0", "::1", "[::1]", "127.0.0.1"].includes(hostname)) {
    throw new Error("Loopback destinations are not allowed");
  }

  if (isBlockedHostname(hostname)) {
    throw new Error("Blocked destination host");
  }

  if (net.isIP(hostname) !== 0) {
    if (isBlockedIPv4(hostname) || isBlockedIPv6(hostname)) {
      throw new Error("Blocked internal or private destination");
    }
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses.length) {
      throw new Error("Host could not be resolved");
    }

    for (const entry of addresses) {
      if (isBlockedAddress(entry.address)) {
        throw new Error("Blocked internal or private destination");
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Blocked")) {
      throw error;
    }
    throw new Error("Destination could not be resolved safely");
  }

  return parsed;
}

export async function assertAllowedRedirect(location: string | null): Promise<void> {
  if (!location) return;
  try {
    const redirectUrl = new URL(location, "http://placeholder.local");
    await validateOutboundUrl(redirectUrl.toString());
  } catch {
    throw new Error("Redirect to blocked destination");
  }
}

export const rateLimitWindowMs = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_CLEANUP_INTERVAL = 300_000;
let lastCleanup = Date.now();

function cleanupRateLimitBuckets() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, bucket] of rateLimitBuckets) {
    if (now >= bucket.resetAt) {
      rateLimitBuckets.delete(key);
    }
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number = rateLimitWindowMs): { allowed: boolean; remaining: number; resetInMs: number } {
  cleanupRateLimitBuckets();
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || now >= current.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetInMs: Math.max(0, current.resetAt - now) };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetInMs: Math.max(0, current.resetAt - now) };
}

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.NEXTAUTH_SECRET || "";

export function generateCsrfToken(sessionId: string): string {
  const timestamp = Date.now().toString(36);
  const payload = `${sessionId}:${timestamp}`;
  const signature = crypto.createHmac("sha256", CSRF_SECRET).update(payload).digest("hex").slice(0, 16);
  return `${timestamp}.${signature}`;
}

export function verifyCsrfToken(token: string, sessionId: string): boolean {
  if (!token || !sessionId) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [timestamp, signature] = parts;
  const payload = `${sessionId}:${timestamp}`;
  const expected = crypto.createHmac("sha256", CSRF_SECRET).update(payload).digest("hex").slice(0, 16);
  if (signature !== expected) return false;

  const ts = parseInt(timestamp, 36);
  if (Number.isNaN(ts)) return false;
  const age = Date.now() - ts;
  return age >= 0 && age < 3600_000;
}

export function sanitizeObjectForStorage<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeForLog(value, 2048) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObjectForStorage(item)) as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase();
      if (sensitiveHeaderNames.includes(normalized) || normalized.includes("password") || normalized.includes("secret") || normalized.includes("token") || normalized.includes("cookie") || normalized.includes("authorization")) {
        result[key] = "[REDACTED]";
        continue;
      }
      result[key] = sanitizeObjectForStorage(entry as never);
    }
    return result as T;
  }

  return value;
}

const ENCRYPTION_KEY = process.env.HEADER_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

export function encryptSensitiveValue(value: string): string {
  if (!value) return value;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSensitiveValue(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith("enc:")) return encrypted;
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 4) return encrypted;
    const [, ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encryptedData = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return encrypted;
  }
}

export function encryptHeaders(headers: Record<string, string> | null): Record<string, string> | null {
  if (!headers) return null;
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    if (sensitiveHeaderNames.includes(normalizedKey)) {
      encrypted[key] = encryptSensitiveValue(value);
    } else {
      encrypted[key] = value;
    }
  }
  return encrypted;
}

export function decryptHeaders(headers: Record<string, string> | null): Record<string, string> | null {
  if (!headers) return null;
  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    if (sensitiveHeaderNames.includes(normalizedKey)) {
      decrypted[key] = decryptSensitiveValue(value);
    } else {
      decrypted[key] = value;
    }
  }
  return decrypted;
}

export function logError(component: string, message: string, error?: unknown) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [ERROR] [${component}]`;
  if (error instanceof Error) {
    console.error(`${prefix} ${message}:`, error.message);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

export function getCronMinInterval(): number {
  return parseInt(process.env.CRON_MIN_INTERVAL_MS || "60000", 10);
}
