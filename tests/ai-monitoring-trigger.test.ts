import { test } from "node:test";
import assert from "node:assert/strict";
import { captureError, forceAnalyze } from "../src/lib/monitoring/client";
import type { NormalizedErrorInput } from "../src/lib/ai/types";

const WINDOW_KEY = "window" as keyof typeof globalThis;
const CUSTOM_EVENT_KEY = "CustomEvent" as keyof typeof globalThis;

type RecordedCall = { url: string; body?: unknown };

const originalFetch = globalThis.fetch;

function installBrowser(calls: RecordedCall[], events: string[], seenStore: Map<string, string>): void {
  (globalThis as unknown as Record<string, unknown>)[WINDOW_KEY] = {
    localStorage: {
      getItem: (key: string) => seenStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        seenStore.set(key, value);
      },
      removeItem: (key: string) => {
        seenStore.delete(key);
      },
    },
    location: { pathname: "/dashboard", search: "" },
    navigator: { userAgent: "cronjobio-test" },
    dispatchEvent: (event: { type: string }) => {
      events.push(event.type);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as unknown as Record<string, unknown>)[CUSTOM_EVENT_KEY] = class CustomEvent {
    type: string;
    constructor(type: string, options: { detail?: unknown }) {
      this.type = type;
      void options;
    }
  };
  globalThis.fetch = ((input: string | Request | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, body });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
      headers: new Headers(),
      redirected: false,
      type: "basic",
      url,
      bodyUsed: false,
    });
  }) as typeof fetch;
}

function restore(): void {
  delete (globalThis as unknown as Record<string, unknown>)[WINDOW_KEY];
  delete (globalThis as unknown as Record<string, unknown>)[CUSTOM_EVENT_KEY];
  globalThis.fetch = originalFetch as typeof fetch;
}

const SAMPLE: NormalizedErrorInput = {
  title: "HTTP 500",
  message: "Request to https://api.example.com failed with HTTP 500",
  errorType: "Error",
  endpoint: "https://api.example.com",
  method: "GET",
  status: 500,
  kind: "api",
  source: "fetch",
};

test("error detection captures but does NOT call /api/ai/analyze", () => {
  const calls: RecordedCall[] = [];
  const events: string[] = [];
  const store = new Map<string, string>();
  installBrowser(calls, events, store);
  try {
    captureError(SAMPLE);
    const urls = calls.map((call) => call.url);
    assert.ok(urls.includes("/api/ai/issues"), "error should be persisted for storage");
    assert.ok(!urls.includes("/api/ai/analyze"), "no automatic analyze call is allowed");
    assert.ok(events.some((type) => type === "cronjobio:ai:issue"), "issue event should be dispatched");
    assert.ok(!events.includes("cronjobio:ai:open"), "panel must not auto-open on detection");
  } finally {
    restore();
  }
});

test("duplicate errors are deduplicated and persisted only once", () => {
  const calls: RecordedCall[] = [];
  const events: string[] = [];
  const store = new Map<string, string>();
  installBrowser(calls, events, store);
  try {
    captureError(SAMPLE);
    captureError(SAMPLE);
    const persistCalls = calls.filter((call) => call.url === "/api/ai/issues");
    assert.equal(persistCalls.length, 1, "client dedup should suppress a second persist");
    assert.ok(!calls.some((call) => call.url === "/api/ai/analyze"));
  } finally {
    restore();
  }
});

test('"Fix with AI" (forceAnalyze) DOES call /api/ai/analyze', async () => {
  const calls: RecordedCall[] = [];
  const events: string[] = [];
  const store = new Map<string, string>();
  installBrowser(calls, events, store);
  try {
    await forceAnalyze(SAMPLE);
    const analyze = calls.find((call) => call.url === "/api/ai/analyze");
    assert.ok(analyze, "Fix with AI must call /api/ai/analyze");
    assert.equal((analyze.body as { force?: boolean }).force, true);
  } finally {
    restore();
  }
});

test("capturing an error never triggers an automatic Groq call", () => {
  const calls: RecordedCall[] = [];
  const events: string[] = [];
  const store = new Map<string, string>();
  installBrowser(calls, events, store);
  try {
    captureError({
      ...SAMPLE,
      kind: "performance",
      title: "Slow request detected",
      message: "Operation fetch took 5000ms (critical threshold)",
    });
    assert.ok(!calls.some((call) => call.url === "/api/ai/analyze"), "no auto analyze on perf capture");
    assert.ok(calls.some((call) => call.url === "/api/ai/issues"));
  } finally {
    restore();
  }
});