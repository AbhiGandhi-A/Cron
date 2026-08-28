export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeFingerprint(parts: Array<string | number | null | undefined>): string {
  const normalized = parts
    .map((part) => {
      if (part === null || part === undefined) return "";
      return String(part).replace(/\s+/g, " ").trim();
    })
    .join("|");
  return hashString(normalized);
}

export function extractStackAnchor(stack: string | null | undefined): string {
  if (!stack || !stack.trim()) return "";
  const lines = stack.split("\n").filter((line) => line.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("http") || trimmed.startsWith("file:") || trimmed.startsWith("webpack:")) {
      return trimmed.replace(/\?.*$/g, "").slice(0, 300);
    }
  }
  return lines[0].trim().slice(0, 300);
}