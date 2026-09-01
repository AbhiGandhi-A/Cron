import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICloudflareConfig extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: string;
  zoneId: string | null;
  d1DatabaseId: string | null;
  workerName: string | null;
  apiToken: string; // Encrypted/hashed in production
  connectionStatus: "connected" | "not-configured" | "configuration-required" | "connection-failed" | "zone-error";
  connectionMessage: string;
  lastConnectionTest: Date | null;
  lastUsageFetch: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CloudflareConfigSchema = new Schema<ICloudflareConfig>(
  {
    accountId: { type: String, required: true, trim: true },
    zoneId: { type: String, default: null, trim: true },
    d1DatabaseId: { type: String, default: null, trim: true },
    workerName: { type: String, default: null, trim: true },
    apiToken: { type: String, required: true }, // Should be encrypted in production
    connectionStatus: {
      type: String,
      enum: ["connected", "not-configured", "configuration-required", "connection-failed", "zone-error"],
      default: "not-configured",
    },
    connectionMessage: {
      type: String,
      default: "Cloudflare Configuration Required",
    },
    lastConnectionTest: { type: Date, default: null },
    lastUsageFetch: { type: Date, default: null },
  },
  { timestamps: true }
);

export const CloudflareConfig: Model<ICloudflareConfig> =
  mongoose.models.CloudflareConfig || mongoose.model<ICloudflareConfig>("CloudflareConfig", CloudflareConfigSchema);
