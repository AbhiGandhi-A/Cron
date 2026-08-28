import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId, readJsonBody } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { AiIssue } from "@/lib/models";
import { serializeIssue } from "@/lib/ai/issues";
import { issueResolveInputSchema } from "@/lib/ai/validate";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`ai:issue:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
    }

    const issue = await AiIssue.findOne({ _id: id, userId }).lean();
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    return NextResponse.json({ issue: serializeIssue(issue as never) });
  } catch (error) {
    logError("ai-issue", "Failed to load issue", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`ai:issue-update:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
    }

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, 4096);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = issueResolveInputSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      resolved: result.data.resolved,
      resolvedAt: result.data.resolved ? new Date() : null,
    };
    if (result.data.severity) {
      update.severity = result.data.severity;
    }

    const issue = await AiIssue.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true }
    ).lean();

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    return NextResponse.json({ issue: serializeIssue(issue as never) });
  } catch (error) {
    logError("ai-issue-update", "Failed to update issue", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}