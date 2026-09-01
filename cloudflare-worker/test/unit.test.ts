import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  generateMailboxId,
  generateMailboxToken,
  hashToken,
  timingSafeEqual,
  getExpirationMinutes,
  getDomain,
  getPageSize,
  uuid,
} from "../src/util";
import { sanitizeHtml, sanitizeFilename, isSafeAttachmentMimeType, sanitizeAttachments } from "../src/security";

describe("util", () => {
  test("generateMailboxId produces 12 lowercase alphanumeric chars", () => {
    const id = generateMailboxId();
    assert.equal(id.length, 12);
    assert.match(id, /^[a-z0-9]{12}$/);
  });

  test("generateMailboxId is unique across many calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 2000; i++) set.add(generateMailboxId());
    assert.equal(set.size, 2000);
  });

  test("generateMailboxToken produces 64-hex", () => {
    const t = generateMailboxToken();
    assert.equal(t.length, 64);
    assert.match(t, /^[0-9a-f]{64}$/);
  });

  test("hashToken is deterministic sha-256", async () => {
    const a = await hashToken("abc");
    const b = await hashToken("abc");
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test("timingSafeEqual matches/non-matches", async () => {
    assert.equal(await timingSafeEqual("same", "same"), true);
    assert.equal(await timingSafeEqual("same", "diff"), false);
    assert.equal(await timingSafeEqual("a", "ab"), false);
  });

  test("getExpirationMinutes defaults/clamps", () => {
    assert.equal(getExpirationMinutes({}), 30);
    assert.equal(getExpirationMinutes({ TEMP_MAIL_EXPIRATION_MINUTES: "120" }), 120);
    assert.equal(getExpirationMinutes({ TEMP_MAIL_EXPIRATION_MINUTES: "0" }), 30);
    assert.equal(getExpirationMinutes({ TEMP_MAIL_EXPIRATION_MINUTES: "9999" }), 30);
  });

  test("getDomain defaults to temp.cronjobs.site", () => {
    assert.equal(getDomain({}), "temp.cronjobs.site");
    assert.equal(getDomain({ TEMP_MAIL_DOMAIN: "Example.com" }), "example.com");
  });

  test("getPageSize defaults/clamps", () => {
    assert.equal(getPageSize({}), 20);
    assert.equal(getPageSize({ TEMP_MAIL_PAGE_SIZE: "5" }), 5);
    assert.equal(getPageSize({ TEMP_MAIL_PAGE_SIZE: "500" }), 20);
  });

  test("uuid is version-4 and unique", () => {
    const a = uuid();
    const b = uuid();
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(a, b);
  });
});

describe("security", () => {
  test("sanitizeHtml strips script tags", () => {
    assert.doesNotMatch(sanitizeHtml('<script>alert(1)</script>hello'), /<script/i);
    assert.match(sanitizeHtml('<script>alert(1)</script>hello'), /hello/);
  });

  test("sanitizeHtml removes event handlers", () => {
    assert.doesNotMatch(sanitizeHtml('<a onclick="alert(1)">x</a>'), /onclick/i);
    assert.doesNotMatch(sanitizeHtml('<img onerror="hack()">'), /onerror/i);
  });

  test("sanitizeHtml blocks javascript and data:text/html URLs", () => {
    assert.doesNotMatch(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), /javascript:/i);
    assert.doesNotMatch(sanitizeHtml('<iframe src="data:text/html,evil">'), /data:text\/html/i);
  });

  test("sanitizeHtml drops forbidden tags", () => {
    assert.doesNotMatch(sanitizeHtml('<iframe src="x"></iframe>ok'), /<iframe/i);
    assert.doesNotMatch(sanitizeHtml('<form>x</form>'), /<form/i);
    assert.doesNotMatch(sanitizeHtml("<style>body{display:none}</style>ok"), /<style/i);
  });

  test("sanitizeFilename guards traversal and dots", () => {
    assert.equal(sanitizeFilename("../../etc/passwd"), "etcpasswd");
    assert.doesNotMatch(sanitizeFilename("..\\..\\x"), /[\\/]/);
    assert.equal(sanitizeFilename(""), "attachment");
  });

  test("isSafeAttachmentMimeType rejects executables", () => {
    assert.equal(isSafeAttachmentMimeType("application/javascript"), false);
    assert.equal(isSafeAttachmentMimeType("text/javascript"), false);
    assert.equal(isSafeAttachmentMimeType("application/x-sh"), false);
    assert.equal(isSafeAttachmentMimeType("application/pdf"), true);
    assert.equal(isSafeAttachmentMimeType("image/png"), true);
  });

  test("sanitizeAttachments filters unsafe types and dedupes", () => {
    const out = sanitizeAttachments([
      { filename: "a.js", contentType: "application/javascript", size: 10 },
      { filename: "a.html", contentType: "text/html", size: 20 },
      { filename: "../../evil", contentType: "application/pdf", size: 5 },
    ]);
    assert.equal(out.length, 2);
    assert.ok(out.every((a) => !a.filename.includes("..")));
  });
});
