const dangerousTags = /<script[\s>]/gi;
const eventHandlers = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const javascriptUrls = /javascript\s*:/gi;
const dataUris = /data\s*:\s*text\/html/gi;

const forbiddenTags = /<\/?(?:script|iframe|object|embed|form|input|button|select|textarea|meta|link|base|applet|style)[^>]*>/gi;

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") return "";

  let sanitized = html;

  sanitized = sanitized.replace(dangerousTags, "");
  sanitized = sanitized.replace(eventHandlers, "");
  sanitized = sanitized.replace(javascriptUrls, "blocked:");
  sanitized = sanitized.replace(dataUris, "blocked:");
  sanitized = sanitized.replace(forbiddenTags, "");

  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  return sanitized;
}

export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") return "attachment";
  const cleaned = filename
    .replace(/[\/\\]/g, "")
    .replace(/\.\./g, "")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "attachment";
  if (cleaned.length > 255) {
    return cleaned.slice(0, 255);
  }
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
