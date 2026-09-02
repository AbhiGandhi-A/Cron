import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution } from "@/lib/models";
import { logError } from "@/lib/security";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const job = await CronJob.findById(id).lean();
    if (!job) {
      return NextResponse.json({ error: "Cron job not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10)
    );
    const skip = (page - 1) * limit;

    const [executions, total] = await Promise.all([
      JobExecution.find({ jobId: id })
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      JobExecution.countDocuments({ jobId: id }),
    ]);

    return NextResponse.json({
      job: {
        _id: job._id,
        name: job.name,
        url: job.url,
        method: job.method,
        schedule: job.schedule,
        isActive: job.isActive,
      },
      executions: executions.map((exec) => ({
        id: exec._id.toString(),
        status: exec.status,
        httpStatus: exec.httpStatus,
        responseTime: exec.responseTime,
        errorMessage: exec.errorMessage,
        retryNumber: exec.retryNumber,
        startedAt: exec.startedAt,
        completedAt: exec.completedAt,
        requestUrl: exec.requestUrl,
        requestMethod: exec.requestMethod,
        requestBody: exec.requestBody,
        requestHeaders: exec.requestHeaders,
        queryParams: exec.queryParams,
        responseBody: exec.responseBody,
        responseHeaders: exec.responseHeaders,
        responseSize: exec.responseSize,
        triggeredBy: exec.triggeredBy,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logError("admin-job-executions", "Failed to get job executions", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}