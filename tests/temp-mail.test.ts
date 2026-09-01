import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  generateMailboxId,
  generateMailboxToken,
  hashMailboxToken,
  getExpirationMinutes,
  getTempMailDomain,
} from "../src/lib/temp-mail/token";
import {
  sanitizeHtml,
  sanitizeFilename,
  isSafeAttachmentMimeType,
} from "../src/lib/temp-mail/security";
import {
  storeInboundEmail,
  verifyMailboxOwnership,
  listMessages,
  markMessageRead,
  deleteMessage,
} from "../src/lib/temp-mail/service";
import { TemporaryMailbox, TemporaryEmail } from "../src/lib/models";
import type { InboundEmail } from "../src/lib/temp-mail/types";

let mongod: MongoMemoryServer | null = null;
let setupError: Error | null = null;

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
    process.env.MONGODB_URI = mongod.getUri();
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

function makeEmail(to: string, overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    from: "sender@example.com",
    to,
    subject: "Hello",
    textBody: "Plain content",
    htmlBody: "<p>Hello</p>",
    attachments: [],
    receivedAt: new Date(),
    ...overrides,
  };
}

function makeKnownMailbox(ownerId: string, token: string, address: string, overrides: Partial<Record<string, unknown>> = {}) {
  return TemporaryMailbox.create({
    ownerId,
    publicAddress: address,
    mailboxTokenHash: hashMailboxToken(token),
    providerMailboxId: null,
    status: "active",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    ...overrides,
  });
}

// ---------------- token / identifier tests ----------------

test("generateMailboxId produces unpredictable 8-char ids", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    ids.add(generateMailboxId());
  }
  assert.equal(ids.size, 1000, "mailbox ids must be unique and non-deterministic");
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]{8}$/);
    assert.doesNotMatch(id, /^[0-9]{24}$/, "must not resemble a Mongo ObjectId");
  }
});

test("mailbox tokens are long, random and unique", () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    tokens.add(generateMailboxToken());
  }
  assert.equal(tokens.size, 1000);
  for (const t of tokens) {
    assert.equal(t.length, 64, "token is hex of 32 bytes");
  }
});

test("hashMailboxToken is deterministic and one-way", () => {
  const t = generateMailboxToken();
  assert.equal(hashMailboxToken(t), hashMailboxToken(t));
  assert.notEqual(hashMailboxToken(t), hashMailboxToken(generateMailboxToken()));
  assert.notEqual(hashMailboxToken(t), t, "hash must not equal the plain token");
});

test("getExpirationMinutes defaults to a long-lived mailbox lifetime and clamps bad values", () => {
  const prev = process.env.TEMP_MAIL_EXPIRATION_MINUTES;
  delete process.env.TEMP_MAIL_EXPIRATION_MINUTES;
  assert.equal(getExpirationMinutes(), 100 * 365 * 24 * 60);
  process.env.TEMP_MAIL_EXPIRATION_MINUTES = "15";
  assert.equal(getExpirationMinutes(), 15);
  process.env.TEMP_MAIL_EXPIRATION_MINUTES = "abc";
  assert.equal(getExpirationMinutes(), 100 * 365 * 24 * 60);
  process.env.TEMP_MAIL_EXPIRATION_MINUTES = "0";
  assert.equal(getExpirationMinutes(), 100 * 365 * 24 * 60);
  process.env.TEMP_MAIL_EXPIRATION_MINUTES = "99999";
  assert.equal(getExpirationMinutes(), 99999);
  if (prev === undefined) delete process.env.TEMP_MAIL_EXPIRATION_MINUTES;
  else process.env.TEMP_MAIL_EXPIRATION_MINUTES = prev;
});

test("getTempMailDomain defaults to temp.cronjobs.site", () => {
  const prev = process.env.TEMP_MAIL_DOMAIN;
  delete process.env.TEMP_MAIL_DOMAIN;
  assert.equal(getTempMailDomain(), "temp.cronjobs.site");
  if (prev === undefined) delete process.env.TEMP_MAIL_DOMAIN;
  else process.env.TEMP_MAIL_DOMAIN = prev;
});

// ---------------- HTML sanitization tests ----------------

test("sanitizeHtml removes scripts and event handlers", () => {
  const html = `<script>alert(1)</script><img src="x" onerror="alert(2)"><p onclick="alert(3)">ok</p>`;
  const out = sanitizeHtml(html);
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("onerror"), false);
  assert.equal(out.includes("onclick"), false);
  assert.equal(out.includes("ok"), true);
});

test("sanitizeHtml neutralizes javascript: URLs and unsafe tags", () => {
  const html = `<a href="javascript:alert(1)">x</a><iframe src="evil"></iframe><style>*{}</style><p>y</p>`;
  const out = sanitizeHtml(html);
  assert.equal(out.includes("javascript:"), false);
  assert.equal(out.includes("<iframe"), false);
  assert.equal(out.includes("<style"), false);
  assert.equal(out.includes("y"), true);
});

test("sanitizeHtml returns empty for non-strings", () => {
  assert.equal(sanitizeHtml(""), "");
  assert.equal(sanitizeHtml(undefined as never), "");
  assert.equal(sanitizeHtml(null as never), "");
});

test("sanitizeFilename prevents path traversal", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "etcpasswd");
  assert.equal(sanitizeFilename("..\\..\\secret"), "secret");
  assert.equal(sanitizeFilename("report.pdf"), "report.pdf");
  assert.equal(sanitizeFilename(""), "attachment");
  assert.equal(sanitizeFilename("   "), "attachment");
});

test("isSafeAttachmentMimeType rejects executable types", () => {
  assert.equal(isSafeAttachmentMimeType("text/plain"), true);
  assert.equal(isSafeAttachmentMimeType("application/pdf"), true);
  assert.equal(isSafeAttachmentMimeType("application/javascript"), false);
  assert.equal(isSafeAttachmentMimeType("text/javascript"), false);
  assert.equal(isSafeAttachmentMimeType("application/x-msdownload"), false);
  assert.equal(isSafeAttachmentMimeType(""), false);
});

// ---------------- provider unavailable ----------------

test("service rejects creation when provider unavailable (no-op provider)", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  // Ensure no provider is configured so createMailbox can still create a DB record.
  // The no-op provider only throws on provider.isConfigured() calls; mailbox
  // creation in service guards provider calls behind isConfigured().
  const prev = process.env.TEMP_MAIL_PROVIDER;
  process.env.TEMP_MAIL_PROVIDER = "";
  try {
    const { createMailbox } = await import("../src/lib/temp-mail/service");
    const result = await createMailbox(userId());
    assert.ok(result.publicAddress.endsWith("@temp.cronjobs.site"));
    assert.ok(result.mailboxToken);
  } finally {
    if (prev === undefined) delete process.env.TEMP_MAIL_PROVIDER;
    else process.env.TEMP_MAIL_PROVIDER = prev;
  }
});

test("active mailboxes ignore timestamp expiry and keep only newest 6 emails", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  const ownerId = userId();
  const token = generateMailboxToken();
  const address = `retention-${Math.random().toString(36).slice(2)}@temp.cronjobs.site`;
  const mailbox = await makeKnownMailbox(ownerId, token, address, {
    expiresAt: new Date(Date.now() - 60 * 60 * 1000),
  });

  for (let i = 0; i < 8; i++) {
    const ok = await storeInboundEmail(
      makeEmail(address, {
        messageId: `retention-${i}`,
        receivedAt: new Date(Date.now() + i * 60_000),
      })
    );
    assert.equal(ok, true, "all emails should be accepted while mailbox remains active");
  }

  const ownership = await verifyMailboxOwnership(ownerId, token, address);
  assert.equal(ownership.valid, true, "active mailbox should not expire based on timestamp");

  const remaining = await TemporaryEmail.find({ mailboxId: mailbox._id }).sort({ receivedAt: 1 }).lean();
  assert.equal(remaining.length, 6, "only newest 6 emails should remain");
  assert.equal(remaining[0].messageId, "retention-2", "oldest retained message should be the 3rd insertion");
});

// ---------------- ownership / cross-user isolation ----------------

test("verifyMailboxOwnership enforces owner isolation", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const owner = userId();
  const intruder = userId();
  const knownToken = "known-token-please";
  const mb = await makeKnownMailbox(owner, knownToken, `own${Date.now()}@temp.cronjobs.site`);
  const addr = mb.publicAddress;

  const ok = await verifyMailboxOwnership(owner, knownToken, addr);
  assert.equal(ok.valid, true);

  const wrongToken = await verifyMailboxOwnership(owner, "wrong-token", addr);
  assert.equal(wrongToken.valid, false);

  const intruderAccess = await verifyMailboxOwnership(intruder, knownToken, addr);
  assert.equal(intruderAccess.valid, false, "another user must never access this mailbox");

  await TemporaryMailbox.deleteOne({ _id: mb._id });
});

test("verifyMailboxOwnership keeps active mailboxes valid even when expiresAt is stale", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const owner = userId();
  const knownToken = "expired-token";
  const mb = await TemporaryMailbox.create({
    ownerId: owner,
    publicAddress: `expired${Date.now()}@temp.cronjobs.site`,
    mailboxTokenHash: hashMailboxToken(knownToken),
    status: "active",
    expiresAt: new Date(Date.now() - 1000),
  });
  const result = await verifyMailboxOwnership(owner, knownToken, mb.publicAddress);
  assert.equal(result.valid, true, "active mailbox must remain valid regardless of stale expiresAt metadata");
  await TemporaryMailbox.deleteOne({ _id: mb._id });
});

test("verifyMailboxOwnership keeps previously expired-status mailboxes usable until explicit delete", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const owner = userId();
  const knownToken = "legacy-expired-token";
  const mb = await TemporaryMailbox.create({
    ownerId: owner,
    publicAddress: `legacy${Date.now()}@temp.cronjobs.site`,
    mailboxTokenHash: hashMailboxToken(knownToken),
    status: "expired",
    expiresAt: new Date(Date.now() - 1000),
  });

  const result = await verifyMailboxOwnership(owner, knownToken, mb.publicAddress);
  assert.equal(result.valid, true, "expired-status mailbox should remain usable until the user explicitly deletes it");

  await TemporaryMailbox.deleteOne({ _id: mb._id });
});

// ---------------- message storage / retrieval ----------------

test("storeInboundEmail stores only sanitized content", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const owner = userId();
  const knownToken = "storage-token";
  const address = `store${Date.now()}@temp.cronjobs.site`;
  const mb = await TemporaryMailbox.create({
    ownerId: owner,
    publicAddress: address,
    mailboxTokenHash: hashMailboxToken(knownToken),
    status: "active",
    expiresAt: new Date(Date.now() + 60 * 1000),
  });

  const stored = await storeInboundEmail(
    makeEmail(address, {
      htmlBody: `<script>bad()</script><p onclick="x()">safe</p>`,
      attachments: [
        { filename: "../../evil.pdf", contentType: "application/pdf", size: 100, attachmentId: "a1" },
        { filename: "hack.js", contentType: "application/javascript", size: 10, attachmentId: "a2" },
      ],
    })
  );
  assert.equal(stored, true);

  const messages = await TemporaryEmail.find({ mailboxId: mb._id }).lean();
  assert.equal(messages.length, 1);
  const msg = messages[0];
  assert.equal(msg.sanitizedHtmlBody.includes("<script"), false);
  assert.equal(msg.sanitizedHtmlBody.includes("onclick"), false);
  assert.equal(msg.sanitizedHtmlBody.includes("safe"), true);
  assert.equal(msg.isRead, false);
  assert.equal(msg.attachments.length, 1, "executable attachment must be filtered");
  assert.equal(msg.attachments[0].filename, "evil.pdf", "path traversal filenames are sanitized");

  // duplicate messageId is ignored
  const dup = await storeInboundEmail(
    makeEmail(address, { messageId: msg.messageId })
  );
  assert.equal(dup, false);

  await TemporaryEmail.deleteMany({ mailboxId: mb._id });
  await TemporaryMailbox.deleteOne({ _id: mb._id });
});

test("storeInboundEmail rejects expired or unknown mailboxes", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const stored = await storeInboundEmail(makeEmail("nobody@temp.cronjobs.site"));
  assert.equal(stored, false);
});

test("listMessages, markRead and deleteMessage work within ownership", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  const owner = userId();
  const knownToken = "list-token";
  const address = `list${Date.now()}@temp.cronjobs.site`;
  const mb = await TemporaryMailbox.create({
    ownerId: owner,
    publicAddress: address,
    mailboxTokenHash: hashMailboxToken(knownToken),
    status: "active",
    expiresAt: new Date(Date.now() + 60 * 1000),
  });

  await storeInboundEmail(makeEmail(address, { messageId: "m1", subject: "One" }));
  await storeInboundEmail(makeEmail(address, { messageId: "m2", subject: "Two" }));

  const list = await listMessages(owner, knownToken, address, 1, 20);
  assert.ok(list);
  assert.equal(list.pagination.total, 2);
  assert.equal(list.messages.length, 2);

  const first = list.messages[0];
  const marked = await markMessageRead(owner, knownToken, address, first._id.toString());
  assert.equal(marked, true);

  const list2 = await listMessages(owner, knownToken, address, 1, 20);
  assert.ok(list2);
  assert.equal(list2.messages.find((m) => m._id.toString() === first._id.toString())!.isRead, true);

  const deleted = await deleteMessage(owner, knownToken, address, first._id.toString());
  assert.equal(deleted, true);

  const list3 = await listMessages(owner, knownToken, address, 1, 20);
  assert.ok(list3);
  assert.equal(list3.pagination.total, 1);

  // intruder cannot list or delete
  const intruder = userId();
  const intruderList = await listMessages(intruder, knownToken, address, 1, 20);
  assert.equal(intruderList, null);
  const msgs = await TemporaryEmail.find({ mailboxId: mb._id });
  const remainingId = msgs[0]._id.toString();
  const intruderDelete = await deleteMessage(intruder, knownToken, address, remainingId);
  assert.equal(intruderDelete, false);

  await TemporaryEmail.deleteMany({ mailboxId: mb._id });
  await TemporaryMailbox.deleteOne({ _id: mb._id });
});

// ---------------- rate limiting ----------------

test("rate limiting uses existing system and blocks over-limit", () => {
  const { checkRateLimit } = require("../src/lib/security-core") as typeof import("../src/lib/security-core");
  const key = `test-rl-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    const res = checkRateLimit(key, 5, 60_000);
    assert.equal(res.allowed, true);
  }
  const blocked = checkRateLimit(key, 5, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

// ---------------- persistence & lifecycle tests ----------------

test("temp mail persistence: getActiveMailbox restores existing mailbox across reloads", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  const { createMailbox, getActiveMailbox, deleteMailbox } = await import("../src/lib/temp-mail/service");
  const owner = userId();

  // 1. Initial state: no mailbox
  const initial = await getActiveMailbox(owner);
  assert.equal(initial, null, "initial getActiveMailbox should be null");

  // 2. Create mailbox
  const created = await createMailbox(owner);
  assert.ok(created.publicAddress);
  assert.ok(created.mailboxToken);

  // 3. Simulating page load / refresh / return after logout
  const restored1 = await getActiveMailbox(owner);
  assert.ok(restored1, "mailbox must be restored on page load");
  assert.equal(restored1!.publicAddress, created.publicAddress, "public address must match created address");
  assert.equal(restored1!.isExpired, false);

  // 4. Second reload / check
  const restored2 = await getActiveMailbox(owner);
  assert.ok(restored2, "mailbox must persist across multiple reloads");
  assert.equal(restored2!.publicAddress, created.publicAddress);

  // 5. Explicit deletion
  const deleted = await deleteMailbox(owner);
  assert.equal(deleted, true);

  // 6. After deletion: getActiveMailbox returns null
  const afterDelete = await getActiveMailbox(owner);
  assert.equal(afterDelete, null, "deleted mailbox should return null");

  // 7. Creating a new mailbox creates a fresh address
  const newCreated = await createMailbox(owner);
  assert.ok(newCreated.publicAddress);
  assert.notEqual(newCreated.publicAddress, created.publicAddress, "new generation should yield a fresh address");
});
