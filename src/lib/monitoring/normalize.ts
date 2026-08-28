import type { NormalizedErrorInput, AiSeverity } from "@/lib/ai/types";

export const SENSITIVE_KEY_RE =
  /(password|passwd|secret|token|cookie|authorization|api[_-]?key|auth[_-]?key|x[_-]?access[_-]?token|credential|jwt|csrf)/iu;

export const mkRedactableKeys = new Set([
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
  "password",
  "passwd",
  "x-access-token",
  "x-api-token",
  "www-authenticate",
]);

export function isSensitiveKey(key: string): boolean {
  return mkRedactableKeys.has(key.toLowerCase()) || SENSITIVE_KEY_RE.test(key);
}

export function capString(value: string | null | undefined, maxLength: number): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function truncateStack(stack: string | null | undefined, maxLength = 4000): string {
  if (!stack) return "";
  if (stack.length <= maxLength) return stack;
  return stack.slice(0, maxLength);
}

export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/^(Bearer|Basic)\s+\S+/iu.test(value)) {
      return value.replace(/^(Bearer|Basic)\s+\S+/giu, "$1 [REDACTED]");
    }
    if (/^\$2[aby]\$\d{2}\$/u.test(value)) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(entry);
    }
    return out;
  }
  return value;
}

export function redactObject<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  return redactValue(value) as T;
}

export function redactHeaders(headers: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!headers || typeof headers !== "object") return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveKey(key)
      ? "[REDACTED]"
      : typeof value === "string"
        ? value
        : typeof value === "number"
          ? String(value)
          : "object";
  }
  return out;
}

export function redactUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveKey(key)) url.searchParams.delete(key);
    }
    if (url.username || url.password) {
      url.username = "[REDACTED]";
      url.password = "[REDACTED]";
    }
    return url.toString();
  } catch {
    return capString(rawUrl, 512);
  }
}

export function sanitizeIssueInput(input: NormalizedErrorInput): NormalizedErrorInput {
  return {
    title: capString(input.title, 300) || "Application error",
    message: capString(input.message, 2000) || "No details",
    errorType: input.errorType ? capString(input.errorType, 200) : null,
    endpoint: input.endpoint ? redactUrl(input.endpoint) : null,
    method: input.method ? capString(input.method, 20) : null,
    status:
      typeof input.status === "number" && Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
        ? input.status
        : null,
    stack: truncateStack(input.stack),
    kind: input.kind ?? "frontend",
    severity: input.severity ?? inferSeverity(input.status ?? null, input.kind ?? "frontend"),
    source: input.source ? capString(input.source, 60) : "unknown",
    page: input.page ? capString(input.page, 512) : null,
    userAgent: input.userAgent ? capString(input.userAgent, 512) : null,
    response: input.response ? capString(input.response, 2000) : null,
    context: input.context ? (redactObject(input.context) as Record<string, unknown>) : null,
    perf: input.perf
      ? {
          op: capString(input.perf.op, 200),
          durationMs: Math.round(input.perf.durationMs),
          threshold: input.perf.threshold,
          endpoint: input.perf.endpoint ? redactUrl(input.perf.endpoint) : null,
        }
      : null,
    retryable: input.retryable
      ? {
          method: capString(input.retryable.method, 20),
          url: redactUrl(input.retryable.url),
          headers: redactHeaders(input.retryable.headers),
          body: redactValue(input.retryable.body),
          bodyType: input.retryable.bodyType ?? "json",
          timeout: Math.min(Math.max(input.retryable.timeout || 30000, 1000), 300000),
          expectedStatus:
            typeof input.retryable.expectedStatus === "number" ? input.retryable.expectedStatus : null,
        }
      : null,
  };
}

export function inferSeverity(status: number | null, kind: string): AiSeverity {
  if (kind === "performance" || kind === "api") {
    if (status !== null && status >= 500) return "high";
    if (status !== null && status >= 400) return "medium";
  }
  if (status !== null && status >= 500) return "high";
  if (status !== null && status >= 400) return "low";
  return "medium";
}

export function severityRank(severity: AiSeverity): number {
  switch (severity) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "critical":
      return 4;
    default:
      return 2;
  }
}

export function pickCritical(severities: Array<AiSeverity | undefined>): boolean {
  return severities.some((severity) => severity && severityRank(severity) >= 4);
}