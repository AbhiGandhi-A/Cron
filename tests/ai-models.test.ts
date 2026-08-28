import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { AiIssue } from "../src/lib/models/AiIssue";
import { GeneratedApi } from "../src/lib/models/GeneratedApi";
import { AiConversation } from "../src/lib/models/AiConversation";
import {
  upsertIssue,
  serializeIssue,
  buildMonitoringSummary,
  computeIssueFingerprint,
} from "../src/lib/ai/issues";
import { createGeneratedApi } from "../src/lib/generated-apis/service";
import { verifyApiAuth } from "../src/lib/generated-apis/auth";
import { executePublicApi } from "../src/lib/generated-apis/executor";
import {
  hashSecret,
  secretPrefix,
  rolloverAnalytics,
  buildCorsHeaders,
  generateAgentId,
  generateSecret,
} from "../src/lib/generated-apis/helpers";
import { generateApiInputSchema } from "../src/lib/ai/validate";
import type { NormalizedErrorInput } from "../src/lib/ai/types";

let mongod: MongoMemoryServer | null = null;
let setupError: Error | null = null;

const now = new Date("2026-01-05T12:00:00.000Z");

function startMemoryServer(): Promise<MongoMemoryServer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("mongod download/start timed out after 120s")),
      120_000
    );
    MongoMemoryServer.create().then(
      (server) => {
        clearTimeout(timeout);
        resolve(server);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

before(async () => {
  try {
    mongod = await startMemoryServer();
    await mongoose.connect(mongod.getUri());
  } catch (error) {
    setupError = error instanceof Error ? error : new Error(String(error));
  }
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});

const userId = () => new mongoose.Types.ObjectId().toString();

const baseInput = (overrides: Record<string, unknown> = {}): NormalizedErrorInput => ({
  title: "Cannot read properties of undefined",
  message: "TypeError: Cannot read properties of undefined (reading 'name')",
  errorType: "TypeError",
  endpoint: "https://example.com/api/jobs",
  method: "GET",
  status: 500,
  stack: "TypeError: x\n    at Home (http://localhost:3000/dashboard)",
  kind: "frontend",
  severity: "medium",
  source: "dashboard",
  ...overrides,
});

test("upsertIssue creates, dedups and reopens resolved issues", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const uid = userId();
  const input = baseInput();

  const first = await upsertIssue(uid, input);
  assert.equal(first.isNew, true);

  const second = await upsertIssue(uid, input);
  assert.equal(second.isNew, false);
  assert.equal(second.issue.occurrences, 2);

  await AiIssue.updateOne(
    { _id: second.issue._id },
    { $set: { resolved: true, resolvedAt: new Date() } }
  );

  const third = await upsertIssue(uid, input);
  assert.equal(third.isNew, false);
  assert.equal(third.issue.resolved, false, "a new occurrence must reopen the issue");
  assert.equal(third.issue.occurrences, 3);
});

test("upsertIssue escalates severity to the highest seen severity", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const uid = userId();

  await upsertIssue(uid, baseInput({ severity: "medium" }));
  const escalated = await upsertIssue(uid, baseInput({ severity: "critical" }));

  assert.equal(escalated.issue.severity, "critical");
});

test("computeIssueFingerprint is stable across identical inputs and differs by error type", () => {
  assert.equal(computeIssueFingerprint(baseInput()), computeIssueFingerprint(baseInput()));
  assert.notEqual(
    computeIssueFingerprint(baseInput()),
    computeIssueFingerprint(baseInput({ errorType: "RangeError", title: "Different" }))
  );
});

test("serializeIssue exposes retryable result after a retry writes it back", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const uid = userId();
  const created = await upsertIssue(uid, baseInput({ retryable: {
    method: "POST",
    url: "https://example.com/data",
    headers: { "content-type": "application/json" },
    body: { value: 1 },
    bodyType: "json",
    timeout: 30000,
  } }));

  await AiIssue.updateOne(
    { _id: created.issue._id },
    { $set: { "retryable.result": { status: "ok", httpStatus: 200, responseTime: 12 } } }
  );

  const loaded = await AiIssue.findById(created.issue._id).lean();
  const serialized = serializeIssue(loaded as never);
  const retryable = serialized.retryable as { result: Record<string, unknown> };
  assert.equal(retryable.result.httpStatus, 200);
  assert.equal((serialized.conversation as unknown[]).length, 0);
});

test("buildMonitoringSummary counts open, critical, pending and recent issues", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const uid = userId();
  await upsertIssue(uid, baseInput());
  await upsertIssue(uid, baseInput({ errorType: "RangeError", title: "Packed", severity: "critical" }));
  await upsertIssue(uid, baseInput({ errorType: "ParseError", title: "Recovered" }));
  await AiIssue.updateOne(
    { userId: new mongoose.Types.ObjectId(uid), errorType: "ParseError" },
    { $set: { resolved: true, resolvedAt: new Date() } }
  );

  const summary = await buildMonitoringSummary(uid);
  assert.equal(summary.openIssues, 2);
  assert.equal(summary.criticalIssues, 1);
  assert.equal(summary.pendingAnalysis, 3);
  assert.equal((summary.recentIssues as unknown[]).length > 0, true);
});

test("createGeneratedApi builds a callable record with a hashed secret", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const input = generateApiInputSchema.parse({
    name: "Static endpoint",
    description: "A static JSON payload",
    source: { type: "static", body: { hello: "world" } },
    authMode: "api-key",
  });

  const { doc, createdSecret } = await createGeneratedApi(userId(), input);
  assert.ok(doc.agentId.startsWith("api_"));
  assert.ok(doc.publicUrl.includes(`/api/public/${doc.agentId}`));
  assert.ok(createdSecret);
  assert.equal(doc.auth.secretHash, hashSecret(createdSecret!));
  assert.equal(doc.auth.secretPrefix, secretPrefix(createdSecret!));
  assert.equal(doc.analytics.requestsToday, 0);
  assert.equal(doc.analytics.dayKey, "");
});

test("verifyApiAuth enforces each auth mode", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const uid = new mongoose.Types.ObjectId();
  const makeRequest = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/public", { headers });

  const publicApi = await createGeneratedApi(uid.toString(), generateApiInputSchema.parse({
    name: "Open",
    source: { type: "static", body: { a: 1 } },
    authMode: "public",
  }));
  assert.equal(await verifyApiAuth(publicApi.doc as never, makeRequest()), true);

  const keyApi = await createGeneratedApi(uid.toString(), generateApiInputSchema.parse({
    name: "Keyed",
    source: { type: "static", body: { a: 1 } },
    authMode: "api-key",
  }));
  assert.equal(await verifyApiAuth(keyApi.doc as never, makeRequest({ "x-api-key": keyApi.createdSecret! })), true);
  assert.equal(await verifyApiAuth(keyApi.doc as never, makeRequest({ "x-api-key": "wrong" })), false);
  assert.equal(await verifyApiAuth(keyApi.doc as never, makeRequest()), false);

  const bearerApi = await createGeneratedApi(uid.toString(), generateApiInputSchema.parse({
    name: "Bearer",
    source: { type: "static", body: { a: 1 } },
    authMode: "bearer",
  }));
  assert.equal(await verifyApiAuth(bearerApi.doc as never, makeRequest({ authorization: `Bearer ${bearerApi.createdSecret}` })), true);
  assert.equal(await verifyApiAuth(bearerApi.doc as never, makeRequest({ authorization: "Bearer nope" })), false);

  const privateApi = await createGeneratedApi(uid.toString(), generateApiInputSchema.parse({
    name: "Private",
    source: { type: "static", body: { a: 1 } },
    authMode: "private",
  }));
  assert.equal(await verifyApiAuth(privateApi.doc as never, makeRequest(), { resolvePrivateToken: async () => ({ id: uid.toString() }) }), true);
  assert.equal(await verifyApiAuth(privateApi.doc as never, makeRequest(), { resolvePrivateToken: async () => ({ id: new mongoose.Types.ObjectId().toString() }) }), false);
  assert.equal(await verifyApiAuth(privateApi.doc as never, makeRequest()), false);
});

test("executePublicApi serves static content and records analytics", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const { doc } = await createGeneratedApi(userId(), generateApiInputSchema.parse({
    name: "Static",
    source: { type: "static", body: { hello: "world" } },
    rateLimit: { limit: 100, windowMs: 60000 },
  }));

  const outcome = await executePublicApi(
    doc as never,
    { method: "GET", searchParams: new URLSearchParams(), rawBody: "", contentType: null },
    now
  );

  assert.equal(outcome.httpStatus, 200);
  assert.equal(outcome.successful, true);
  assert.deepEqual(outcome.body, { hello: "world" });

  const reloaded = await GeneratedApi.findById(doc._id).lean();
  assert.equal(reloaded!.analytics.requestsToday, 1);
  assert.equal(reloaded!.analytics.successCount, 1);
  assert.equal(reloaded!.analytics.errorCount, 0);
});

test("executePublicApi queries allowlisted collection scoped to the owner", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const ownerId = new mongoose.Types.ObjectId();
  const intruderId = new mongoose.Types.ObjectId();

  await mongoose.connection.collection("testurls").insertMany([
    { userId: ownerId, name: "Job A", token: "t-a", isActive: true, createdAt: new Date(), secretField: "should-not-leak" },
    { userId: ownerId, name: "Job B", token: "t-b", isActive: false, createdAt: new Date() },
    { userId: intruderId, name: "Job C", token: "t-c", isActive: true, createdAt: new Date() },
  ]);

  const { doc } = await createGeneratedApi(ownerId.toString(), generateApiInputSchema.parse({
    name: "Collection",
    source: { type: "collection", collection: "testurls", fields: ["name", "token"] },
  }));

  const outcome = await executePublicApi(
    doc as never,
    { method: "GET", searchParams: new URLSearchParams({ limit: "50" }), rawBody: "", contentType: null },
    now
  );

  assert.equal(outcome.httpStatus, 200);
  const data = (outcome.body as { data: Array<Record<string, unknown>> }).data;
  assert.equal(data.length, 2);
  assert.ok(data.every((item) => "name" in item && "token" in item && !("userId" in item)));

  const reloaded = await GeneratedApi.findById(doc._id).lean();
  assert.equal(reloaded!.analytics.requestsToday, 1);
});

test("executePublicApi caps collection limits at the configured maximum", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const ownerId = new mongoose.Types.ObjectId();
  const docs = new Array(120).fill(null).map((_, index) => ({
    userId: ownerId,
    name: `job-${index}`,
    type: "no-type",
  }));
  await mongoose.connection.collection("cronjobs").insertMany(docs);

  const { doc } = await createGeneratedApi(ownerId.toString(), generateApiInputSchema.parse({
    name: "Big",
    source: { type: "collection", collection: "cronjobs", fields: ["name"] },
  }));

  const outcome = await executePublicApi(
    doc as never,
    { method: "GET", searchParams: new URLSearchParams({ limit: "999999" }), rawBody: "", contentType: null },
    now
  );
  assert.equal((outcome.body as { data: unknown[] }).data.length, 100);
});

test("buildCorsHeaders supports wildcard, allowlisted origins and no-op when disabled", () => {
  const methods = ["GET", "POST"];

  assert.deepEqual(buildCorsHeaders({ enabled: false, origins: [] }, methods, "https://a.com"), {});

  const wildcard = buildCorsHeaders({ enabled: true, origins: ["*"] }, methods, "https://a.com");
  assert.equal(wildcard["Access-Control-Allow-Origin"], "*");
  assert.equal(wildcard["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");

  const matched = buildCorsHeaders({ enabled: true, origins: ["https://a.com"] }, methods, "https://a.com");
  assert.equal(matched["Access-Control-Allow-Origin"], "https://a.com");
  assert.equal(matched["Vary"], "Origin");

  const rejected = buildCorsHeaders({ enabled: true, origins: ["https://a.com"] }, methods, "https://evil.com");
  assert.deepEqual(rejected, {});
});

test("currentDayKey and rolloverAnalytics reset the day window", () => {
  const analytics = { dayKey: "2026-01-04", requestsToday: 10, successCount: 8, errorCount: 2, totalResponseTimeMs: 500, lastRequestAt: new Date("2026-01-04T23:00:00Z") };
  const rolled = rolloverAnalytics(analytics, now);
  assert.equal(rolled.dayKey, "2026-01-05");
  assert.equal(rolled.requestsToday, 0);
  assert.equal(rolled.lastRequestAt, null);
  assert.equal(rolloverAnalytics(rolled, now).requestsToday, 0);
});

test("secret helpers produce unique, prefixed, hashable values", () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.notEqual(a, b);
  assert.ok(a.length === 43);
  assert.equal(a.slice(0, 4), secretPrefix(a));
  assert.equal(hashSecret(a), hashSecret(a));
  assert.notEqual(hashSecret(a), hashSecret(b));
  assert.match(generateAgentId(), /^api_[0-9a-f]{32}$/);
});

test("AiConversation stores issue-scoped and standalone threads", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const uid = new mongoose.Types.ObjectId();
  const conf = await AiConversation.create({
    userId: uid,
    kind: "issue",
    issueId: new mongoose.Types.ObjectId(),
    messages: [{ role: "user", content: "what does this mean?", createdAt: new Date() }],
  });
  conf.messages.push({ role: "assistant", content: "It means X", createdAt: new Date() });
  await conf.save();

  const reloaded = await AiConversation.findById(conf._id).lean();
  assert.equal((reloaded!.messages as unknown[]).length, 2);
  assert.equal(reloaded!.kind, "issue");
});