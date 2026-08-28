import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRequestUrl,
  buildRequestBody,
  buildExecutionHeaders,
  executeHttpRequest,
  decryptSensitiveValue,
} from "../src/lib/execution-core";
import { encryptSensitiveValue } from "../src/lib/security-core";

test("buildRequestUrl appends query params and preserves existing ones", () => {
  const url = buildRequestUrl("https://example.com/path?a=1", { b: "2", c: "hello world" });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("a"), "1");
  assert.equal(parsed.searchParams.get("b"), "2");
  assert.equal(parsed.searchParams.get("c"), "hello world");
});

test("buildRequestUrl returns url unchanged when no query params", () => {
  assert.equal(buildRequestUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(buildRequestUrl("https://example.com/path", null), "https://example.com/path");
});

test("buildRequestBody ignores body for non-body methods", () => {
  const { body, contentType } = buildRequestBody("GET", { a: 1 }, "json");
  assert.equal(body, undefined);
  assert.equal(contentType, undefined);
});

test("buildRequestBody builds JSON bodies", () => {
  const { body, contentType } = buildRequestBody("POST", { hello: "world" }, "json");
  assert.equal(contentType, "application/json");
  assert.deepEqual(JSON.parse(body!), { hello: "world" });
});

test("buildRequestBody builds form-encoded bodies", () => {
  const { body, contentType } = buildRequestBody("POST", { a: "1", b: "two words" }, "form");
  assert.equal(contentType, "application/x-www-form-urlencoded");
  assert.equal(body, "a=1&b=two+words");
});

test("buildRequestBody builds text/plain bodies", () => {
  const { body, contentType } = buildRequestBody("POST", "plain payload", "text");
  assert.equal(contentType, "text/plain");
  assert.equal(body, "plain payload");
});

test("buildRequestBody returns undefined for none / empty body", () => {
  assert.equal(buildRequestBody("POST", null, "none").body, undefined);
  assert.equal(buildRequestBody("POST", "", "json").body, undefined);
  assert.equal(buildRequestBody("POST", undefined, "json").body, undefined);
});

test("buildExecutionHeaders decrypts enc: values and passes plain values through", () => {
  const encrypted = encryptSensitiveValue("Bearer shh-token");
  const headers = buildExecutionHeaders({ "X-Custom": "plain", "Authorization": encrypted }, undefined, "GET");
  assert.equal(headers["X-Custom"], "plain");
  assert.equal(headers["Authorization"], "Bearer shh-token");
});

test("buildExecutionHeaders adds default Content-Type only for JSON bodies on body methods", () => {
  const headers = buildExecutionHeaders({}, "{\"a\":1}", "POST");
  assert.equal(headers["Content-Type"], "application/json");
  const withExplicit = buildExecutionHeaders({ "Content-Type": "application/xml" }, "<a/>", "POST");
  assert.equal(withExplicit["Content-Type"], "application/xml");
});

test("decryptSensitiveValue passes non-enc values through unchanged", () => {
  assert.equal(decryptSensitiveValue("plain-value"), "plain-value");
  assert.equal(decryptSensitiveValue(""), "");
});

test("executeHttpRequest blocks private/loopback destinations (SSRF)", async () => {
  const result = await executeHttpRequest({ url: "http://127.0.0.1:9999/x", method: "GET", timeout: 2000 });
  assert.equal(result.status, "FAILED");
  assert.ok(result.errorMessage!.includes("blocked"));
  assert.equal(result.httpStatus, null);
  assert.equal(result.timedOut, false);
});

test("executeHttpRequest (live): TIMEOUT against a deliberately slow endpoint", {
  skip: process.env.RUN_LIVE_NETWORK_TESTS !== "true"
    ? "set RUN_LIVE_NETWORK_TESTS=true to run live network assertions (httpbin.org)"
    : false,
}, async () => {
  // httpbin.org/delay/10 accepts the connection and stalls 10s; our 2s
  // timeout must abort and be recorded as TIMEOUT (not retried forever).
  const result = await executeHttpRequest({
    url: "https://httpbin.org/delay/10",
    method: "GET",
    timeout: 2000,
  });
  assert.equal(result.status, "TIMEOUT");
  assert.equal(result.timedOut, true);
  assert.ok(result.responseTime >= 1000);
});

test("executeHttpRequest (live): SUCCESS against a public endpoint", {
  skip: process.env.RUN_LIVE_NETWORK_TESTS !== "true"
    ? "set RUN_LIVE_NETWORK_TESTS=true to run live network assertions (httpbin.org)"
    : false,
}, async () => {
  const result = await executeHttpRequest({
    url: "https://httpbin.org/post",
    method: "POST",
    bodyType: "json",
    body: { hello: "world" },
    timeout: 15000,
  });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.httpStatus, 200);
  assert.ok(result.responseBody!.includes("hello"));
  assert.ok(result.responseSize > 0);
});