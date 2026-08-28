import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, readJsonBody, sanitizeForLog } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { callGrokJson, isGrokConfigured, resolveReasoningModel, GrokUnavailableError, GrokTimeoutError, GrokHttpError, GrokMalformedError } from "@/lib/ai/grok";
import { buildCreateApiSystemPrompt, buildCreateApiPrompt } from "@/lib/ai/prompts";
import { generateApiInputSchema } from "@/lib/ai/validate";
import { createGeneratedApi, serializeGeneratedApi } from "@/lib/generated-apis/service";
import { GeneratedApi } from "@/lib/models";

const MAX_DESCRIPTION_LENGTH = 8000;
const MAX_APIS_PER_USER = 20;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`ai:create-api:${getAuthenticatedIdentifier(userId)}`, 5, 60_000);
    if (limited) return limited;

    if (!isGrokConfigured()) {
      return NextResponse.json(
        { error: "AI is not configured. Set GROQ_API_KEY in the environment to generate APIs." },
        { status: 503 }
      );
    }

    await connectDb();

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, 64 * 1024);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const description = (parsed as { description?: unknown })?.description;
    if (typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "A description is required" }, { status: 400 });
    }
    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: "Description is too long" }, { status: 400 });
    }

    const existing = await GeneratedApi.countDocuments({ userId });
    if (existing >= MAX_APIS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_APIS_PER_USER} generated APIs reached` },
        { status: 429 }
      );
    }

    let raw: Record<string, unknown>;
    let validated: ReturnType<typeof generateApiInputSchema.safeParse>;
    const apiOptions = { timeoutMs: 45_000, maxTokens: 1600, model: resolveReasoningModel() } as const;
    const systemPrompt = buildCreateApiSystemPrompt();
    const userPrompt = buildCreateApiPrompt(description.trim());
    try {
      raw = await callGrokJson(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        apiOptions
      );
      validated = generateApiInputSchema.safeParse(raw);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((item) => `${item.path.join(".") || "."}: ${item.message}`)
          .join("; ")
          .slice(0, 500);
        raw = await callGrokJson(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            { role: "user", content: `Your previous configuration was rejected. Fix these validation errors and return ONLY the corrected single JSON object:\n${issues}` },
          ],
          apiOptions
        );
        validated = generateApiInputSchema.safeParse(raw);
      }
    } catch (error) {
      if (error instanceof GrokUnavailableError) {
        return NextResponse.json({ error: "AI is not configured. Set GROQ_API_KEY in the environment." }, { status: 503 });
      }
      if (error instanceof GrokTimeoutError || error instanceof GrokHttpError || error instanceof GrokMalformedError) {
        return NextResponse.json({ error: "The AI could not generate a valid API configuration. Please try again." }, { status: 502 });
      }
      logError("ai-create-api", "AI generation failed", error);
      return NextResponse.json({ error: "The AI could not generate a valid API configuration. Please try again." }, { status: 502 });
    }

    if (!validated.success) {
      const issue = sanitizeForLog(
        validated.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; "),
        500
      );
      logError("ai-create-api", "AI produced an invalid configuration", new Error(issue));
      return NextResponse.json(
        { error: "The AI produced an invalid API configuration. Please try again." },
        { status: 422 }
      );
    }

    const { doc, createdSecret } = await createGeneratedApi(userId, validated.data);

    return NextResponse.json(
      {
        api: serializeGeneratedApi(doc),
        createdSecret,
      },
      { status: 201 }
    );
  } catch (error) {
    logError("ai-create-api", "Failed to create generated API", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}