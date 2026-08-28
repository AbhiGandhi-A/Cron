import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId, readJsonBody } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { AiIssue, AiConversation } from "@/lib/models";
import { chatInputSchema } from "@/lib/ai/validate";
import { callGrok, GrokUnavailableError, grokErrorMessage, resolveReasoningModel } from "@/lib/ai/grok";
import { runWebResearch, shouldUseResearch } from "@/lib/ai/router";
import { buildChatSystemPrompt, buildChatPrompt, buildIssueTextForChat } from "@/lib/ai/prompts";
import { serializeIssue } from "@/lib/ai/issues";
import { chatDedupeKey, findChatDedupe, storeChatDedupe } from "@/lib/ai/optimizer";
import type { NormalizedErrorInput } from "@/lib/ai/types";

const MAX_MESSAGES = 20;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`ai:chat:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (limited) return limited;

    await connectDb();

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, 64 * 1024);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = chatInputSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { issueId, message, context } = result.data;

    const dedupeKey = chatDedupeKey(userId, issueId, message);
    const cachedReply = findChatDedupe(dedupeKey);
    if (cachedReply) {
      return NextResponse.json(cachedReply);
    }

    let issue: Awaited<ReturnType<typeof AiIssue.findOne>> | null = null;
    let history: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (issueId) {
      if (!validateObjectId(issueId)) {
        return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
      }
      issue = await AiIssue.findOne({ _id: issueId, userId }).exec();
      if (!issue) {
        return NextResponse.json({ error: "Issue not found" }, { status: 404 });
      }
      history = (issue.conversation || []).slice(-MAX_MESSAGES);
    }

    let issueText = "";
    if (issue) {
      const normalized: NormalizedErrorInput = {
        title: issue.title,
        message: issue.message,
        errorType: issue.errorType,
        endpoint: issue.endpoint,
        method: issue.method,
        status: issue.status,
        stack: issue.stack,
        kind: issue.kind,
        severity: issue.severity,
        source: issue.source,
        page: issue.page,
        response: issue.response,
        context: issue.context ?? (context as Record<string, unknown> | null | undefined) ?? null,
      };
      issueText = buildIssueTextForChat(normalized);
    }

    const researchTopics: string[] = [];
    if (shouldUseResearch({ question: message, ...(issue ? { title: issue.title, message: issue.message } : {}) })) {
      const topic = issue ? `${issue.title} — ${issue.message}` : message;
      const summary = await runWebResearch(topic);
      if (summary) researchTopics.push(summary);
    }

    let systemPrompt = buildChatSystemPrompt();
    if (researchTopics.length) {
      systemPrompt = `${systemPrompt}\n\nWEB RESEARCH BRIEF (from the web-research analyst; reconcile it with the provided context):\n${researchTopics.join("\n---\n")}`;
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: buildChatPrompt(issueText, history) },
      { role: "user" as const, content: message },
    ];

    let reply: string;
    let aiAvailable = true;
    try {
      reply = await callGrok(messages, { model: resolveReasoningModel(), timeoutMs: 30_000, maxTokens: 900 });
    } catch (error) {
      aiAvailable = false;
      reply =
        error instanceof GrokUnavailableError
          ? "AI assistant is temporarily unavailable (provider is not configured). Please try again later."
          : grokErrorMessage(error);
    }

    const now = new Date();

    if (issue) {
      const updated = [...(issue.conversation || []).slice(-(MAX_MESSAGES - 2)), { role: "user" as const, content: message, createdAt: now }, { role: "assistant" as const, content: reply, createdAt: now }];
      issue.conversation = updated;
      await issue.save();
      const body: Record<string, unknown> = {
        reply,
        aiAvailable,
        conversation: updated.slice(-MAX_MESSAGES),
        issue: serializeIssue(issue),
      };
      storeChatDedupe(dedupeKey, body);
      return NextResponse.json(body);
    }

    const conversation = await AiConversation.create({
      userId,
      issueId: null,
      kind: "assistant",
      messages: [
        { role: "user", content: message, createdAt: now },
        { role: "assistant", content: reply, createdAt: now },
      ],
    });

    const body: Record<string, unknown> = {
      reply,
      aiAvailable,
      conversationId: conversation._id.toString(),
      conversation: conversation.messages.slice(-MAX_MESSAGES),
    };
    storeChatDedupe(dedupeKey, body);
    return NextResponse.json(body);
  } catch (error) {
    logError("ai-chat", "Failed to run AI chat", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}