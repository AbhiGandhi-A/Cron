import mongoose, { Schema, Document, Model } from "mongoose";

export type JobMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type BodyType = "none" | "json" | "form" | "text";

export interface INotificationConfig {
  enabled: boolean;
  url: string;
  failureThreshold: number;
  notifyOnRecovery: boolean;
}

export interface ICronJob extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  url: string;
  method: JobMethod;
  headers: Record<string, string> | null;
  body: unknown;
  bodyType: BodyType;
  queryParams: Record<string, string> | null;
  schedule: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  consecutiveFailures: number;
  notifications: INotificationConfig;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotificationConfig>(
  {
    enabled: { type: Boolean, default: false },
    url: { type: String, default: "" },
    failureThreshold: { type: Number, default: 1, min: 1, max: 100 },
    notifyOnRecovery: { type: Boolean, default: true },
  },
  { _id: false }
);

const CronJobSchema = new Schema<ICronJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    method: { type: String, enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"], default: "GET" },
    headers: { type: Schema.Types.Mixed, default: null },
    body: { type: Schema.Types.Mixed, default: null },
    bodyType: { type: String, enum: ["none", "json", "form", "text"], default: "none" },
    queryParams: { type: Schema.Types.Mixed, default: null },
    schedule: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    timeout: { type: Number, default: 30000, min: 1000, max: 300000 },
    retryCount: { type: Number, default: 3, min: 0, max: 10 },
    isRunning: { type: Boolean, default: false },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null, index: true },
    consecutiveFailures: { type: Number, default: 0 },
    notifications: { type: NotificationSchema, default: () => ({}) },
  },
  { timestamps: true }
);

CronJobSchema.index({ isActive: 1, nextRunAt: 1 });

export const CronJob: Model<ICronJob> =
  mongoose.models.CronJob || mongoose.model<ICronJob>("CronJob", CronJobSchema);
