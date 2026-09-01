import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, getClientIp } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { AdminAuditLog } from "@/lib/models";
import { logError } from "@/lib/security";
import { getCloudflareUsageData } from "@/lib/cloudflare-usage";
import {
  getRealtimeTempMailStats,
  getRealtimeActiveMailboxes,
  adminDeleteMailbox,
  cleanExpiredMailboxes,
} from "@/lib/temp-mail/admin-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const [tempMailStats, activeMailboxes, cloudflareUsage] = await Promise.all([
      getRealtimeTempMailStats(),
      getRealtimeActiveMailboxes(),
      getCloudflareUsageData().catch(() => null),
    ]);

    return NextResponse.json({
      mailboxes: tempMailStats.mailboxes,
      emails: tempMailStats.emails,
      storage: tempMailStats.storage,
      activeMailboxes,
      cloudflare: cloudflareUsage,
      source: tempMailStats.source,
    });
  } catch (error) {
    logError("admin-temp-mail", "Failed to fetch temp mail stats", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();

    const body = await req.json().catch(() => ({}));
    const { action, publicAddress, mailboxId } = body as {
      action?: string;
      publicAddress?: string;
      mailboxId?: string;
    };

    if (!action) {
      return NextResponse.json(
        { error: "Action required" },
        { status: 400 }
      );
    }

    if (action === "delete-mailbox") {
      const identifier = (publicAddress || mailboxId || "").trim();
      if (!identifier) {
        return NextResponse.json(
          { error: "publicAddress or mailboxId is required" },
          { status: 400 }
        );
      }

      const deleted = await adminDeleteMailbox(identifier);

      await AdminAuditLog.create({
        action: "mailbox_deleted",
        adminIp: getClientIp(req),
        targetUserId: null,
        targetUserEmail: null,
        details: {
          publicAddress: identifier,
          success: deleted,
        },
        success: deleted,
      }).catch(() => {});

      return NextResponse.json({
        success: deleted,
        message: deleted
          ? `Mailbox ${identifier} and its messages have been deleted.`
          : `Mailbox ${identifier} not found or already deleted.`,
      });
    }

    if (action === "clean-expired") {
      const result = await cleanExpiredMailboxes();

      await AdminAuditLog.create({
        action: "mailbox_cleaned",
        adminIp: getClientIp(req),
        targetUserId: null,
        targetUserEmail: null,
        details: {
          mailboxesMarkedExpired: result.totalModified,
          d1Modified: result.d1Modified,
          mongoModified: result.mongoModified,
        },
        success: true,
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Marked ${result.totalModified} expired mailboxes across Cloudflare D1 & MongoDB.`,
      });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    logError("admin-temp-mail-action", "Failed to perform temp mail action", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
