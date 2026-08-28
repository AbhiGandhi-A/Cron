import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callGrokJson,
  setGrokTransport,
  resolveReasoningModel,
  resolveResearchModel,
  DEFAULT_GROK_MODEL,
  DEFAULT_RESEARCH_MODEL,
  GROK_BASE_URL,
} from "../src/lib/ai/grok";
import {
  runRouterAnalysis,
  runWebResearch,
  shouldUseResearch,
} from "../src/lib/ai/router";
import {
  decideReuseAnalysis,
  withAnalysisInFlight,
  analysisCooldownMs,
  researchCacheMs,
  usageSnapshot,
  resetUsageForTests,
  clearResearchCacheForTests,
  chatDedupeKey,
  findChatDedupe,
  storeChatDedupe,
  tryBeginRetry,
  endRetry,
} from "../src/lib/ai/optimizer";
import { generateApiInputSchema } from "../src/lib/ai/validate";
import { buildCreateApiSystemPrompt, buildCreateApiPrompt } from "../src/lib/ai/prompts";
import type { NormalizedErrorInput } from "../src/lib/ai/types";

async function withEnvMap(
  envs: Record<string, string | undefined>,
  fn: () => Promise<unknown> | unknown
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(envs)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    await fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

type CapturedCall = {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format?: { type: string };
  };
};

function makeTransport(calls: CapturedCall[]) {
  setGrokTransport(async (url, init) => {
    const call: CapturedCall = { url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    const isResearch = call.body.model === (process.env.GROQ_RESEARCH_MODEL ?? "");
    if (isResearch) {
      const data = { choices: [{ message: { content: "research brief about current docs" } }] };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(data),
        json: async () => data,
      };
    }
    const content = '{"rootCause":"Root cause here","fix":"Fix here","references":["https://example.com/docs"]}';
    const data = { choices: [{ message: { content } }] };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
      json: async () => data,
    };
  });
}

function plainIssue(): NormalizedErrorInput {
  return {
    title: "SyntaxError in form.js",
    message: "SyntaxError: missing ) after argument list",
    errorType: "SyntaxError",
    kind: "frontend",
    source: "frontend",
    stack: "at buildForm (static/js/form.js:41:9)",
  };
}

function researchIssue(): NormalizedErrorInput {
  return {
    ...plainIssue(),
    title: "Next.js API route returns 404 after deployment",
    message: "Works locally but 404 in production. Is this a change in the latest Next.js middleware behavior?",
    endpoint: "https://app.example.com/api/users",
    stack: "at APIHandler (next/dist/server/api.js:82:15)",
  };
}

const ENV = {
  GROQ_API_KEY: "k",
  GROQ_REASONING_MODEL: "reasoner-model",
  GROQ_RESEARCH_MODEL: "research-model",
};

test("cooldown defaults and env overrides", () =>
  withEnvMap({ AI_ANALYSIS_COOLDOWN_MS: undefined, AI_RESEARCH_CACHE_MS: undefined }, async () => {
    assert.equal(analysisCooldownMs(), 3_600_000);
    assert.equal(researchCacheMs(), 3_600_000);
  }).then(() =>
    withEnvMap({ AI_ANALYSIS_COOLDOWN_MS: "5000", AI_RESEARCH_CACHE_MS: "10000" }, async () => {
      assert.equal(analysisCooldownMs(), 5_000);
      assert.equal(researchCacheMs(), 10_000);
    })
  ));

test("A+B: first occurrence = 1 call; immediate same fingerprint reuses, 0 additional", () => {
  resetUsageForTests();
  const calls: CapturedCall[] = [];
  makeTransport(calls);
  return withEnvMap(ENV, async () => {
    const outcome = await runRouterAnalysis(plainIssue());
    assert.equal(outcome.analysis.available, true);
    assert.equal(calls.length, 1);

    const gate = decideReuseAnalysis({ analysis: outcome.analysis });
    assert.equal(gate.reuse, true);
    assert.equal(gate.reason, "available");
  }).finally(() => {
    setGrokTransport(null);
    assert.equal(calls.length, 1);
  });
});

test("failed attempt is not retried within cooldown", () => {
  withEnvMap({ AI_ANALYSIS_COOLDOWN_MS: "3600000" }, () => {
    const failed = { analyzedAt: new Date(Date.now() - 60_000), available: false };
    assert.deepEqual(decideReuseAnalysis({ analysis: failed }), { reuse: true, reason: "cooldown" });
    const expired = { analyzedAt: new Date(Date.now() - 61 * 60_000) };
    withEnvMap({ AI_ANALYSIS_COOLDOWN_MS: "3600000" }, () => {
      assert.equal(decideReuseAnalysis({ analysis: expired }).reuse, false);
    });
  });
  withEnvMap({ AI_ANALYSIS_COOLDOWN_MS: "0" }, () => {
    const failed = { analyzedAt: new Date(Date.now() - 10_000), available: false };
    assert.equal(decideReuseAnalysis({ analysis: failed }).reuse, false);
  });
});

test("C: 10 simultaneous identical events produce 1 underlying run", () => {
  resetUsageForTests();
  let runs = 0;
  const run = async (): Promise<string> => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "ok";
  };
  return Promise.all(Array.from({ length: 10 }, () => withAnalysisInFlight("u:f", run))).then((results) => {
    assert.equal(runs, 1);
    assert.deepEqual(results, Array(10).fill("ok"));
    assert.equal(usageSnapshot().dedupedRequests >= 9, true);
  });
});

test("D: research-worthy first occurrence = 2 calls max (research then reasoning)", () => {
  resetUsageForTests();
  const calls: CapturedCall[] = [];
  makeTransport(calls);
  return withEnvMap(ENV, async () => {
    const outcome = await runRouterAnalysis(researchIssue());
    assert.equal(outcome.analysis.available, true);
    assert.equal(outcome.analysis.researchUsed, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.model, ENV.GROQ_RESEARCH_MODEL);
    assert.equal(calls[1].body.model, ENV.GROQ_REASONING_MODEL);
    assert.equal(usageSnapshot().researchCalls, 1);
    assert.equal(usageSnapshot().reasoningCalls, 1);
  }).finally(() => setGrokTransport(null));
});

test("E: repeated research-worthy issue reuses cached research, no new research call", () => {
  resetUsageForTests();
  clearResearchCacheForTests();
  const calls: CapturedCall[] = [];
  makeTransport(calls);
  return withEnvMap({ ...ENV, AI_RESEARCH_CACHE_MS: "3600000" }, async () => {
    const first = await runRouterAnalysis(researchIssue());
    assert.equal(first.analysis.researchUsed, true);
    assert.equal(calls.length, 2);

    const second = await runRouterAnalysis(researchIssue());
    assert.equal(second.analysis.researchUsed, true);
    assert.equal(calls.length, 3);
    assert.equal(usageSnapshot().researchCacheHits, 1);
    assert.equal(usageSnapshot().researchCalls, 1);
    assert.equal(usageSnapshot().reasoningCalls, 2);
  }).finally(() => {
    setGrokTransport(null);
    clearResearchCacheForTests();
  });
});

test("E2: runWebResearch dedupes identical questions directly", () => {
  resetUsageForTests();
  clearResearchCacheForTests();
  const calls: CapturedCall[] = [];
  makeTransport(calls);
  return withEnvMap(ENV, async () => {
    const question = "How to migrate to the latest Next.js version?";
    const brief1 = await runWebResearch(question);
    const brief2 = await runWebResearch(question);
    assert.equal(brief1, "research brief about current docs");
    assert.equal(brief2, "research brief about current docs");
    assert.equal(calls.length, 1);
    assert.equal(usageSnapshot().researchCacheHits, 1);
  }).finally(() => {
    setGrokTransport(null);
    clearResearchCacheForTests();
  });
});

test("F: manual retry bypasses cooldown and forces a new run", () => {
  withEnvMap({ AI_ANALYSIS_COOLDOWN_MS: "3600000" }, () => {
    const recent = { analyzedAt: new Date(Date.now() - 1000), available: false };
    assert.equal(decideReuseAnalysis({ analysis: recent }).reuse, true);
    assert.equal(decideReuseAnalysis({ analysis: recent, manual: true }).reuse, false);
    const available = { analyzedAt: new Date(), available: true };
    assert.equal(decideReuseAnalysis({ analysis: available, manual: true }).reuse, false);
  });
});

test("G: create-api makes exactly 1 reasoning-model call", () => {
  resetUsageForTests();
  const calls: CapturedCall[] = [];
  setGrokTransport(async (url, init) => {
    const call: CapturedCall = { url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    const config = {
      name: "Jobs API",
      source: { type: "collection", collection: "cronjobs", fields: ["name", "schedule"] },
      methods: ["GET"],
    };
    const data = { choices: [{ message: { content: JSON.stringify(config) } }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data };
  });
  return withEnvMap(ENV, async () => {
    const raw = await callGrokJson(
      [
        { role: "system", content: buildCreateApiSystemPrompt() },
        { role: "user", content: buildCreateApiPrompt("list cron jobs with their name and schedule") },
      ],
      { model: resolveReasoningModel(), maxTokens: 1600 }
    );
    const validated = generateApiInputSchema.safeParse(raw);
    assert.equal(validated.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, ENV.GROQ_REASONING_MODEL);
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  }).finally(() => setGrokTransport(null));
});

test("H: research failure falls back to reasoning and still produces an analysis", () => {
  resetUsageForTests();
  const calls: CapturedCall[] = [];
  setGrokTransport(async (url, init) => {
    const call: CapturedCall = { url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    const isResearch = call.body.model === (process.env.GROQ_RESEARCH_MODEL ?? "");
    if (isResearch) {
      return { ok: false, status: 500, text: async () => "upstream failed", json: async () => ({}) };
    }
    const content = '{"rootCause":"Root cause here","fix":"Fix here"}';
    const data = { choices: [{ message: { content } }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data };
  });
  return withEnvMap(ENV, async () => {
    const outcome = await runRouterAnalysis(researchIssue());
    assert.equal(outcome.analysis.available, true);
    assert.equal(outcome.analysis.researchUsed, false);
    assert.equal(calls.length, 2);
  }).finally(() => setGrokTransport(null));
});

test("I: reasoning failure returns graceful unavailable analysis, never throws", () => {
  resetUsageForTests();
  const calls: CapturedCall[] = [];
  setGrokTransport(async (url, init) => {
    const call: CapturedCall = { url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    return { ok: false, status: 429, text: async () => "rate limited", json: async () => ({}) };
  });
  return withEnvMap(ENV, async () => {
    let outcome: Awaited<ReturnType<typeof runRouterAnalysis>> | null = null;
    await assert.doesNotReject(async () => {
      outcome = await runRouterAnalysis(plainIssue());
    });
    assert.equal(outcome!.analysis.available, false);
    assert.ok(outcome!.analysis.error);
    assert.equal(calls.length, 1);
  }).finally(() => setGrokTransport(null));
});

test("J: API key is never exposed - only in the Authorization header, never logged", () => {
  resetUsageForTests();
  const KEY = "super-secret-test-key";
  const calls: CapturedCall[] = [];
  makeTransport(calls);
  const logs: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  return withEnvMap(
    { GROQ_API_KEY: KEY, GROQ_REASONING_MODEL: "reasoner", GROQ_RESEARCH_MODEL: "research" },
    async () => {
      try {
        await runRouterAnalysis(plainIssue());
      } finally {
        console.log = original.log;
        console.warn = original.warn;
        console.error = original.error;
      }
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
      assert.equal(JSON.stringify(calls[0].body).includes(KEY), false);
      assert.equal(logs.some((line) => line.includes(KEY)), false);
    }
  ).finally(() => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
    setGrokTransport(null);
  });
});

test("chat and retry guards dedupe accidental duplicates", () => {
  resetUsageForTests();
  const key = chatDedupeKey("u", "issue1", "why is it failing?");
  assert.equal(findChatDedupe(key), null);
  storeChatDedupe(key, { reply: "Because of X", aiAvailable: true });
  assert.deepEqual(findChatDedupe(key), { reply: "Because of X", aiAvailable: true });
  assert.equal(usageSnapshot().dedupedRequests >= 1, true);

  const retryKey = "u:issue1";
  assert.equal(tryBeginRetry(retryKey), true);
  assert.equal(tryBeginRetry(retryKey), false);
  endRetry(retryKey);
  assert.equal(tryBeginRetry(retryKey), true);
  endRetry(retryKey);
});

test("model resolution and research trigger remain unchanged", () => {
  withEnvMap({ GROQ_REASONING_MODEL: undefined, GROQ_RESEARCH_MODEL: undefined, GROQ_MODEL: undefined }, () => {
    assert.equal(resolveReasoningModel(), DEFAULT_GROK_MODEL);
    assert.equal(resolveResearchModel(), DEFAULT_RESEARCH_MODEL);
  });
  withEnvMap({ GROQ_REASONING_MODEL: undefined, GROQ_RESEARCH_MODEL: undefined, GROQ_MODEL: "fallback" }, () => {
    assert.equal(resolveReasoningModel(), "fallback");
    assert.equal(resolveResearchModel(), "fallback");
  });
  assert.equal(shouldUseResearch({ message: "How to migrate to the latest version?" }), true);
  assert.equal(shouldUseResearch({ message: "SyntaxError: missing )" }), false);
  setGrokTransport(null);
});

test("endpoint and auth remain exactly as required", () => {
  const calls: CapturedCall[] = [];
  makeTransport(calls);
  return withEnvMap(ENV, async () => {
    await runRouterAnalysis(plainIssue());
    assert.equal(calls[0].url, GROK_BASE_URL);
    assert.equal(calls[0].headers.Authorization, "Bearer k");
  }).finally(() => setGrokTransport(null));
});