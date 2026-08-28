import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Model } from "mongoose";
import mongoose from "mongoose";
import type { ICronJob } from "../scheduler/models";
import type { IJobExecution } from "../scheduler/jobExecutionModel";

let mongod: MongoMemoryServer | null = null;
let setupError: Error | null = null;

let schedulerMod: typeof import("../scheduler/scheduler");
let CronJobModel: Model<ICronJob>;
let JobExecutionModel: Model<IJobExecution>;
let HeartbeatModel: Model<any>;

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

function waitForExecution(
  jobId: unknown,
  timeoutMs = 20_000
): Promise<IJobExecution | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = async () => {
      const execution = await JobExecutionModel.findOne({
        jobId: jobId as mongoose.Types.ObjectId,
      }).sort({ startedAt: 1 }).lean();
      if (execution || Date.now() - started > timeoutMs) {
        resolve(execution);
        return;
      }
      setTimeout(poll, 150);
    };
    void poll();
  });
}

before(async () => {
  try {
    mongod = await startMemoryServer();

    // These env vars are read at module import time, so set them BEFORE the
    // dynamic import — this boots the real loop against the in-process DB.
    process.env.MONGODB_URI = mongod.getUri();
    process.env.SCHEDULER_POLL_INTERVAL_MS = "200";
    process.env.SCHEDULER_HEARTBEAT_INTERVAL_MS = "300";

    schedulerMod = await import("../scheduler/scheduler");
    const models = await import("../scheduler/models");
    const executions = await import("../scheduler/jobExecutionModel");
    const heartbeats = await import("../scheduler/heartbeatModel");
    CronJobModel = models.CronJobModel;
    JobExecutionModel = executions.JobExecutionModel;
    HeartbeatModel = heartbeats.SchedulerHeartbeatModel;
  } catch (error) {
    setupError = error instanceof Error ? error : new Error(String(error));
  }
});

after(async () => {
  if (mongod) {
    await mongod.stop().catch(() => {});
  }
});

test("full loop: startScheduler -> poll -> execute -> release -> heartbeat OFF/ON/OFF", async (t) => {
  if (setupError) return t.skip("mongodb-memory-server unavailable: " + setupError.message);

  try {
    const startedAt = Date.now();
    await schedulerMod.startScheduler();

    const schedulerDb = CronJobModel.db;
    const userName = new mongoose.Types.ObjectId();
    await schedulerDb.collection("users").insertOne({
      _id: userName,
      email: "loop@example.com",
      maxExecutions: 100000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const job = await CronJobModel.create({
      userId: userName,
      name: "loop-test",
      url: "http://127.0.0.1:9/blocked-by-ssrf",
      method: "GET",
      schedule: "*/1 * * * *",
      timezone: "UTC",
      bodyType: "none",
      isActive: true,
      timeout: 5000,
      retryCount: 0,
      notifications: { enabled: false, url: "", failureThreshold: 1, notifyOnRecovery: false },
      nextRunAt: new Date(Date.now() - 1000),
    });

    const execution = await waitForExecution(job._id);
    assert.ok(execution, "the real poll loop must pick up and execute a due job");

    assert.equal(execution.status, "FAILED"); // SSRF-blocked target on purpose
    assert.equal(execution.jobId.toString(), job._id.toString());

    const reloaded = await CronJobModel.findById(job._id).lean();
    assert.ok(reloaded!.lastRunAt, "lastRunAt must be set after a loop execution");
    assert.ok(reloaded!.nextRunAt, "nextRunAt must be advanced after a loop execution");
    assert.ok(reloaded!.nextRunAt.getTime() > Date.now() - 1000);
    assert.equal(reloaded!.isRunning, false, "lock must be released");
    assert.equal(reloaded!.lockedAt, null);

    const heartbeatBefore = await HeartbeatModel.findById("scheduler").lean();
    assert.ok(heartbeatBefore, "heartbeat must exist while running");
    assert.equal(heartbeatBefore.status, "ONLINE", "running scheduler writes ONLINE heartbeat");
    assert.ok((heartbeatBefore.jobsProcessed ?? 0) >= 1, "heartbeat counts processed jobs");
    assert.ok(heartbeatBefore.schedulerId, "heartbeat must carry instance identity");
    assert.ok(heartbeatBefore.hostname, "heartbeat must carry hostname");

    await schedulerMod.stopScheduler();

    // Graceful shutdown disconnects MongoDB; reconnect just to read the doc.
    await mongoose.connect(mongod!.getUri());
    const heartbeatAfter = await HeartbeatModel.findById("scheduler").lean();
    assert.equal(heartbeatAfter!.status, "OFFLINE", "graceful shutdown must mark heartbeat OFFLINE");
    assert.ok(Date.now() - startedAt > 0);
  } finally {
    try {
      if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    } catch {}
  }
});