import type { NormalizedErrorInput, AiAnalysis } from "./types";
import {
  callGrok,
  callGrokJson,
  resolveReasoningModel,
  resolveResearchModel,
  GrokUnavailableError,
  GrokTimeoutError,
  GrokHttpError,
  GrokMalformedError,
  grokErrorMessage,
} from "./grok";
import { buildAnalyzeSystemPrompt, buildAnalyzePrompt } from "./prompts";
import { analyzeResultSchema } from "./validate";

export interface AnalyzeOutcome {
  analysis: AiAnalysis;
}

export interface ResearchContext {
  kind?: string;
  severity?: string;
  errorType?: string | null;
  title?: string;
  message?: string;
  stack?: string | null;
  endpoint?: string | null;
  question?: string;
}

const RESEARCH_KEYWORDS = [
  "latest",
  "current",
  "deprecated",
  "deprecation",
  "migration",
  "migrate",
  "new version",
  "newest",
  "changelog",
  "breaking change",
  "breaking changes",
  "recently changed",
  "documentation",
  "docs",
  "official docs",
  "outdated",
  "sunset",
  "end-of-life",
  "eol",
  "api change",
  "version compatibility",
  "does this version",
  "in the new",
  "external api",
  "third-party",
];

const RESEARCH_TEXT_PATTERNS = [
  /https?:\/\/\S+/i,
  /version\s*\d/i,
  /v\d+\.\d+/i,
  /library|framework|sdk|package/i,
  /next\.js|react|prisma|mongoose|node/i,
];

export function shouldUseResearch(ctx: ResearchContext): boolean {
  const text = [ctx.question, ctx.title, ctx.message, ctx.errorType, ctx.stack, ctx.endpoint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (RESEARCH_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return true;
  }
  if (RESEARCH_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return text.includes("api") || /error|fail|404|500|migration|deprecat|incompat/i.test(text);
  }
  return false;
}

export function buildResearchPrompt(input: string): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You are the Web Research Analyst of CronJob.io's AI Dev Assistant.",
        "Your job is to research a technical problem and report ONLY concise, current, actionable findings.",
        "Assume the developer needs up-to-date information that could be newer than an LLM's training data:",
        "- current official documentation and behavior of the relevant framework/library/API",
        "- recent deprecations, migrations, or breaking changes",
        "- known causes and fixes for the reported error",
        "- exact URLs to official documentation pages",
        "Return a plain-text research brief (no markdown tables, no JSON) with these sections max:",
        "DOCS: relevant official documentation URLs and what they say.",
        "CHANGES: any recent/breaking changes, deprecations, or migrations that could cause this.",
        "ROOT CAUSE: the most likely current explanation of the problem.",
        "FIX: concrete, current solution steps.",
        "Never invent URLs you are not confident about. If the problem does not need external research, say so briefly.",
      ].join("\n"),
    },
    { role: "user", content: `Research this:\n${input.slice(0, 6000)}` },
  ];
}

export async function runWebResearch(question: string): Promise<string | null> {
  try {
    const brief = await callGrok(buildResearchPrompt(question), {
      model: resolveResearchModel(),
      timeoutMs: 25_000,
      maxTokens: 900,
      temperature: 0,
    });
    return brief.trim() ? brief : null;
  } catch {
    return null;
  }
}

export async function runRouterAnalysis(issue: NormalizedErrorInput): Promise<AnalyzeOutcome> {
  const reasoningModel = resolveReasoningModel();
  const useResearch = shouldUseResearch(issue);
  let researchUsed = false;

  let researchBrief: string | null = null;
  if (useResearch) {
    researchBrief = await runWebResearch(buildAnalyzePrompt(issue));
    researchUsed = Boolean(researchBrief);
  }

  const systemPrompt = buildAnalyzeSystemPrompt();

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: researchBrief
        ? `${systemPrompt}\n\nWEB RESEARCH BRIEF (provided by the web-research analyst; reconcile it with the actual telemetry below and do not repeat research claims that contradict it):\n${researchBrief}`
        : systemPrompt,
    },
    { role: "user", content: buildAnalyzePrompt(issue) },
  ];

  try {
    const raw = await callGrokJson(messages, { model: reasoningModel, timeoutMs: 30_000, maxTokens: 1400 });
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
        reasoningModel,
        researchModel: researchBrief ? resolveResearchModel() : null,
        researchUsed,
      },
    };
  } catch (error) {
    const common = {
      analyzedAt: new Date(),
      available: false,
      rootCause: null,
      fix: null,
      impact: null,
      prevention: null,
      references: [],
      raw: null,
      reasoningModel,
      researchModel: researchBrief ? resolveResearchModel() : null,
      researchUsed,
    };

    if (error instanceof GrokUnavailableError) {
      return {
        analysis: {
          ...common,
          error: "AI analysis is temporarily unavailable (provider is not configured)",
        },
      };
    }

    const message =
      error instanceof GrokTimeoutError || error instanceof GrokHttpError || error instanceof GrokMalformedError
        ? grokErrorMessage(error)
        : error instanceof Error && error.message
          ? error.message
          : "AI analysis failed. Please try again.";

    return { analysis: { ...common, error: message } };
  }
}

export function isResearchModelConfigured(): boolean {
  return Boolean(resolveResearchModel());
}