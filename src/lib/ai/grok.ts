export const GROK_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROK_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_RESEARCH_MODEL = "groq/compound";

export function resolveReasoningModel(): string {
  return process.env.GROQ_REASONING_MODEL || process.env.GROQ_MODEL || DEFAULT_GROK_MODEL;
}

export function resolveResearchModel(): string {
  return process.env.GROQ_RESEARCH_MODEL || process.env.GROQ_MODEL || DEFAULT_GROK_MODEL;
}

export class GrokUnavailableError extends Error {
  constructor() {
    super("AI analysis is not configured (GROQ_API_KEY is not set)");
    this.name = "GrokUnavailableError";
  }
}

export class GrokHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GrokHttpError";
  }
}

export class GrokTimeoutError extends Error {
  constructor() {
    super("AI analysis timed out");
    this.name = "GrokTimeoutError";
  }
}

export class GrokMalformedError extends Error {
  constructor() {
    super("AI analysis returned an invalid response");
    this.name = "GrokMalformedError";
  }
}

export interface GrokChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokCompletionOptions {
  model?: string;
  jsonMode?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}

type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

let transport: FetchLike | null = null;

export function setGrokTransport(fetchLike: FetchLike | null): void {
  transport = fetchLike;
}

export function isGrokConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function aiAnalysisEnabled(): boolean {
  return process.env.AI_ANALYSIS_ENABLED !== "false";
}

function resolveFetch(): FetchLike {
  if (transport) return transport;
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new GrokUnavailableError();
  }
  return fetchImpl as unknown as FetchLike;
}

export async function callGrok(
  messages: GrokChatMessage[],
  options: GrokCompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GrokUnavailableError();
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const model = options.model ?? process.env.GROQ_MODEL ?? DEFAULT_GROK_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await resolveFetch()(GROK_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 200);
      } catch {
        detail = "";
      }
      throw new GrokHttpError(response.status, `AI provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new GrokMalformedError();
    }
    return content;
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new GrokTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function callGrokJson(
  messages: GrokChatMessage[],
  options: GrokCompletionOptions = {}
): Promise<Record<string, unknown>> {
  const raw = await callGrok(messages, { ...options, jsonMode: true });
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new GrokMalformedError();
    }
    return parsed;
  } catch {
    throw new GrokMalformedError();
  }
}

export function grokErrorMessage(error: unknown): string {
  if (error instanceof GrokUnavailableError) return "AI analysis is temporarily unavailable (provider is not configured)";
  if (error instanceof GrokTimeoutError) return "AI analysis timed out. Please try again.";
  if (error instanceof GrokHttpError) return "AI provider returned an error. Please try again later.";
  if (error instanceof GrokMalformedError) return "AI returned an invalid response. Please try again.";
  if (error instanceof Error && error.message) return error.message;
  return "AI analysis failed. Please try again.";
}