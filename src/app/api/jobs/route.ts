import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { CronJob, User } from "@/lib/models";
import { createJobSchema } from "@/lib/validation";
import cronParser from "cron-parser";
import { enforceRateLimit, getAuthenticatedIdentifier, getCronMinInterval, logError, readJsonBody, sanitizeObjectForStorage, validateOutboundUrl, validateCronExpression, validatePaginationParams } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`jobs:list:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = validatePaginationParams(searchParams);

    const [jobs, total] = await Promise.all([
      CronJob.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CronJob.countDocuments({ userId }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logError("jobs-list", "Failed to list jobs", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDb();

    const rateLimited = enforceRateLimit(`jobs:create:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (rateLimited) return rateLimited;

    const body = await readJsonBody(req, 256 * 1024);
    const result = createJobSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    await validateOutboundUrl(result.data.url);

    const minInterval = getCronMinInterval();
    if (!validateCronExpression(result.data.schedule, minInterval)) {
      return NextResponse.json({ error: "Invalid cron expression or interval too frequent" }, { status: 400 });
    }

    const userJobCount = await CronJob.countDocuments({ userId });

    const user = await User.findById(userId).lean();

    if (user && userJobCount >= user.maxJobs) {
      return NextResponse.json(
        { error: `Job limit reached (${user.maxJobs}). Upgrade your plan.` },
        { status: 403 }
      );
    }

    const data = result.data;

    let nextRunAt: Date | null = null;
    try {
      const interval = cronParser.parseExpression(data.schedule);
      nextRunAt = interval.next().toDate();
    } catch {
      return NextResponse.json(
        { error: "Invalid cron expression" },
        { status: 400 }
      );
    }

    const job = await CronJob.create({
      userId,
      name: data.name,
      url: data.url,
      method: data.method,
      headers: data.headers || null,
      body: sanitizeObjectForStorage(data.body || null),
      schedule: data.schedule,
      isActive: data.isActive,
      timeout: data.timeout,
      retryCount: data.retryCount,
      nextRunAt,
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    logError("jobs-create", "Failed to create job", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
