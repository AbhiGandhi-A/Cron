import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { formatRequestBody, formatRequestSize, mergeRequestCounts } from "../src/lib/test-urls/view";
import { redactHeaders } from "../src/lib/security-core";
import { TestUrlRequest } from "../src/lib/models/TestUrl";

// ============================================================
// TEST 1: JSON body is displayed as readable, formatted JSON
// ============================================================
test("view: JSON bodies render with indented formatting", () => {
  const payload = { event: "create_item", itemId: 123, name: "Test Item" };
  const rendered = formatRequestBody(payload);
  assert.equal(rendered, JSON.stringify(payload, null, 2));
  assert.ok(rendered.includes("\n"), "JSON should be pretty-printed with newlines");
  assert.ok(rendered.includes('"event": "create_item"'));
  assert.ok(rendered.includes('"itemId": 123'));
  assert.ok(rendered.includes('"name": "Test Item"'));
});

// ============================================================
// TEST 2: Plain text body is displayed as-is
// ============================================================
test("view: plain text bodies render unchanged", () => {
  assert.equal(formatRequestBody("hello world"), "hello world");
  const raw = "Event: create_item\nItemId: 123";
  assert.equal(formatRequestBody(raw), raw);
});

// ============================================================
// TEST 3: Empty / missing bodies render a placeholder
// ============================================================
test("view: empty or missing bodies do not crash or render raw objects", () => {
  assert.equal(formatRequestBody(null), "No body");
  assert.equal(formatRequestBody(undefined), "No body");
  assert.equal(formatRequestBody(""), "No body");
});

test("view: primitive JSON bodies render as strings", () => {
  assert.equal(formatRequestBody(0), "0");
  assert.equal(formatRequestBody(false), "false");
  assert.equal(formatRequestBody(123), "123");
});

// ============================================================
// TEST 4: Request size is formatted from the stored requestSize
// ============================================================
test("view: request size formats bytes into B/KB/MB", () => {
  assert.equal(formatRequestSize(0), "0 B");
  assert.equal(formatRequestSize(512), "512 B");
  assert.equal(formatRequestSize(1500), "1.5 KB");
  assert.equal(formatRequestSize(2 * 1024 * 1024), "2.0 MB");
});

test("view: request size handles missing/invalid values defensively", () => {
  assert.equal(formatRequestSize(undefined), "0 B");
  assert.equal(formatRequestSize(null), "0 B");
  assert.equal(formatRequestSize(Number.NaN), "0 B");
});

// ============================================================
// TEST 5: Status code is part of the captured request record
// ============================================================
test("model: captured requests expose a statusCode (the response status, 200 on success)", () => {
  const statusPath = TestUrlRequest.schema.path("statusCode") as { options?: { default?: unknown } } | undefined;
  assert.ok(statusPath, "statusCode path should exist on TestUrlRequest");
  assert.equal(statusPath.options?.default, 200);

  const sizePath = TestUrlRequest.schema.path("requestSize");
  assert.ok(sizePath, "requestSize path should exist on TestUrlRequest");
});

// ============================================================
// TEST 6: Request count is derived from existing request records
// ============================================================
test("view: request count merges counts per Test URL with zero default", () => {
  const urls = [{ _id: "aaa", name: "Monday Hook" }, { _id: "bbb", name: "Empty Hook" }];
  const counts = [{ _id: "aaa", count: 3 }];
  const merged = mergeRequestCounts(urls, counts);

  assert.equal(merged[0].requestCount, 3);
  assert.equal(merged[1].requestCount, 0);
});

// ============================================================
// TEST 7: Repeated webhook requests stay separate records
// ============================================================
test("model: each captured webhook request is its own record", () => {
  const r1 = new TestUrlRequest({
    testUrlId: new mongoose.Types.ObjectId(),
    method: "POST",
    url: "https://example.com/api/test/token",
    body: { event: "create_item", itemId: 123 },
    requestSize: 38,
  });
  const r2 = new TestUrlRequest({
    testUrlId: new mongoose.Types.ObjectId(),
    method: "POST",
    url: "https://example.com/api/test/token",
    body: { event: "create_item", itemId: 124 },
    requestSize: 38,
  });

  assert.notEqual(String(r1._id), String(r2._id), "Each request must produce a distinct record");
  assert.notDeepEqual(r1.body, r2.body);
});

// ============================================================
// TEST 8: Existing secret header redaction remains intact
// ============================================================
test("security: captured request headers still redact secrets before display", () => {
  const headers = {
    authorization: "Bearer super-secret-token",
    "content-type": "application/json",
    cookie: "session=abc123",
    "x-api-key": "sk_live_12345",
    "x-custom": "keep-me",
  };

  const redacted = redactHeaders(headers);
  assert.equal(redacted.authorization, "***REDACTED***");
  assert.equal(redacted.cookie, "***REDACTED***");
  assert.equal(redacted["x-api-key"], "***REDACTED***");
  assert.equal(redacted["content-type"], "application/json");
  assert.equal(redacted["x-custom"], "keep-me");
});