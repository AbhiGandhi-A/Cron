import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { isActive } = body as { isActive?: boolean };

    const job = await CronJob.findById(id);
    if (!job) {
      return NextResponse.json({ error: "Cron job not found" }, { status: 404 });
    }

    const nextIsActive = typeof isActive === "boolean" ? isActive : !job.isActive;
    job.isActive = nextIsActive;
    await job.save();

    return NextResponse.json({
      success: true,
      message: nextIsActive ? "Cron job enabled" : "Cron job disabled",
      job: {
        _id: job._id,
        name: job.name,
        url: job.url,
        method: job.method,
        isActive: job.isActive,
      },
    });
  } catch (error) {
    logError("admin-job-toggle", "Failed to toggle cron job", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const job = await CronJob.findById(id);
    if (!job) {
      return NextResponse.json({ error: "Cron job not found" }, { status: 404 });
    }

    await JobExecution.deleteMany({ jobId: job._id });
    await CronJob.findByIdAndDelete(job._id);

    return NextResponse.json({
      success: true,
      message: `Cron job ${job.name || id} deleted successfully`,
    });
  } catch (error) {
    logError("admin-job-delete", "Failed to delete cron job", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}