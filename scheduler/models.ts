import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICronJob extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string> | null;
  body: unknown;
  bodyType: "none" | "json" | "form" | "text" | null;

  queryParams: Record<string, string> | null;
  schedule: string;
  timezone: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  consecutiveFailures: number;
  notifications: {
    enabled: boolean;
    url: string;
    failureThreshold: number;
    notifyOnRecovery: boolean;
  };
  lockedAt: Date | null;
  lockedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    url: { type: String, default: "" },
    failureThreshold: { type: Number, default: 1 },
    notifyOnRecovery: { type: Boolean, default: true },
  },
  { _id: false }
);

const CronJobSchema = new Schema<ICronJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    method: { type: String, enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"], default: "GET" },
    headers: { type: Schema.Types.Mixed, default: null },
    body: { type: Schema.Types.Mixed, default: null },
    bodyType: { type: String, enum: ["none", "json", "form", "text"], default: "none" },
    queryParams: { type: Schema.Types.Mixed, default: null },
    schedule: { type: String, required: true },
    timezone: { type: String, default: "UTC" },
    isActive: { type: Boolean, default: true },
    timeout: { type: Number, default: 30000 },
    retryCount: { type: Number, default: 3 },
    isRunning: { type: Boolean, default: false },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null, index: true },
    consecutiveFailures: { type: Number, default: 0 },
    notifications: { type: NotificationSchema, default: () => ({}) },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
  },
  { timestamps: true }
);

CronJobSchema.index({ isActive: 1, nextRunAt: 1 });
CronJobSchema.index({ isRunning: 1, lockedAt: 1 });

export const CronJobModel: Model<ICronJob> =
  mongoose.models.CronJob || mongoose.model<ICronJob>("CronJob", CronJobSchema);