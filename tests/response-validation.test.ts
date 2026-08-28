import { test } from "node:test";
import assert from "node:assert/strict";

import { executeHttpRequest, validateResponse } from "../src/lib/execution-core";

test("validateResponse returns null when no validation is configured", () => {
  assert.equal(validateResponse(200, "hello world"), null);
  assert.equal(validateResponse(500, "hello world"), null);
});

test("validateResponse flags an unexpected status code", () => {
  const error = validateResponse(200, "body", 500, null);
  assert.ok(error && error.includes("expected HTTP 500") && error.includes("200"));
});

test("validateResponse passes when the status code matches", () => {
  assert.equal(validateResponse(200, "body", 200, null), null);
});

test("validateResponse matches a response body pattern", () => {
  assert.equal(validateResponse(200, '{"status":"ok","up":true}', null, '"ok"'), null);
  assert.equal(validateResponse(200, "server UP and running", null, "UP"), null);
});

test("validateResponse flags a body that does not match", () => {
  const error = validateResponse(200, "plain body", null, "nope-zzz");
  assert.ok(error && error.includes("does not match"));
});

test("validateResponse flags an invalid regex pattern", () => {
  const error = validateResponse(200, "body", null, "([unclosed");
  assert.ok(error && error.includes("invalid pattern"));
});

test("executeHttpRequest (live): expectedStatus mismatch marks the run FAILED but keeps the HTTP status", {
  skip: process.env.RUN_LIVE_NETWORK_TESTS !== "true"
    ? "set RUN_LIVE_NETWORK_TESTS=true to run live network assertions (httpbin.org)"
    : false,
}, async () => {
  const result = await executeHttpRequest({
    url: "https://httpbin.org/status/200",
    method: "GET",
    timeout: 15000,
    expectedStatus: 500,
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.httpStatus, 200);
  assert.ok(result.errorMessage!.includes("expected HTTP 500, got 200"));
});

test("executeHttpRequest (live): expectedStatus match succeeds", {
  skip: process.env.RUN_LIVE_NETWORK_TESTS !== "true"
    ? "set RUN_LIVE_NETWORK_TESTS=true to run live network assertions (httpbin.org)"
    : false,
}, async () => {
  const result = await executeHttpRequest({
    url: "https://httpbin.org/status/200",
    method: "GET",
    timeout: 15000,
    expectedStatus: 200,
  });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.errorMessage, null);
});

test("executeHttpRequest (live): body pattern that matches succeeds", {
  skip: process.env.RUN_LIVE_NETWORK_TESTS !== "true"
    ? "set RUN_LIVE_NETWORK_TESTS=true to run live network assertions (httpbin.org)"
    : false,
}, async () => {
  const result = await executeHttpRequest({
    url: "https://httpbin.org/get",
    method: "GET",
    timeout: 15000,
    expectedResponseRegex: "httpbin",
  });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.httpStatus, 200);
});

test("executeHttpRequest (live): body pattern that does not match fails with the response kept", {
  skip: process.env.RUN_LIVE_NETWORK_TESTS !== "true"
    ? "set RUN_LIVE_NETWORK_TESTS=true to run live network assertions (httpbin.org)"
    : false,
}, async () => {
  const result = await executeHttpRequest({
    url: "https://httpbin.org/get",
    method: "GET",
    timeout: 15000,
    expectedResponseRegex: "zzz-definitely-not-present-zzz",
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.httpStatus, 200);
  assert.ok(result.errorMessage!.includes("does not match"));
  assert.ok(result.responseBody && result.responseBody.length > 0);
});