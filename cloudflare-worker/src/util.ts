const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MAILBOX_ID_LENGTH = 12;
const TOKEN_BYTES = 32;

const te = new TextEncoder();

/** CSPRNG-fill the given array using Web Crypto (available on Workers). */
function randomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

/** 12-char lowercase alphanumeric mailbox id (never an ObjectId). */
export function generateMailboxId(): string {
  const bytes = randomBytes(MAILBOX_ID_LENGTH);
  let result = "";
  for (let i = 0; i < MAILBOX_ID_LENGTH; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

/** 64-hex mailbox token (32 random bytes). Full token is only shown once to
 *  the creator; only its SHA-256 hash is stored. */
export function generateMailboxToken(): string {
  const bytes = randomBytes(TOKEN_BYTES);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 hex digest (Web Crypto / SubtleCrypto, async). */
export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", te.encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time token comparison. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const ab = te.encode(a);
  const bb = te.encode(b);
  if (ab.length !== bb.length) return false;
  const xor = new Uint8Array(ab.length);
  for (let i = 0; i < ab.length; i++) {
    xor[i] = ab[i] ^ bb[i];
  }
  let diff = 0;
  for (const v of xor) diff |= v;
  return diff === 0;
}

/** Current timestamp as ISO string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Mailbox lifetime in minutes from env (clamped 1-1440, default 30). */
export function getExpirationMinutes(env: { TEMP_MAIL_EXPIRATION_MINUTES?: string }): number {
  const val = parseInt(env.TEMP_MAIL_EXPIRATION_MINUTES || "30", 10);
  if (Number.isNaN(val) || val < 1 || val > 1440) return 30;
  return val;
}

/** Domain used to build temporary addresses (default temp.cronjobs.site). */
export function getDomain(env: { TEMP_MAIL_DOMAIN?: string }): string {
  return (env.TEMP_MAIL_DOMAIN || "temp.cronjobs.site").toLowerCase().trim();
}

/** Page size for listings from env (clamped 1-100, default 20). */
export function getPageSize(env: { TEMP_MAIL_PAGE_SIZE?: string }): number {
  const val = parseInt(env.TEMP_MAIL_PAGE_SIZE || "20", 10);
  if (Number.isNaN(val) || val < 1 || val > 100) return 20;
  return val;
}

/** RFC 4122 v4 UUID (D1 primary keys). */
export function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
