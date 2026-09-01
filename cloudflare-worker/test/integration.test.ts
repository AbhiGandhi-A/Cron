import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { TempMailStore } from "../src/store";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let mf: Miniflare;
let serviceSecret: string;
let distFile: string;
const D1_ID = "test-d1";

before(async () => {
  serviceSecret = "test-service-secret";
  const dir = mkdtempSync(join(tmpdir(), "tm-worker-"));
  distFile = join(dir, "worker.js");

  // Esbuild the TypeScript source so Miniflare (which does not bundle raw TS)
  // can load it as a module worker.
  await build({
    entryPoints: [join(root, "src", "index.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: distFile,
    external: [],
    logLevel: "silent",
  });

  mf = new Miniflare({
    modules: true,
    scriptPath: distFile,
    modulesRoot: dir,
    d1Databases: { DB: D1_ID },
    bindings: {
      TEMP_MAIL_SERVICE_SECRET: serviceSecret,
      TEMP_MAIL_DOMAIN: "temp.cronjobs.site",
      TEMP_MAIL_EXPIRATION_MINUTES: "30",
      TEMP_MAIL_PAGE_SIZE: "20",
    },
    compatibilityDate: "2024-09-01",
  });

  // Apply the migration SQL to the in-memory D1. Comment lines are stripped
  // first so semicolons inside comments don't split statements, and so
  // comment-prefixed segments are not dropped.
  const db = await mf.getD1Database("DB");
  const sql = readFileSync(join(root, "migrations", "0001_init.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
});

after(async () => {
  await mf?.dispose();
  if (distFile) rmSync(dirname(distFile), { recursive: true, force: true });
});

function authedInit(init?: RequestInit, secret: string = serviceSecret): RequestInit {
  const headers = new Headers(init?.headers || {});
  headers.set("x-temp-mail-service", secret);
  headers.set("content-type", "application/json");
  return { ...init, headers };
}

function dispatch(request: Request | [string, RequestInit?] ): Promise<globalThis.Response> {
  if (request instanceof Request) return mf.dispatchFetch(request.url, { method: request.method, headers: request.headers });
  const [path, init] = request;
  return mf.dispatchFetch(`https://api.cronjobs.site${path}`, init);
}


interface MailboxResp {
  mailbox: { id: string; publicAddress: string; mailboxToken: string; expiresAt: string; createdAt: string };
  configured: boolean;
}

test("full lifecycle: create mailbox, list, read, delete, expire via API", async () => {
  // Create
  const create = await dispatch(["/api/temp-mail", authedInit({
    method: "POST",
    body: JSON.stringify({ ownerId: "user-1" }),
  })]);
  assert.equal(create.status, 201);
  const created = (await create.json()) as { mailbox: MailboxResp["mailbox"]; configured: boolean };
  assert.match(created.mailbox.publicAddress, /@temp\.cronjobs\.site$/);
  assert.match(created.mailbox.mailboxToken, /^[0-9a-f]{64}$/);

  // create is idempotent per owner (reuses same address)
  const create2 = await dispatch(["/api/temp-mail", authedInit({
    method: "POST",
    body: JSON.stringify({ ownerId: "user-1" }),
  })]);
  const created2 = (await create2.json()) as { mailbox: MailboxResp["mailbox"] };
  assert.equal(created2.mailbox.publicAddress, created.mailbox.publicAddress);

  // GET current mailbox
  const get = await dispatch(["/api/temp-mail?ownerId=user-1", authedInit()]);
  assert.equal(get.status, 200);
  const got = (await get.json()) as MailboxResp;
  assert.equal(got.mailbox?.publicAddress, created.mailbox.publicAddress);
  // The GET rotates the token (like the Mongo service), so use the latest one.
  const activeToken = got.mailbox?.mailboxToken || created.mailbox.mailboxToken;

  // list messages (empty at first)
  const listEmpty = await dispatch([
    `/api/temp-mail/messages?ownerId=user-1&publicAddress=${encodeURIComponent(created.mailbox.publicAddress)}&mailboxToken=${encodeURIComponent(activeToken)}`,
    authedInit(),
  ]);
  assert.equal(listEmpty.status, 200);
  const empty = (await listEmpty.json()) as { items: unknown[]; total: number };
  assert.equal(empty.items.length, 0);

  // unauthorized secret is rejected
  const unauthedRes = await dispatch(["/api/temp-mail?ownerId=user-1", authedInit({}, "wrong-secret")]);
  assert.equal(unauthedRes.status, 401);

  // a wrong mailbox token is rejected for message access
  const wrongToken = await dispatch([
    `/api/temp-mail/messages?ownerId=user-1&publicAddress=${encodeURIComponent(created.mailbox.publicAddress)}&mailboxToken=${"f".repeat(64)}`,
    authedInit(),
  ]);
  assert.equal(wrongToken.status, 404);

  // CORS preflight granted
  const preflight = new Request("https://api.cronjobs.site/api/temp-mail", { method: "OPTIONS" });
  const pfRes = await dispatch(preflight);
  assert.equal(pfRes.status, 204);
  assert.ok(pfRes.headers.get("access-control-allow-origin"));

  // delete mailbox
  const del = await dispatch(["/api/temp-mail", authedInit({
    method: "DELETE",
    body: JSON.stringify({ ownerId: "user-1", publicAddress: created.mailbox.publicAddress }),
  })]);
  assert.equal(del.status, 200);
  const delJson = (await del.json()) as { deleted: boolean };
  assert.equal(delJson.deleted, true);

  // post-delete, list is 404
  const afterDel = await dispatch([
    `/api/temp-mail/messages?ownerId=user-1&publicAddress=${encodeURIComponent(created.mailbox.publicAddress)}&mailboxToken=${encodeURIComponent(created.mailbox.mailboxToken)}`,
    authedInit(),
  ]);
  assert.equal(afterDel.status, 404);
});

test("admin expiry sweep clears expired mailboxes", async () => {
  const ok = await dispatch(["/__admin/expire", authedInit({ method: "POST" })]);
  assert.equal(ok.status, 200);
  const bad = await dispatch(["/__admin/expire", authedInit({ method: "POST" }, "bad")]);
  assert.equal(bad.status, 401);
});

test("store: inbound email storage, read, delete, expiration", async () => {
  const DB = await mf.getD1Database("DB");
  const store = new TempMailStore({
    DB: DB as unknown as D1Database,
    TEMP_MAIL_DOMAIN: "temp.cronjobs.site",
    TEMP_MAIL_EXPIRATION_MINUTES: "30",
    TEMP_MAIL_PAGE_SIZE: "20",
  });

  // Create a mailbox for the inbound path.
  const created = await store.createMailbox("user-inbound");
  const addr = created.publicAddress.toLowerCase();

  // Store an inbound email for that address.
  const stored = await store.storeInboundEmail({
    messageId: "msg-1",
    from: "sender@example.com",
    to: addr,
    subject: "Hello <b>bold</b>",
    textBody: "plain body",
    htmlBody: "<script>alert(1)</script><p>hi</p>",
    receivedAt: new Date().toISOString(),
    attachments: [{ filename: "a.js", contentType: "application/javascript", size: 5 }],
  });
  assert.equal(stored, true);

  // Email to an unknown address is ignored.
  const ignored = await store.storeInboundEmail({
    messageId: "msg-2",
    from: "x@example.com",
    to: "nobody@temp.cronjobs.site",
    subject: "nope",
    textBody: "x",
    htmlBody: null,
    receivedAt: new Date().toISOString(),
  });
  assert.equal(ignored, false);

  // List shows the message; duplicate messageId is not re-inserted.
  const list1 = await store.listMessages(created.id, 1, 20);
  assert.equal(list1.total, 1);
  await store.storeInboundEmail({
    messageId: "msg-1",
    from: "sender@example.com",
    to: addr,
    subject: "Hello <b>bold</b>",
    textBody: "plain body",
    htmlBody: "<p>hi</p>",
    receivedAt: new Date().toISOString(),
    attachments: [],
  });
  const list2 = await store.listMessages(created.id, 1, 20);
  assert.equal(list2.total, 1);

  // Details include sanitized html (script stripped) and filtered attachments.
  const detail = await store.getMessage(created.id, list2.items[0].id);
  assert.ok(detail);
  assert.ok(detail.bodyHtml && !detail.bodyHtml.includes("<script"));
  assert.equal(detail.attachments.length, 0, "unsafe attachment filtered out");

  // Mark read, then delete.
  const marked = await store.markMessageRead(created.id, detail!.id);
  assert.equal(marked, true);
  const detailRead = await store.getMessage(created.id, detail!.id);
  assert.equal(detailRead!.isRead, true);
  const del = await store.deleteMessage(created.id, detail!.id);
  assert.equal(del, true);
  const list3 = await store.listMessages(created.id, 1, 20);
  assert.equal(list3.total, 0);

  // Expired mailbox is treated as missing (database row sets expires_at in past).
  await DB.prepare("UPDATE mailboxes SET expires_at = ?1 WHERE id = ?2")
    .bind(new Date(Date.now() - 1000).toISOString(), created.id)
    .run();
  const afterExpiry = await store.getActiveMailbox("user-inbound");
  assert.equal(afterExpiry, null);
  const swept = await store.expireStaleMailboxes();
  assert.ok(swept >= 1);
});
