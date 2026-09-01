-- ===========================================================================
-- D1 migration 0001_init.sql - cronjobs_temp_mail_db
-- Temporary mailboxes + inbound emails.
--
-- TTL / expiration is enforced two ways:
--   1. Lazily: every read/ownership check filters by `expires_at > now()`
--      (see src/expiration.ts / src/store.ts).
--   2. A periodic sweep can be run (e.g. a Worker cron or the Next.js bridge)
--      calling `DELETE FROM mailboxes WHERE expires_at <= now()`.
-- D1 has no native TTL index (unlike Mongo), so we rely on lazy filtering.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Table: mailboxes
-- One temporary address per row. `owner_id` is the Next.js user id (string).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mailboxes (
  id               TEXT PRIMARY KEY,          -- uuid
  owner_id         TEXT NOT NULL,             -- Next.js user id (scoping)
  public_address   TEXT NOT NULL UNIQUE,      -- a1b2c3d4e5f6@temp.cronjobs.site
  token_hash       TEXT NOT NULL,             -- SHA-256 of the mailbox token
  status           TEXT NOT NULL DEFAULT 'active', -- active | expired | deleted
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at       TEXT NOT NULL              -- ISO datetime
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_owner
  ON mailboxes (owner_id, status);

CREATE INDEX IF NOT EXISTS idx_mailboxes_address
  ON mailboxes (public_address);

CREATE INDEX IF NOT EXISTS idx_mailboxes_expires
  ON mailboxes (expires_at);

-- ---------------------------------------------------------------------------
-- Table: emails
-- Metadata + sanitized bodies for inbound mail delivered to a mailbox.
-- `body_html` always stores SANITIZED html (never raw).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emails (
  id            TEXT PRIMARY KEY,             -- uuid
  mailbox_id    TEXT NOT NULL,                -- FK -> mailboxes.id
  message_id    TEXT NOT NULL,                -- unique id from the sender / dedupe
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  body_text     TEXT,                         -- plain text body (may be NULL)
  body_html     TEXT,                         -- SANITIZED html body (may be NULL)
  received_at   TEXT NOT NULL,
  is_read       INTEGER NOT NULL DEFAULT 0,   -- 0 = unread, 1 = read
  size          INTEGER NOT NULL DEFAULT 0,   -- approximate bytes
  json_attachments TEXT,                      -- JSON array of attachment metadata

  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emails_mailbox_received
  ON emails (mailbox_id, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_mailbox_message
  ON emails (mailbox_id, message_id);

-- Sweep expired mailboxes. Idempotent; runnable via a cron or manual SQL.
CREATE INDEX IF NOT EXISTS idx_mailboxes_expires_status
  ON mailboxes (expires_at, status);
