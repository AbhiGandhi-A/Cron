/**
 * Pure display helpers for the Test URL request viewer.
 *
 * The webhook endpoint persists parsed JSON bodies as objects and non-JSON
 * bodies as strings. These helpers keep that rendering safe and readable.
 */

export function formatRequestBody(body: unknown): string {
  if (body === null || body === undefined || body === "") return "No body";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

export function formatRequestSize(bytes: unknown): string {
  const size =
    typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0
      ? Math.floor(bytes)
      : 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export interface RequestCountEntry {
  _id: unknown;
  count: number;
}

/**
 * Decorates Test URL records with the number of captured requests, deriving
 * the count from the existing TestUrlRequest records instead of maintaining
 * duplicate state. Test URLs with no requests map to 0.
 */
export function mergeRequestCounts<T extends { _id: unknown }>(
  items: T[],
  counts: readonly RequestCountEntry[]
): Array<T & { requestCount: number }> {
  const countById = new Map<string, number>();
  for (const entry of counts) {
    countById.set(String(entry._id), entry.count);
  }
  return items.map((item) => ({
    ...item,
    requestCount: countById.get(String(item._id)) ?? 0,
  }));
}