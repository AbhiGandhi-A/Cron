import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, getClientIp } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { User, TemporaryMailbox, TemporaryEmail, AdminAuditLog, CronJob, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";
import mongoose from "mongoose";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 }
      );
    }

    const user = await User.findById(id).select("-password").lean();
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get temp mail stats
    const mailboxes = await TemporaryMailbox.find({
      ownerId: user._id.toString(),
      status: "active",
    }).lean();
    const mailboxIds = mailboxes.map((m) => m._id);
    const emailCount = await TemporaryEmail.countDocuments({
      mailboxId: { $in: mailboxIds },
    });

    // Get job stats
    const jobCount = await CronJob.countDocuments({ userId: user._id });
    const executionCount = await JobExecution.countDocuments({
      jobId: { $in: await CronJob.distinct("_id", { userId: user._id }) },
    });

    // Get activity
    const recentActivity = await AdminAuditLog.find({
      targetUserId: user._id,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return NextResponse.json({
      user,
      tempMail: {
        enabled: !user.tempMailDisabled,
        mailboxes: mailboxes.length,
        emails: emailCount,
      },
      jobs: {
        total: jobCount,
        totalExecutions: executionCount,
      },
      activity: recentActivity,
    });
  } catch (error) {
    logError("admin-user-detail", "Failed to fetch user", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (!action) {
      return NextResponse.json(
        { error: "Action required" },
        { status: 400 }
      );
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    let success = false;
    let message = "";

    if (action === "block") {
      if (user.status !== "blocked") {
        user.status = "blocked";
        await user.save();
        success = true;
        message = "User blocked successfully";

        // Log action
        await AdminAuditLog.create({
          action: "user_blocked",
          adminIp: getClientIp(req),
          targetUserId: user._id,
          targetUserEmail: user.email,
          details: {},
          success: true,
        }).catch(() => {});
      } else {
        message = "User is already blocked";
        success = true;
      }
    } else if (action === "unblock") {
      if (user.status === "blocked") {
        user.status = "active";
        await user.save();
        success = true;
        message = "User unblocked successfully";

        // Log action
        await AdminAuditLog.create({
          action: "user_unblocked",
          adminIp: getClientIp(req),
          targetUserId: user._id,
          targetUserEmail: user.email,
          details: {},
          success: true,
        }).catch(() => {});
      } else {
        message = "User is not blocked";
        success = true;
      }
    } else if (action === "disable-temp-mail") {
      if (!user.tempMailDisabled) {
        user.tempMailDisabled = true;
        await user.save();
        success = true;
        message = "Temp Mail disabled for user";

        // Log action
        await AdminAuditLog.create({
          action: "temp_mail_disabled",
          adminIp: getClientIp(req),
          targetUserId: user._id,
          targetUserEmail: user.email,
          details: {},
          success: true,
        }).catch(() => {});
      } else {
        message = "Temp Mail is already disabled for this user";
        success = true;
      }
    } else if (action === "enable-temp-mail") {
      if (user.tempMailDisabled) {
        user.tempMailDisabled = false;
        await user.save();
        success = true;
        message = "Temp Mail enabled for user";

        // Log action
        await AdminAuditLog.create({
          action: "temp_mail_enabled",
          adminIp: getClientIp(req),
          targetUserId: user._id,
          targetUserEmail: user.email,
          details: {},
          success: true,
        }).catch(() => {});
      } else {
        message = "Temp Mail is already enabled for this user";
        success = true;
      }
    } else {
      return NextResponse.json(
        { error: "Unknown action" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success,
      message,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        status: user.status,
        tempMailDisabled: user.tempMailDisabled,
        plan: user.plan,
        maxJobs: user.maxJobs,
        maxExecutions: user.maxExecutions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    logError("admin-user-action", "Failed to perform action on user", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { name, plan, maxJobs, maxExecutions, status, tempMailDisabled } = body as {
      name?: string;
      plan?: string;
      maxJobs?: number;
      maxExecutions?: number;
      status?: "active" | "blocked";
      tempMailDisabled?: boolean;
    };

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (typeof name === "string" && name.trim()) user.name = name.trim();
    if (typeof plan === "string" && plan.trim()) user.plan = plan.trim().toLowerCase();
    if (typeof maxJobs === "number" && maxJobs > 0) user.maxJobs = maxJobs;
    if (typeof maxExecutions === "number" && maxExecutions > 0) user.maxExecutions = maxExecutions;
    if (status === "active" || status === "blocked") user.status = status;
    if (typeof tempMailDisabled === "boolean") user.tempMailDisabled = tempMailDisabled;

    await user.save();

    await AdminAuditLog.create({
      action: "user_updated",
      adminIp: getClientIp(req),
      targetUserId: user._id,
      targetUserEmail: user.email,
      details: {
        plan: user.plan,
        maxJobs: user.maxJobs,
        maxExecutions: user.maxExecutions,
        status: user.status,
        tempMailDisabled: user.tempMailDisabled,
      },
      success: true,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `User ${user.email} updated successfully`,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        status: user.status,
        tempMailDisabled: user.tempMailDisabled,
        plan: user.plan,
        maxJobs: user.maxJobs,
        maxExecutions: user.maxExecutions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    logError("admin-user-update", "Failed to update user", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 }
      );
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userEmail = user.email;
    const userId = user._id;

    // Delete user's mailboxes and emails
    const mailboxes = await TemporaryMailbox.find({
      ownerId: userId.toString(),
    });
    const mailboxIds = mailboxes.map((m) => m._id);

    if (mailboxIds.length > 0) {
      await TemporaryEmail.deleteMany({ mailboxId: { $in: mailboxIds } });
      await TemporaryMailbox.deleteMany({ _id: { $in: mailboxIds } });
    }

    // Delete user's cron jobs and executions
    const jobIds = await CronJob.distinct("_id", { userId });
    if (jobIds.length > 0) {
      await JobExecution.deleteMany({ jobId: { $in: jobIds } });
      await CronJob.deleteMany({ userId });
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    // Log action
    await AdminAuditLog.create({
      action: "user_deleted",
      adminIp: getClientIp(req),
      targetUserId: userId,
      targetUserEmail: userEmail,
      details: {},
      success: true,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `User ${userEmail} deleted successfully`,
    });
  } catch (error) {
    logError("admin-user-delete", "Failed to delete user", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
