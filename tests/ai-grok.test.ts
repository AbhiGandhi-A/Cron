import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callGrok,
  callGrokJson,
  setGrokTransport,
  isGrokConfigured,
  grokErrorMessage,
  GrokUnavailableError,
  GrokHttpError,
  GrokTimeoutError,
  GrokMalformedError,
  GrokChatMessage,
  DEFAULT_GROK_MODEL,
} from "../src/lib/ai/grok";
import { aiAnalysisEnabled } from "../src/lib/ai/grok";

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
    messages: GrokChatMessage[];
    response_format?: { type: string };
    max_tokens?: number;
    temperature?: number;
  };
};

function fakeTransport(response: () => {
  ok: boolean;
  status: number;
  body: string;
  delay?: number;
}) {
  const calls: CapturedCall[] = [];
  setGrokTransport(async (_url, init) => {
    calls.push({
      url: _url,
      headers: init.headers,
      body: JSON.parse(init.body) as CapturedCall["body"],
    });
    if (response().delay) {
      await new Promise((resolve) => setTimeout(resolve, response().delay));
    }
    return {
      ok: response().ok,
      status: response().status,
      text: async () => response().body,
      json: async () => JSON.parse(response().body) as unknown,
    };
  });
  return () => calls;
}

test("callGrok throws GrokUnavailableError when GROQ_API_KEY is unset", async () => {
  withEnv("GROQ_API_KEY", undefined, () => {
    assert.equal(isGrokConfigured(), false);
    assert.rejects(() => callGrok([{ role: "user", content: "hi" }]), (error) => {
      assert.ok(error instanceof GrokUnavailableError);
      return true;
    });
  });
});

test("callGrok returns content and sends the configured key, model and JSON mode", async () => {
  withEnv("GROQ_API_KEY", "test-key", () => {
    const calls = fakeTransport(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "hello" } }] }),
    }));
    return callGrok(
      [{ role: "user", content: "hi" }],
      { jsonMode: true, maxTokens: 100, timeoutMs: 5000 }
    ).then((content) => {
      assert.equal(content, "hello");
      const call = calls()[0];
      assert.equal(call.url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(call.headers.Authorization, "Bearer test-key");
      assert.equal(call.body.model, DEFAULT_GROK_MODEL);
      assert.ok(!call.body.model.includes("test"));
      assert.deepEqual(call.body.response_format, { type: "json_object" });
      assert.equal(call.body.max_tokens, 100);
    });
  });
});

test("callGrok honors GROQ_MODEL override", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    withEnv("GROQ_MODEL", "grok-4-turbo", () => {
      const calls = fakeTransport(() => ({
        ok: true,
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: "yo" } }] }),
      }));
      return callGrok([{ role: "user", content: "hi" }]).then(() => {
        assert.equal(calls()[0].body.model, "grok-4-turbo");
      });
    });
  });
});

test("callGrok throws GrokHttpError with status on non-ok responses", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    fakeTransport(() => ({ ok: false, status: 429, body: "rate limited" }));
    return callGrok([{ role: "user", content: "hi" }]).then(
      () => Promise.reject(new Error("should have thrown")),
      (error) => {
        assert.ok(error instanceof GrokHttpError);
        assert.equal((error as GrokHttpError).status, 429);
      }
    );
  });
});

test("callGrok throws GrokMalformedError when JSON is not an object or content is empty", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    fakeTransport(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "" } }] }),
    }));
    return assert.rejects(() => callGrok([{ role: "user", content: "hi" }]), GrokMalformedError);
  });
});

test("callGrok maps aborts to GrokTimeoutError", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    setGrokTransport(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    return assert.rejects(() => callGrok([{ role: "user", content: "hi" }]), GrokTimeoutError);
  });
});

test("callGrokJson parses object responses and rejects non-objects", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    fakeTransport(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }),
    }));
    return callGrokJson([{ role: "user", content: "hi" }]).then((parsed) => {
      assert.deepEqual(parsed, { a: 1 });
    });
  });
});

test("callGrokJson rejects malformed JSON bodies", async () => {
  withEnv("GROQ_API_KEY", "k", () => {
    fakeTransport(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
    }));
    return assert.rejects(() => callGrokJson([{ role: "user", content: "hi" }]), GrokMalformedError);
  });
});

test("grokErrorMessage returns friendly messages per error type", () => {
  assert.equal(grokErrorMessage(new GrokUnavailableError()), "AI analysis is temporarily unavailable (provider is not configured)");
  assert.equal(grokErrorMessage(new GrokTimeoutError()), "AI analysis timed out. Please try again.");
  assert.equal(grokErrorMessage(new GrokHttpError(500, "x")), "AI provider returned an error. Please try again later.");
  assert.equal(grokErrorMessage(new GrokMalformedError()), "AI returned an invalid response. Please try again.");
  assert.equal(grokErrorMessage(new Error("custom")), "custom");
  assert.equal(grokErrorMessage("string error"), "AI analysis failed. Please try again.");
});

test("aiAnalysisEnabled respects AI_ANALYSIS_ENABLED=false and defaults true", () => {
  withEnv("AI_ANALYSIS_ENABLED", undefined, () => {
    assert.equal(aiAnalysisEnabled(), true);
  });
  withEnv("AI_ANALYSIS_ENABLED", "false", () => {
    assert.equal(aiAnalysisEnabled(), false);
  });
});

test("transport restore keeps subsequent behavior", async () => {
  withEnv("GROQ_API_KEY", undefined, () => {
    setGrokTransport(null);
    assert.rejects(() => callGrok([{ role: "user", content: "hi" }]), GrokUnavailableError);
  });
});