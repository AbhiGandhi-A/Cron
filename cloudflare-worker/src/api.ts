import type { Env, MailboxSummary } from "./types";
import { TempMailStore } from "./store";
import { timingSafeEqual } from "./util";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
} as const;

/** Boolean helper used by parseBoolFromQuery. */
function asBool(v: string | null, def: boolean): boolean {
  if (v == null) return def;
  const t = v.trim().toLowerCase();
  if (t === "true" || t === "1") return true;
  if (t === "false" || t === "0") return false;
  return def;
}

function parsePageLimit(pageRaw: string | null, limitRaw: string | null, defLimit: number): { page: number; limit: number } {
  let page = parseInt(pageRaw || "1", 10);
  let limit = parseInt(limitRaw || String(defLimit), 10);
  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(limit) || limit < 1) limit = defLimit;
  if (limit > 100) limit = 100;
  if (page > 1000) page = 1000;
  return { page, limit };
}

/** Validate that a request is authorized to talk to the Worker backend. */
async function isServiceAuthorized(request: Request, env: Env): Promise<boolean> {
  const secret = env.TEMP_MAIL_SERVICE_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-temp-mail-service") || request.headers.get("authorization");
  const token = provided?.startsWith("Bearer ") ? provided.slice(7) : provided || "";
  return timingSafeEqual(token, secret);
}

/**
 * HTTP API. This Worker is designed to be called by the Next.js backend
 * (which owns NextAuth session auth), so requests must present the shared
 * service secret header `x-temp-mail-service`. CORS is also enabled so the
 * existing frontend can call the message endpoints directly if desired.
 */
export async function handleFetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers),
    });
  }

  // Optional admin sweep (guarded by service secret) - not part of the public API.
  if (path === "/__admin/expire" && request.method === "POST") {
    if (!(await isServiceAuthorized(request, env))) return json(401, { error: "Unauthorized" }, request);
    const store = new TempMailStore(env);
    const cleared = await store.expireStaleMailboxes();
    return json(200, { ok: true, cleared }, request);
  }

  const authorized = await isServiceAuthorized(request, env);
  if (!authorized) {
    return json(401, { error: "Unauthorized" }, request);
  }
  const store = new TempMailStore(env);

  type MailboxResult = MailboxSummary | null;

  try {
    // GET /api/temp-mail  -> current active mailbox (with fresh token) + configured
    if (path === "/api/temp-mail" && request.method === "GET") {
      const ownerId = url.searchParams.get("ownerId");
      if (!ownerId) return json(400, { error: "ownerId required" }, request);
      const active = await store.getActiveMailbox(ownerId);
      let mailbox: MailboxResult = null;
      if (active) {
        const token = await store.rotateToken(ownerId, active.publicAddress);
        mailbox = { ...active, mailboxToken: token || "" };
      }
      return json(200, { mailbox, configured: true }, request);
    }

    // POST /api/temp-mail  -> create (or reuse + refresh) a mailbox
    if (path === "/api/temp-mail" && request.method === "POST") {
      const body = await safeJson<{ ownerId?: string; publicAddress?: string }>(request);
      const ownerId = body.ownerId || url.searchParams.get("ownerId");
      if (!ownerId) return json(400, { error: "ownerId required" }, request);
      const existing = await store.getActiveMailbox(ownerId);
      const created = await store.createMailbox(ownerId, existing);
      return json(201, { mailbox: created, configured: true }, request);
    }

    // DELETE /api/temp-mail  -> delete current mailbox
    if (path === "/api/temp-mail" && request.method === "DELETE") {
      const body = await safeJson<{ ownerId?: string; publicAddress?: string }>(request);
      const ownerId = body.ownerId || url.searchParams.get("ownerId");
      const publicAddress = body.publicAddress || url.searchParams.get("publicAddress");
      if (!ownerId) return json(400, { error: "ownerId required" }, request);
      if (!publicAddress) return json(400, { error: "publicAddress required" }, request);
      const deleted = await store.deleteMailboxByAddress(ownerId, publicAddress);
      return json(200, { deleted }, request);
    }

    // GET /api/temp-mail/messages?ownerId=&publicAddress=&mailboxToken=&page=&limit=
    if (path === "/api/temp-mail/messages" && request.method === "GET") {
      const ownerId = url.searchParams.get("ownerId");
      const publicAddress = url.searchParams.get("publicAddress");
      const mailboxToken = url.searchParams.get("mailboxToken");
      if (!ownerId || !publicAddress) return json(400, { error: "ownerId and publicAddress required" }, request);
      const mailbox = await store.verifyMailboxToken(publicAddress, mailboxToken || "", ownerId);
      if (!mailbox) return json(404, { error: "Mailbox not found" }, request);
      const { page, limit } = parsePageLimit(url.searchParams.get("page"), url.searchParams.get("limit"), getPageSizeEnv(env));
      const data = await store.listMessages(mailbox.id, page, limit);
      return json(200, data, request);
    }

    // message-scoped: /api/temp-mail/messages/:id and /read
    const messageMatch = path.match(/^\/api\/temp-mail\/messages\/([^/]+)(?:\/(read))?$/);
    if (messageMatch) {
      const emailId = decodeURIComponent(messageMatch[1]);
      const isRead = messageMatch[2] === "read";
      const ownerId = url.searchParams.get("ownerId");
      const publicAddress = url.searchParams.get("publicAddress");
      const mailboxToken = url.searchParams.get("mailboxToken");
      if (!ownerId || !publicAddress) return json(400, { error: "ownerId and publicAddress required" }, request);
      const mailbox = await store.verifyMailboxToken(publicAddress, mailboxToken || "", ownerId);
      if (!mailbox) return json(404, { error: "Mailbox not found" }, request);

      if (request.method === "GET") {
        const msg = await store.getMessage(mailbox.id, emailId);
        if (!msg) return json(404, { error: "Message not found" }, request);
        return json(200, { message: msg }, request);
      }
      if (request.method === "POST" && isRead) {
        const ok = await store.markMessageRead(mailbox.id, emailId);
        return json(200, { read: ok }, request);
      }
      if (request.method === "DELETE") {
        const ok = await store.deleteMessage(mailbox.id, emailId);
        return json(200, { deleted: ok }, request);
      }
      return json(405, { error: "Method not allowed" }, request);
    }

    // POST /api/temp-mail/refresh  -> heartbeat (re-issue token)
    if (path === "/api/temp-mail/refresh" && request.method === "POST") {
      const body = await safeJson<{ ownerId?: string; publicAddress?: string; mailboxToken?: string }>(request);
      const ownerId = body.ownerId || url.searchParams.get("ownerId");
      const publicAddress = body.publicAddress || url.searchParams.get("publicAddress");
      const mailboxToken = body.mailboxToken || url.searchParams.get("mailboxToken");
      if (!ownerId || !publicAddress) return json(400, { error: "ownerId and publicAddress required" }, request);
      const mailbox = await store.verifyMailboxToken(publicAddress, mailboxToken || "", ownerId);
      if (!mailbox) return json(404, { error: "Mailbox not found" }, request);
      const token = await store.rotateToken(ownerId, mailbox.publicAddress);
      return json(200, { refreshedAt: new Date().toISOString(), mailboxToken: token }, request);
    }

    return json(404, { error: "Not found" }, request);
  } catch (err) {
    console.error("api error", err);
    return json(500, { error: "Internal server error" }, request);
  }
}

function getPageSizeEnv(env: Env): number {
  const v = parseInt(env.TEMP_MAIL_PAGE_SIZE || "20", 10);
  if (Number.isNaN(v) || v < 1 || v > 100) return 20;
  return v;
}

function corsHeaders(reqHeaders: Headers): Record<string, string> {
  const origin = reqHeaders.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, x-temp-mail-service, authorization",
    "access-control-max-age": "86400",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

function json(status: number, body: unknown, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request.headers) },
  });
}

async function safeJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
