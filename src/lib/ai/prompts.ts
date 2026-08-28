import type { NormalizedErrorInput, AiSeverity } from "./types";
import type { GeneratedApiSourceConfig } from "./types";

function compactContext(issue: NormalizedErrorInput, maxChars = 6000): string {
  const lines: string[] = [];
  lines.push(`Title: ${issue.title}`);
  lines.push(`Message: ${issue.message}`);
  if (issue.errorType) lines.push(`Type: ${issue.errorType}`);
  if (issue.endpoint) lines.push(`URL: ${issue.endpoint}`);
  if (issue.method) lines.push(`Method: ${issue.method}`);
  if (issue.status) lines.push(`HTTP status: ${issue.status}`);
  if (issue.kind) lines.push(`Kind: ${issue.kind}`);
  if (issue.source) lines.push(`Source: ${issue.source}`);
  if (issue.severity) lines.push(`Severity: ${issue.severity}`);
  if (issue.page) lines.push(`Page: ${issue.page}`);
  if (issue.userAgent) lines.push(`User agent: ${issue.userAgent}`);
  if (issue.perf) {
    lines.push(`Perf: ${issue.perf.op} took ${issue.perf.durationMs}ms (${issue.perf.threshold})`);
  }
  if (issue.context) {
    lines.push(`Context: ${JSON.stringify(issue.context).slice(0, 1500)}`);
  }
  if (issue.response) {
    lines.push(`Response snippet: ${issue.response.slice(0, 1500)}`);
  }
  if (issue.stack) {
    lines.push(`Stack:\n${issue.stack.slice(0, 2500)}`);
  }
  let text = lines.join("\n");
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 100)}\n\n[context truncated]`;
  }
  return text;
}

export function buildAnalyzeSystemPrompt(): string {
  return [
    "You are the AI Dev Assistant embedded in CronJob.io, a cron job scheduler.",
    "You diagnose errors from normalized, pre-redacted debugging telemetry.",
    "Respond with a SINGLE JSON object, no surrounding text, using exactly these keys:",
    '{"slug": "<short stable identifier, e.g. http-500-null-response>", "rootCause": "<most likely cause>", "fix": "<concrete, actionable fix>", "impact": "<what might be affected>", "prevention": "<how to prevent it>", "references": ["<optional url>"]}',
    "Rules:",
    "- Never invent diagnostics that are not present in the telemetry; if unclear, say so explicitly.",
    "- Do not recommend sending secrets, passwords, or API keys anywhere.",
    "- Suggest concrete fixes that map to the product: check the cron job URL/endpoint, schedule, timezone, response validation, retries, outbound SSRF rules, or the upstream API.",
    "- Keep rootCause/fix/impact/prevention under ~300 words total.",
  ].join("\n");
}

export function buildAnalyzePrompt(issue: NormalizedErrorInput): string {
  return `{"purpose":"Analyze the following application error. Return only the JSON described by the system prompt.","issue":${JSON.stringify(compactContext(issue))}}`;
}

export function buildChatSystemPrompt(): string {
  return [
    "You are the AI Dev Assistant embedded in CronJob.io.",
    "Help the developer understand and fix a problem described in an issue, or answer questions about the app (cron jobs, scheduled execution, the API tester, test URLs, and generated APIs).",
    "Never invent diagnostics not present in the provided context. Never suggest sending secrets. Never instruct making dangerous or destructive changes without a very clear, explicit reason.",
    "Answer concisely and concretely.",
  ].join("\n");
}

export function buildChatPrompt(issueText: string, history: Array<{ role: "user" | "assistant"; content: string }>): string {
  const parts: string[] = [];
  if (issueText) {
    parts.push(`Issue context:\n${issueText.slice(0, 6000)}`);
  }
  if (history.length) {
    const serialized = history.map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`).join("\n");
    parts.push(`Conversation so far:\n${serialized.slice(0, 6000)}`);
  }
  if (!parts.length) {
    parts.push("No prior context was provided.");
  }
  return parts.join("\n");
}

const RESPONSE_EXAMPLE = {
  name: "Weather alerts feed",
  description: "Returns the three latest failed executions for authenticated owners.",
  source: {
    type: "collection",
    collection: "jobexecutions",
    fields: ["status", "httpStatus", "errorMessage", "startedAt"],
  },
  methods: ["GET"],
  authMode: "public",
  cors: { enabled: true, origins: ["*"] },
  rateLimit: { limit: 30, windowMs: 60000 },
  response: { statusCode: 200, maxSizeBytes: 100000, contentType: "application/json" },
};

const SOURCE_GUIDE = [
  'Example sources a user may describe (map the request to the closest one):',
  '- static: a fixed JSON payload that is returned as-is. Provide the literal value in "body".',
  '- collection: read from an existing MongoDB collection. Provide "collection" (one of cronjobs, jobexecutions, testurls, users) and "fields" (a short allowlist of field names to expose).',
  '- internal: proxy to an existing internal API. Provide "url" (absolute http(s)) and "method".',
].join("\n");

export function buildCreateApiSystemPrompt(): string {
  const example = JSON.stringify(RESPONSE_EXAMPLE);
  return [
    "You generate safe API configurations for CronJob.io. You never generate or execute code.",
    "The app creates a REAL public backend endpoint from your configuration at /api/public/:token.",
    `Allowed collection sources and allowed fields: ${JSON.stringify({
      cronjobs: ["name", "url", "method", "schedule", "isActive", "timeout", "lastRunAt", "nextRunAt"],
      jobexecutions: ["status", "httpStatus", "responseTime", "errorMessage", "startedAt", "completedAt", "requestMethod", "responseSize"],
      testurls: ["name", "token", "isActive", "createdAt"],
      users: ["name", "email", "plan", "createdAt"],
    })}`,
    SOURCE_GUIDE,
    "Allowed authMode values: public, api-key, bearer, private. private = owner session only; api-key/bearer require a client secret you never include in output (the app generates secrets server-side).",
    'cors.origins: array of allowed origins or ["*"] when open access is intended; cors.enabled must be true for browser callers from other sites.',
    "Rate limits: pick a sane limit between 1 and 1000 per window.",
    "Respond with a SINGLE JSON object, no surrounding text, matching exactly this shape (body is only meaningful for static):",
    example,
    "Rules:",
    "- Only expose data the developer asked for. Never request data sources beyond what they mention.",
    "- Never expose fields containing secrets, passwords, tokens, keys, or hashed credentials.",
    "- If the request is ambiguous, fail safe: pick the least permissive sensible option (private auth, no CORS).",
  ].join("\n");
}

export function buildCreateApiPrompt(description: string): string {
  return `{"purpose":"Create an API for a developer's natural-language request. Return only the JSON described by the system prompt.","userRequest":${JSON.stringify(description)}}`;
}

export function describeSourceForAi(source: GeneratedApiSourceConfig): Record<string, unknown> {
  return {
    type: source.type,
    ...(source.type === "collection" ? { collection: source.collection, fields: source.fields } : {}),
    ...(source.type === "internal" ? { url: source.url, method: source.method } : {}),
  };
}

export function buildIssueTextForChat(issue: NormalizedErrorInput): string {
  return compactContext(issue);
}