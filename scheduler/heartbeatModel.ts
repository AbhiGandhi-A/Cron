import mongoose, { Schema, Model } from "mongoose";

export interface ISchedulerHeartbeat {
  _id: string;
  status: string;
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

export const SchedulerHeartbeatModel: Model<ISchedulerHeartbeat & mongoose.Document> =
  mongoose.models.SchedulerHeartbeat ||
  mongoose.model<ISchedulerHeartbeat & mongoose.Document>("SchedulerHeartbeat", SchedulerHeartbeatSchema);
