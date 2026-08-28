import mongoose, { Schema, Model } from "mongoose";
import type {
  GeneratedApiAuthMode,
  GeneratedApiCorsConfig,
  GeneratedApiRateLimitConfig,
  GeneratedApiResponseConfig,
  GeneratedApiSourceConfigStored,
  GeneratedApiAnalytics,
} from "../ai/types";

export interface IGeneratedApi extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  agentId: string;
  publicUrl: string;
  source: GeneratedApiSourceConfigStored;
  methods: string[];
  auth: {
    mode: GeneratedApiAuthMode;
    secretHash: string | null;
    secretPrefix: string | null;
  };
  cors: GeneratedApiCorsConfig;
  rateLimit: GeneratedApiRateLimitConfig;
  response: GeneratedApiResponseConfig;
  isActive: boolean;
  analytics: GeneratedApiAnalytics;
  createdAt: Date;
  updatedAt: Date;
}

const GeneratedApiSchema = new Schema<IGeneratedApi>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    agentId: { type: String, required: true, unique: true, index: true },
    publicUrl: { type: String, required: true },
    source: {
      type: {
        type: String,
        enum: ["static", "collection", "internal"],
        required: true,
      },
      body: { type: Schema.Types.Mixed, default: null },
      collection: { type: String, default: null },
      fields: { type: [String], default: null },
      url: { type: String, default: null },
      method: { type: String, default: null },
      timeout: { type: Number, default: 30000 },
    },
    methods: { type: [String], required: true },
    auth: {
      mode: { type: String, enum: ["public", "api-key", "bearer", "private"], default: "private" },
      secretHash: { type: String, default: null },
      secretPrefix: { type: String, default: null },
    },
    cors: {
      enabled: { type: Boolean, default: false },
      origins: { type: [String], default: [] },
    },
    rateLimit: {
      limit: { type: Number, default: 30 },
      windowMs: { type: Number, default: 60000 },
    },
    response: {
      statusCode: { type: Number, default: 200 },
      maxSizeBytes: { type: Number, default: 100000 },
      contentType: { type: String, default: "application/json" },
    },
    isActive: { type: Boolean, default: true },
    analytics: {
      dayKey: { type: String, default: "" },
      requestsToday: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      errorCount: { type: Number, default: 0 },
      totalResponseTimeMs: { type: Number, default: 0 },
      lastRequestAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

GeneratedApiSchema.index({ userId: 1, createdAt: -1 });

export const GeneratedApi: Model<IGeneratedApi> =
  mongoose.models.GeneratedApi || mongoose.model<IGeneratedApi>("GeneratedApi", GeneratedApiSchema);