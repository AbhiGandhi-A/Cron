import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, getClientIp } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { TemporaryMailbox, TemporaryEmail, AdminAuditLog } from "@/lib/models";
import { logError } from "@/lib/security";

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

    // Fetch Cloudflare worker usage
    let workerUsage: Record<string, unknown> | null = null;
    try {
      const workerUrl =
        process.env.NEXT_PUBLIC_API_URL || "https://api.cronjobs.site";
      const res = await fetch(`${workerUrl}/api/temp-mail/usage`, {
        headers: {
          "x-temp-mail-service":
            process.env.TEMP_MAIL_SERVICE_SECRET || "",
        },
      });

      if (res.ok) {
        workerUsage = await res.json();
      }
    } catch {
      // Silently fail
    }

    return NextResponse.json({
      mailboxes: {
        total: totalMailboxes,
        active: activeMailboxes,
        expired: expiredMailboxes,
        deleted: deletedMailboxes,
        createdToday: mailboxesToday,
      },
      emails: {
        total: totalEmails,
        createdToday: emailsToday,
      },
      storage: {
        totalBytes: storage.totalSize,
        averageEmailSize: storage.avgSize,
      },
      cloudflareUsage: workerUsage,
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
      // Mark expired mailboxes as expired
      const now = new Date();
      const result = await TemporaryMailbox.updateMany(
        { status: "active", expiresAt: { $lt: now } },
        { $set: { status: "expired", deletedAt: new Date() } }
      );

      // Log action
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
        message: `Cleaned ${result.modifiedCount} expired mailboxes`,
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
