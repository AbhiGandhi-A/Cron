import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const rateLimited = enforceRateLimit(`jobs:toggle:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (rateLimited) return rateLimited;

    const job = await CronJob.findOne({ _id: id, userId }).lean();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const updated = await CronJob.findByIdAndUpdate(
      id,
      { isActive: !job.isActive },
      { new: true }
    ).lean();

    return NextResponse.json({
      job: updated,
      message: updated?.isActive ? "Job enabled" : "Job disabled",
    });
  } catch (error) {
    logError("job-toggle", "Failed to toggle job", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
