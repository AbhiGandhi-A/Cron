import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { buildMonitoringSummary } from "@/lib/ai/issues";

export async function GET(_req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`ai:monitoring:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const summary = await buildMonitoringSummary(userId);

    return NextResponse.json(summary);
  } catch (error) {
    logError("ai-monitoring", "Failed to load monitoring summary", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}