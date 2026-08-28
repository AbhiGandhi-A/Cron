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
  shouldUseResearch,
  runWebResearch,
} from "../src/lib/ai/router";
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

function makeTransportWithResearchSupport() {
  const calls: CapturedCall[] = [];
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
  return () => calls;
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

test("resolveReasoningModel/resolveResearchModel use env and safe defaults", () => {
  withEnvMap({ GROQ_REASONING_MODEL: undefined, GROQ_RESEARCH_MODEL: undefined, GROQ_MODEL: undefined }, () => {
    assert.equal(resolveReasoningModel(), DEFAULT_GROK_MODEL);
    assert.equal(resolveResearchModel(), DEFAULT_RESEARCH_MODEL);
  });
  withEnvMap({ GROQ_REASONING_MODEL: undefined, GROQ_RESEARCH_MODEL: undefined, GROQ_MODEL: "fallback" }, () => {
    assert.equal(resolveReasoningModel(), "fallback");
    assert.equal(resolveResearchModel(), "fallback");
  });
  withEnvMap({ GROQ_REASONING_MODEL: "gpt-oss", GROQ_RESEARCH_MODEL: undefined, GROQ_MODEL: undefined }, () => {
    assert.equal(resolveReasoningModel(), "gpt-oss");
  });
  withEnvMap({ GROQ_REASONING_MODEL: undefined, GROQ_RESEARCH_MODEL: "compound", GROQ_MODEL: undefined }, () => {
    assert.equal(resolveResearchModel(), "compound");
  });
});

test("shouldUseResearch flags current-docs questions and not simple syntax errors", () => {
  assert.equal(shouldUseResearch({ question: "Is this a breaking change in the latest Next.js version?" }), true);
  assert.equal(shouldUseResearch({ message: "How to migrate to the new API?" }), true);
  assert.equal(shouldUseResearch({ message: "This deprecated method no longer works" }), true);
  assert.equal(shouldUseResearch({ title: "SyntaxError: missing )" }), false);
  assert.equal(shouldUseResearch({ message: "Unexpected token in JSON" }), false);
});

test("router uses reasoning model only for ordinary analysis and the correct endpoint", () =>
  withEnvMap(
    { GROQ_API_KEY: "k", GROQ_REASONING_MODEL: "reasoner-model", GROQ_RESEARCH_MODEL: "research-model" },
    async () => {
      const calls = makeTransportWithResearchSupport();
      const outcome = await runRouterAnalysis(plainIssue());
      assert.equal(outcome.analysis.available, true);
      assert.equal(outcome.analysis.rootCause, "Root cause here");
      assert.equal(outcome.analysis.researchUsed, false);
      const captured = calls();
      assert.equal(captured.length, 1);
      assert.equal(captured[0].url, GROK_BASE_URL);
      assert.equal(captured[0].body.model, "reasoner-model");
      assert.equal(captured[0].headers.Authorization, "Bearer k");
      assert.deepEqual(captured[0].body.response_format, { type: "json_object" });
    }
  ));

test("router uses research model then reasoning model for current-docs errors and combines the brief", () =>
  withEnvMap(
    { GROQ_API_KEY: "k", GROQ_REASONING_MODEL: "reasoner-model", GROQ_RESEARCH_MODEL: "research-model" },
    async () => {
      const calls = makeTransportWithResearchSupport();
      const issue: NormalizedErrorInput = {
        ...plainIssue(),
        title: "Next.js API route returns 404 after deployment",
        message: "Works locally but 404 in production. Is this a change in the latest Next.js middleware behavior?",
      };
      const outcome = await runRouterAnalysis(issue);
      const captured = calls();
      assert.equal(captured.length, 2, "research + reasoning calls expected");
      assert.equal(captured[0].url, GROK_BASE_URL);
      assert.equal(captured[1].url, GROK_BASE_URL);
      assert.equal(captured[0].body.model, "research-model");
      assert.equal(captured[1].body.model, "reasoner-model");
      const finalSystem = captured[1].body.messages[0].content;
      assert.ok(finalSystem.includes("WEB RESEARCH BRIEF"), "research brief must reach the reasoning model");
      assert.equal(outcome.analysis.researchUsed, true);
      assert.equal(outcome.analysis.available, true);
    }
  ));

test("research model failure falls back to reasoning-only analysis", () =>
  withEnvMap(
    { GROQ_API_KEY: "k", GROQ_REASONING_MODEL: "reasoner-model", GROQ_RESEARCH_MODEL: "research-model" },
    async () => {
      const calls: CapturedCall[] = [];
      setGrokTransport(async (url, init) => {
        const call: CapturedCall = { url, headers: init.headers, body: JSON.parse(init.body) };
        calls.push(call);
        if (call.body.model === "research-model") {
          return { ok: false, status: 500, text: async () => "server error", json: async () => ({}) };
        }
        const content = '{"rootCause":"Still diagnosed","fix":"fix"}';
        const data = { choices: [{ message: { content } }] };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(data),
          json: async () => data,
        };
      });
      const issue: NormalizedErrorInput = { ...plainIssue(), message: "Check the latest docs about this migration error" };
      const outcome = await runRouterAnalysis(issue);
      assert.equal(calls.length, 2, "research attempt still happens");
      assert.equal(calls[0].body.model, "research-model");
      assert.equal(calls[1].body.model, "reasoner-model");
      assert.equal(outcome.analysis.available, true);
      assert.equal(outcome.analysis.rootCause, "Still diagnosed");
      assert.equal(outcome.analysis.researchUsed, false);
    }
  ));

test("reasoning model failure produces graceful unavailable analysis", () =>
  withEnvMap(
    { GROQ_API_KEY: "k", GROQ_REASONING_MODEL: "reasoner-model", GROQ_RESEARCH_MODEL: "research-model" },
    async () => {
      setGrokTransport(async () => ({ ok: false, status: 400, text: async () => "bad request", json: async () => ({}) }));
      const outcome = await runRouterAnalysis(plainIssue());
      assert.equal(outcome.analysis.available, false);
      assert.equal(outcome.analysis.error, "AI provider returned an error. Please try again later.");
      assert.equal(outcome.analysis.researchUsed, false);
    }
  ));

test("API key is never exposed in URLs, headers or message bodies", () =>
  withEnvMap(
    { GROQ_API_KEY: "super-secret-key-123", GROQ_REASONING_MODEL: "reasoner-model", GROQ_RESEARCH_MODEL: "research-model" },
    async () => {
      const calls = makeTransportWithResearchSupport();
      const issue: NormalizedErrorInput = { ...plainIssue(), message: "Latest deprecation check" };
      await runRouterAnalysis(issue);
      for (const call of calls()) {
        assert.ok(!call.url.includes("super-secret-key-123"));
        assert.equal(call.headers.Authorization, "Bearer super-secret-key-123");
        assert.ok(!JSON.stringify(call.body.messages).includes("super-secret-key-123"));
      }
    }
  ));

test("runWebResearch returns null on failure and never throws", () =>
  withEnvMap(
    { GROQ_API_KEY: "k", GROQ_RESEARCH_MODEL: "research-model" },
    async () => {
      setGrokTransport(async () => ({ ok: false, status: 429, text: async () => "rate limited", json: async () => ({}) }));
      assert.equal(await runWebResearch("latest docs"), null);
    }
  ));

test("callGrokJson accepts an explicit model option", () =>
  withEnvMap({ GROQ_API_KEY: "k" }, async () => {
    setGrokTransport(async (_url, init) => {
      assert.equal(JSON.parse(init.body).model, "explicit-model");
      const data = { choices: [{ message: { content: '{"a":1}' } }] };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(data),
        json: async () => data,
      };
    });
    assert.deepEqual(await callGrokJson([{ role: "user", content: "hi" }], { model: "explicit-model" }), { a: 1 });
  }));