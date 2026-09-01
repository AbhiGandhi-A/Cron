import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { AdminAuditLog } from "@/lib/models";
import { logError } from "@/lib/security";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const action = searchParams.get("action") || "";
    const days = parseInt(searchParams.get("days") || "7", 10);

    const skip = (page - 1) * Math.min(limit, 100);

    // Build query
    const query: Record<string, unknown> = {};

    if (action) {
      query.action = action;
    }

    // Filter by date
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    query.createdAt = { $gte: startDate };

    // Get total count
    const total = await AdminAuditLog.countDocuments(query);

    // Get logs
    const logs = await AdminAuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean();

    // Get unique actions for filter suggestions
    const actions = await AdminAuditLog.distinct("action", {
      createdAt: { $gte: startDate },
    });

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / Math.min(limit, 100)),
      },
      actions,
    });
  } catch (error) {
    logError("admin-activity", "Failed to fetch activity logs", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
