const memoryCache = new Map<string, unknown>();

export function getSessionCache<T>(key: string): T | null {
  if (!memoryCache.has(key)) return null;
  return memoryCache.get(key) as T;
}

export function setSessionCache<T>(key: string, value: T): void {
  memoryCache.set(key, value);
}