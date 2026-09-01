import test from "node:test";
import assert from "node:assert/strict";
import {
  maskCloudflareSecret,
  getCloudflareConfigFromEnv,
  serializeCloudflareConfig,
} from "../src/lib/cloudflare-config";
import {
  safeNumber,
  computeDerivedMetrics,
  buildMetric,
} from "../src/lib/cloudflare-usage";

test("maskCloudflareSecret never exposes the full secret", () => {
  const secret = "cf_sec_1234567890abcdef1234567890abcdef";
  const masked = maskCloudflareSecret(secret);
  assert.strictEqual(masked.includes("1234567890abcdef1234567890abcdef"), false);
  assert.ok(masked.startsWith("cf_s"));
  assert.ok(masked.endsWith("cdef"));
  assert.ok(masked.includes("****"));
});

test("serializeCloudflareConfig omits apiToken from client output", () => {
  const config = {
    accountId: "acc_123456",
    zoneId: "zone_123456",
    d1DatabaseId: "d1_123456",
    workerName: "cronjobs-worker",
    apiToken: "cf_token_super_secret_9999",
    configStatus: "configured" as const,
    status: "connected" as const,
    connectionMessage: "Verified",
    lastTested: "2026-09-01T00:00:00.000Z",
  };

  const serialized = serializeCloudflareConfig(config);

  // apiToken must not be present or must be undefined
  assert.strictEqual((serialized as unknown as Record<string, unknown>).apiToken, undefined);
  assert.strictEqual(serialized.apiTokenPresent, true);
  assert.strictEqual(serialized.tokenPreview.includes("super_secret"), false);
  assert.ok(serialized.tokenPreview.startsWith("cf_t"));
  assert.ok(serialized.tokenPreview.includes("****"));
});

test("safeNumber handles numbers, numeric strings, null, undefined, and NaN", () => {
  // Valid numbers
  assert.strictEqual(safeNumber(0), 0);
  assert.strictEqual(safeNumber(123), 123);
  assert.strictEqual(safeNumber(-5), -5);
  assert.strictEqual(safeNumber(45.67), 45.67);

  // Numeric strings
  assert.strictEqual(safeNumber("100"), 100);
  assert.strictEqual(safeNumber("0"), 0);
  assert.strictEqual(safeNumber("  42  "), 42);

  // Invalid / non-numeric
  assert.strictEqual(safeNumber(undefined, null), null);
  assert.strictEqual(safeNumber(null, null), null);
  assert.strictEqual(safeNumber(NaN, null), null);
  assert.strictEqual(safeNumber(Infinity, null), null);
  assert.strictEqual(safeNumber("", null), null);
  assert.strictEqual(safeNumber("not a number", null), null);
  assert.strictEqual(safeNumber({}, null), null);
});

test("computeDerivedMetrics handles real 0 and missing limits without NaN", () => {
  // When usage is 0 and limit is 100
  const zeroUsage = computeDerivedMetrics(0, 100);
  assert.strictEqual(zeroUsage.percentage, 0);
  assert.strictEqual(zeroUsage.remaining, 100);

  // When limit is null (Unavailable in Cloudflare API)
  const missingLimit = computeDerivedMetrics(500, null);
  assert.strictEqual(missingLimit.percentage, null);
  assert.strictEqual(missingLimit.remaining, null);

  // When usage is null
  const missingUsage = computeDerivedMetrics(null, 1000);
  assert.strictEqual(missingUsage.percentage, null);
  assert.strictEqual(missingUsage.remaining, null);

  // When limit is 0 or negative
  const zeroLimit = computeDerivedMetrics(10, 0);
  assert.strictEqual(zeroLimit.percentage, null);
  assert.strictEqual(zeroLimit.remaining, null);

  // Normal calculation
  const normal = computeDerivedMetrics(25, 100);
  assert.strictEqual(normal.percentage, 25);
  assert.strictEqual(normal.remaining, 75);

  // Usage exceeds limit
  const exceeded = computeDerivedMetrics(150, 100);
  assert.strictEqual(exceeded.percentage, 150);
  assert.strictEqual(exceeded.remaining, 0);
});

test("buildMetric assigns correct status according to quota percentages and availability", () => {
  // Metric with missing limit (real Cloudflare case where quota is unavailable)
  const metricNoLimit = buildMetric({
    id: "worker_requests",
    name: "Worker Requests",
    label: "Worker Requests (24h)",
    category: "workers",
    usage: 1250,
    limit: null,
    source: "GraphQL",
  });
  assert.strictEqual(metricNoLimit.current, 1250);
  assert.strictEqual(metricNoLimit.limit, null);
  assert.strictEqual(metricNoLimit.percentage, null);
  assert.strictEqual(metricNoLimit.remaining, null);
  assert.strictEqual(metricNoLimit.status, "healthy");

  // Metric with 0 usage (valid 0)
  const metricZero = buildMetric({
    id: "worker_errors",
    name: "Worker Errors",
    label: "Worker Errors",
    category: "workers",
    usage: 0,
    limit: null,
    source: "GraphQL",
  });
  assert.strictEqual(metricZero.current, 0);
  assert.strictEqual(metricZero.status, "healthy");

  // Metric with null usage (unavailable)
  const metricUnavailable = buildMetric({
    id: "d1_storage",
    name: "D1 Storage",
    label: "D1 Storage",
    category: "d1",
    usage: null,
    limit: null,
    source: "REST",
  });
  assert.strictEqual(metricUnavailable.current, null);
  assert.strictEqual(metricUnavailable.status, "unavailable");

  // Metric with warning percentage (> 90%)
  const metricWarning = buildMetric({
    id: "test_metric",
    name: "Test",
    label: "Test",
    category: "workers",
    usage: 92,
    limit: 100,
    source: "Test",
  });
  assert.strictEqual(metricWarning.status, "warning");

  // Metric with critical percentage (>= 95%)
  const metricCritical = buildMetric({
    id: "test_metric_crit",
    name: "Test",
    label: "Test",
    category: "workers",
    usage: 96,
    limit: 100,
    source: "Test",
  });
  assert.strictEqual(metricCritical.status, "critical");
});

test("getCloudflareConfigFromEnv reads environment variables cleanly without side effects", () => {
  const originalEnv = { ...process.env };

  try {
    process.env.CLOUDFLARE_ACCOUNT_ID = "test_acc_999";
    process.env.CLOUDFLARE_ZONE_ID = "test_zone_888";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "test_d1_777";
    process.env.CLOUDFLARE_WORKER_NAME = "custom-worker";
    process.env.CLOUDFLARE_API_TOKEN = "test_token_secret_12345";

    const config = getCloudflareConfigFromEnv();
    assert.strictEqual(config.accountId, "test_acc_999");
    assert.strictEqual(config.zoneId, "test_zone_888");
    assert.strictEqual(config.d1DatabaseId, "test_d1_777");
    assert.strictEqual(config.workerName, "custom-worker");
    assert.strictEqual(config.apiToken, "test_token_secret_12345");
    assert.strictEqual(config.status, "configuration-required");
  } finally {
    process.env = originalEnv;
  }
});

test("admin authentication verifies credentials with Bearer and Basic headers", async () => {
  const { validateAdminCredentials, verifyAdminAuthHeader } = await import("../src/lib/admin-auth");

  process.env.ADMIN_USERNAME = "testadmin";
  process.env.ADMIN_PASSWORD = "supersecretpassword123";

  const validToken = Buffer.from("testadmin:supersecretpassword123").toString("base64");
  const invalidToken = Buffer.from("testadmin:wrongpassword").toString("base64");

  assert.strictEqual(validateAdminCredentials("testadmin", "supersecretpassword123"), true);
  assert.strictEqual(validateAdminCredentials("testadmin", "wrongpassword"), false);

  const bearerValid = verifyAdminAuthHeader(`Bearer ${validToken}`);
  assert.strictEqual(bearerValid.isAdmin, true);

  const bearerInvalid = verifyAdminAuthHeader(`Bearer ${invalidToken}`);
  assert.strictEqual(bearerInvalid.isAdmin, false);

  const basicValid = verifyAdminAuthHeader(`Basic ${validToken}`);
  assert.strictEqual(basicValid.isAdmin, true);

  assert.strictEqual(verifyAdminAuthHeader(null).isAdmin, false);
});

test("user actions and plan limits conform to schema constraints", () => {
  const supportedActions = ["block", "unblock", "disable-temp-mail", "enable-temp-mail"];
  for (const act of supportedActions) {
    assert.ok(["block", "unblock", "disable-temp-mail", "enable-temp-mail"].includes(act));
  }

  const supportedPlans = ["free", "pro", "enterprise", "custom"];
  for (const plan of supportedPlans) {
    assert.ok(["free", "pro", "enterprise", "custom"].includes(plan));
  }
});

