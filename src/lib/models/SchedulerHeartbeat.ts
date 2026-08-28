import mongoose, { Schema, Model } from "mongoose";

export type SchedulerStatus = "ONLINE" | "OFFLINE";

export interface ISchedulerHeartbeat {
  _id: string;
  status: SchedulerStatus;
  lastHeartbeat: Date;
  jobsProcessed: number;
  lastExecutionAt: Date | null;
  startedAt: Date;
  schedulerId: string | null;
  hostname: string | null;
  pid: number | null;
  nodeVersion: string | null;
  lastError: string | null;
  lastExecutionStatus: string | null;
  lastExecutionHttpStatus: number | null;
}

const SchedulerHeartbeatSchema = new Schema(
  {
    _id: { type: String, default: "scheduler" },
    status: { type: String, enum: ["ONLINE", "OFFLINE"], default: "OFFLINE" },
    lastHeartbeat: { type: Date, default: Date.now },
    jobsProcessed: { type: Number, default: 0 },
    lastExecutionAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    schedulerId: { type: String, default: null },
    hostname: { type: String, default: null },
    pid: { type: Number, default: null },
    nodeVersion: { type: String, default: null },
    lastError: { type: String, default: null },
    lastExecutionStatus: { type: String, default: null },
    lastExecutionHttpStatus: { type: Number, default: null },
  },
  { timestamps: false }
);

export const SchedulerHeartbeat: Model<ISchedulerHeartbeat> =
  mongoose.models.SchedulerHeartbeat ||
  mongoose.model<ISchedulerHeartbeat>("SchedulerHeartbeat", SchedulerHeartbeatSchema);