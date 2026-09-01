import mongoose, { Schema, Document, Model } from "mongoose";

export type AdminAction =
  | "admin_login"
  | "admin_logout"
  | "user_blocked"
  | "user_unblocked"
  | "temp_mail_disabled"
  | "temp_mail_enabled"
  | "user_deleted"
  | "user_updated"
  | "temp_mail_disabled_global"
  | "temp_mail_enabled_global"
  | "usage_protection_triggered"
  | "mailbox_cleaned";

export interface IAdminAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  action: AdminAction;
  adminIp: string;
  targetUserId: mongoose.Types.ObjectId | null;
  targetUserEmail: string | null;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    action: { type: String, required: true, index: true },
    adminIp: { type: String, default: "" },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    targetUserEmail: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
AdminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

export const AdminAuditLog: Model<IAdminAuditLog> =
  mongoose.models.AdminAuditLog ||
  mongoose.model<IAdminAuditLog>("AdminAuditLog", AdminAuditLogSchema);
