import mongoose, { Schema, Model } from "mongoose";

export type SchedulerStatus = "ONLINE" | "OFFLINE";

export interface ISchedulerHeartbeat {
  _id: string;
  status: SchedulerStatus;
  lastHeartbeat: Date;
  jobsProcessed: number;
  lastExecutionAt: Date | null;
  startedAt: Date;
}

const SchedulerHeartbeatSchema = new Schema(
  {
    _id: { type: String, default: "scheduler" },
    status: { type: String, enum: ["ONLINE", "OFFLINE"], default: "OFFLINE" },
    lastHeartbeat: { type: Date, default: Date.now },
    jobsProcessed: { type: Number, default: 0 },
    lastExecutionAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const SchedulerHeartbeat: Model<ISchedulerHeartbeat> =
  mongoose.models.SchedulerHeartbeat ||
  mongoose.model<ISchedulerHeartbeat>("SchedulerHeartbeat", SchedulerHeartbeatSchema);
