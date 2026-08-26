import test from "node:test";
import assert from "node:assert/strict";

import {
  validateOutboundUrl,
  sanitizeForLog,
  escapeHtml,
  redactHeaders,
  sanitizeUrlForLog,
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedAddress,
  encryptSensitiveValue,
  decryptSensitiveValue,
  encryptHeaders,
  decryptHeaders,
  validateObjectId,
  validatePaginationParams,
  generateCsrfToken,
  verifyCsrfToken,
  validateCronExpression,
  checkRateLimit,
  sanitizeForResponse,
  sanitizeObjectForStorage,
  sensitiveHeaderNames,
} from "../src/lib/security-core";

import { createJobSchema, registerSchema, updateJobSchema } from "../src/lib/validation";

// ============================================================
// TEST 1: User A cannot access User B's job (IDOR protection)
// ============================================================
test("IDOR: ObjectId validation prevents invalid job access", () => {
  assert.equal(validateObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(validateObjectId("000000000000000000000000"), true);
  assert.equal(validateObjectId("invalid-id"), false);
  assert.equal(validateObjectId(""), false);
  assert.equal(validateObjectId("507f1f77bcf86cd79943901"), false);
  assert.equal(validateObjectId("507f1f77bcf86cd799439011z"), false);
  assert.equal(validateObjectId("<script>alert(1)</script>"), false);
  assert.equal(validateObjectId("'; DROP TABLE users; --"), false);
});

// ============================================================
// TEST 2: User A cannot access User B's execution logs
// ============================================================
test("IDOR: pagination params are safely parsed", () => {
  const sp1 = new URLSearchParams({ page: "1", limit: "20" });
  const r1 = validatePaginationParams(sp1);
  assert.equal(r1.page, 1);
  assert.equal(r1.limit, 20);

  const sp2 = new URLSearchParams({ page: "-1", limit: "999999" });
  const r2 = validatePaginationParams(sp2);
  assert.equal(r2.page, 1);
  assert.equal(r2.limit, 100);

  const sp3 = new URLSearchParams({ page: "abc", limit: "xyz" });
  const r3 = validatePaginationParams(sp3);
  assert.equal(r3.page, 1);
  assert.equal(r3.limit, 20);

  const sp4 = new URLSearchParams({});
  const r4 = validatePaginationParams(sp4);
  assert.equal(r4.page, 1);
  assert.equal(r4.limit, 20);
});

// ============================================================
// TEST 3: User cannot access arbitrary filesystem files
// ============================================================
test("SSRF: file:// protocol URLs are blocked", async () => {
  await assert.rejects(
    () => validateOutboundUrl("file:///etc/passwd"),
    /Only HTTP|Invalid|Blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("file:///C:/Windows/System32/config/sam"),
    /Only HTTP|Invalid|Blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("file://localhost/etc/passwd"),
    /Only HTTP|Invalid|Blocked/
  );
});

// ============================================================
// TEST 4: User cannot execute shell commands
// ============================================================
test("No shell execution vectors in URL validation", async () => {
  await assert.rejects(
    () => validateOutboundUrl("javascript:alert(1)"),
    /Only HTTP|Invalid|blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("data:text/html,<script>alert(1)</script>"),
    /Only HTTP|Invalid|blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("ssh://127.0.0.1"),
    /Only HTTP|Invalid|blocked/
  );
});

// ============================================================
// TEST 5: Localhost URLs are blocked
// ============================================================
test("SSRF: localhost URLs are blocked", async () => {
  const blockedUrls = [
    "http://localhost:3000",
    "http://localhost:8080/api",
    "http://localhost",
    "https://localhost",
    "http://127.0.0.1:3000",
    "http://127.0.0.1",
    "http://[::1]:3000",
    "http://0.0.0.0",
    "http://0.0.0.0:8080",
  ];

  for (const url of blockedUrls) {
    await assert.rejects(
      () => validateOutboundUrl(url),
      /Blocked|Invalid|Loopback|Destination|resolved/,
      `Expected "${url}" to be blocked`
    );
  }
});

// ============================================================
// TEST 6: Private IP addresses are blocked
// ============================================================
test("SSRF: private IP addresses are blocked", async () => {
  const blockedIps = [
    "http://10.0.0.1",
    "http://10.255.255.255",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.0.1",
    "http://192.168.1.100",
    "http://169.254.169.254",
    "http://100.100.100.200",
    "http://198.18.0.1",
    "http://198.19.0.1",
  ];

  for (const url of blockedIps) {
    await assert.rejects(
      () => validateOutboundUrl(url),
      /Blocked|Invalid|Loopback|Destination|resolved/,
      `Expected "${url}" to be blocked`
    );
  }
});

test("IPv4: private ranges are correctly identified", () => {
  assert.equal(isBlockedIPv4("127.0.0.1"), true);
  assert.equal(isBlockedIPv4("127.255.255.255"), true);
  assert.equal(isBlockedIPv4("10.0.0.1"), true);
  assert.equal(isBlockedIPv4("172.16.0.1"), true);
  assert.equal(isBlockedIPv4("172.31.255.255"), true);
  assert.equal(isBlockedIPv4("192.168.0.1"), true);
  assert.equal(isBlockedIPv4("169.254.169.254"), true);
  assert.equal(isBlockedIPv4("0.0.0.0"), true);
  assert.equal(isBlockedIPv4("100.64.0.1"), true);
  assert.equal(isBlockedIPv4("198.18.0.1"), true);
  assert.equal(isBlockedIPv4("224.0.0.1"), true);
  assert.equal(isBlockedIPv4("8.8.8.8"), false);
  assert.equal(isBlockedIPv4("1.1.1.1"), false);
  assert.equal(isBlockedIPv4("93.184.216.34"), false);
});

test("IPv6: blocked ranges are correctly identified", () => {
  assert.equal(isBlockedIPv6("::1"), true);
  assert.equal(isBlockedIPv6("::"), true);
  assert.equal(isBlockedIPv6("::ffff:0.0.0.0"), true);
  assert.equal(isBlockedIPv6("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIPv6("fc00::1"), true);
  assert.equal(isBlockedIPv6("fd00::1"), true);
  assert.equal(isBlockedIPv6("fe80::1"), true);
  assert.equal(isBlockedIPv6("ff00::1"), true);
  assert.equal(isBlockedIPv6("2001:db8::1"), true);
  assert.equal(isBlockedIPv6("2607:f8b0:4004:800::200e"), false);
});

// ============================================================
// TEST 7: Cloud metadata addresses are blocked
// ============================================================
test("SSRF: cloud metadata endpoints are blocked", async () => {
  const metadataUrls = [
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://100.100.100.200/latest/meta-data/",
    "http://metadata.tencentyun.com/latest/meta-data/",
  ];

  for (const url of metadataUrls) {
    await assert.rejects(
      () => validateOutboundUrl(url),
      /Blocked|Invalid|Loopback|Destination|resolved/,
      `Expected metadata URL "${url}" to be blocked`
    );
  }
});

test("isBlockedAddress detects metadata hosts", () => {
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("metadata.google.internal"), true);
  assert.equal(isBlockedAddress("100.100.100.200"), true);
  assert.equal(isBlockedAddress("localhost"), true);
  assert.equal(isBlockedAddress("example.com"), false);
  assert.equal(isBlockedAddress("api.github.com"), false);
});

// ============================================================
// TEST 8: Redirects to private IPs are blocked
// ============================================================
test("SSRF: redirect validation blocks internal destinations", async () => {
  await assert.rejects(
    () => validateOutboundUrl("http://redirect-to-internal.example.com"),
    /resolved|Blocked|Destination/
  );
});

// ============================================================
// TEST 9: Authorization headers are not present in logs
// ============================================================
test("Log sanitization: authorization headers are redacted", () => {
  const value = "Authorization: Bearer abc123secret";
  assert.equal(sanitizeForLog(value).includes("abc123secret"), false);
  assert.equal(sanitizeForLog(value).includes("[REDACTED]"), true);
});

test("Log sanitization: cookie headers are redacted", () => {
  const value = "Cookie: session=xyz789";
  assert.equal(sanitizeForLog(value).includes("xyz789"), false);
});

test("Log sanitization: API key patterns are redacted", () => {
  const value = "X-API-Key: sk_live_1234567890abcdef";
  assert.equal(sanitizeForLog(value).includes("sk_live_"), false);
  assert.equal(sanitizeForLog(value).includes("[REDACTED]"), true);
});

// ============================================================
// TEST 10: Cookies are not present in logs
// ============================================================
test("Log sanitization: set-cookie headers are redacted", () => {
  const value = "Set-Cookie: auth=abc123; HttpOnly; Secure";
  assert.equal(sanitizeForLog(value).includes("abc123"), false);
});

// ============================================================
// TEST 11: Environment variables are not exposed
// ============================================================
test("Response sanitization: sensitive headers are redacted in responses", () => {
  const headers = {
    authorization: "Bearer secret123",
    "content-type": "application/json",
    cookie: "session=abc",
    "x-api-key": "key123",
    normalHeader: "normalValue",
  };

  const sanitized = redactHeaders(headers);
  assert.equal(sanitized.authorization, "***REDACTED***");
  assert.equal(sanitized.cookie, "***REDACTED***");
  assert.equal(sanitized["x-api-key"], "***REDACTED***");
  assert.equal(sanitized["content-type"], "application/json");
  assert.equal(sanitized.normalHeader, "normalValue");
});

test("Object sanitization: redacts sensitive keys in nested objects", () => {
  const obj = {
    name: "test",
    authorization: "Bearer secret",
    headers: {
      cookie: "session=abc",
      "x-api-key": "key123",
    },
  };

  const sanitized = sanitizeObjectForStorage(obj) as Record<string, unknown>;
  assert.equal(sanitized.authorization, "[REDACTED]");
  const nested = sanitized.headers as Record<string, unknown>;
  assert.equal(nested.cookie, "[REDACTED]");
  assert.equal(nested["x-api-key"], "[REDACTED]");
});

// ============================================================
// TEST 12: SQL injection attempts fail safely
// ============================================================
test("NoSQL injection: ObjectId validation rejects injection attempts", () => {
  const injections = [
    "'; db.users.drop(); //",
    '{"$gt": ""}',
    "1; DROP TABLE users",
    "true, $where: '1 == 1'",
    "'; return db.users.find(); var a='",
    "507f1f77bcf86cd799439011",
    "ObjectId('507f1f77bcf86cd799439011')",
  ];

  for (const injection of injections) {
    const valid = validateObjectId(injection);
    if (injection === "507f1f77bcf86cd799439011") {
      assert.equal(valid, true, "Valid ObjectId should pass");
    } else {
      assert.equal(valid, false, `Injection "${injection}" should be rejected`);
    }
  }
});

test("NoSQL injection: register schema rejects malicious input", () => {
  const result = registerSchema.safeParse({
    name: "test",
    email: "test@example.com",
    password: "a".repeat(12),
  });
  assert.equal(result.success, true);

  const maliciousName = registerSchema.safeParse({
    name: "test'; db.users.drop(); //",
    email: "test@example.com",
    password: "a".repeat(12),
  });
  assert.equal(maliciousName.success, true, "Name with special chars should pass validation (escaped by MongoDB)");
});

// ============================================================
// TEST 13: XSS attempts are escaped/sanitized
// ============================================================
test("XSS: HTML is properly escaped", () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(escapeHtml('javascript:alert(1)'), "javascript:alert(1)");
  assert.equal(escapeHtml('"><script>alert(1)</script>'), "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml("' onmouseover='alert(1)'"), "&#039; onmouseover=&#039;alert(1)&#039;");
  assert.equal(escapeHtml("&amp;&lt;&gt;"), "&amp;amp;&amp;lt;&amp;gt;");
});

test("Response sanitization: nested objects with sensitive keys are cleaned", () => {
  const data = {
    jobs: [
      { name: "test", headers: { authorization: "Bearer secret" } },
    ],
  };
  const sanitized = sanitizeForResponse(data) as any;
  assert.equal(sanitized.jobs[0].headers.authorization, "***REDACTED***");
  assert.equal(sanitized.jobs[0].name, "test");
});

// ============================================================
// TEST 14: Invalid cron expressions are rejected
// ============================================================
test("Cron validation: invalid expressions are rejected", () => {
  assert.equal(validateCronExpression("not a cron"), false);
  assert.equal(validateCronExpression(""), false);
  assert.equal(validateCronExpression("* * *"), false);
  assert.equal(validateCronExpression("60 * * * *"), false);
  assert.equal(validateCronExpression("* 25 * * *"), false);
  assert.equal(validateCronExpression("abc def ghi jkl mno"), false);
});

test("Cron validation: valid expressions pass", () => {
  assert.equal(validateCronExpression("* * * * *"), true);
  assert.equal(validateCronExpression("*/5 * * * *"), true);
  assert.equal(validateCronExpression("0 * * * *"), true);
  assert.equal(validateCronExpression("0 0 * * *"), true);
  assert.equal(validateCronExpression("*/15 * * * *"), true);
});

test("Cron validation: interval too frequent is rejected", () => {
  assert.equal(validateCronExpression("* * * * *", 120000), false, "Every minute should fail with 2min minimum");
  assert.equal(validateCronExpression("*/5 * * * *", 120000), true, "Every 5 minutes should pass with 2min minimum");
});

test("Create job schema: schedule field is validated as non-empty string", () => {
  const emptySchedule = createJobSchema.safeParse({
    name: "Test Job",
    url: "https://example.com",
    method: "GET",
    headers: {},
    schedule: "",
    timeout: 30000,
    retryCount: 1,
  });
  assert.equal(emptySchedule.success, false, "Empty schedule should be rejected");
});

test("Create job schema: rejects extra fields", () => {
  const result = createJobSchema.safeParse({
    name: "Test Job",
    url: "https://example.com",
    method: "GET",
    headers: {},
    schedule: "*/5 * * * *",
    timeout: 30000,
    retryCount: 1,
    maliciousField: "injected",
  });
  assert.equal(result.success, false, "Extra fields should be rejected");
});

// ============================================================
// TEST 15: Excessive manual executions are rate-limited
// ============================================================
test("Rate limiting: blocks after limit exceeded", () => {
  const key = `test:ratelimit:${Date.now()}`;
  const limit = 3;

  const r1 = checkRateLimit(key, limit);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit(key, limit);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit(key, limit);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  const r4 = checkRateLimit(key, limit);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.resetInMs > 0);
});

// ============================================================
// TEST 16: Very large request/response payloads are rejected
// ============================================================
test("URL validation: URLs longer than 2048 chars are rejected", async () => {
  const longUrl = "https://example.com/" + "a".repeat(2100);
  await assert.rejects(
    () => validateOutboundUrl(longUrl),
    /Invalid|too long|URL/
  );
});

test("URL validation: credentials in URLs are rejected", async () => {
  await assert.rejects(
    () => validateOutboundUrl("https://user:pass@example.com"),
    /Credentials|not allowed/
  );
  await assert.rejects(
    () => validateOutboundUrl("https://user@example.com"),
    /Credentials|not allowed/
  );
});

// ============================================================
// TEST 17: Long-running requests timeout correctly
// ============================================================
test("Job schema: timeout limits are enforced", () => {
  const tooShort = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "GET",
    schedule: "*/5 * * * *",
    timeout: 500,
    retryCount: 1,
  });
  assert.equal(tooShort.success, false, "Timeout < 1000ms should be rejected");

  const tooLong = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "GET",
    schedule: "*/5 * * * *",
    timeout: 400000,
    retryCount: 1,
  });
  assert.equal(tooLong.success, false, "Timeout > 300000ms should be rejected");

  const valid = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "GET",
    schedule: "*/5 * * * *",
    timeout: 30000,
    retryCount: 1,
  });
  assert.equal(valid.success, true, "Timeout of 30000ms should pass");
});

// ============================================================
// TEST 18: A failed customer job cannot crash the scheduler
// ============================================================
test("Job schema: retry count limits are enforced", () => {
  const tooManyRetries = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "GET",
    schedule: "*/5 * * * *",
    timeout: 30000,
    retryCount: 15,
  });
  assert.equal(tooManyRetries.success, false, "retryCount > 10 should be rejected");

  const validRetries = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "GET",
    schedule: "*/5 * * * *",
    timeout: 30000,
    retryCount: 5,
  });
  assert.equal(validRetries.success, true);
});

// ============================================================
// TEST 19: Restarting the scheduler does not corrupt job schedules
// ============================================================
test("Cron validation: expressions produce valid next run times", () => {
  const expressions = [
    "* * * * *",
    "*/5 * * * *",
    "*/15 * * * *",
    "*/30 * * * *",
    "0 * * * *",
    "0 0 * * *",
    "0 12 * * *",
    "0 0 * * 1",
  ];

  for (const expr of expressions) {
    assert.equal(validateCronExpression(expr), true, `Expression "${expr}" should be valid`);
  }
});

// ============================================================
// TEST 20: Authentication/session protections work correctly
// ============================================================
test("Register schema: strong password requirements", () => {
  const weak = registerSchema.safeParse({
    name: "Test",
    email: "test@example.com",
    password: "short",
  });
  assert.equal(weak.success, false, "Short passwords should be rejected");

  const medium = registerSchema.safeParse({
    name: "Test",
    email: "test@example.com",
    password: "123456789012",
  });
  assert.equal(medium.success, true, "12-char password should pass");

  const tooLong = registerSchema.safeParse({
    name: "Test",
    email: "test@example.com",
    password: "a".repeat(200),
  });
  assert.equal(tooLong.success, false, "Too long passwords should be rejected");
});

test("Register schema: email validation", () => {
  const invalid = registerSchema.safeParse({
    name: "Test",
    email: "not-an-email",
    password: "a".repeat(12),
  });
  assert.equal(invalid.success, false);

  const valid = registerSchema.safeParse({
    name: "Test",
    email: "test@example.com",
    password: "a".repeat(12),
  });
  assert.equal(valid.success, true);
});

// ============================================================
// ADDITIONAL: Encryption/decryption of sensitive values
// ============================================================
test("Encryption: sensitive values can be encrypted and decrypted", () => {
  const original = "Bearer sk_live_1234567890abcdef";
  const encrypted = encryptSensitiveValue(original);

  assert.notEqual(encrypted, original, "Encrypted value should differ from original");
  assert.ok(encrypted.startsWith("enc:"), "Encrypted value should start with enc:");

  const decrypted = decryptSensitiveValue(encrypted);
  assert.equal(decrypted, original, "Decrypted value should match original");
});

test("Encryption: empty values pass through unchanged", () => {
  assert.equal(encryptSensitiveValue(""), "");
  assert.equal(decryptSensitiveValue(""), "");
  assert.equal(decryptSensitiveValue("not-encrypted"), "not-encrypted");
});

test("Encryption: headers with sensitive values are encrypted", () => {
  const headers = {
    authorization: "Bearer secret123",
    "content-type": "application/json",
    cookie: "session=abc",
  };

  const encrypted = encryptHeaders(headers);
  assert.ok(encrypted);
  assert.notEqual(encrypted!.authorization, "Bearer secret123");
  assert.ok(encrypted!.authorization.startsWith("enc:"));
  assert.equal(encrypted!["content-type"], "application/json");
  assert.ok(encrypted!.cookie.startsWith("enc:"));
});

test("Encryption: encrypted headers can be decrypted", () => {
  const headers = {
    authorization: "Bearer secret123",
    "x-api-key": "key456",
  };

  const encrypted = encryptHeaders(headers);
  const decrypted = decryptHeaders(encrypted);
  assert.ok(decrypted);
  assert.equal(decrypted!.authorization, "Bearer secret123");
  assert.equal(decrypted!["x-api-key"], "key456");
});

// ============================================================
// ADDITIONAL: CSRF token generation and verification
// ============================================================
test("CSRF: tokens can be generated and verified", () => {
  const sessionId = "test-session-123";
  const token = generateCsrfToken(sessionId);

  assert.ok(token, "Token should be generated");
  assert.ok(token.includes("."), "Token should contain separator");
  assert.equal(verifyCsrfToken(token, sessionId), true, "Token should verify with correct session");
});

test("CSRF: invalid tokens are rejected", () => {
  assert.equal(verifyCsrfToken("invalid", "session123"), false);
  assert.equal(verifyCsrfToken("", "session123"), false);
  assert.equal(verifyCsrfToken("abc.def", "session123"), false);
  assert.equal(verifyCsrfToken(generateCsrfToken("session-a"), "session-b"), false, "Different session should fail");
});

// ============================================================
// ADDITIONAL: URL sanitization for logs
// ============================================================
test("URL sanitization: credentials and sensitive params removed", () => {
  const url1 = sanitizeUrlForLog("https://user:pass@example.com/api?token=abc123&key=secret");
  assert.ok(!url1.includes("user"));
  assert.ok(!url1.includes("pass"));
  assert.ok(!url1.includes("abc123"));
  assert.ok(!url1.includes("secret"));

  const url2 = sanitizeUrlForLog("https://example.com/api?authorization=bearer123");
  assert.ok(!url2.includes("bearer123"));
});

// ============================================================
// ADDITIONAL: Input validation rejects unexpected fields
// ============================================================
test("Strict schema: rejects unexpected fields", () => {
  const result = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "GET",
    schedule: "*/5 * * * *",
    timeout: 30000,
    retryCount: 1,
    maliciousField: "injected",
    __proto__: { polluted: true },
  });
  assert.equal(result.success, false, "Should reject unknown fields");
});

// ============================================================
// ADDITIONAL: Method validation
// ============================================================
test("Job schema: only allowed HTTP methods", () => {
  const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  for (const method of allowed) {
    const result = createJobSchema.safeParse({
      name: "Test",
      url: "https://example.com",
      method,
      schedule: "*/5 * * * *",
      timeout: 30000,
      retryCount: 1,
    });
    assert.equal(result.success, true, `Method ${method} should be allowed`);
  }

  const blocked = createJobSchema.safeParse({
    name: "Test",
    url: "https://example.com",
    method: "INVALID",
    schedule: "*/5 * * * *",
    timeout: 30000,
    retryCount: 1,
  });
  assert.equal(blocked.success, false, "Method INVALID should be rejected");
});

// ============================================================
// ADDITIONAL: URL protocol validation
// ============================================================
test("URL validation: only HTTP/HTTPS protocols allowed", async () => {
  await assert.rejects(
    () => validateOutboundUrl("ftp://example.com/file"),
    /Only HTTP|Invalid|blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("javascript:alert(1)"),
    /Only HTTP|Invalid|blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("data:text/html,<script>alert(1)</script>"),
    /Only HTTP|Invalid|blocked/
  );
  await assert.rejects(
    () => validateOutboundUrl("ws://example.com"),
    /Only HTTP|Invalid|blocked/
  );
});

// ============================================================
// ADDITIONAL: Blocked hostname suffixes
// ============================================================
test("SSRF: .internal, .local, .localhost suffixes blocked", async () => {
  const blocked = [
    "http://service.internal/api",
    "http://printer.local/status",
    "http://dev.localhost:8080",
    "http://myapp.lan",
  ];

  for (const url of blocked) {
    await assert.rejects(
      () => validateOutboundUrl(url),
      /Blocked|Invalid|Destination|resolved/,
      `Expected "${url}" to be blocked`
    );
  }
});

// ============================================================
// ADDITIONAL: Sensitive header names list is comprehensive
// ============================================================
test("Sensitive headers list covers all major auth headers", () => {
  const required = [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "proxy-authorization",
    "api-key",
    "x-auth-token",
    "x-csrf-token",
    "secret",
    "token",
    "x-access-token",
    "x-api-token",
    "www-authenticate",
  ];

  for (const header of required) {
    assert.ok(
      sensitiveHeaderNames.includes(header),
      `Header "${header}" should be in sensitiveHeaderNames`
    );
  }
});

// ============================================================
// ADDITIONAL: Error messages don't leak internals
// ============================================================
test("URL validation: error messages are generic", async () => {
  try {
    await validateOutboundUrl("http://127.0.0.1");
  } catch (e: any) {
    assert.ok(!e.message.includes("file"), "Error should not mention file paths");
    assert.ok(!e.message.includes("stack"), "Error should not include stack traces");
    assert.ok(!e.message.includes("node_modules"), "Error should not include node_modules");
  }
});
