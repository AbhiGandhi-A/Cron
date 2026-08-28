import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashString,
  computeFingerprint,
  extractStackAnchor,
} from "../src/lib/monitoring/fingerprint";
import {
  sanitizeIssueInput,
  redactObject,
  redactHeaders,
  redactUrl,
  inferSeverity,
  severityRank,
  pickCritical,
  capString,
  isSensitiveKey,
} from "../src/lib/monitoring/normalize";
import type { NormalizedErrorInput } from "../src/lib/ai/types";

test("hashString is deterministic and produces 8 hex chars", () => {
  const a = hashString("hello world");
  const b = hashString("hello world");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.notEqual(hashString("hello"), hashString("hello "));
});

test("computeFingerprint collapses whitespace and treats null/undefined as empty tokens", () => {
  const a = computeFingerprint(["TypeError", "  two   words ", null, undefined]);
  const b = computeFingerprint(["TypeError", "two words", "", ""]);
  assert.equal(a, b);
});

test("extractStackAnchor picks the first http line and strips query strings", () => {
  const stack = [
    "TypeError: x",
    "    at App (app.js:12:3)",
    "http://localhost:3000/_next/static/chunks/app.js?id=abc?ts=99",
    "    at other (x:1)",
  ].join("\n");
  const anchor = extractStackAnchor(stack);
  assert.equal(anchor, "http://localhost:3000/_next/static/chunks/app.js");
  assert.ok(!anchor.includes("?"));
});

test("extractStackAnchor falls back to first line when no URL present", () => {
  const anchor = extractStackAnchor("Error at module\n    at fn");
  assert.equal(anchor, "Error at module");
});

test("redactObject removes nested secrets and Bearer/basic tokens", () => {
  const input = {
    body: {
      password: "hunter2",
      ApiKey: "abc123",
      nested: { cookie: "sid=1", bearer: "Bearer eyJhbGci" },
    },
    safe: "keep me",
    list: ["Bearer tok1", "Basic base64"],
  };
  const out = redactObject(input) as Record<string, unknown>;
  const body = out.body as Record<string, unknown>;
  assert.equal(body.password, "[REDACTED]");
  assert.equal(body.ApiKey, "[REDACTED]");
  assert.equal((body.nested as Record<string, unknown>).cookie, "[REDACTED]");
  assert.equal((body.nested as Record<string, unknown>).bearer, "Bearer [REDACTED]");
  assert.equal(out.safe, "keep me");
  assert.deepEqual(out.list, ["Bearer [REDACTED]", "Basic [REDACTED]"]);
});

test("redactHeaders redacts authorization and x-api-key only", () => {
  const out = redactHeaders({
    authorization: "Bearer abc",
    "x-api-key": "sekrit",
    "content-type": "application/json",
  });
  assert.equal(out!["authorization"], "[REDACTED]");
  assert.equal(out!["x-api-key"], "[REDACTED]");
  assert.equal(out!["content-type"], "application/json");
});

test("redactUrl strips sensitive query params and userinfo", () => {
  const out = redactUrl("https://user:pass@example.com/data?token=sek&id=1&x_api_key=abc");
  const parsed = new URL(out);
  assert.equal(parsed.searchParams.has("token"), false);
  assert.equal(parsed.searchParams.has("x_api_key"), false);
  assert.equal(parsed.searchParams.get("id"), "1");
  assert.equal(parsed.username, "%5BREDACTED%5D");
  assert.equal(parsed.password, "%5BREDACTED%5D");
  assert.ok(!out.includes("user") && !out.includes("pass"));
});

test("isSensitiveKey matches common credential key shapes", () => {
  assert.equal(isSensitiveKey("Authorization"), true);
  assert.equal(isSensitiveKey("X-Api-Key"), true);
  assert.equal(isSensitiveKey("password"), true);
  assert.equal(isSensitiveKey("x-access-token"), true);
  assert.equal(isSensitiveKey("content-type"), false);
});

test("sanitizeIssueInput caps, redacts and infers severity", () => {
  const input: NormalizedErrorInput = {
    title: "  The request failed with an unexpectedly long title " + "x".repeat(400),
    message: "boom",
    endpoint: "https://example.com/api?password=hunter2",
    status: 503,
    kind: "api",
    context: { headers: { authorization: "Bearer abc" } },
    stack: "at fn http://site/app.js\n".repeat(100),
    retryable: {
      method: "POST",
      url: "https://example.com/data?token=x",
      headers: { "x-api-key": "k", "content-type": "application/json" },
      body: { login: "u", password: "p" },
      bodyType: "json",
      timeout: 30000,
    },
  };
  const out = sanitizeIssueInput(input);
  assert.ok(out.title.length <= 300);
  assert.ok(!out.endpoint!.includes("password"));
  assert.ok(!out.stack!.includes("?"));
  assert.equal(out.retryable!.headers!["x-api-key"], "[REDACTED]");
  assert.equal((out.retryable!.body as Record<string, unknown>).password, "[REDACTED]");
  assert.equal(out.retryable!.url, "https://example.com/data");
  assert.equal(out.severity, "high");
});

test("sanitizeIssueInput normalizes retryable bodyType and preserves expectedStatus", () => {
  const out = sanitizeIssueInput({
    title: "t",
    message: "m",
    retryable: {
      method: "GET",
      url: "https://example.com",
      bodyType: "none" as const,
      timeout: 30000,
      expectedStatus: 200,
    },
  });
  assert.equal(out.retryable!.bodyType, "none");
  assert.equal(out.retryable!.expectedStatus, 200);
});

test("inferSeverity maps api/http statuses", () => {
  assert.equal(inferSeverity(500, "api"), "high");
  assert.equal(inferSeverity(429, "api"), "medium");
  assert.equal(inferSeverity(404, "cron"), "low");
  assert.equal(inferSeverity(null, "frontend"), "medium");
});

test("severityRank orders and pickCritical flags critical only", () => {
  assert.equal(severityRank("low"), 1);
  assert.equal(severityRank("critical"), 4);
  assert.equal(pickCritical(["high", "medium"]), false);
  assert.equal(pickCritical(["high", "critical"]), true);
  assert.equal(pickCritical([]), false);
});

test("capString collapses whitespace and appends ellipsis", () => {
  assert.equal(capString("  a\n  b  ", 10), "a b");
  assert.equal(capString("1234567890abcd", 10), "1234567...");
});