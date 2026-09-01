import type { Env, InboundEmail, MailboxSummary, EmailSummary, EmailDetail, Paginated, AttachmentMeta } from "./types";
import { generateMailboxId, generateMailboxToken, hashToken, timingSafeEqual, getExpirationMinutes, getDomain, nowIso, uuid } from "./util";
import { sanitizeAttachments, sanitizeHtml, sanitizeFilename } from "./security";

const ACTIVE = "active";
const EXPIRED = "expired";
const DELETED = "deleted";

export interface StoreHelpers {
  hashToken(token: string): Promise<string>;
  timingSafeEqual(a: string, b: string): Promise<boolean>;
}

/** Data access layer for Cloudflare D1 (no Mongoose, Node-only APIs). */
export class TempMailStore {
  constructor(
    private env: Env,
    private helpers: StoreHelpers = { hashToken, timingSafeEqual },
  ) {}

  private get db(): D1Database {
    return this.env.DB;
  }

  /** Create a mailbox for an owner. Returns a one-time token (only hash stored). */
  async createMailbox(ownerId: string, existing?: { id: string; publicAddress: string } | null): Promise<{
    id: string;
    publicAddress: string;
    mailboxToken: string;
    expiresAt: string;
    createdAt: string;
  }> {
    const domain = getDomain(this.env);
    const id = existing?.id || uuid();
    const address = existing?.publicAddress || `${generateMailboxId()}@${domain}`;
    const token = generateMailboxToken();
    const tokenHash = await this.helpers.hashToken(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .prepare(
        `INSERT INTO mailboxes (id, owner_id, public_address, token_hash, status, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, '${ACTIVE}', ?5, ?6)
         ON CONFLICT(public_address) DO UPDATE SET
           owner_id = excluded.owner_id,
           token_hash = excluded.token_hash,
           status = '${ACTIVE}',
           expires_at = excluded.expires_at`,
      )
      .bind(id, ownerId, address, tokenHash, createdAt, expiresAt)
      .run();

    return { id, publicAddress: address, mailboxToken: token, expiresAt, createdAt };
  }

  /** Return the owner's active mailbox, reactivating legacy expired rows. */
  async getActiveMailbox(ownerId: string): Promise<{ id: string; publicAddress: string; expiresAt: string; createdAt: string } | null> {
    const row = await this.db
      .prepare(
        `SELECT id, public_address, expires_at, created_at, status
         FROM mailboxes
         WHERE owner_id = ?1 AND status != 'deleted'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(ownerId)
      .first<{ id: string; public_address: string; expires_at: string; created_at: string; status: string }>();
    if (!row) return null;
    let expiresAt = row.expires_at;
    if (row.status === EXPIRED) {
      expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
      await this.db
        .prepare("UPDATE mailboxes SET status = ?, expires_at = ? WHERE id = ?")
        .bind(ACTIVE, expiresAt, row.id)
        .run();
    }
    return {
      id: row.id,
      publicAddress: row.public_address,
      expiresAt,
      createdAt: row.created_at,
    };
  }

  /** Issue a fresh token + rotate stored hash for an existing owner mailbox. */
  async rotateToken(ownerId: string, address: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT id FROM mailboxes WHERE owner_id = ?1 AND public_address = ?2 AND status = 'active'")
      .bind(ownerId, address)
      .first<{ id: string }>();
    if (!row) return null;
    const token = generateMailboxToken();
    const tokenHash = await this.helpers.hashToken(token);
    await this.db.prepare("UPDATE mailboxes SET token_hash = ?1 WHERE id = ?2").bind(tokenHash, row.id).run();
    return token;
  }

  /** Verify address+token (+owner) is still usable; legacy expired records are reactivated. */
  async verifyMailboxToken(
    address: string,
    token: string,
    ownerId?: string,
  ): Promise<{ id: string; ownerId: string; publicAddress: string; expiresAt: string } | null> {
    const addr = address.trim().toLowerCase();
    const row = await this.db
      .prepare(
        `SELECT id, owner_id, public_address, token_hash, expires_at, status
         FROM mailboxes WHERE public_address = ?1 AND status != 'deleted'`,
      )
      .bind(addr)
      .first<{
        id: string;
        owner_id: string;
        public_address: string;
        token_hash: string;
        expires_at: string;
        status: string;
      }>();
    if (!row) return null;
    if (ownerId !== undefined && row.owner_id !== ownerId) return null;
    if (row.status === EXPIRED) {
      const reactivatedExpiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
      await this.db
        .prepare("UPDATE mailboxes SET status = ?, expires_at = ? WHERE id = ?")
        .bind(ACTIVE, reactivatedExpiresAt, row.id)
        .run();
      row.expires_at = reactivatedExpiresAt;
    }
    const presentedHash = await this.helpers.hashToken(token);
    const ok = await this.helpers.timingSafeEqual(presentedHash, row.token_hash);
    if (!ok) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      publicAddress: row.public_address,
      expiresAt: row.expires_at,
    };
  }

  /** Look up an active mailbox by address (for inbound email routing). Legacy expired rows are reactivated automatically. */
  async getActiveMailboxByAddress(address: string): Promise<{ id: string; publicAddress: string } | null> {
    const row = await this.db
      .prepare(
        `SELECT id, public_address, status FROM mailboxes
         WHERE public_address = ?1 AND status != 'deleted' LIMIT 1`,
      )
      .bind(address)
      .first<{ id: string; public_address: string; status: string }>();
    if (!row) return null;
    if (row.status === EXPIRED) {
      await this.db
        .prepare("UPDATE mailboxes SET status = ?, expires_at = ? WHERE id = ?")
        .bind(ACTIVE, new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(), row.id)
        .run();
    }
    return { id: row.id, publicAddress: row.public_address };
  }

  /** Store an inbound email. Dedupes by (mailbox_id, message_id). Returns false if ignored. */
  async storeInboundEmail(email: InboundEmail): Promise<boolean> {
    const addr = email.to.trim().toLowerCase();
    const mailbox = await this.getActiveMailboxByAddress(addr);
    if (!mailbox) return false;

    const existing = await this.db
      .prepare("SELECT id FROM emails WHERE mailbox_id = ?1 AND message_id = ?2")
      .bind(mailbox.id, email.messageId)
      .first<{ id: string }>();
    if (existing) return true;

    const attachments = sanitizeAttachments(email.attachments);
    const html = email.htmlBody ? sanitizeHtml(email.htmlBody) : null;
    const text = email.textBody;
    const size =
      (text?.length || 0) +
      (html?.length || 0) +
      attachments.reduce((n, a) => n + a.size, 0);

    await this.db
      .prepare(
        `INSERT INTO emails (id, mailbox_id, message_id, from_address, to_address, subject, body_text, body_html, received_at, is_read, size, json_attachments)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)`,
      )
      .bind(
        uuid(),
        mailbox.id,
        email.messageId,
        email.from,
        email.to,
        email.subject || "",
        text,
        html,
        email.receivedAt,
        size,
        JSON.stringify(attachments),
      )
      .run();

    const rows = await this.db
      .prepare(
        `SELECT id FROM emails WHERE mailbox_id = ?1 ORDER BY received_at DESC, id DESC`,
      )
      .bind(mailbox.id)
      .all<{ id: string }>();

    const keepIds = (rows.results || []).slice(0, 6).map((row) => row.id);
    if (keepIds.length < (rows.results || []).length) {
      const deletedIds = (rows.results || []).slice(6).map((row) => row.id);
      if (deletedIds.length > 0) {
        const placeholders = deletedIds.map((_, index) => `?${index + 2}`).join(", ");
        await this.db
          .prepare(`DELETE FROM emails WHERE mailbox_id = ?1 AND id IN (${placeholders})`)
          .bind(mailbox.id, ...deletedIds)
          .run();
      }
    }

    return true;
  }

  /** List messages for a mailbox (metadata only, no bodies). */
  async listMessages(mailboxId: string, page: number, limit: number): Promise<Paginated<EmailSummary>> {
    const offset = (page - 1) * limit;
    const totalRow = await this.db
      .prepare("SELECT COUNT(*) AS n FROM emails WHERE mailbox_id = ?1")
      .bind(mailboxId)
      .first<{ n: number }>();
    const total = totalRow?.n ?? 0;

    const rows = await this.db
      .prepare(
        `SELECT id, from_address, to_address, subject, received_at, is_read, size, json_attachments
         FROM emails WHERE mailbox_id = ?1
         ORDER BY received_at DESC LIMIT ?2 OFFSET ?3`,
      )
      .bind(mailboxId, limit, offset)
      .all<{
        id: string;
        from_address: string;
        to_address: string;
        subject: string;
        received_at: string;
        is_read: number;
        size: number;
        json_attachments: string | null;
      }>();

    const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
    const items: EmailSummary[] = (rows.results || []).map((r) => ({
      id: r.id,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      subject: r.subject,
      receivedAt: r.received_at,
      isRead: !!r.is_read,
      size: r.size,
      attachments: parseAttachments(r.json_attachments),
    }));
    return { items, total, page, limit, totalPages };
  }

  /** Get a single message with bodies, scoped to a mailbox. */
  async getMessage(mailboxId: string, emailId: string): Promise<EmailDetail | null> {
    const row = await this.db
      .prepare(
        `SELECT id, message_id, from_address, to_address, subject, body_text, body_html, received_at, is_read, size, json_attachments
         FROM emails WHERE mailbox_id = ?1 AND id = ?2`,
      )
      .bind(mailboxId, emailId)
      .first<{
        id: string;
        message_id: string;
        from_address: string;
        to_address: string;
        subject: string;
        body_text: string | null;
        body_html: string | null;
        received_at: string;
        is_read: number;
        size: number;
        json_attachments: string | null;
      }>();
    if (!row) return null;
    return {
      id: row.id,
      messageId: row.message_id,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      subject: row.subject,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      receivedAt: row.received_at,
      isRead: !!row.is_read,
      size: row.size,
      attachments: parseAttachments(row.json_attachments),
    };
  }

  async markMessageRead(mailboxId: string, emailId: string): Promise<boolean> {
    const res = await this.db
      .prepare("UPDATE emails SET is_read = 1 WHERE mailbox_id = ?1 AND id = ?2")
      .bind(mailboxId, emailId)
      .run();
    return res.meta.changes > 0;
  }

  async deleteMessage(mailboxId: string, emailId: string): Promise<boolean> {
    const res = await this.db
      .prepare("DELETE FROM emails WHERE mailbox_id = ?1 AND id = ?2")
      .bind(mailboxId, emailId)
      .run();
    return res.meta.changes > 0;
  }

  /** Find a mailbox by owner + address (legacy expired rows remain valid until explicit delete). */
  async getMailboxByOwnerAddress(ownerId: string, publicAddress: string): Promise<{ id: string; publicAddress: string } | null> {
    const addr = publicAddress.trim().toLowerCase();
    const row = await this.db
      .prepare(
        `SELECT id, public_address, status FROM mailboxes
         WHERE owner_id = ?1 AND public_address = ?2 AND status != 'deleted' LIMIT 1`,
      )
      .bind(ownerId, addr)
      .first<{ id: string; public_address: string; status: string }>();
    if (!row) return null;
    if (row.status === EXPIRED) {
      await this.db
        .prepare("UPDATE mailboxes SET status = ?, expires_at = ? WHERE id = ?")
        .bind(ACTIVE, new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(), row.id)
        .run();
    }
    return { id: row.id, publicAddress: row.public_address };
  }

  /** Soft-delete an active mailbox by owner + address and drop its emails. */
  async deleteMailboxByAddress(ownerId: string, publicAddress: string): Promise<boolean> {
    const addr = publicAddress.trim().toLowerCase();
    const row = await this.db
      .prepare("SELECT id FROM mailboxes WHERE owner_id = ?1 AND public_address = ?2 AND status != 'deleted'")
      .bind(ownerId, addr)
      .first<{ id: string }>();
    if (!row) return false;
    await this.db
      .prepare("UPDATE mailboxes SET status = 'deleted', expires_at = ?1 WHERE id = ?2 AND owner_id = ?3")
      .bind(nowIso(), row.id, ownerId)
      .run();
    await this.db.prepare("DELETE FROM emails WHERE mailbox_id = ?1").bind(row.id).run();
    return true;
  }

  /** Soft-delete a mailbox + hard-delete its emails. */
  async deleteMailbox(ownerId: string, mailboxId: string): Promise<boolean> {
    const res = await this.db
      .prepare(
        "UPDATE mailboxes SET status = 'deleted', expires_at = ?1 WHERE id = ?2 AND owner_id = ?3",
      )
      .bind(nowIso(), mailboxId, ownerId)
      .run();
    if (res.meta.changes > 0) {
      await this.db.prepare("DELETE FROM emails WHERE mailbox_id = ?1").bind(mailboxId).run();
    }
    return res.meta.changes > 0;
  }

}

function parseAttachments(json: string | null): AttachmentMeta[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        filename: sanitizeFilename(a.filename),
        contentType: String(a.contentType || "application/octet-stream"),
        size: typeof a.size === "number" ? a.size : 0,
      }));
  } catch {
    return [];
  }
}
