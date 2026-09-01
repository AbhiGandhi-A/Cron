import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getUsageConfig,
  getUsageSnapshot,
  recordUsage,
  getUsageProtectionStatus,
  type UsageResourceName,
} from "../src/usage";

test("usage config calculates safety, warning, and block thresholds from Cloudflare limits", () => {
  const config = getUsageConfig({
    CLOUDFLARE_USAGE_PROTECTION_ENABLED: "true",
    CLOUDFLARE_SAFETY_PERCENT: "90",
    CLOUDFLARE_WARNING_PERCENT: "90",
    CLOUDFLARE_BLOCK_PERCENT: "95",
    CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT: "100000",
    CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT: "5000000",
    CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT: "100000",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.workerRequestsDailyLimit, 100000);
  assert.equal(config.workerRequestsSafetyLimit, 90000);
  assert.equal(config.workerRequestsWarningLimit, 81000);
  assert.equal(config.workerRequestsBlockLimit, 85500);
  assert.equal(config.d1RowsReadSafetyLimit, 4500000);
  assert.equal(config.d1RowsWrittenBlockLimit, 85500);
});

test("usage snapshot marks warning and block states correctly by resource", () => {
  const config = getUsageConfig({
    CLOUDFLARE_USAGE_PROTECTION_ENABLED: "true",
    CLOUDFLARE_SAFETY_PERCENT: "90",
    CLOUDFLARE_WARNING_PERCENT: "90",
    CLOUDFLARE_BLOCK_PERCENT: "95",
    CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT: "100",
  });

  const workerStatus = getUsageProtectionStatus("worker_requests", config, 82, new Date("2026-09-01T00:00:00Z"));
  const d1ReadStatus = getUsageProtectionStatus("d1_reads", config, 82, new Date("2026-09-01T00:00:00Z"));
  const d1WriteStatus = getUsageProtectionStatus("d1_writes", config, 96, new Date("2026-09-01T00:00:00Z"));

  assert.equal(workerStatus.status, "warning");
  assert.equal(d1ReadStatus.status, "warning");
  assert.equal(d1WriteStatus.status, "blocked");
});

test("daily reset clears usage for the next UTC day", () => {
  const env = {
    CLOUDFLARE_USAGE_PROTECTION_ENABLED: "true",
    CLOUDFLARE_SAFETY_PERCENT: "90",
    CLOUDFLARE_WARNING_PERCENT: "90",
    CLOUDFLARE_BLOCK_PERCENT: "95",
    CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT: "100",
  };

  const config = getUsageConfig(env);
  recordUsage("worker_requests", 50, config, new Date("2026-09-01T23:59:59Z"));

  const nextDay = getUsageSnapshot(env, new Date("2026-09-02T00:00:00Z"));
  const status = getUsageProtectionStatus("worker_requests", config, 0, new Date("2026-09-02T00:00:00Z"));

  assert.equal(nextDay.date, "2026-09-02");
  assert.equal(status.status, "healthy");
});

test("usage protection can be disabled without breaking Temp Mail", () => {
  const config = getUsageConfig({
    CLOUDFLARE_USAGE_PROTECTION_ENABLED: "false",
    CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT: "100",
  });

  assert.equal(config.enabled, false);
  const snapshot = getUsageSnapshot({
    CLOUDFLARE_USAGE_PROTECTION_ENABLED: "false",
    CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT: "100",
    CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT: "100",
  });

  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.status, "healthy");
});

const resourceNames: UsageResourceName[] = ["worker_requests", "d1_reads", "d1_writes"];
for (const name of resourceNames) {
  test(`resource ${name} stays healthy below its warning threshold`, () => {
    const status = getUsageProtectionStatus(name, getUsageConfig({
      CLOUDFLARE_USAGE_PROTECTION_ENABLED: "true",
      CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT: "100",
      CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT: "100",
      CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT: "100",
    }), 10, new Date("2026-09-01T00:00:00Z"));

    assert.equal(status.status, "healthy");
  });
}
