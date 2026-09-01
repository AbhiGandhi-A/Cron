import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isUsingCloudflare,
  isValidMessageId,
  createMailbox,
  getActiveMailbox,
  deleteMailbox,
  listMessages,
  getMessage,
  markMessageRead,
  deleteMessage,
} from "../src/lib/temp-mail/bridge";

const SERVICE_URL = "https://api.cronjobs.site";
const SERVICE_SECRET = "test-secret";

function withCfEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevUrl = process.env.TEMP_MAIL_SERVICE_URL;
  const prevSecret = process.env.TEMP_MAIL_SERVICE_SECRET;
  process.env.TEMP_MAIL_SERVICE_URL = SERVICE_URL;
  process.env.TEMP_MAIL_SERVICE_SECRET = SERVICE_SECRET;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevUrl === undefined) delete process.env.TEMP_MAIL_SERVICE_URL;
      else process.env.TEMP_MAIL_SERVICE_URL = prevUrl;
      if (prevSecret === undefined) delete process.env.TEMP_MAIL_SERVICE_SECRET;
      else process.env.TEMP_MAIL_SERVICE_SECRET = prevSecret;
    });
}

type FetchLog = { url: string; method: string; authHeader: string | null; contentType: string | null }[];

/** Stub global.fetch, respond based on a routes map, record calls. */
function stubFetch(routes: (url: string, init: RequestInit) => { status: number; body: unknown }, log: FetchLog) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = typeof input === "string" ? input : input.url;
    const headers = new Headers(init?.headers || {});
    const result = routes(url, {
      method: init?.method || "GET",
      headers,
      body: init?.body || undefined,
    });
    log.push({
      url,
      method: init?.method || "GET",
      authHeader: headers.get("x-temp-mail-service"),
      contentType: headers.get("content-type"),
    });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("isValidMessageId accepts ObjectId and UUID v4, rejects others", () => {
  assert.equal(isValidMessageId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidMessageId("a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f"), true);
  assert.equal(isValidMessageId(""), false);
  assert.equal(isValidMessageId("short"), false);
  assert.equal(isValidMessageId("zzz-not-a-uuid"), false);
});

test("isUsingCloudflare requires both env vars", async () => {
  const prevUrl = process.env.TEMP_MAIL_SERVICE_URL;
  const prevSecret = process.env.TEMP_MAIL_SERVICE_SECRET;
  delete process.env.TEMP_MAIL_SERVICE_URL;
  delete process.env.TEMP_MAIL_SERVICE_SECRET;
  try {
    assert.equal(isUsingCloudflare(), false);
    process.env.TEMP_MAIL_SERVICE_URL = SERVICE_URL;
    assert.equal(isUsingCloudflare(), false);
    process.env.TEMP_MAIL_SERVICE_SECRET = SERVICE_SECRET;
    assert.equal(isUsingCloudflare(), true);
  } finally {
    if (prevUrl === undefined) delete process.env.TEMP_MAIL_SERVICE_URL;
    else process.env.TEMP_MAIL_SERVICE_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.TEMP_MAIL_SERVICE_SECRET;
    else process.env.TEMP_MAIL_SERVICE_SECRET = prevSecret;
  }
});

test("createMailbox forwards to the worker and translates the shape", async () => {
  const log: FetchLog = [];
  const restore = stubFetch(
    (url, init) =>
      url === `${SERVICE_URL}/api/temp-mail` && init.method === "POST"
        ? {
            status: 201,
            body: {
              mailbox: {
                id: "mb-1",
                publicAddress: "ab12cd34ef56@temp.cronjobs.site",
                mailboxToken: "f".repeat(64),
                expiresAt: "2026-09-01T12:00:00.000Z",
                createdAt: "2026-09-01T11:00:00.000Z",
              },
              configured: true,
            },
          }
        : { status: 404, body: { error: "not found" } },
    log
  );
  try {
    const result = await withCfEnv(() => createMailbox("user-1"));
    assert.equal(result.publicAddress, "ab12cd34ef56@temp.cronjobs.site");
    assert.equal(result.mailboxToken, "f".repeat(64));
    assert.ok(result.expiresAt instanceof Date);
    assert.equal(log.length, 1);
    assert.equal(log[0].method, "POST");
    assert.equal(log[0].authHeader, SERVICE_SECRET);
    assert.equal(log[0].contentType, "application/json");
  } finally {
    restore();
  }
});

test("getActiveMailbox maps null and active mailbox correctly", async () => {
  const restore = stubFetch(
    (url) =>
      url === `${SERVICE_URL}/api/temp-mail?ownerId=user-1`
        ? {
            status: 200,
            body: {
              mailbox: {
                id: "mb-1",
                publicAddress: "ab12cd34ef56@temp.cronjobs.site",
                mailboxToken: "f".repeat(64),
                expiresAt: "2026-09-01T12:00:00.000Z",
                createdAt: "2026-09-01T11:00:00.000Z",
              },
              configured: true,
            },
          }
        : { status: 404, body: { error: "not found" } },
    []
  );
  try {
    const mb = await withCfEnv(() => getActiveMailbox("user-1"));
    assert.ok(mb);
    assert.equal(mb!.mailboxToken, "f".repeat(64));
    assert.equal(mb!.isExpired, false);

    const restoreNull = stubFetch(() => ({ status: 200, body: { mailbox: null, configured: true } }), []);
    try {
      const none = await withCfEnv(() => getActiveMailbox("user-2"));
      assert.equal(none, null);
    } finally {
      restoreNull();
    }
  } finally {
    restore();
  }
});

test("listMessages translates worker items to the frontend message shape", async () => {
  const restore = stubFetch(
    (url) =>
      url.startsWith(`${SERVICE_URL}/api/temp-mail/messages?`)
        ? {
            status: 200,
            body: {
              items: [
                {
                  id: "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f",
                  fromAddress: "sender@example.com",
                  toAddress: "ab12cd34ef56@temp.cronjobs.site",
                  subject: "Hello",
                  receivedAt: "2026-09-01T12:00:00.000Z",
                  isRead: false,
                  size: 123,
                  attachments: [{ filename: "report.pdf", contentType: "application/pdf", size: 50 }],
                },
              ],
              total: 1,
              page: 1,
              limit: 20,
              totalPages: 1,
            },
          }
        : { status: 404, body: { error: "not found" } },
    []
  );
  try {
    const result = await withCfEnv(() =>
      listMessages("user-1", "f".repeat(64), "ab12cd34ef56@temp.cronjobs.site", 1, 20)
    );
    assert.ok(result);
    assert.equal(result!.messages.length, 1);
    const m = result!.messages[0];
    assert.equal(m._id, "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f");
    assert.equal(m.from, "sender@example.com");
    assert.equal(m.to, "ab12cd34ef56@temp.cronjobs.site");
    assert.equal(m.subject, "Hello");
    assert.equal(m.isRead, false);
    assert.equal(m.attachments![0].filename, "report.pdf");
    assert.equal(result!.pagination.total, 1);
  } finally {
    restore();
  }
});

test("getMessage maps body fields to the frontend contract", async () => {
  const restore = stubFetch(
    (url) =>
      url.includes("/api/temp-mail/messages/a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f?")
        ? {
            status: 200,
            body: {
              message: {
                id: "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f",
                messageId: "<m@example>",
                fromAddress: "sender@example.com",
                toAddress: "ab12cd34ef56@temp.cronjobs.site",
                subject: "Hello",
                bodyText: "plain",
                bodyHtml: "<p>hi</p>",
                receivedAt: "2026-09-01T12:00:00.000Z",
                isRead: false,
                size: 123,
                attachments: [],
              },
            },
          }
        : { status: 404, body: { error: "not found" } },
    []
  );
  try {
    const msg = await withCfEnv(() =>
      getMessage("user-1", "f".repeat(64), "ab12cd34ef56@temp.cronjobs.site", "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f")
    );
    assert.ok(msg);
    assert.equal(msg!.textBody, "plain");
    assert.equal(msg!.sanitizedHtmlBody, "<p>hi</p>");
    assert.equal(msg!.messageId, "<m@example>");
    assert.equal(msg!._id, "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f");
  } finally {
    restore();
  }
});

test("deleteMailbox gets the active mailbox then deletes it", async () => {
  const log: FetchLog = [];
  const restore = stubFetch(
    (url, init) => {
      if (url === `${SERVICE_URL}/api/temp-mail?ownerId=user-1` && init.method === "GET") {
        return {
          status: 200,
          body: {
            mailbox: {
              id: "mb-1",
              publicAddress: "ab12cd34ef56@temp.cronjobs.site",
              mailboxToken: "f".repeat(64),
              expiresAt: "2026-09-01T12:00:00.000Z",
              createdAt: "2026-09-01T11:00:00.000Z",
            },
            configured: true,
          },
        };
      }
      if (url === `${SERVICE_URL}/api/temp-mail` && init.method === "DELETE") {
        return { status: 200, body: { deleted: true } };
      }
      return { status: 404, body: { error: "not found" } };
    },
    log
  );
  try {
    const deleted = await withCfEnv(() => deleteMailbox("user-1"));
    assert.equal(deleted, true);
    assert.equal(log.length, 2);
    assert.equal(log[0].url, `${SERVICE_URL}/api/temp-mail?ownerId=user-1`);
    assert.equal(log[1].url, `${SERVICE_URL}/api/temp-mail`);
  } finally {
    restore();
  }
});

test("markMessageRead and deleteMessage map booleans", async () => {
  const restore = stubFetch(
    (url, init) => {
      if (url.includes("/read?")) return { status: 200, body: { read: true } };
      if (init.method === "DELETE") return { status: 200, body: { deleted: true } };
      return { status: 404, body: { error: "not found" } };
    },
    []
  );
  try {
    const read = await withCfEnv(() =>
      markMessageRead("user-1", "f".repeat(64), "ab12cd34ef56@temp.cronjobs.site", "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f")
    );
    assert.equal(read, true);
    const gone = await withCfEnv(() =>
      deleteMessage("user-1", "f".repeat(64), "ab12cd34ef56@temp.cronjobs.site", "a5643c8e-6e7f-4a9b-9f2e-1b8a1c2d3e4f")
    );
    assert.equal(gone, true);
  } finally {
    restore();
  }
});