import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, getClientIp } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { TemporaryMailbox, TemporaryEmail, AdminAuditLog } from "@/lib/models";
import { logError } from "@/lib/security";
import { getCloudflareUsageData } from "@/lib/cloudflare-usage";

function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get overall stats
    const totalMailboxes = await TemporaryMailbox.countDocuments();
    const activeMailboxes = await TemporaryMailbox.countDocuments({
      status: "active",
    });
    const expiredMailboxes = await TemporaryMailbox.countDocuments({
      status: "expired",
    });
    const deletedMailboxes = await TemporaryMailbox.countDocuments({
      status: "deleted",
    });

    const totalEmails = await TemporaryEmail.countDocuments();
    const emailsToday = await TemporaryEmail.countDocuments({
      createdAt: { $gte: today },
    });

    const mailboxesToday = await TemporaryMailbox.countDocuments({
      createdAt: { $gte: today },
      status: { $ne: "deleted" },
    });

    // Get storage stats
    const emailStats = await TemporaryEmail.aggregate([
      {
        $group: {
          _id: null,
          totalSize: { $sum: "$size" },
          avgSize: { $avg: "$size" },
        },
      },
    ]);

    const storage =
      emailStats.length > 0
        ? emailStats[0]
        : { totalSize: 0, avgSize: 0 };

    // Fetch real Cloudflare usage
    let cloudflareUsage = null;
    try {
      cloudflareUsage = await getCloudflareUsageData();
    } catch {
      // Graceful fallback
    }

    return NextResponse.json({
      mailboxes: {
        total: safeNumber(totalMailboxes, 0),
        active: safeNumber(activeMailboxes, 0),
        expired: safeNumber(expiredMailboxes, 0),
        deleted: safeNumber(deletedMailboxes, 0),
        createdToday: safeNumber(mailboxesToday, 0),
      },
      emails: {
        total: safeNumber(totalEmails, 0),
        createdToday: safeNumber(emailsToday, 0),
      },
      storage: {
        totalBytes: safeNumber(storage?.totalSize, 0),
        averageEmailSize: safeNumber(storage?.avgSize, 0),
      },
      cloudflare: cloudflareUsage,
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
      const now = new Date();
      const result = await TemporaryMailbox.updateMany(
        { status: "active", expiresAt: { $lt: now } },
        { $set: { status: "expired", deletedAt: new Date() } }
      );

      await AdminAuditLog.create({
        action: "mailbox_cleaned",
        adminIp: getClientIp(req),
        targetUserId: null,
        targetUserEmail: null,
        details: { mailboxesMarkedExpired: result.modifiedCount },
        success: true,
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Marked ${result.modifiedCount} expired mailboxes.`,
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

