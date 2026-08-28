import { z } from "zod";

const safeText = (max: number) => z.string().trim().max(max);

export const analyzeResultSchema = z.object({
  slug: z.string().trim().max(200).optional().nullable(),
  rootCause: z.string().trim().max(2000).optional().nullable(),
  fix: z.string().trim().max(4000).optional().nullable(),
  impact: z.string().trim().max(2000).optional().nullable(),
  prevention: z.string().trim().max(2000).optional().nullable(),
  references: z.array(z.string().trim().max(500)).max(8).optional().default([]),
}).default({});

export type AnalyzeResultInput = z.infer<typeof analyzeResultSchema>;

export const ALLOWED_COLLECTIONS: Record<string, string[]> = {
  cronjobs: ["name", "url", "method", "schedule", "isActive", "timeout", "lastRunAt", "nextRunAt"],
  jobexecutions: ["status", "httpStatus", "responseTime", "errorMessage", "startedAt", "completedAt", "requestMethod", "responseSize"],
  testurls: ["name", "token", "isActive", "createdAt"],
  users: ["name", "email", "plan", "createdAt"],
};

export const ALLOWED_API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;

export const ALLOWED_SOURCE_TYPES = ["static", "collection", "internal"] as const;

export const ALLOWED_AUTH_MODES = ["public", "api-key", "bearer", "private"] as const;

const urlSchema = safeText(1000).refine(
  (value) => {
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  "Only HTTP(S) URLs are allowed"
);

export const generateApiInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  source: z.object({
    type: z.enum(ALLOWED_SOURCE_TYPES),
    body: z.any().optional().nullable(),
    collection: z.string().trim().max(80).optional().nullable(),
    fields: z.array(z.string().trim().max(80)).max(50).optional().nullable(),
    url: urlSchema.optional().nullable(),
    method: z.enum(ALLOWED_API_METHODS).optional().nullable(),
    timeout: z.number().int().min(1000).max(300000).optional().nullable(),
  }).refine(
    (source) => {
      if (source.type === "collection") {
        return !!source.collection && !!source.fields && source.fields.length > 0;
      }
      if (source.type === "internal") {
        return !!source.url && !!source.method;
      }
      if (source.type === "static") {
        return source.body !== undefined && source.body !== null;
      }
      return true;
    },
    "The generated API source configuration is incomplete or invalid"
  ).refine(
    (source) => {
      if (source.type !== "collection" || !source.collection) return true;
      const allowed = ALLOWED_COLLECTIONS[source.collection];
      if (!allowed) return false;
      const fields = source.fields ?? [];
      return fields.every((field) => allowed.includes(field));
    },
    "Only allowlisted collections and fields can be exposed"
  ),
  methods: z.array(z.enum(ALLOWED_API_METHODS)).min(1).max(6).default(["GET"]),
  authMode: z.enum(ALLOWED_AUTH_MODES).default("private"),
  cors: z.object({
    enabled: z.boolean().default(false),
    origins: z.array(z.string().trim().max(500)).max(10).default([]),
  }).default({ enabled: false, origins: [] }),
  rateLimit: z.object({
    limit: z.number().int().min(1).max(1000).default(30),
    windowMs: z.number().int().min(1000).max(3_600_000).default(60_000),
  }).default({ limit: 30, windowMs: 60_000 }),
  response: z.object({
    statusCode: z.number().int().min(200).max(599).default(200),
    maxSizeBytes: z.number().int().min(1024).max(500_000).default(100_000),
    contentType: z.string().trim().max(100).default("application/json"),
  }).default({ statusCode: 200, maxSizeBytes: 100_000, contentType: "application/json" }),
});

export type GenerateApiInput = z.infer<typeof generateApiInputSchema>;

export const issueResolveInputSchema = z.object({
  resolved: z.boolean(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
}).strict();

export const chatInputSchema = z.object({
  issueId: z.string().trim().max(120).optional(),
  message: z.string().trim().min(1).max(4000),
  context: z.record(z.unknown()).optional().nullable(),
}).strict();

export const analyzeInputSchema = z.object({
  title: z.string().trim().max(300).default("Application error"),
  message: z.string().trim().max(2000).default("No details"),
  errorType: z.string().trim().max(200).optional().nullable(),
  endpoint: z.string().trim().max(2048).optional().nullable(),
  method: z.string().trim().max(20).optional().nullable(),
  status: z.number().int().min(100).max(599).optional().nullable(),
  stack: z.string().max(8000).optional().nullable(),
  kind: z.enum(["frontend", "api", "cron", "performance"]).default("frontend"),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  source: z.string().trim().max(60).default("unknown"),
  page: z.string().trim().max(512).optional().nullable(),
  userAgent: z.string().trim().max(512).optional().nullable(),
  response: z.string().max(4000).optional().nullable(),
  context: z.record(z.unknown()).optional().nullable(),
  perf: z.object({
    op: z.string().trim().max(200),
    durationMs: z.number().int().min(0),
    threshold: z.enum(["normal", "warning", "critical"]),
    endpoint: z.string().trim().max(2048).optional().nullable(),
  }).optional().nullable(),
  retryable: z.object({
    method: z.string().trim().max(20),
    url: z.string().trim().max(2048),
    headers: z.record(z.string()).optional().nullable(),
    body: z.any().optional().nullable(),
    bodyType: z.enum(["none", "json", "form", "text"]).default("json"),
    timeout: z.number().int().min(1000).max(300000).default(30000),
    expectedStatus: z.number().int().min(100).max(599).optional().nullable(),
  }).optional().nullable(),
  force: z.boolean().optional().default(false),
}).strict();

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;