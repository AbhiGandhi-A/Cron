import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, readJsonBody } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { GeneratedApi } from "@/lib/models";
import { generateApiInputSchema } from "@/lib/ai/validate";
import { createGeneratedApi, serializeGeneratedApi } from "@/lib/generated-apis/service";

const MAX_APIS_PER_USER = 20;

export async function GET(_req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`generated-apis:list:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const docs = await GeneratedApi.find({ userId }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      apis: docs.map((doc) => serializeGeneratedApi(doc as never)),
    });
  } catch (error) {
    logError("generated-apis", "Failed to list generated APIs", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const limited = enforceRateLimit(`generated-apis:list:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (limited) return limited;

    await connectDb();

    const existing = await GeneratedApi.countDocuments({ userId });
    if (existing >= MAX_APIS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_APIS_PER_USER} generated APIs reached` },
        { status: 429 }
      );
    }

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, 64 * 1024);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = generateApiInputSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { doc, createdSecret } = await createGeneratedApi(userId, result.data);

    return NextResponse.json(
      {
        api: serializeGeneratedApi(doc),
        createdSecret,
      },
      { status: 201 }
    );
  } catch (error) {
    logError("generated-apis", "Failed to create generated API", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}