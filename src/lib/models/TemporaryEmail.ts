import mongoose, { Schema, Document, Model } from "mongoose";

export interface IEmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  attachmentId: string;
}

export interface ITemporaryEmail extends Document {
  _id: mongoose.Types.ObjectId;
  mailboxId: mongoose.Types.ObjectId;
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  sanitizedHtmlBody: string;
  receivedAt: Date;
  isRead: boolean;
  attachments: IEmailAttachment[];
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const TemporaryEmailSchema = new Schema<ITemporaryEmail>(
  {
    mailboxId: { type: Schema.Types.ObjectId, ref: "TemporaryMailbox", required: true, index: true },
    messageId: { type: String, required: true },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, default: "", trim: true },
    textBody: { type: String, default: "" },
    sanitizedHtmlBody: { type: String, default: "" },
    receivedAt: { type: Date, default: Date.now, index: true },
    isRead: { type: Boolean, default: false },
    attachments: [
      {
        filename: { type: String, required: true },
        contentType: { type: String, required: true },
        size: { type: Number, required: true },
        attachmentId: { type: String, required: true },
      },
    ],
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TemporaryEmailSchema.index({ mailboxId: 1, receivedAt: -1 });

export const TemporaryEmail: Model<ITemporaryEmail> =
  mongoose.models.TemporaryEmail ||
  mongoose.model<ITemporaryEmail>("TemporaryEmail", TemporaryEmailSchema);
