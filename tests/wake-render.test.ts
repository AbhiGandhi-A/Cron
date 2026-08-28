import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/wake-render/route";
import { resolveWakeUrl, resetWakeRateLimiter } from "../src/lib/wake-render";

const originalFetch = globalThis.fetch;
const TOKEN = "test-wake-secret";

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    headers: { "x-forwarded-for": "203.0.113.9", ...headers },
  });
}

function makeFetchStub(status = 200) {
  return async () => new Response(JSON.stringify({ status: "ok" }), { status });
}

before(() => {
  process.env.RENDER_WAKE_TOKEN = TOKEN;
  process.env.RENDER_WAKE_URL = "https://cron-8vgj.onrender.com/health";
  resetWakeRateLimiter();
});

after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.RENDER_WAKE_TOKEN;
  delete process.env.RENDER_WAKE_URL;
  resetWakeRateLimiter();
});

test("wake URL validation accepts only https *.onrender.com/health", () => {
  process.env.RENDER_WAKE_URL = "https://cron-8vgj.onrender.com/health";
  assert.equal(resolveWakeUrl(), "https://cron-8vgj.onrender.com/health");

  process.env.RENDER_WAKE_URL = "http://cron-8vgj.onrender.com/health";
  assert.equal(resolveWakeUrl(), null, "http is rejected");

  process.env.RENDER_WAKE_URL = "https://evil.com/health";
  assert.equal(resolveWakeUrl(), null, "non-onrender hosts are rejected");

  process.env.RENDER_WAKE_URL = "https://cron-8vgj.onrender.com/not-health";
  assert.equal(resolveWakeUrl(), null, "only /health path is accepted");

  process.env.RENDER_WAKE_URL = "not-a-url";
  assert.equal(resolveWakeUrl(), null);

  process.env.RENDER_WAKE_URL = "";
  assert.equal(resolveWakeUrl(), null);

  process.env.RENDER_WAKE_URL = "https://cron-8vgj.onrender.com/health";
});

function setValidEnv(): void {
  process.env.RENDER_WAKE_TOKEN = TOKEN;
  process.env.RENDER_WAKE_URL = "https://cron-8vgj.onrender.com/health";
  resetWakeRateLimiter();
}

test("endpoint returns 503 when the wake token is not configured", async () => {
  delete process.env.RENDER_WAKE_TOKEN;
  const res = await GET(makeRequest("https://vercel.com/api/wake-render", { authorization: "Bearer " + TOKEN }));
  assert.equal(res.status, 503);
  process.env.RENDER_WAKE_TOKEN = TOKEN;
});

test("missing, wrong, or malformed token is rejected without leaking anything", async () => {
  const noAuth = await GET(makeRequest("https://vercel.com/api/wake-render"));
  assert.equal(noAuth.status, 401);

  const wrongBearer = await GET(makeRequest("https://vercel.com/api/wake-render", { authorization: "Bearer wrong-token" }));
  assert.equal(wrongBearer.status, 401);

  const wrongQuery = await GET(makeRequest("https://vercel.com/api/wake-render?token=wrong-token"));
  assert.equal(wrongQuery.status, 401);

  for (const res of [noAuth, wrongBearer, wrongQuery]) {
    const body = await res.json();
    assert.ok(!JSON.stringify(body).includes(TOKEN), "token must never appear in responses");
  }
});

test("valid bearer token relays to the fixed Render URL and reports success", async () => {
  setValidEnv();
  let calledUrl = "";
  globalThis.fetch = (async (input: any) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  }) as any;

  const res = await GET(
    makeRequest("https://vercel.com/api/wake-render", { authorization: "Bearer " + TOKEN })
  );
  assert.equal(calledUrl, "https://cron-8vgj.onrender.com/health", "must fetch only the configured Render /health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.renderStatus, 200);
  assert.equal(body.message, "Render wake request completed");
  globalThis.fetch = originalFetch;
});

test("valid query token is accepted", async () => {
  setValidEnv();
  globalThis.fetch = makeFetchStub(200) as any;
  const res = await GET(makeRequest("https://vercel.com/api/wake-render?token=" + TOKEN));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  globalThis.fetch = originalFetch;
});

test("Render 5xx produces a controlled 502 without crashing", async () => {
  setValidEnv();
  globalThis.fetch = makeFetchStub(503) as any;
  const res = await GET(makeRequest("https://vercel.com/api/wake-render", { authorization: "Bearer " + TOKEN }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.renderStatus, 503);
  globalThis.fetch = originalFetch;
});

test("fetch failure (network/DNS/timeout) is caught and reported as 502", async () => {
  setValidEnv();
  globalThis.fetch = (async () => {
    throw new Error("socket hung up");
  }) as any;
  const res = await GET(makeRequest("https://vercel.com/api/wake-render", { authorization: "Bearer " + TOKEN }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.message, "Render wake request did not complete");
  globalThis.fetch = originalFetch;
});

test("misconfigured RENDER_WAKE_URL returns 500 and never performs a fetch", async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  }) as any;

  process.env.RENDER_WAKE_URL = "https://evil.com/health";
  const res = await GET(makeRequest("https://vercel.com/api/wake-render", { authorization: "Bearer " + TOKEN }));
  assert.equal(res.status, 500);
  assert.equal(fetchCalled, false, "must not issue any request when the wake URL is invalid");
  process.env.RENDER_WAKE_URL = "https://cron-8vgj.onrender.com/health";
  globalThis.fetch = originalFetch;
});

test("excessive requests from the same IP are rate limited", async () => {
  setValidEnv();
  globalThis.fetch = makeFetchStub(200) as any;
  for (let i = 0; i < 120; i++) {
    const res = await GET(makeRequest("https://vercel.com/api/wake-render"));
    assert.notEqual(res.status, 429, "first 120 requests within the window are allowed");
    await res.text();
  }
  const limited = await GET(makeRequest("https://vercel.com/api/wake-render"));
  assert.equal(limited.status, 429);
  globalThis.fetch = originalFetch;
  resetWakeRateLimiter();
});