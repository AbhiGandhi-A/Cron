import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution } from "@/lib/models";
import { updateJobSchema } from "@/lib/validation";
import cronParser from "cron-parser";
import { enforceRateLimit, getCronMinInterval, getAuthenticatedIdentifier, logError, readJsonBody, sanitizeObjectForStorage, validateCronExpression, validateObjectId, validateOutboundUrl } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`jobs:detail:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const job = await CronJob.findOne({ _id: id, userId }).lean();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const executions = await JobExecution.find({ jobId: id })
      .sort({ startedAt: -1 })
      .limit(10)
      .lean();

    return NextResponse.json({
      job: {
        ...job,
        executions: executions.map((exec) => ({
          ...exec,
          id: exec._id.toString(),
        })),
      },
    });
  } catch (error) {
    logError("job-detail", "Failed to get job", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
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

    const existing = await CronJob.findOne({ _id: id, userId }).lean();

    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const rateLimited = enforceRateLimit(`jobs:update:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (rateLimited) return rateLimited;

    const body = await readJsonBody(req, 256 * 1024);
    const result = updateJobSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = result.data;
    if (data.url) {
      await validateOutboundUrl(data.url);
    }
    if (data.schedule) {
      const minInterval = getCronMinInterval();
      if (!validateCronExpression(data.schedule, minInterval)) {
        return NextResponse.json({ error: "Invalid cron expression or interval too frequent" }, { status: 400 });
      }
    }
    let nextRunAt = existing.nextRunAt;

    if (data.schedule && data.schedule !== existing.schedule) {
      try {
        const interval = cronParser.parseExpression(data.schedule);
        nextRunAt = interval.next().toDate();
      } catch {
        return NextResponse.json(
          { error: "Invalid cron expression" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.url !== undefined) updateData.url = data.url;
    if (data.method !== undefined) updateData.method = data.method;
    if (data.headers !== undefined) updateData.headers = data.headers || null;
    if (data.body !== undefined) updateData.body = sanitizeObjectForStorage(data.body || null);
    if (data.schedule !== undefined) {
      updateData.schedule = data.schedule;
      updateData.nextRunAt = nextRunAt;
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.bodyType !== undefined) updateData.bodyType = data.bodyType;
    if (data.queryParams !== undefined) updateData.queryParams = data.queryParams || null;
    if (data.notifications !== undefined) updateData.notifications = data.notifications || undefined;
    if (data.timeout !== undefined) updateData.timeout = data.timeout;
    if (data.retryCount !== undefined) updateData.retryCount = data.retryCount;

    const job = await CronJob.findByIdAndUpdate(id, updateData, {
      new: true,
    }).lean();

    return NextResponse.json({ job });
  } catch (error) {
    logError("job-update", "Failed to update job", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`jobs:delete:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const existing = await CronJob.findOne({ _id: id, userId }).lean();

    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    await Promise.all([
      CronJob.findByIdAndDelete(id),
      JobExecution.deleteMany({ jobId: id }),
    ]);

    return NextResponse.json({ message: "Job deleted" });
  } catch (error) {
    logError("job-delete", "Failed to delete job", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
