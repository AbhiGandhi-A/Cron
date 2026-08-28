import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, JobExecution } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId, validatePaginationParams } from "@/lib/security";

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

    const limited = enforceRateLimit(`jobs:history:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
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

    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = validatePaginationParams(searchParams);

    const filter = (searchParams.get("filter") || "all").toLowerCase();

    const query: Record<string, unknown> = { jobId: id };
    switch (filter) {
      case "success":
        query.status = "SUCCESS";
        break;
      case "failed":
        query.status = "FAILED";
        break;
      case "timeout":
        query.status = "TIMEOUT";
        break;
      case "4xx":
        query.httpStatus = { $gte: 400, $lt: 500 };
        break;
      case "5xx":
        query.httpStatus = { $gte: 500 };
        break;
      case "all":
      default:
        break;
    }

    const [executions, total] = await Promise.all([
      JobExecution.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      JobExecution.countDocuments(query),
    ]);

    return NextResponse.json({
      executions: executions.map((exec) => ({
        ...exec,
        id: exec._id.toString(),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logError("job-history", "Failed to get job history", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
