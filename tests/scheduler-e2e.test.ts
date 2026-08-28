import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { CronJobModel } from "../scheduler/models";
import { JobExecutionModel } from "../scheduler/jobExecutionModel";
import { SchedulerHeartbeatModel } from "../scheduler/heartbeatModel";
import { processJob } from "../scheduler/worker";
import { pollJobs } from "../scheduler/scheduler";

let mongod: MongoMemoryServer | null = null;
let setupError: Error | null = null;
const TEST_USER_ID = new mongoose.Types.ObjectId();

async function createJob(overrides: Record<string, unknown> = {}) {
  return CronJobModel.create({
    userId: TEST_USER_ID,
    name: "test-job",
    url: "http://127.0.0.1:9/blocked-by-ssrf",
    method: "GET",
    schedule: "*/1 * * * *",
    timezone: "UTC",
    bodyType: "none",
    body: null,
    queryParams: null,
    isActive: true,
    timeout: 5000,
    retryCount: 0,
    notifications: { enabled: false, url: "", failureThreshold: 1, notifyOnRecovery: false },
    ...overrides,
  });
}

function startMemoryServer(): Promise<MongoMemoryServer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("mongod download/start timed out after 120s")),
      120_000
    );
    MongoMemoryServer.create().then(
      (server) => {
        clearTimeout(timeout);
        resolve(server);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

before(async () => {
  try {
    mongod = await startMemoryServer();
    await mongoose.connect(mongod.getUri());
    // The worker enforces a monthly execution limit against the "users"
    // collection — seed a user with a high limit so jobs actually run.
    await mongoose.connection.collection("users").insertOne({
      _id: TEST_USER_ID,
      email: "e2e@example.com",
      maxExecutions: 100000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    setupError = error instanceof Error ? error : new Error(String(error));
  }
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});

test("scheduler e2e: does not double-execute a currently-locked job", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  const job = await createJob({
    lockedAt: new Date(),
    lockedBy: "other-worker",
    isRunning: true,
    nextRunAt: new Date(Date.now() - 1000),
  });

  await processJob(job._id.toString());

  const executions = await JobExecutionModel.countDocuments({ jobId: job._id });
  assert.equal(executions, 0, "a locked job must not be executed again");

  const reloaded = await CronJobModel.findById(job._id).lean();
  assert.equal(reloaded!.lockedBy, "other-worker");
  assert.equal(reloaded!.isRunning, true);
});

test("scheduler e2e: reclaims stale locks and executes the job", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  // Lock older than the default SCHEDULER_LOCK_EXPIRY_MS (15 min) is dead.
  const job = await createJob({
    lockedAt: new Date(Date.now() - 16 * 60 * 1000),
    lockedBy: "crashed-worker",
    isRunning: true,
    nextRunAt: new Date(Date.now() - 1000),
  });

  await processJob(job._id.toString());

  const executions = await JobExecutionModel.countDocuments({ jobId: job._id });
  assert.equal(executions, 1, "stale-lock reclaim must produce exactly one execution");

  const execution = await JobExecutionModel.findOne({ jobId: job._id }).sort({ startedAt: 1 }).lean();
  assert.equal(execution!.status, "FAILED"); // target is SSRF-blocked on purpose

  const reloaded = await CronJobModel.findById(job._id).lean();
  assert.equal(reloaded!.isRunning, false, "lock must be released after execution");
  assert.equal(reloaded!.lockedAt, null);
  assert.equal(reloaded!.lockedBy, null);
  assert.ok(reloaded!.lastRunAt, "lastRunAt must be set");
  assert.ok(reloaded!.nextRunAt, "nextRunAt must be set");
  assert.ok(reloaded!.nextRunAt.getTime() > Date.now());
});

test("scheduler e2e: executes jobs with null nextRunAt (legacy/first-run)", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  const job = await createJob({ nextRunAt: null, lockedAt: null });

  await processJob(job._id.toString());

  const executions = await JobExecutionModel.countDocuments({ jobId: job._id });
  assert.equal(executions, 1);

  const reloaded = await CronJobModel.findById(job._id).lean();
  assert.ok(reloaded!.nextRunAt, "nextRunAt must be computed for legacy jobs");
  assert.ok(reloaded!.nextRunAt.getTime() > Date.now());
});

test("scheduler e2e: pollJobs finds due jobs, executes them, and updates heartbeat", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  await SchedulerHeartbeatModel.findByIdAndUpdate(
    "scheduler",
    { status: "ONLINE", jobsProcessed: 0 },
    { upsert: true }
  );

  const job = await createJob({ nextRunAt: new Date(Date.now() - 5000), lockedAt: null });

  await pollJobs();

  const executions = await JobExecutionModel.countDocuments({ jobId: job._id });
  assert.equal(executions, 1, "poll loop must execute due jobs");

  const heartbeat = await SchedulerHeartbeatModel.findById("scheduler").lean();
  assert.ok(heartbeat, "heartbeat must exist");
  assert.equal(heartbeat.status, "ONLINE");
  assert.ok((heartbeat.jobsProcessed ?? 0) >= 1);
});

test("scheduler e2e (live): full HTTP 200 round trip via public endpoint", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);
  if (process.env.RUN_LIVE_NETWORK_TESTS !== "true") {
    return t.skip("set RUN_LIVE_NETWORK_TESTS=true to run the live httpbin.org round trip");
  }

  const job = await createJob({
    url: "https://httpbin.org/post",
    method: "POST",
    bodyType: "json",
    body: { hello: "world" },
    queryParams: { from: "scheduler-e2e" },
    timeout: 15000,
  });

  await processJob(job._id.toString());

  const execution = await JobExecutionModel.findOne({ jobId: job._id }).sort({ startedAt: 1 }).lean();
  assert.equal(execution!.status, "SUCCESS");
  assert.equal(execution!.httpStatus, 200);
  assert.equal(execution!.queryParams!.from, "scheduler-e2e");
  assert.ok(execution!.responseBody!.includes("hello"));
});