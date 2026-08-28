import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError } from "@/lib/security";
import { isGrokConfigured, resolveReasoningModel, resolveResearchModel } from "@/lib/ai/grok";
import { usageSnapshot } from "@/lib/ai/optimizer";

export async function GET(_req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`ai:status:${getAuthenticatedIdentifier(userId)}`, 60, 60_000);
    if (limited) return limited;

    const reasoningModel = resolveReasoningModel();
    return NextResponse.json({
      provider: "Groq",
      model: reasoningModel,
      reasoningModel,
      researchModel: resolveResearchModel(),
      configured: isGrokConfigured(),
      analysisEnabled: process.env.AI_ANALYSIS_ENABLED !== "false",
      usage: usageSnapshot(),
    });
  } catch (error) {
    logError("ai-status", "Failed to load AI status", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}