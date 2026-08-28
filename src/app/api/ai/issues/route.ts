import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validatePaginationParams, readJsonBody } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { AiIssue } from "@/lib/models";
import { upsertIssue, serializeIssue } from "@/lib/ai/issues";
import { analyzeInputSchema } from "@/lib/ai/validate";
import { sanitizeIssueInput } from "@/lib/monitoring/normalize";

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

    const limited = enforceRateLimit(`ai:issues:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = validatePaginationParams(searchParams);

    const filter = (searchParams.get("status") || "open").toLowerCase();
    const query: Record<string, unknown> = { userId };

    if (filter === "open") query.resolved = false;
    else if (filter === "resolved") query.resolved = true;

    const rawSeverity = searchParams.get("severity");
    if (rawSeverity && ["low", "medium", "high", "critical"].includes(rawSeverity)) {
      query.severity = rawSeverity;
    }

    const rawQ = searchParams.get("q");
    if (rawQ && rawQ.trim()) {
      const escaped = rawQ.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { message: { $regex: escaped, $options: "i" } },
        { endpoint: { $regex: escaped, $options: "i" } },
      ];
    }

    const [issues, total] = await Promise.all([
      AiIssue.find(query).sort({ lastSeenAt: -1 }).skip(skip).limit(limit).lean(),
      AiIssue.countDocuments(query),
    ]);

    return NextResponse.json({
      issues: issues.map((doc) => serializeIssue(doc as never)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logError("ai-issues", "Failed to list issues", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`ai:issues-create:${getAuthenticatedIdentifier(userId)}`, 60, 60_000);
    if (limited) return limited;

    await connectDb();

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, 64 * 1024);
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

    return NextResponse.json({ issue: serializeIssue(issue) });
  } catch (error) {
    logError("ai-issues-create", "Failed to store issue", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`ai:issues-clear:${getAuthenticatedIdentifier(userId)}`, 5, 60_000);
    if (limited) return limited;

    await connectDb();

    const query: Record<string, unknown> = { userId };

    let parsed: { status?: string } = {};
    try {
      parsed = (await readJsonBody(req, 4096)) as { status?: string };
    } catch {
      parsed = {};
    }

    if (parsed.status === "resolved") query.resolved = true;

    const result = await AiIssue.deleteMany(query);

    return NextResponse.json({ deleted: result.deletedCount ?? 0 });
  } catch (error) {
    logError("ai-issues-clear", "Failed to clear issues", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}