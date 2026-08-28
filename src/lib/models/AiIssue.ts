import mongoose, { Schema, Model } from "mongoose";
import type { AiIssueKind, AiSeverity, AiAnalysis, AiConversationMessage, AiRetryableRequest, AiPerformanceInfo } from "../ai/types";

export interface IAiIssue extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kind: AiIssueKind;
  source: string;
  title: string;
  message: string;
  errorType: string | null;
  endpoint: string | null;
  method: string | null;
  status: number | null;
  stack: string | null;
  severity: AiSeverity;
  fingerprint: string;
  page: string | null;
  userAgent: string | null;
  response: string | null;
  context: Record<string, unknown> | null;
  perf: AiPerformanceInfo | null;
  retryable: (AiRetryableRequest & { result?: Record<string, unknown> | null }) | null;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolved: boolean;
  resolvedAt: Date | null;
  analysis: AiAnalysis | null;
  conversation: AiConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const RetryableSchema = new Schema<AiRetryableRequest & { result?: Record<string, unknown> | null }>(
  {
    method: { type: String, required: true },
    url: { type: String, required: true },
    headers: { type: Schema.Types.Mixed, default: null },
    body: { type: Schema.Types.Mixed, default: null },
    bodyType: { type: String, enum: ["none", "json", "form", "text"], default: "json" },
    timeout: { type: Number, default: 30000 },
    expectedStatus: { type: Number, default: null },
    result: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const PerfSchema = new Schema<AiPerformanceInfo>(
  {
    op: { type: String, required: true },
    durationMs: { type: Number, required: true },
    threshold: { type: String, enum: ["normal", "warning", "critical"], required: true },
    endpoint: { type: String, default: null },
  },
  { _id: false }
);

const AnalysisSchema = new Schema<AiAnalysis>(
  {
    analyzedAt: { type: Date, default: Date.now },
    available: { type: Boolean, default: false },
    error: { type: String, default: null },
    rootCause: { type: String, default: null },
    fix: { type: String, default: null },
    impact: { type: String, default: null },
    prevention: { type: String, default: null },
    references: { type: [String], default: [] },
    raw: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const ConversationMessageSchema = new Schema<AiConversationMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AiIssueSchema = new Schema<IAiIssue>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["frontend", "api", "cron", "performance"], default: "frontend" },
    source: { type: String, default: "unknown" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    errorType: { type: String, default: null },
    endpoint: { type: String, default: null },
    method: { type: String, default: null },
    status: { type: Number, default: null },
    stack: { type: String, default: null },
    severity: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
    fingerprint: { type: String, required: true, index: true },
    page: { type: String, default: null },
    userAgent: { type: String, default: null },
    response: { type: String, default: null },
    context: { type: Schema.Types.Mixed, default: null },
    perf: { type: PerfSchema, default: null },
    retryable: { type: RetryableSchema, default: null },
    occurrences: { type: Number, default: 1 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
    analysis: { type: AnalysisSchema, default: null },
    conversation: { type: [ConversationMessageSchema], default: [] },
  },
  { timestamps: true }
);

AiIssueSchema.index({ userId: 1, lastSeenAt: -1 });
AiIssueSchema.index({ userId: 1, fingerprint: 1, resolved: 1 });

export const AiIssue: Model<IAiIssue> =
  mongoose.models.AiIssue || mongoose.model<IAiIssue>("AiIssue", AiIssueSchema);