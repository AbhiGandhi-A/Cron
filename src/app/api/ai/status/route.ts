import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError } from "@/lib/security";
import { isGrokConfigured, DEFAULT_GROK_MODEL } from "@/lib/ai/grok";

export async function GET(_req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`ai:status:${getAuthenticatedIdentifier(userId)}`, 60, 60_000);
    if (limited) return limited;

    return NextResponse.json({
      provider: "Groq",
      model: process.env.GROK_MODEL || DEFAULT_GROK_MODEL,
      configured: isGrokConfigured(),
      analysisEnabled: process.env.AI_ANALYSIS_ENABLED !== "false",
    });
  } catch (error) {
    logError("ai-status", "Failed to load AI status", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}