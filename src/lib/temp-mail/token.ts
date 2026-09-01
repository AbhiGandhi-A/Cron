import crypto from "node:crypto";

const MAILBOX_ID_LENGTH = 8;
const MAILBOX_TOKEN_LENGTH = 32;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateMailboxId(): string {
  const bytes = crypto.randomBytes(MAILBOX_ID_LENGTH);
  let result = "";
  for (let i = 0; i < MAILBOX_ID_LENGTH; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

export function generateMailboxToken(): string {
  return crypto.randomBytes(MAILBOX_TOKEN_LENGTH).toString("hex");
}

export function hashMailboxToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getExpirationMinutes(): number {
  const val = parseInt(process.env.TEMP_MAIL_EXPIRATION_MINUTES || "30", 10);
  if (Number.isNaN(val) || val < 1 || val > 1440) return 30;
  return val;
}

export function getTempMailDomain(): string {
  return (process.env.TEMP_MAIL_DOMAIN || "temp.cronjobs.site").toLowerCase().trim();
}
