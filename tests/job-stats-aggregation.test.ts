import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { JobExecution } from "../src/lib/models";

let mongod: MongoMemoryServer | null = null;
let setupError: Error | null = null;

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

// ============================================================
// Regression: job stats aggregations returned 0 even though
// executions existed. Mongoose 9 does NOT cast a string id to
// ObjectId inside an aggregate() $match stage, so the pipeline
// matched nothing. The routes now cast explicitly.
// ============================================================
test("stats: aggregate with an explicit ObjectId counts the job's executions", async function (t) {
  if (setupError) return t.skip("mongod unavailable: " + setupError.message);

  const jobId = new mongoose.Types.ObjectId();
  await JobExecution.create([
    { jobId, status: "SUCCESS", httpStatus: 200, responseTime: 120, requestUrl: "https://example.com", retryNumber: 0, triggeredBy: "schedule" },
    { jobId, status: "SUCCESS", httpStatus: 200, responseTime: 95, requestUrl: "https://example.com", retryNumber: 0, triggeredBy: "schedule" },
    { jobId, status: "FAILED", httpStatus: 500, responseTime: 310, requestUrl: "https://example.com", retryNumber: 0, triggeredBy: "schedule" },
  ]);

  const buckets = await JobExecution.aggregate([
    { $match: { jobId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const countOf = (status: string) => buckets.find((b) => b._id === status)?.count ?? 0;
  assert.equal(countOf("SUCCESS"), 2);
  assert.equal(countOf("FAILED"), 1);
  assert.equal(countOf("RUNNING"), 0);
});

test("stats: aggregate keyed by the raw 24-hex string jobId matches nothing (the bug this fix works around)", async function (t) {
  if (setupError) return t.skip("mongod unavailable: " + setupError.message);

  const jobId = new mongoose.Types.ObjectId();
  await JobExecution.create({
    jobId,
    status: "SUCCESS",
    httpStatus: 200,
    responseTime: 50,
    requestUrl: "https://example.com",
    retryNumber: 0,
    triggeredBy: "schedule",
  });

  // WARNING: deliberately reproduces the broken behavior. Mongoose 9 leaves the
  // string untouched inside aggregate(), so the pipeline matches nothing, while
  // find({ jobId: <string> }) casts and works. The stats route therefore casts
  // to ObjectId explicitly before building the pipeline.
  const rawStringResult = await JobExecution.aggregate([
    { $match: { jobId: jobId.toString() } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  assert.equal(rawStringResult.length, 0);

  const viaFind = await JobExecution.find({ jobId: jobId.toString() }).lean();
  assert.equal(viaFind.length, 1, "find() still matches string ids");
});