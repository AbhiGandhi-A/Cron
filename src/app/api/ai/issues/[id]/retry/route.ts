import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { AiIssue } from "@/lib/models";
import { serializeIssue } from "@/lib/ai/issues";
import { executeHttpRequest } from "@/lib/execution-core";

const STORED_RESULT_BODY_BYTES = 20_000;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`ai:retry:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
    }

    const issue = await AiIssue.findOne({ _id: id, userId }).exec();
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    if (!issue.retryable || !issue.retryable.url) {
      return NextResponse.json(
        { error: "This issue has no retryable operation" },
        { status: 400 }
      );
    }

    const config = issue.retryable;
    const result = await executeHttpRequest({
      url: config.url,
      method: config.method,
      headers: config.headers ?? undefined,
      body: config.body,
      bodyType: config.bodyType ?? "json",
      timeout: config.timeout || 30000,
      expectedStatus: config.expectedStatus ?? null,
    });

    const storedResult = {
      status: result.status,
      httpStatus: result.httpStatus,
      responseTime: result.responseTime,
      errorMessage: result.errorMessage,
      responseBody: result.responseBody
        ? result.responseBody.substring(0, STORED_RESULT_BODY_BYTES)
        : null,
      responseSize: result.responseSize,
      timedOut: result.timedOut,
      retriedAt: new Date().toISOString(),
    };

    issue.retryable = { ...config, result: storedResult };
    await issue.save();

    return NextResponse.json({
      result: storedResult,
      issue: serializeIssue(issue),
    });
  } catch (error) {
    logError("ai-retry", "Failed to retry operation", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}