export type AiIssueKind = "frontend" | "api" | "cron" | "performance";

export type AiSeverity = "low" | "medium" | "high" | "critical";

export interface AiAnalysis {
  analyzedAt: Date | string;
  available: boolean;
  error: string | null;
  rootCause: string | null;
  fix: string | null;
  impact: string | null;
  prevention: string | null;
  references: string[];
  raw: Record<string, unknown> | null;
}

export interface AiConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date | string;
}

export interface AiRetryableRequest {
  method: string;
  url: string;
  headers?: Record<string, string> | null;
  body?: unknown;
  bodyType: "none" | "json" | "form" | "text";
  timeout: number;
  expectedStatus?: number | null;
}

export interface AiPerformanceInfo {
  op: string;
  durationMs: number;
  threshold: "normal" | "warning" | "critical";
  endpoint?: string | null;
}

export interface NormalizedErrorInput {
  title: string;
  message: string;
  errorType?: string | null;
  endpoint?: string | null;
  method?: string | null;
  status?: number | null;
  stack?: string | null;
  kind?: AiIssueKind;
  severity?: AiSeverity;
  source?: string;
  page?: string | null;
  userAgent?: string | null;
  response?: string | null;
  context?: Record<string, unknown> | null;
  perf?: AiPerformanceInfo | null;
  retryable?: AiRetryableRequest | null;
}

export type GeneratedApiSourceType = "static" | "collection" | "internal";

export interface GeneratedApiSourceConfig {
  type: GeneratedApiSourceType;
  body?: unknown;
  collection?: string;
  fields?: string[];
  url?: string;
  method?: string;
  timeout?: number;
}

export type GeneratedApiAuthMode = "public" | "api-key" | "bearer" | "private";

export interface GeneratedApiAuthConfig {
  mode: GeneratedApiAuthMode;
  secretHash: string | null;
  secretPrefix: string | null;
}

export interface GeneratedApiCorsConfig {
  enabled: boolean;
  origins: string[];
}

export interface GeneratedApiRateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface GeneratedApiResponseConfig {
  statusCode: number;
  maxSizeBytes: number;
  contentType: string;
}

export interface GeneratedApiSourceConfigStored {
  type: GeneratedApiSourceType;
  body?: unknown;
  collection?: string;
  fields?: string[];
  url?: string;
  method?: string;
  timeout?: number;
}

export interface GeneratedApiAnalytics {
  dayKey: string;
  requestsToday: number;
  successCount: number;
  errorCount: number;
  totalResponseTimeMs: number;
  lastRequestAt: Date | null;
}

export interface GeneratedApiInput {
  name: string;
  description: string;
  source: GeneratedApiSourceConfig;
  methods: string[];
  authMode: GeneratedApiAuthMode;
  cors: GeneratedApiCorsConfig;
  rateLimit: GeneratedApiRateLimitConfig;
  response: GeneratedApiResponseConfig;
}

export const PERFORMANCE_THRESHOLDS = {
  normalMs: 1000,
  warningMs: 3000,
} as const;