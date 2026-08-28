import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeResultSchema,
  generateApiInputSchema,
  issueResolveInputSchema,
  chatInputSchema,
  analyzeInputSchema,
} from "../src/lib/ai/validate";

test("generateApiInputSchema accepts a full allowlisted collection config", () => {
  const input = {
    name: "Latest flights",
    description: "Returns recent flights",
    source: {
      type: "collection",
      collection: "cronjobs",
      fields: ["name", "url", "isActive"],
    },
    methods: ["GET", "POST"],
    authMode: "api-key",
    cors: { enabled: true, origins: ["https://example.com"] },
    rateLimit: { limit: 50, windowMs: 60000 },
    response: { statusCode: 200, maxSizeBytes: 200000, contentType: "application/json" },
  };
  const parsed = generateApiInputSchema.parse(input);
  assert.equal(parsed.name, input.name);
  assert.deepEqual(parsed.methods, ["GET", "POST"]);
});

test("generateApiInputSchema applies defaults for omitted optional config", () => {
  const parsed = generateApiInputSchema.parse({
    name: "Static",
    source: { type: "static", body: { hello: "world" } },
  });
  assert.equal(parsed.authMode, "private");
  assert.deepEqual(parsed.methods, ["GET"]);
  assert.deepEqual(parsed.rateLimit, { limit: 30, windowMs: 60000 });
  assert.deepEqual(parsed.response, { statusCode: 200, maxSizeBytes: 100000, contentType: "application/json" });
  assert.deepEqual(parsed.cors, { enabled: false, origins: [] });
  assert.equal(parsed.description, "");
});

test("generateApiInputSchema rejects non-allowlisted collections", () => {
  const result = generateApiInputSchema.safeParse({
    name: "Bad",
    source: { type: "collection", collection: "secrets", fields: ["name"] },
  });
  assert.equal(result.success, false);
});

test("generateApiInputSchema rejects fields outside the allowlist", () => {
  const result = generateApiInputSchema.safeParse({
    name: "Bad",
    source: { type: "collection", collection: "cronjobs", fields: ["email", "passwordHash"] },
  });
  assert.equal(result.success, false);
});

test("generateApiInputSchema rejects static source without a body", () => {
  const result = generateApiInputSchema.safeParse({ name: "x", source: { type: "static" } });
  assert.equal(result.success, false);
});

test("generateApiInputSchema rejects internal source without url/method", () => {
  const result = generateApiInputSchema.safeParse({
    name: "x",
    source: { type: "internal", url: "https://example.com" },
  });
  assert.equal(result.success, false);
});

test("generateApiInputSchema rejects invalid URLs", () => {
  const result = generateApiInputSchema.safeParse({
    name: "x",
    source: { type: "internal", url: "ftp://example.com", method: "GET" },
  });
  assert.equal(result.success, false);
});

test("analyzeResultSchema accepts a valid analysis and defaults references", () => {
  const parsed = analyzeResultSchema.parse({
    rootCause: "crash",
    fix: "patch",
    impact: "high",
    prevention: "guard",
    references: ["https://mdn.dev"],
  });
  assert.equal(parsed.rootCause, "crash");
  assert.deepEqual(parsed.references, ["https://mdn.dev"]);
});

test("analyzeResultSchema tolerates empty input via default object", () => {
  const parsed = analyzeResultSchema.parse({});
  assert.deepEqual(parsed, { references: [] });
  assert.deepEqual(analyzeResultSchema.parse(undefined!), { references: [] });
});

test("analyzeResultSchema rejects oversized fix and excessive references", () => {
  assert.equal(analyzeResultSchema.safeParse({ fix: "x".repeat(4001) }).success, false);
  assert.equal(analyzeResultSchema.safeParse({ references: new Array(9).fill("r") }).success, false);
});

test("issueResolveInputSchema is strict and rejects extras", () => {
  assert.equal(issueResolveInputSchema.safeParse({ resolved: true }).success, true);
  assert.equal(issueResolveInputSchema.safeParse({ resolved: false, severity: "critical" }).success, true);
  assert.equal(issueResolveInputSchema.safeParse({ resolved: true, nope: 1 }).success, false);
});

test("chatInputSchema requires a message and allows issueId", () => {
  assert.equal(chatInputSchema.safeParse({ message: "hi" }).success, true);
  assert.equal(chatInputSchema.safeParse({ message: "hi", issueId: "abc" }).success, true);
  assert.equal(chatInputSchema.safeParse({ message: "   " }).success, false);
  assert.equal(chatInputSchema.safeParse({ issueId: "abc" }).success, false);
});

test("analyzeInputSchema validates performance and retryable payloads strictly", () => {
  const valid = analyzeInputSchema.safeParse({
    title: "Slow request",
    message: "took too long",
    kind: "performance",
    perf: { op: "fetch", durationMs: 4200, threshold: "warning", endpoint: "https://example.com" },
    retryable: {
      method: "POST",
      url: "https://example.com/data",
      body: { a: 1 },
      bodyType: "json",
      timeout: 30000,
    },
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data!.perf!.threshold, "warning");

  assert.equal(
    analyzeInputSchema.safeParse({
      title: "x",
      message: "m",
      perf: { op: "fetch", durationMs: 10, threshold: "definitely-slow" },
    }).success,
    false
  );
  assert.equal(
    analyzeInputSchema.safeParse({
      title: "x",
      message: "m",
      retryable: { method: "GET", url: "https://x.com", bodyType: "binary", timeout: 30000 },
    }).success,
    false
  );
  assert.equal(analyzeInputSchema.safeParse({ title: "x", message: "m", extra: 1 }).success, false);
});