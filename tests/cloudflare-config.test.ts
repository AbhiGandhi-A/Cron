import test from "node:test";
import assert from "node:assert/strict";

import {
  maskCloudflareSecret,
  serializeCloudflareConfig,
} from "@/lib/cloudflare-config";

test("maskCloudflareSecret never exposes the full token", () => {
  assert.equal(maskCloudflareSecret("abcd1234efgh5678ijkl"), "abcd************ijkl");
});

test("serializeCloudflareConfig omits the raw token from client-safe output", () => {
  const payload = serializeCloudflareConfig({
    accountId: "acct_123",
    zoneId: "zone_456",
    apiToken: "secret-token-789",
    lastTested: "2026-09-01T00:00:00.000Z",
    status: "connected",
    connectionMessage: "Cloudflare account connected",
  });

  assert.equal(payload.accountId, "acct_123");
  assert.equal(payload.zoneId, "zone_456");
  assert.equal(payload.apiToken, undefined);
  assert.equal(payload.apiTokenPresent, true);
  assert.equal(payload.tokenPreview, "secr********-789");
});
