import * as dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI!;

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    plan: { type: String, default: "free" },
    maxJobs: { type: Number, default: 10 },
    maxExecutions: { type: Number, default: 1000 },
  },
  { timestamps: true }
);

const CronJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    method: { type: String, enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
    headers: { type: mongoose.Schema.Types.Mixed, default: null },
    body: { type: mongoose.Schema.Types.Mixed, default: null },
    bodyType: { type: String, enum: ["none", "json", "form", "text"], default: "none" },
    queryParams: { type: mongoose.Schema.Types.Mixed, default: null },
    schedule: { type: String, required: true },
    timezone: { type: String, default: "UTC" },
    isActive: { type: Boolean, default: true },
    timeout: { type: Number, default: 30000 },
    retryCount: { type: Number, default: 3 },
    isRunning: { type: Boolean, default: false },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null },
    consecutiveFailures: { type: Number, default: 0 },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const CronJob = mongoose.models.CronJob || mongoose.model("CronJob", CronJobSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const email = "admin@example.com";
  const password = await bcrypt.hash("password123", 12);

  const user = await User.findOneAndUpdate(
    { email },
    { $setOnInsert: { name: "Admin", email, password, plan: "free", maxJobs: 10, maxExecutions: 1000 } },
    { upsert: true, new: true }
  );

  console.log("User:", user.email, "(ID:", user._id, ")");

  const jobCount = await CronJob.countDocuments({ userId: user._id });

  if (jobCount === 0) {
    const now = new Date();
    await CronJob.insertMany([
      {
        userId: user._id,
        name: "Example Health Check",
        url: "https://httpbin.org/get",
        method: "GET",
        schedule: "*/5 * * * *",
        isActive: true,
        timeout: 30000,
        retryCount: 3,
        nextRunAt: new Date(now.getTime() + 5 * 60 * 1000),
      },
      {
        userId: user._id,
        name: "Example POST Request",
        url: "https://httpbin.org/post",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { test: true, message: "Hello from CronJob.io" },
        schedule: "0 * * * *",
        isActive: true,
        timeout: 30000,
        retryCount: 2,
        nextRunAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    ]);
    console.log("Created 2 sample jobs");
  }

  await mongoose.disconnect();
  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
