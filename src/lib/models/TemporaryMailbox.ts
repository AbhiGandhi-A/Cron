import mongoose, { Schema, Document, Model } from "mongoose";

export type MailboxStatus = "active" | "expired" | "deleted";

export interface ITemporaryMailbox extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: string;
  publicAddress: string;
  mailboxTokenHash: string;
  providerMailboxId: string | null;
  status: MailboxStatus;
  expiresAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TemporaryMailboxSchema = new Schema<ITemporaryMailbox>(
  {
    ownerId: { type: String, required: true, index: true },
    publicAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mailboxTokenHash: { type: String, required: true, index: true },
    providerMailboxId: { type: String, default: null },
    status: { type: String, enum: ["active", "expired", "deleted"], default: "active", index: true },
    expiresAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const TemporaryMailbox: Model<ITemporaryMailbox> =
  mongoose.models.TemporaryMailbox ||
  mongoose.model<ITemporaryMailbox>("TemporaryMailbox", TemporaryMailboxSchema);
