import type { InboundEmail, AttachmentMeta } from "./types";
import { sanitizeHtml, sanitizeAttachments } from "./security";
import { nowIso } from "./util";

function cleanHeader(value: string | ArrayBuffer | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return new TextDecoder().decode(value);
}

function cleanContent(value: ArrayBuffer | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return new TextDecoder().decode(value);
}

/** Build a stable message id if the sender didn't provide one. */
function resolveMessageId(provided?: string): string {
  if (provided && provided.trim()) return provided.trim();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@cronjobs`;
}

/** Map a Cloudflare Email Routing `message` into the InboundEmail shape,
 *  sanitizing HTML and attachment metadata for storage. */
export async function parseEmailMessage(message: {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  setReject: (reason: string) => void;
}): Promise<InboundEmail> {
  const subject = cleanHeader(message.headers.get("subject"));

  try {
    const buf = await readAll(message.raw);
    const decoder = new TextDecoder("utf-8");
    const rawText = decoder.decode(buf);
    const { textBody, htmlBody, attachments } = parseRawEmail(rawText);
    const messageId = resolveMessageId(cleanHeader(message.headers.get("message-id")));
    return {
      messageId,
      from: cleanHeader(message.from),
      to: cleanHeader(message.to),
      subject,
      textBody: textBody ? textBody.slice(0, 2_000_000) : null,
      htmlBody: htmlBody ? sanitizeHtml(htmlBody.slice(0, 4_000_000)) : null,
      receivedAt: nowIso(),
      attachments,
    } satisfies InboundEmail;
  } catch {
    return {
      messageId: resolveMessageId(cleanHeader(message.headers.get("message-id"))),
      from: cleanHeader(message.from),
      to: cleanHeader(message.to),
      subject,
      textBody: null,
      htmlBody: null,
      receivedAt: nowIso(),
      attachments: [],
    };
  }
}

async function readAll(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

interface ParsedEmail {
  textBody: string | null;
  htmlBody: string | null;
  attachments: AttachmentMeta[];
}

/** Extremely lightweight MIME parser. Splits headers from body, extracts
 *  multipart/alternative (text/plain + text/html) text content, and captures
 *  attachment metadata. This is intentionally simple and tolerant. */
export function parseRawEmail(raw: string): ParsedEmail {
  if (!raw) return { textBody: null, htmlBody: null, attachments: [] };
  const headerEnd = raw.indexOf("\r\n\r\n");
  const sep = headerEnd === -1 ? "\n\n" : "\r\n\r\n";
  const headerEndReal = headerEnd === -1 ? raw.indexOf("\n\n") : headerEnd;
  if (headerEndReal === -1) {
    return extractPlain(raw, { textBody: null, htmlBody: null, attachments: [] });
  }
  const headers = raw.slice(0, headerEndReal);
  const body = raw.slice(headerEndReal + sep.length);

  const contentType = getHeader(headers, "content-type") || "";
  const isMultipart = /multipart\//i.test(contentType);
  if (isMultipart) {
    // Attempt to walk multipart boundaries.
    const boundary = getBoundary(contentType);
    if (boundary) {
      const acc: ParsedEmail = { textBody: null, htmlBody: null, attachments: [] };
      const parts = body.split(new RegExp(`--${escapeRegExp(boundary)}`));
      for (const part of parts) {
        collectPart(part, acc);
      }
      return acc;
    }
    return extractPlain(body, { textBody: null, htmlBody: null, attachments: [] });
  }

  return extractPlain(body, { textBody: null, htmlBody: null, attachments: [] });
}

function getHeader(headers: string, name: string): string {
  const re = new RegExp(`^${escapeRegExp(name)}\\s*:\\s*(.*)$`, "im");
  const m = headers.match(re);
  return m ? m[1].trim() : "";
}

function getBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i);
  return m ? m[1] : null;
}

function collectPart(part: string, acc: ParsedEmail): void {
  const end = part.indexOf("\r\n\r\n");
  const sepReal = end === -1 ? part.indexOf("\n\n") : end;
  if (end === -1 && sepReal === -1) return;
  const headers = part.slice(0, sepReal);
  const body = part.slice(sepReal + (end !== -1 ? 4 : 2));
  const contentType = getHeader(headers, "content-type") || "";
  const disposition = getHeader(headers, "content-disposition") || "";

  if (/^text\/plain/i.test(contentType)) {
    acc.textBody = acc.textBody ? acc.textBody + "\n" + body : body;
  } else if (/^text\/html/i.test(contentType)) {
    acc.htmlBody = acc.htmlBody ? acc.htmlBody + "\n" + body : body;
  } else if (/attachment/i.test(disposition) || !/multipart\//i.test(contentType)) {
    const filenameMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i) || disposition.match(/filename\s*=\s*([^\s;]+)/i);
    const filename = filenameMatch ? filenameMatch[1] : "attachment";
    acc.attachments.push({
      filename,
      contentType: contentType.split(";")[0].trim() || "application/octet-stream",
      size: new TextEncoder().encode(body).length,
    });
  }
}

function extractPlain(body: string, base: ParsedEmail): ParsedEmail {
  // Whole message is plain text.
  const isHtml = /<html[\s>]/i.test(body) || /<!doctype\s+html>/i.test(body);
  if (isHtml) {
    return { ...base, htmlBody: base.htmlBody ?? sanitizeHtml(body) };
  }
  return { ...base, textBody: base.textBody ?? body };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Sanitize the final in-memory InboundEmail for storage (dedupe attachments). */
export function prepareForStorage(email: InboundEmail): InboundEmail {
  return {
    ...email,
    htmlBody: email.htmlBody ? sanitizeHtml(email.htmlBody) : email.htmlBody,
    attachments: sanitizeAttachments(email.attachments),
  };
}
