import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "http";
import { startHealthServer, markSchedulerRunning, isSchedulerRunning } from "../scheduler/health";

let server: Server | null = null;
let port = 0;

before(async () => {
  process.env.PORT = "0";
  server = startHealthServer();
  const deadline = Date.now() + 3000;
  while (!port && Date.now() < deadline) {
    const addr = server.address();
    if (addr && typeof addr === "object") port = addr.port;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
});

after(() => {
  server?.close();
});

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch("http://127.0.0.1:" + port + path);
  return { status: res.status, body: await res.json() };
}

test("health server binds on PORT and serves GET /health", async () => {
  assert.ok(port > 0, "server must bind an ephemeral port");
  const { status, body } = await getJson("/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.ok(typeof body.uptime === "number");
});

test("health reports scheduler:starting, then running after markSchedulerRunning", async () => {
  assert.equal(isSchedulerRunning(), false);
  const starting = await getJson("/health");
  assert.equal(starting.body.scheduler, "starting");

  markSchedulerRunning(true);
  const running = await getJson("/health");
  assert.equal(running.body.scheduler, "running");

  markSchedulerRunning(false);
  assert.equal(isSchedulerRunning(), false);
});

test("wake endpoint returns awake and never triggers execution", async () => {
  const { status, body } = await getJson("/wake");
  assert.equal(status, 200);
  assert.equal(body.status, "awake");
});

test("wake endpoint does not alter scheduler running state", async () => {
  markSchedulerRunning(true);
  await getJson("/wake");
  assert.equal(isSchedulerRunning(), true);
  markSchedulerRunning(false);
});

test("unknown paths return 404 and expose no job data", async () => {
  const res = await fetch("http://127.0.0.1:" + port + "/trigger");
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.deepEqual(body, { error: "Not found" });
});

test("health server is disabled locally unless opted in", () => {
  const previousRender = process.env.RENDER;
  const previousEnabled = process.env.SCHEDULER_HEALTH_ENABLED;
  const { healthServerEnabled } = require("../scheduler/health") as typeof import("../scheduler/health");

  delete process.env.RENDER;
  process.env.SCHEDULER_HEALTH_ENABLED = "false";
  assert.equal(healthServerEnabled(), false);

  process.env.RENDER = "true";
  assert.equal(healthServerEnabled(), true);
  delete process.env.RENDER;

  process.env.SCHEDULER_HEALTH_ENABLED = "true";
  assert.equal(healthServerEnabled(), true);

  if (previousRender === undefined) delete process.env.RENDER;
  else process.env.RENDER = previousRender;
  process.env.SCHEDULER_HEALTH_ENABLED = previousEnabled || "";
});