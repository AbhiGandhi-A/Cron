import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  maskCloudflareSecret,
  serializeCloudflareConfig,
  getCloudflareConfigFromEnv,
} from "@/lib/cloudflare-config";

test("maskCloudflareSecret never exposes the full token", () => {
  const fullToken = "thisIsAVeryLongCloudflareAPIToken";
  const masked = maskCloudflareSecret(fullToken);
  assert(!masked.includes("VeryLong"), "Masked token should not contain middle part");
  assert(!masked.includes(fullToken), "Masked token should not be the full token");
  assert(masked.includes("*"), "Masked token should contain asterisks");
});

test("maskCloudflareSecret shows first and last 4 characters", () => {
  const token = "abcdefghijklmnop";
  const masked = maskCloudflareSecret(token);
  assert(masked.startsWith("abcd"), "Should start with first 4 chars");
  assert(masked.endsWith("mnop"), "Should end with last 4 chars");
});

test("maskCloudflareSecret handles short tokens", () => {
  const shortToken = "abc";
  const masked = maskCloudflareSecret(shortToken);
  assert.equal(masked, "***", "Masked short token should all be asterisks");
});

test("maskCloudflareSecret handles empty tokens", () => {
  const masked = maskCloudflareSecret("");
  assert.equal(masked, "", "Empty token should return empty string");
});

test("serializeCloudflareConfig omits the raw token from client-safe output", () => {
  const config = {
    accountId: "abc123",
    zoneId: "zone123",
    d1DatabaseId: "db123",
    workerName: "my-worker",
    apiToken: "thisIsAVerySecureToken",
    status: "connected" as const,
    connectionMessage: "Connected",
    lastTested: "2024-01-01T00:00:00Z",
  };

  const serialized = serializeCloudflareConfig(config);
  
  assert.equal(serialized.apiToken, undefined, "Raw API token should not be in output");
  assert(!Object.values(serialized).includes("thisIsAVerySecureToken"), "Token value should not appear anywhere");
  assert.equal(serialized.apiTokenPresent, true, "Should indicate token is present");
  assert(serialized.tokenPreview !== undefined, "Should include masked token preview");
});

test("serializeCloudflareConfig includes all credential fields", () => {
  const config = {
    accountId: "account123",
    zoneId: "zone456",
    d1DatabaseId: "db789",
    workerName: "my-worker",
    apiToken: "token",
    status: "connected" as const,
    connectionMessage: "Connected",
    lastTested: null,
  };

  const serialized = serializeCloudflareConfig(config);
  
  assert.equal(serialized.accountId, "account123", "Should include account ID");
  assert.equal(serialized.zoneId, "zone456", "Should include zone ID");
  assert.equal(serialized.d1DatabaseId, "db789", "Should include D1 database ID");
  assert.equal(serialized.workerName, "my-worker", "Should include worker name");
});

test("getCloudflareConfigFromEnv reads all environment variables", () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = "env_account";
  process.env.CLOUDFLARE_ZONE_ID = "env_zone";
  process.env.CLOUDFLARE_D1_DATABASE_ID = "env_db";
  process.env.CLOUDFLARE_WORKER_NAME = "env_worker";
  process.env.CLOUDFLARE_API_TOKEN = "env_token";

  const config = getCloudflareConfigFromEnv();

  assert.equal(config.accountId, "env_account", "Should read account ID from env");
  assert.equal(config.zoneId, "env_zone", "Should read zone ID from env");
  assert.equal(config.d1DatabaseId, "env_db", "Should read D1 database ID from env");
  assert.equal(config.workerName, "env_worker", "Should read worker name from env");
  assert.equal(config.apiToken, "env_token", "Should read API token from env");
  assert.equal(config.status, "configuration-required", "Status should be configuration-required");

  // Cleanup
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_ZONE_ID;
  delete process.env.CLOUDFLARE_D1_DATABASE_ID;
  delete process.env.CLOUDFLARE_WORKER_NAME;
  delete process.env.CLOUDFLARE_API_TOKEN;
});

test("getCloudflareConfigFromEnv returns not-configured when missing credentials", () => {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;

  const config = getCloudflareConfigFromEnv();

  assert.equal(config.status, "not-configured", "Status should be not-configured when no creds");
  assert(config.connectionMessage.includes("Configuration Required"), "Should indicate configuration required");
});

test("serializeCloudflareConfig never exposes raw token regardless of input", () => {
  const config = {
    accountId: "acc",
    zoneId: "zone",
    d1DatabaseId: "db",
    workerName: "worker",
    apiToken: "super_secret_token_12345",
    status: "connected" as const,
    connectionMessage: "Ok",
    lastTested: null,
  };

  const serialized = serializeCloudflareConfig(config);

  assert(!Object.values(serialized).includes("super_secret_token_12345"), "Raw token must not appear");
  assert(Object.keys(serialized).includes("apiTokenPresent"), "Must indicate if token present");
  assert(Object.keys(serialized).includes("tokenPreview"), "Must include masked preview");
  assert.equal(serialized.apiToken, undefined, "apiToken field must be undefined");
});

test("maskCloudflareSecret handles variable token lengths correctly", () => {
  const test1 = maskCloudflareSecret("short");
  assert.equal(test1, "*****", "5 char token should mask to 5 asterisks");

  const test2 = maskCloudflareSecret("abcdefghij");
  assert(test2.startsWith("abcd"), "Should show first 4 chars");
  assert(test2.endsWith("hij"), "Should show last 3 chars for 10 char token");

  const test3 = maskCloudflareSecret("a".repeat(100));
  assert(test3.length === 100, "Masked length should match input length");
});

test("serializeCloudflareConfig correctly indicates token presence", () => {
  const withToken = serializeCloudflareConfig({
    accountId: "acc",
    zoneId: "zone",
    d1DatabaseId: "db",
    workerName: "worker",
    apiToken: "token123",
    status: "connected" as const,
    connectionMessage: "Ok",
    lastTested: null,
  });

  assert.equal(withToken.apiTokenPresent, true, "Should indicate token is present");

  const withoutToken = serializeCloudflareConfig({
    accountId: "acc",
    zoneId: "zone",
    d1DatabaseId: "db",
    workerName: "worker",
    apiToken: "",
    status: "not-configured" as const,
    connectionMessage: "Missing token",
    lastTested: null,
  });

  assert.equal(withoutToken.apiTokenPresent, false, "Should indicate token is absent");
  assert.equal(withoutToken.tokenPreview, "", "Should have empty preview when no token");
});
