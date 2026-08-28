import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { GeneratedApi } from "@/lib/models";
import { serializeGeneratedApi } from "@/lib/generated-apis/service";
import { generateAgentId, generateSecret, hashSecret, secretPrefix } from "@/lib/generated-apis/helpers";

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

    const limited = enforceRateLimit(`generated-apis:regenerate:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid API ID" }, { status: 400 });
    }

    const doc = await GeneratedApi.findOne({ _id: id, userId }).exec();
    if (!doc) {
      return NextResponse.json({ error: "Generated API not found" }, { status: 404 });
    }

    const newAgentId = generateAgentId();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const publicUrl = `${baseUrl.replace(/\/$/g, "")}/api/public/${newAgentId}`;

    const update: Record<string, unknown> = {
      agentId: newAgentId,
      publicUrl,
    };

    let createdSecret: string | null = null;
    if (doc.auth.mode === "api-key" || doc.auth.mode === "bearer") {
      createdSecret = generateSecret();
      update["auth.secretHash"] = hashSecret(createdSecret);
      update["auth.secretPrefix"] = secretPrefix(createdSecret);
    }

    const updated = await GeneratedApi.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();

    return NextResponse.json({
      api: updated ? serializeGeneratedApi(updated as never) : null,
      publicUrl,
      createdSecret,
    });
  } catch (error) {
    logError("generated-apis-regenerate", "Failed to regenerate API token", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}