import mongoose, { Schema, Document, Model } from "mongoose";

export type UserStatus = "active" | "blocked";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  password: string;
  plan: string;
  maxJobs: number;
  maxExecutions: number;
  status: UserStatus;
  tempMailDisabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    plan: { type: String, default: "free" },
    maxJobs: { type: Number, default: 10 },
    maxExecutions: { type: Number, default: 1000 },
    status: { type: String, enum: ["active", "blocked"], default: "active", index: true },
    tempMailDisabled: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
