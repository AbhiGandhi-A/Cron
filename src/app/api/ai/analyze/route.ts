import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, readJsonBody } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { AiIssue } from "@/lib/models";
import { analyzeInputSchema } from "@/lib/ai/validate";
import { sanitizeIssueInput } from "@/lib/monitoring/normalize";
import { upsertIssue, serializeIssue } from "@/lib/ai/issues";
import { runAiAnalysis } from "@/lib/ai/analyze";

const ANALYSIS_RATE_LIMIT = 10;
const ANALYSIS_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    await connectDb();

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = analyzeInputSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const sanitized = sanitizeIssueInput({
      title: result.data.title,
      message: result.data.message,
      errorType: result.data.errorType,
      endpoint: result.data.endpoint,
      method: result.data.method,
      status: result.data.status,
      stack: result.data.stack,
      kind: result.data.kind,
      severity: result.data.severity,
      source: result.data.source,
      page: result.data.page,
      userAgent: result.data.userAgent,
      response: result.data.response,
      context: result.data.context ?? null,
      perf: result.data.perf ?? null,
      retryable: result.data.retryable ?? null,
    });

    const { issue } = await upsertIssue(userId, sanitized);

    const limited = enforceRateLimit(`ai:analyze:${getAuthenticatedIdentifier(userId)}`, ANALYSIS_RATE_LIMIT, ANALYSIS_WINDOW_MS);
    if (limited) {
      return NextResponse.json(
        {
          error: "AI analysis limit reached. The error was still recorded.",
          issue: serializeIssue(issue),
        },
        { status: 429 }
      );
    }

    let issueDoc = issue;
    if (!issueDoc.analysis || !issueDoc.analysis.available) {
      const outcome = await runAiAnalysis(sanitized);
      const updated = await AiIssue.findByIdAndUpdate(
        issueDoc._id,
        { $set: { analysis: outcome.analysis } },
        { new: true }
      ).exec();
      if (!updated) {
        return NextResponse.json({ error: "Issue not found" }, { status: 404 });
      }
      issueDoc = updated;
    }

    return NextResponse.json({
      issue: serializeIssue(issueDoc),
      analysis: issueDoc.analysis,
    });
  } catch (error) {
    logError("ai-analyze", "Failed to analyze error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}