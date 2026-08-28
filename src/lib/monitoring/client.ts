import type { NormalizedErrorInput, AiAnalysis, AiSeverity } from "@/lib/ai/types";
import { sanitizeIssueInput } from "./normalize";
import { computeFingerprint, extractStackAnchor } from "./fingerprint";
import { getAiSettings } from "./settings";

const SEEN_STORAGE_KEY = "cronjobio.ai.seen";
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const DISPATCH_ISSUE = "cronjobio:ai:issue";
const DISPATCH_ANALYSIS = "cronjobio:ai:analysis";

let initialized = false;

function isAiEndpoint(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes("/api/ai/");
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function computeClientFingerprint(input: NormalizedErrorInput): string {
  return computeFingerprint([
    input.errorType || input.title,
    input.title,
    input.message,
    input.endpoint,
    input.status,
    extractStackAnchor(input.stack),
  ]);
}

function readSeen(): Record<string, number> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, number>): void {
  if (!isBrowser()) return;
  try {
    const pruned = Object.fromEntries(
      Object.entries(seen).filter(([, timestamp]) => Date.now() - timestamp < DEDUP_WINDOW_MS * 7)
    );
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    /* ignore */
  }
}

function dispatch(eventName: string, detail: Record<string, unknown>): void {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } catch {
    /* ignore */
  }
}

async function persistIssue(input: NormalizedErrorInput): Promise<void> {
  if (!isBrowser()) return;
  try {
    await fetch("/api/ai/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    /* this endpoint only stores; ignore failures */
  }
}

async function sendAnalyze(input: NormalizedErrorInput, extra?: Record<string, unknown>): Promise<void> {
  if (!isBrowser()) return;
  try {
    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, ...extra }),
    });
    if (response.ok) {
      const data = (await response.json()) as { issue: Record<string, unknown>; analysis: AiAnalysis };
      dispatch(DISPATCH_ANALYSIS, { issue: data.issue, analysis: data.analysis });
    } else {
      const data = (await response.json().catch(() => ({ error: "AI analysis failed" }))) as {
        error?: string;
        issue?: Record<string, unknown>;
      };
      dispatch(DISPATCH_ANALYSIS, {
        error: data.error ?? "AI analysis failed",
        issue: data.issue ?? null,
      });
    }
  } catch {
    dispatch(DISPATCH_ANALYSIS, { error: "AI analysis failed", issue: null });
  }
}

export function captureError(input: NormalizedErrorInput): NormalizedErrorInput | null {
  const settings = getAiSettings();
  if (!settings.enabled) return null;

  const sanitized = sanitizeIssueInput(
    isBrowser()
      ? {
          ...input,
          page: input.page ?? `${window.location.pathname}${window.location.search}`,
          userAgent: input.userAgent ?? navigator.userAgent,
        }
      : input
  );

  const fingerprint = computeClientFingerprint(sanitized);

  const seen = readSeen();
  const duplicate = Boolean(seen[fingerprint] && Date.now() - seen[fingerprint] < DEDUP_WINDOW_MS);
  if (!duplicate) {
    seen[fingerprint] = Date.now();
    writeSeen(seen);
  }

  dispatch(DISPATCH_ISSUE, { issue: sanitized, fingerprint, duplicate });

  if (duplicate) return sanitized;

  void persistIssue(sanitized);

  return sanitized;
}

export function isCriticalSeverity(severity: AiSeverity): boolean {
  return severity === "high" || severity === "critical";
}

export function forceAnalyze(input: NormalizedErrorInput): Promise<void> {
  const sanitized = sanitizeIssueInput(input);
  return sendAnalyze(sanitized, { force: true });
}

function notifyFetchFailure(input: {
  method: string;
  url: string;
  status: number | null;
  headers?: Record<string, string>;
  durationMs: number;
}): void {
  if (isAiEndpoint(input.url)) return;
  captureError({
    title: input.status !== null ? `HTTP ${input.status}` : "Network request failed",
    message: input.status !== null ? `Request to ${input.url} failed with HTTP ${input.status}` : `Network error while requesting ${input.url}`,
    endpoint: input.url,
    method: input.method,
    status: input.status,
    kind: "api",
    source: "fetch",
    retryable: {
      method: input.method,
      url: input.url,
      headers: Object.keys(input.headers ?? {}).length ? input.headers : undefined,
      bodyType: "json",
      timeout: 30000,
    },
  });
}

function notifyPerf(op: string, endpoint: string | null | undefined, durationMs: number): void {
  if (isAiEndpoint(endpoint)) return;
  const settings = getAiSettings();
  if (durationMs < settings.normalMs) return;
  const threshold = durationMs >= settings.warningMs ? "critical" : "warning";
  captureError({
    title: threshold === "critical" ? "Slow request detected" : "Slow request warning",
    message: `Operation "${op}" took ${Math.round(durationMs)}ms (${threshold} threshold)`,
    endpoint,
    kind: "performance",
    source: "performance",
    perf: { op, durationMs: Math.round(durationMs), threshold, endpoint },
  });
}

function patchFetch(): void {
  if (!isBrowser() || typeof window.fetch !== "function") return;
  const originalFetch = window.fetch;
  window.fetch = async function aiWrappedFetch(input, init) {
    const start = Date.now();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || (typeof input !== "string" && input instanceof Request ? input.method : "GET");

    try {
      const response = await originalFetch.call(globalThis, input, init);
      const durationMs = Date.now() - start;
      if (!response.ok) {
        notifyFetchFailure({ method, url, status: response.status, durationMs });
      } else {
        notifyPerf("fetch", url, durationMs);
      }
      return response;
    } catch (error) {
      const durationMs = Date.now() - start;
      notifyFetchFailure({ method, url, status: null, durationMs });
      throw error;
    }
  };
}

function patchXhr(): void {
  if (!isBrowser() || !("XMLHttpRequest" in window)) return;
  const OriginalXhr = window.XMLHttpRequest;

  const proto = OriginalXhr.prototype as unknown as {
    open: (method: string, url: string) => void;
    send: (body?: Document | BodyInit | null) => void;
    addEventListener: (type: string, listener: (event: ProgressEvent) => void) => void;
    status: number;
    statusText: string;
    responseURL: string;
  };

  const originalOpen = proto.open;
  const originalSend = proto.send;

  proto.open = function aiWrappedOpen(method: string, url: string) {
    const state = this as unknown as {
      __aiUrl: string;
      __aiMethod: string;
      __aiStartedAt: number;
    };
    state.__aiUrl = url;
    state.__aiMethod = method;
    return originalOpen.apply(this, [method, url]);
  };

  proto.send = function aiWrappedSend(body?: Document | BodyInit | null) {
    const state = this as unknown as {
      __aiUrl: string;
      __aiMethod: string;
      __aiStartedAt: number;
    };
    state.__aiStartedAt = Date.now();
    return originalSend.apply(this, [body]);
  };

  proto.addEventListener("loadend", function aiXhrLoadend(this: XMLHttpRequest, _event: Event) {
    const xhr = this;
    const state = this as unknown as {
      __aiUrl?: string;
      __aiMethod?: string;
      __aiStartedAt?: number;
    };
    if (!state.__aiUrl) return;
    const durationMs = state.__aiStartedAt ? Date.now() - state.__aiStartedAt : 0;
    if (xhr.status >= 400) {
      notifyFetchFailure({
        method: state.__aiMethod ?? "GET",
        url: state.__aiUrl,
        status: xhr.status,
        durationMs,
      });
    } else {
      notifyPerf("xhr", state.__aiUrl, durationMs);
    }
  });
}

function onWindowError(event: ErrorEvent): void {
  const input: NormalizedErrorInput = {
    title: event.message || "Uncaught error",
    message: event.message || "An error occurred",
    errorType: event.error?.name || "Error",
    stack: typeof event.error?.stack === "string" ? event.error.stack : undefined,
    kind: "frontend",
    source: "window.onerror",
    context: { line: event.lineno ?? null, column: event.colno ?? null },
  };
  captureError(input);
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const input: NormalizedErrorInput = {
    title: "Unhandled promise rejection",
    message: reason instanceof Error ? reason.message : String(reason),
    errorType: reason instanceof Error ? reason.name : "PromiseRejection",
    stack: reason instanceof Error && typeof reason.stack === "string" ? reason.stack : undefined,
    kind: "frontend",
    source: "unhandledrejection",
  };
  captureError(input);
}

export function initAiMonitoring(): void {
  if (!isBrowser() || initialized) return;
  initialized = true;
  try {
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    patchFetch();
    patchXhr();
  } catch {
    /* ignore */
  }
}