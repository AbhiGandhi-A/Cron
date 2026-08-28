import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeNextRunAt, getUpcomingRuns, isValidTimeZone } from "@/lib/cron";
import { enforceRateLimit, getAuthenticatedIdentifier, getCronMinInterval, logError, validateCronExpression } from "@/lib/security";

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

    const limited = enforceRateLimit(`jobs:preview:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const schedule = (searchParams.get("schedule") || "").trim();
    const timezone = (searchParams.get("timezone") || "UTC").trim();
    const rawCount = parseInt(searchParams.get("count") || "5", 10);
    const count = Number.isFinite(rawCount) ? Math.min(Math.max(1, rawCount), 50) : 5;

    if (!schedule) {
      return NextResponse.json({ error: "Schedule is required" }, { status: 400 });
    }

    if (!isValidTimeZone(timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    const minInterval = getCronMinInterval();
    if (!validateCronExpression(schedule, minInterval)) {
      return NextResponse.json({ error: "Invalid cron expression or interval too frequent" }, { status: 400 });
    }

    const upcoming = getUpcomingRuns(schedule, timezone, count);

    // nextRunAt is computed by the exact same function used on job create/edit.
    const nextRunAt = computeNextRunAt(schedule, timezone);

    return NextResponse.json({
      schedule,
      timezone,
      nextRunAt: nextRunAt.toISOString(),
      upcoming: upcoming.map((d) => d.toISOString()),
    });
  } catch (error) {
    logError("jobs-preview", "Failed to preview schedule", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}