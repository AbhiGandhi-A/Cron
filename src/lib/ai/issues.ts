import type { NormalizedErrorInput, AiSeverity } from "./types";
import { AiIssue, type IAiIssue } from "@/lib/models";
import { computeFingerprint, extractStackAnchor, hashString } from "@/lib/monitoring/fingerprint";
import { severityRank } from "@/lib/monitoring/normalize";
import { isGrokConfigured } from "./grok";

export function computeIssueFingerprint(input: NormalizedErrorInput): string {
  return computeFingerprint([
    input.errorType || input.title,
    input.title,
    input.message,
    input.endpoint,
    input.status,
    extractStackAnchor(input.stack),
  ]);
}

export async function upsertIssue(
  userId: string,
  input: NormalizedErrorInput
): Promise<{ issue: IAiIssue; isNew: boolean; fingerprint: string }> {
  const fingerprint = computeIssueFingerprint(input);

  const existing = await AiIssue.findOne({ userId, fingerprint })
    .sort({ firstSeenAt: -1 })
    .exec();

  if (!existing) {
    const issue = await AiIssue.create({
      userId,
      kind: input.kind ?? "frontend",
      source: input.source ?? "unknown",
      title: input.title,
      message: input.message,
      errorType: input.errorType ?? null,
      endpoint: input.endpoint ?? null,
      method: input.method ?? null,
      status: input.status ?? null,
      stack: input.stack ?? null,
      severity: input.severity ?? "medium",
      fingerprint,
      page: input.page ?? null,
      userAgent: input.userAgent ?? null,
      response: input.response ?? null,
      context: input.context ?? null,
      perf: input.perf ?? null,
      retryable: input.retryable ?? null,
      occurrences: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      resolved: false,
      resolvedAt: null,
      analysis: null,
      conversation: [],
    });
    return { issue, isNew: true, fingerprint };
  }

  const reopen = existing.resolved;
  existing.occurrences += 1;
  existing.lastSeenAt = new Date();
  existing.message = input.message || existing.message;
  existing.source = input.source || existing.source;
  if (input.endpoint) existing.endpoint = input.endpoint;
  if (input.status) existing.status = input.status;
  if (input.severity && severityRank(input.severity) > severityRank(existing.severity)) {
    existing.severity = input.severity;
  }
  if (input.stack) existing.stack = input.stack;
  if (input.context) existing.context = input.context;
  if (input.perf) existing.perf = input.perf;
  if (input.retryable) {
    existing.retryable = { ...input.retryable, result: null };
  }
  if (reopen) {
    existing.resolved = false;
    existing.resolvedAt = null;
  }
  await existing.save();

  return { issue: existing, isNew: false, fingerprint };
}

export function serializeIssue(doc: IAiIssue): Record<string, unknown> {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    source: doc.source,
    title: doc.title,
    message: doc.message,
    errorType: doc.errorType,
    endpoint: doc.endpoint,
    method: doc.method,
    status: doc.status,
    stack: doc.stack,
    severity: doc.severity,
    page: doc.page,
    userAgent: doc.userAgent,
    response: doc.response,
    context: doc.context,
    perf: doc.perf,
    retryable: doc.retryable,
    occurrences: doc.occurrences,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    resolved: doc.resolved,
    resolvedAt: doc.resolvedAt,
    analysis: doc.analysis,
    conversation: doc.conversation ? doc.conversation.slice(-20) : [],
    createdAt: doc.createdAt,
  };
}

export async function buildMonitoringSummary(userId: string): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [openIssues, criticalIssues, pendingAnalysis, recentDocs] = await Promise.all([
    AiIssue.countDocuments({ userId, resolved: false }),
    AiIssue.countDocuments({ userId, resolved: false, severity: { $in: ["high", "critical"] } }),
    AiIssue.countDocuments({ userId, analysis: null }),
    AiIssue.find({ userId, lastSeenAt: { $gte: cutoff } })
      .sort({ lastSeenAt: -1 })
      .limit(5)
      .lean(),
  ]);

  return {
    openIssues,
    criticalIssues,
    pendingAnalysis,
    configured: isGrokConfigured(),
    recentIssues: recentDocs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      severity: doc.severity,
      resolved: doc.resolved,
      occurrences: doc.occurrences,
      lastSeenAt: doc.lastSeenAt,
      hasAnalysis: Boolean(doc.analysis),
    })),
  };
}

export function stableHash(value: string): string {
  return hashString(value);
}