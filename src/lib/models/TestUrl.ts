import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITestUrl extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  token: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TestUrlSchema = new Schema<ITestUrl>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    token: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TestUrl: Model<ITestUrl> =
  mongoose.models.TestUrl || mongoose.model<ITestUrl>("TestUrl", TestUrlSchema);

export interface ITestUrlRequest extends Document {
  _id: mongoose.Types.ObjectId;
  testUrlId: mongoose.Types.ObjectId;
  method: string;
  url: string;
  queryParams: Record<string, string> | null;
  headers: Record<string, string> | null;
  body: unknown;
  contentType: string | null;
  requestSize: number;
  statusCode: number;
  receivedAt: Date;
}

const TestUrlRequestSchema = new Schema<ITestUrlRequest>(
  {
    testUrlId: { type: Schema.Types.ObjectId, ref: "TestUrl", required: true, index: true },
    method: { type: String, required: true },
    url: { type: String, required: true },
    queryParams: { type: Schema.Types.Mixed, default: null },
    headers: { type: Schema.Types.Mixed, default: null },
    body: { type: Schema.Types.Mixed, default: null },
    contentType: { type: String, default: null },
    requestSize: { type: Number, default: 0 },
    statusCode: { type: Number, default: 200 },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

TestUrlRequestSchema.index({ testUrlId: 1, receivedAt: -1 });

export const TestUrlRequest: Model<ITestUrlRequest> =
  mongoose.models.TestUrlRequest || mongoose.model<ITestUrlRequest>("TestUrlRequest", TestUrlRequestSchema);
