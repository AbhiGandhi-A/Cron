import mongoose, { Schema, Document, Model } from "mongoose";

export type ExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "RETRY";

export interface IJobExecution extends Document {
  _id: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  startedAt: Date;
  completedAt: Date | null;
  status: ExecutionStatus;
  httpStatus: number | null;
  responseTime: number | null;
  errorMessage: string | null;
  retryNumber: number;
  requestUrl: string;
  requestBody: unknown;
  responseBody: string | null;
  requestMethod: string;
  requestHeaders: Record<string, string> | null;
  queryParams: Record<string, string> | null;
  responseHeaders: Record<string, string> | null;
  responseSize: number;
}

const JobExecutionSchema = new Schema<IJobExecution>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "CronJob", required: true },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["PENDING", "RUNNING", "SUCCESS", "FAILED", "TIMEOUT", "RETRY"],
      default: "PENDING",
    },
    httpStatus: { type: Number, default: null },
    responseTime: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    retryNumber: { type: Number, default: 0 },
    requestUrl: { type: String, required: true },
    requestBody: { type: Schema.Types.Mixed, default: null },
    responseBody: { type: String, default: null },
    requestMethod: { type: String, default: "GET" },
    requestHeaders: { type: Schema.Types.Mixed, default: null },
    queryParams: { type: Schema.Types.Mixed, default: null },
    responseHeaders: { type: Schema.Types.Mixed, default: null },
    responseSize: { type: Number, default: 0 },
  },
  { timestamps: false }
);

JobExecutionSchema.index({ jobId: 1, startedAt: -1 });
JobExecutionSchema.index({ status: 1 });

export const JobExecution: Model<IJobExecution> =
  mongoose.models.JobExecution ||
  mongoose.model<IJobExecution>("JobExecution", JobExecutionSchema);
