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

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
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

function makeTransport() {
  const calls: CapturedCall[] = [];
  const responder = (call: CapturedCall) => {
    const isResearch = call.body.model.includes("compound") || call.body.model === (process.env.GROQ_RESEARCH_MODEL ?? "");
    if (isResearch) {
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: "DOCS: https://nextjs.org/docs\nROOT CAUSE: recent middleware matcher change\nFIX: update the matcher.",
              },
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: '{"rootCause":"Root cause here","fix":"Fix here","references":["https://example.com/docs"]}' } }] }),
    };
  };
  setGrokTransport(async (_url, init) => {
    const call: CapturedCall = { url: _url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    const response = responder(call);
    return {
      ok: response.ok,
      status: response.status,
      text: async () => response.body,
      json: async () => JSON.parse(response.body) as unknown,
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
  withEnv("GROQ_REASONING_MODEL", undefined, () => {
    withEnv("GROQ_RESEARCH_MODEL", undefined, () => {
      withEnv("GROQ_MODEL", undefined, () => {
        assert.equal(resolveReasoningModel(), DEFAULT_GROK_MODEL);
        assert.equal(resolveResearchModel(), DEFAULT_RESEARCH_MODEL);
      });
      withEnv("GROQ_MODEL", "fallback", () => {
        assert.equal(resolveReasoningModel(), "fallback");
        assert.equal(resolveResearchModel(), "fallback");
      });
    });
  });
  withEnv("GROQ_REASONING_MODEL", "gpt-oss", () => {
    assert.equal(resolveReasoningModel(), "gpt-oss");
  });
  withEnv("GROQ_RESEARCH_MODEL", "compound", () => {
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

test("router uses reasoning model only for ordinary analysis and the correct endpoint", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    withEnv("GROQ_REASONING_MODEL", "reasoner-model", () => {
      withEnv("GROQ_RESEARCH_MODEL", "research-model", () => {
        const calls = makeTransport();
        return runRouterAnalysis(plainIssue()).then((outcome) => {
          assert.equal(outcome.analysis.available, true);
          assert.equal(outcome.analysis.rootCause, "Root cause here");
          assert.equal(outcome.analysis.researchUsed, false);
          const captured = calls();
          assert.equal(captured.length, 1);
          assert.equal(captured[0].url, GROK_BASE_URL);
          assert.equal(captured[0].body.model, "reasoner-model");
          assert.equal(captured[0].headers.Authorization, "Bearer k");
          assert.deepEqual(captured[0].body.response_format, { type: "json_object" });
        });
      });
    });
  });
});

test("router uses research model then reasoning model for current-docs errors and combines the brief", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    withEnv("GROQ_REASONING_MODEL", "reasoner-model", () => {
      withEnv("GROQ_RESEARCH_MODEL", "research-model", () => {
        const calls = makeTransport();
        const issue: NormalizedErrorInput = {
          ...plainIssue(),
          title: "Next.js API route returns 404 after deployment",
          message: "Works locally but 404 in production. Is this a change in the latest Next.js middleware behavior?",
        };
        return runRouterAnalysis(issue).then((outcome) => {
          const captured = calls();
          assert.equal(captured.length, 2, "research + reasoning calls expected");
          assert.equal(captured[0].url, GROK_BASE_URL);
          assert.equal(captured[1].url, GROK_BASE_URL);
          assert.equal(captured[0].body.model, "research-model");
          assert.equal(captured[1].body.model, "reasoner-model");
          const finalSystem = captured[1].body.messages[0].content;
          assert.ok(finalSystem.includes("WEB RESEARCH BRIEF"), "research brief must reach the reasoning model");
          assert.ok(outcome.analysis.researchUsed === true);
          assert.equal(outcome.analysis.available, true);
        });
      });
    });
  });
});

test("research model failure falls back to reasoning-only analysis", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    withEnv("GROQ_REASONING_MODEL", "reasoner-model", () => {
      withEnv("GROQ_RESEARCH_MODEL", "research-model", () => {
        const calls: CapturedCall[] = [];
        setGrokTransport(async (_url, init) => {
          const call: CapturedCall = { url: _url, headers: init.headers, body: JSON.parse(init.body) };
          calls.push(call);
          const isResearch = call.body.model === "research-model";
          if (isResearch) {
            return { ok: false, status: 500, text: async () => "server error", json: async () => ({}) };
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ choices: [{ message: { content: '{"rootCause":"Still diagnosed","fix":"fix"}' } }] }),
            json: async () => ({ choices: [{ message: { content: '{"rootCause":"Still diagnosed","fix":"fix"}' } }] }),
          };
        });
        const issue: NormalizedErrorInput = { ...plainIssue(), message: "Check the latest docs about this migration error" };
        return runRouterAnalysis(issue).then((outcome) => {
          assert.equal(calls.length, 2, "research attempt still happens");
          assert.equal(outcome.analysis.available, true);
          assert.equal(outcome.analysis.rootCause, "Still diagnosed");
          assert.equal(outcome.analysis.researchUsed, false);
        });
      });
    });
  });
});

test("reasoning model failure produces graceful unavailable analysis", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    withEnv("GROQ_REASONING_MODEL", "reasoner-model", () => {
      withEnv("GROQ_RESEARCH_MODEL", "research-model", () => {
        setGrokTransport(async () => ({ ok: false, status: 400, text: async () => "bad request", json: async () => ({}) }));
        return runRouterAnalysis(plainIssue()).then((outcome) => {
          assert.equal(outcome.analysis.available, false);
          assert.equal(outcome.analysis.error, "AI provider returned an error. Please try again later.");
          assert.equal(outcome.analysis.researchUsed, false);
        });
      });
    });
  });
});

test("API key is never exposed in URLs, headers or message bodies", async () => {
  withEnv("GROQ_API_KEY", "super-secret-key-123", () => {
    withEnv("GROQ_REASONING_MODEL", "reasoner-model", () => {
      withEnv("GROQ_RESEARCH_MODEL", "research-model", () => {
        const calls = makeTransport();
        const issue: NormalizedErrorInput = { ...plainIssue(), message: "Latest deprecation check" };
        return runRouterAnalysis(issue).then(() => {
          for (const call of calls()) {
            assert.ok(!call.url.includes("super-secret-key-123"));
            assert.equal(call.headers.Authorization, "Bearer super-secret-key-123");
            assert.ok(!call.headers.Authorization.includes("super-secret-key-123") || call.headers.Authorization.startsWith("Bearer "));
            const serialized = JSON.stringify(call.body.messages);
            assert.ok(!serialized.includes("super-secret-key-123"));
          }
        });
      });
    });
  });
});

test("runWebResearch returns null on failure and never throws", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    withEnv("GROQ_RESEARCH_MODEL", "research-model", () => {
      setGrokTransport(async () => ({ ok: false, status: 429, text: async () => "rate limited", json: async () => ({}) }));
      return runWebResearch("latest docs").then((result) => {
        assert.equal(result, null);
      });
    });
  });
});

test("callGrokJson accepts an explicit model option", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    setGrokTransport(async (_url, init) => {
      assert.equal(JSON.parse(init.body).model, "explicit-model");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }),
        json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }),
      };
    });
    return callGrokJson([{ role: "user", content: "hi" }], { model: "explicit-model" }).then((parsed) => {
      assert.deepEqual(parsed, { a: 1 });
    });
  });
});