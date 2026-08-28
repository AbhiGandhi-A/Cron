import mongoose, { Schema, Model } from "mongoose";
import type { AiConversationMessage } from "../ai/types";

export type AiConversationKind = "issue" | "assistant";

export interface IAiConversation extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  issueId: mongoose.Types.ObjectId | null;
  kind: AiConversationKind;
  messages: AiConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMessageSchema = new Schema<AiConversationMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AiConversationSchema = new Schema<IAiConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    issueId: { type: Schema.Types.ObjectId, ref: "AiIssue", default: null, index: true },
    kind: { type: String, enum: ["issue", "assistant"], default: "assistant" },
    messages: { type: [ConversationMessageSchema], default: [] },
  },
  { timestamps: true }
);

AiConversationSchema.index({ userId: 1, updatedAt: -1 });

export const AiConversation: Model<IAiConversation> =
  mongoose.models.AiConversation ||
  mongoose.model<IAiConversation>("AiConversation", AiConversationSchema);