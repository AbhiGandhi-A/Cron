import type { NormalizedErrorInput, AiAnalysis } from "./types";
import { callGrokJson, GrokUnavailableError, GrokTimeoutError, GrokHttpError, GrokMalformedError, grokErrorMessage } from "./grok";
import { buildAnalyzeSystemPrompt, buildAnalyzePrompt } from "./prompts";
import { analyzeResultSchema } from "./validate";

export interface AnalyzeOutcome {
  analysis: AiAnalysis;
}

export async function runAiAnalysis(issue: NormalizedErrorInput): Promise<AnalyzeOutcome> {
  const messages = [
    { role: "system" as const, content: buildAnalyzeSystemPrompt() },
    { role: "user" as const, content: buildAnalyzePrompt(issue) },
  ];

  try {
    const raw = await callGrokJson(messages, { timeoutMs: 30_000, maxTokens: 1400 });
    const parsed = analyzeResultSchema.parse(raw);

    return {
      analysis: {
        analyzedAt: new Date(),
        available: true,
        error: null,
        rootCause: parsed.rootCause ?? null,
        fix: parsed.fix ?? null,
        impact: parsed.impact ?? null,
        prevention: parsed.prevention ?? null,
        references: parsed.references ?? [],
        raw,
      },
    };
  } catch (error) {
    if (error instanceof GrokUnavailableError) {
      return {
        analysis: {
          analyzedAt: new Date(),
          available: false,
          error: "AI analysis is temporarily unavailable (provider is not configured)",
          rootCause: null,
          fix: null,
          impact: null,
          prevention: null,
          references: [],
          raw: null,
        },
      };
    }

    const message =
      error instanceof GrokTimeoutError || error instanceof GrokHttpError || error instanceof GrokMalformedError
        ? grokErrorMessage(error)
        : error instanceof Error && error.message
          ? error.message
          : "AI analysis failed. Please try again.";

    return {
      analysis: {
        analyzedAt: new Date(),
        available: false,
        error: message,
        rootCause: null,
        fix: null,
        impact: null,
        prevention: null,
        references: [],
        raw: null,
      },
    };
  }
}