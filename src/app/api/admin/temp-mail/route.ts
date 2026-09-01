import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, getClientIp } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { AdminAuditLog } from "@/lib/models";
import { logError } from "@/lib/security";
import { getCloudflareUsageData } from "@/lib/cloudflare-usage";
import { getRealtimeTempMailStats, cleanExpiredMailboxes } from "@/lib/temp-mail/admin-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const [tempMailStats, cloudflareUsage] = await Promise.all([
      getRealtimeTempMailStats(),
      getCloudflareUsageData().catch(() => null),
    ]);

    return NextResponse.json({
      mailboxes: tempMailStats.mailboxes,
      emails: tempMailStats.emails,
      storage: tempMailStats.storage,
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
    const { action } = body as { action?: string };

    if (!action) {
      return NextResponse.json(
        { error: "Action required" },
        { status: 400 }
      );
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
