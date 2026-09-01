const dangerousTags = /<script[\s>]/gi;
const eventHandlers = /\s*on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const javascriptUrls = /javascript\s*:/gi;
const dataUris = /data\s*:\s*text\/html/gi;

const forbiddenTags =
  /<\/?(?:script|iframe|object|embed|form|input|button|select|textarea|meta|link|base|applet|style)[^>]*>/gi;

/** Returns a best-effort sanitized HTML string. This is defense-in-depth; it
 *  never guarantees perfectly safe HTML but strips the well-known XSS vectors
 *  (scripts, event handlers, javascript:/data:text/html URLs, forbidden tags). */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") return "";
  let s = html;
  s = s.replace(dangerousTags, "");
  s = s.replace(eventHandlers, "");
  s = s.replace(javascriptUrls, "blocked:");
  s = s.replace(dataUris, "blocked:");
  s = s.replace(forbiddenTags, "");
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  return s;
}

export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") return "attachment";
  const cleaned = filename
    .replace(/[\\/]/g, "")
    .replace(/\.\./g, "")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "attachment";
  if (cleaned.length > 255) return cleaned.slice(0, 255);
  return cleaned;
}

export function isSafeAttachmentMimeType(mimeType: string): boolean {
  if (!mimeType || typeof mimeType !== "string") return false;
  const dangerous = [
    "application/javascript",
    "application/x-javascript",
    "text/javascript",
    "application/x-executable",
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-bat",
    "application/x-sh",
  ];
  return !dangerous.includes(mimeType.toLowerCase().trim());
}

/** Filter attachment metadata, sanitizing filenames and dropping unsafe types. */
export function sanitizeAttachments(attachments?: {
  filename?: string;
  contentType?: string;
  size?: number;
}[]): { filename: string; contentType: string; size: number }[] {
  if (!Array.isArray(attachments)) return [];
  const seen = new Set<string>();
  const out: { filename: string; contentType: string; size: number }[] = [];
  for (const a of attachments) {
    const filename = sanitizeFilename(a.filename || "attachment");
    const contentType = (a.contentType || "application/octet-stream").toLowerCase().trim();
    if (!isSafeAttachmentMimeType(contentType)) continue;
    const key = `${filename}|${contentType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ filename, contentType, size: typeof a.size === "number" && a.size > 0 ? Math.floor(a.size) : 0 });
  }
  return out;
}
