import { hashString } from "@/lib/monitoring/fingerprint";

const DEFAULT_ANALYSIS_COOLDOWN_MS = 3_600_000;
const DEFAULT_RESEARCH_CACHE_MS = 3_600_000;
const CHAT_DEDUP_WINDOW_MS = 5_000;
const MAX_RESEARCH_ENTRIES = 500;
const MAX_CHAT_ENTRIES = 300;

function readEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function analysisCooldownMs(): number {
  return readEnvMs("AI_ANALYSIS_COOLDOWN_MS", DEFAULT_ANALYSIS_COOLDOWN_MS);
}

export function researchCacheMs(): number {
  return readEnvMs("AI_RESEARCH_CACHE_MS", DEFAULT_RESEARCH_CACHE_MS);
}

const startedAt = Date.now();
const usage = {
  totalCalls: 0,
  reasoningCalls: 0,
  researchCalls: 0,
  researchCacheHits: 0,
  dedupedRequests: 0,
};

export interface AiUsageSnapshot {
  totalCalls: number;
  reasoningCalls: number;
  researchCalls: number;
  researchCacheHits: number;
  dedupedRequests: number;
  since: string;
}

export function markAiCall(model: string, reasoningModel: string): void {
  usage.totalCalls += 1;
  if (model === reasoningModel) {
    usage.reasoningCalls += 1;
  } else {
    usage.researchCalls += 1;
  }
}

export function markDedupe(count = 1): void {
  usage.dedupedRequests += count;
}

export function markResearchCacheHit(): void {
  usage.researchCacheHits += 1;
}

export function usageSnapshot(): AiUsageSnapshot {
  return { ...usage, since: new Date(startedAt).toISOString() };
}

export function resetUsageForTests(): void {
  usage.totalCalls = 0;
  usage.reasoningCalls = 0;
  usage.researchCalls = 0;
  usage.researchCacheHits = 0;
  usage.dedupedRequests = 0;
}

export type AnalysisGateReason = "available" | "cooldown" | "run";

export interface AnalysisGate {
  reuse: boolean;
  reason: AnalysisGateReason;
}

export function decideReuseAnalysis(input: {
  analysis: { analyzedAt?: Date | string | number | null; available?: boolean } | null | undefined;
  manual?: boolean;
  now?: Date;
}): AnalysisGate {
  if (input.manual) return { reuse: false, reason: "run" };
  if (input.analysis?.available) return { reuse: true, reason: "available" };
  const attemptedAt = input.analysis?.analyzedAt;
  if (attemptedAt) {
    const timestamp = new Date(attemptedAt).getTime();
    const since = (input.now?.getTime() ?? Date.now()) - timestamp;
    if (Number.isFinite(timestamp) && since >= 0 && since < analysisCooldownMs()) {
      return { reuse: true, reason: "cooldown" };
    }
  }
  return { reuse: false, reason: "run" };
}

interface ResearchCacheEntry {
  brief: string;
  at: number;
}

const researchCache = new Map<string, ResearchCacheEntry>();

export function getCachedResearch(question: string): string | null {
  const key = hashString(question);
  const entry = researchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at < researchCacheMs()) {
    markResearchCacheHit();
    return entry.brief;
  }
  researchCache.delete(key);
  return null;
}

export function storeResearch(question: string, brief: string): void {
  researchCache.set(hashString(question), { brief, at: Date.now() });
  const overflow = researchCache.size - MAX_RESEARCH_ENTRIES;
  if (overflow > 0) {
    const oldest = researchCache.keys().next().value as string | undefined;
    if (oldest) researchCache.delete(oldest);
  }
}

export function clearResearchCacheForTests(): void {
  researchCache.clear();
}

const analysisInFlight = new Map<string, Promise<unknown>>();

export function withAnalysisInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = analysisInFlight.get(key);
  if (existing) {
    markDedupe();
    return existing as Promise<T>;
  }
  const promise = Promise.resolve().then(run).finally(() => {
    analysisInFlight.delete(key);
  });
  analysisInFlight.set(key, promise);
  return promise;
}

interface ChatDedupeEntry {
  at: number;
  body: Record<string, unknown>;
}

const chatDedupCache = new Map<string, ChatDedupeEntry>();

export function chatDedupeKey(userId: string, issueId: string | undefined, message: string): string {
  return `${userId}|${issueId ?? "global"}|${hashString(message)}`;
}

export function findChatDedupe(key: string): Record<string, unknown> | null {
  const entry = chatDedupCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at < CHAT_DEDUP_WINDOW_MS) {
    markDedupe();
    return entry.body;
  }
  chatDedupCache.delete(key);
  return null;
}

export function storeChatDedupe(key: string, body: Record<string, unknown>): void {
  chatDedupCache.set(key, { at: Date.now(), body });
  const overflow = chatDedupCache.size - MAX_CHAT_ENTRIES;
  if (overflow > 0) {
    const oldest = chatDedupCache.keys().next().value as string | undefined;
    if (oldest) chatDedupCache.delete(oldest);
  }
}

const retryInFlight = new Set<string>();

export function tryBeginRetry(key: string): boolean {
  if (retryInFlight.has(key)) {
    markDedupe();
    return false;
  }
  retryInFlight.add(key);
  return true;
}

export function endRetry(key: string): void {
  retryInFlight.delete(key);
}