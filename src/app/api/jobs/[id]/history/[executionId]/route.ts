import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, redactHeaders, validateObjectId } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`jobs:execution:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id, executionId } = await params;

    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }
    if (!validateObjectId(executionId)) {
      return NextResponse.json({ error: "Invalid execution ID" }, { status: 400 });
    }

    const job = await CronJob.findOne({ _id: id, userId }).lean();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const execution = await JobExecution.findOne({ _id: executionId, jobId: id }).lean();

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    const sanitized = {
      ...execution,
      id: execution._id.toString(),
      requestHeaders: redactHeaders(execution.requestHeaders),
      responseHeaders: redactHeaders(execution.responseHeaders),
    };

    return NextResponse.json({ execution: sanitized });
  } catch (error) {
    logError("job-execution-detail", "Failed to get execution", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
