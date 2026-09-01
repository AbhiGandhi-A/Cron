import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();
    const result = await JobExecution.deleteMany({});

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount ?? 0} execution records`,
    });
  } catch (error) {
    logError("admin-clear-logs", "Failed to clear execution logs", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
