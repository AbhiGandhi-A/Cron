import { validateObjectId } from "@/lib/security-core";
import * as service from "./service";
import type { InboundEmail } from "./types";

/**
 * Bridge between the existing (MongoDB/Mongoose) temp-mail backend and the new
 * Cloudflare Worker backend (`cloudflare-worker/`, deployed at
 * `TEMP_MAIL_SERVICE_URL`).
 *
 * When `TEMP_MAIL_SERVICE_URL` and `TEMP_MAIL_SERVICE_SECRET` are both set, all
 * temp-mail operations are forwarded to the Cloudflare Worker (which stores
 * data in D1 and receives inbound email via Cloudflare Email Routing).
 * Otherwise the original Mongoose service is used unchanged.
 *
 * The route handlers keep their NextAuth session checks and rate limiting -
 * this module only swaps where the data lives. Response shapes are translated
 * back to the shapes the existing API contracts expect.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUsingCloudflare(): boolean {
  return Boolean(
    process.env.TEMP_MAIL_SERVICE_URL &&
      process.env.TEMP_MAIL_SERVICE_SECRET
  );
}

function serviceBaseUrl(): string {
  return process.env.TEMP_MAIL_SERVICE_URL!.replace(/\/+$/, "");
}

function serviceSecret(): string {
  return process.env.TEMP_MAIL_SERVICE_SECRET || "2a9e24071ab0c591753ce39f8a0c22502ea30451eadb6a8cb42948778447d06c";
}

/** Accept Mongo ObjectIds (existing backend) or the Worker's UUID message ids. */
export function isValidMessageId(id: string): boolean {
  if (validateObjectId(id)) return true;
  return UUID_V4.test(id);
}

async function workerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${serviceBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-temp-mail-service": serviceSecret(),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

// ---------------------------------------------------------------------------
// Mailbox lifecycle
// ---------------------------------------------------------------------------

export async function createMailbox(ownerId: string) {
  if (isUsingCloudflare()) {
    try {
      const res = await workerFetch("/api/temp-mail", {
        method: "POST",
        body: JSON.stringify({ ownerId }),
      });

      if (res.ok) {
        const data = await readJson<{ mailbox?: { publicAddress: string; mailboxToken: string; expiresAt: string } }>(res);
        if (data.mailbox) {
          return {
            publicAddress: data.mailbox.publicAddress,
            mailboxToken: data.mailbox.mailboxToken,
            expiresAt: new Date(data.mailbox.expiresAt),
          };
        }
      }
    } catch {
      // Fall back to Mongo service
    }
  }

  return service.createMailbox(ownerId);
}

export async function getActiveMailbox(ownerId: string) {
  if (isUsingCloudflare()) {
    try {
      const res = await workerFetch(`/api/temp-mail?ownerId=${encodeURIComponent(ownerId)}`);
      if (res.ok) {
        const data = await readJson<{ mailbox: { publicAddress: string; mailboxToken: string; expiresAt: string } | null }>(res);
        if (data.mailbox) {
          return {
            publicAddress: data.mailbox.publicAddress,
            mailboxToken: data.mailbox.mailboxToken,
            expiresAt: new Date(data.mailbox.expiresAt),
            isExpired: false,
          };
        }
      }
    } catch {
      // Fall back to Mongo service
    }
  }

  return service.getActiveMailbox(ownerId);
}

export async function deleteMailbox(ownerId: string): Promise<boolean> {
  let cfDeleted = false;
  if (isUsingCloudflare()) {
    try {
      const active = await getActiveMailbox(ownerId);
      if (active) {
        const res = await workerFetch("/api/temp-mail", {
          method: "DELETE",
          body: JSON.stringify({ ownerId, publicAddress: active.publicAddress }),
        });
        if (res.ok) {
          const data = await readJson<{ deleted: boolean }>(res);
          cfDeleted = Boolean(data.deleted);
        }
      }
    } catch {
      // Fall back to Mongo service
    }
  }

  const mongoDeleted = await service.deleteMailbox(ownerId);
  return cfDeleted || mongoDeleted;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function isProviderConfigured(): Promise<boolean> {
  if (isUsingCloudflare()) return true;
  return service.isProviderConfigured();
}

export async function listMessages(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  page: number,
  limit: number
) {
  if (!isUsingCloudflare()) {
    return service.listMessages(ownerId, mailboxToken, publicAddress, page, limit);
  }

  const params = new URLSearchParams({
    ownerId,
    mailboxToken,
    publicAddress,
    page: String(page),
    limit: String(limit),
  });
  const res = await workerFetch(`/api/temp-mail/messages?${params.toString()}`);
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`temp-mail worker list failed: ${res.status}`);

  const data = await readJson<{
    items: WorkerMessageSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(res);

  return {
    messages: (data.items || []).map(mapMessageSummary),
    pagination: {
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
      totalPages: data.totalPages || 1,
    },
  };
}

export async function getMessage(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  messageId: string
) {
  if (!isUsingCloudflare()) {
    return service.getMessage(ownerId, mailboxToken, publicAddress, messageId);
  }

  const params = new URLSearchParams({ ownerId, mailboxToken, publicAddress });
  const res = await workerFetch(
    `/api/temp-mail/messages/${encodeURIComponent(messageId)}?${params.toString()}`
  );
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`temp-mail worker get message failed: ${res.status}`);

  const data = await readJson<{ message?: WorkerMessageDetail }>(res);
  if (!data.message) return null;
  return mapMessageDetail(data.message);
}

export async function markMessageRead(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  messageId: string
): Promise<boolean> {
  if (!isUsingCloudflare()) {
    return service.markMessageRead(ownerId, mailboxToken, publicAddress, messageId);
  }

  const params = new URLSearchParams({ ownerId, mailboxToken, publicAddress });
  const res = await workerFetch(
    `/api/temp-mail/messages/${encodeURIComponent(messageId)}/read?${params.toString()}`,
    { method: "POST", body: "{}" }
  );
  if (!res.ok) return false;

  const data = await readJson<{ read: boolean }>(res);
  return Boolean(data.read);
}

export async function deleteMessage(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  messageId: string
): Promise<boolean> {
  if (!isUsingCloudflare()) {
    return service.deleteMessage(ownerId, mailboxToken, publicAddress, messageId);
  }

  const params = new URLSearchParams({ ownerId, mailboxToken, publicAddress });
  const res = await workerFetch(
    `/api/temp-mail/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
    { method: "DELETE" }
  );
  if (!res.ok) return false;

  const data = await readJson<{ deleted: boolean }>(res);
  return Boolean(data.deleted);
}

// ---------------------------------------------------------------------------
// Shape translation (Worker -> existing API contract)
// ---------------------------------------------------------------------------

interface WorkerMessageSummary {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  size: number;
  attachments?: { filename: string; contentType: string; size: number }[];
}

interface WorkerMessageDetail extends WorkerMessageSummary {
  messageId: string;
  bodyText: string | null;
  bodyHtml: string | null;
}

function mapAttachment(a: { filename: string; contentType: string; size: number }) {
  return { filename: a.filename, contentType: a.contentType, size: a.size, attachmentId: undefined as string | undefined };
}

function mapMessageSummary(m: WorkerMessageSummary) {
  return {
    _id: m.id,
    from: m.fromAddress,
    to: m.toAddress,
    subject: m.subject,
    receivedAt: m.receivedAt,
    isRead: m.isRead,
    size: m.size,
    attachments: (m.attachments || []).map(mapAttachment),
  };
}

function mapMessageDetail(m: WorkerMessageDetail) {
  return {
    ...mapMessageSummary(m),
    messageId: m.messageId,
    textBody: m.bodyText,
    sanitizedHtmlBody: m.bodyHtml,
  };
}

// Re-exported so the barrel can keep a stable surface and inbound email from
// the (legacy) MailPace webhook still works.
export { storeInboundEmail, verifyMailboxOwnership } from "./service";
export type { InboundEmail };