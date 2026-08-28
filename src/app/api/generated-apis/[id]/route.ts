import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId, readJsonBody } from "@/lib/security";
import connectDb from "@/lib/mongodb";
import { GeneratedApi } from "@/lib/models";
import { generateApiInputSchema, ALLOWED_AUTH_MODES } from "@/lib/ai/validate";
import { serializeGeneratedApi } from "@/lib/generated-apis/service";
import { generateSecret, hashSecret, secretPrefix, generateAgentId } from "@/lib/generated-apis/helpers";

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

    const limited = enforceRateLimit(`generated-apis:item:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid API ID" }, { status: 400 });
    }

    const doc = await GeneratedApi.findOne({ _id: id, userId }).lean();
    if (!doc) {
      return NextResponse.json({ error: "Generated API not found" }, { status: 404 });
    }

    return NextResponse.json({ api: serializeGeneratedApi(doc as never) });
  } catch (error) {
    logError("generated-apis-item", "Failed to load generated API", error);
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

    const limited = enforceRateLimit(`generated-apis:item:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid API ID" }, { status: 400 });
    }

    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, 64 * 1024);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const body = parsed as {
      name?: string;
      description?: string;
      isActive?: boolean;
      methods?: string[];
      authMode?: string;
      cors?: { enabled?: boolean; origins?: string[] };
      rateLimit?: { limit?: number; windowMs?: number };
      response?: { statusCode?: number; maxSizeBytes?: number; contentType?: string };
      source?: unknown;
    };

    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      update.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 1000) {
        return NextResponse.json({ error: "Invalid description" }, { status: 400 });
      }
      update.description = body.description;
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json({ error: "Invalid isActive" }, { status: 400 });
      }
      update.isActive = body.isActive;
    }

    if (body.methods !== undefined) {
      if (!Array.isArray(body.methods) || body.methods.length === 0 || body.methods.length > 6) {
        return NextResponse.json({ error: "Invalid methods" }, { status: 400 });
      }
      const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
      if (!body.methods.every((method) => allowed.includes(method))) {
        return NextResponse.json({ error: "Invalid methods" }, { status: 400 });
      }
      update.methods = [...new Set(body.methods)];
    }

    if (body.cors !== undefined) {
      const enabled = Boolean(body.cors.enabled);
      const origins = Array.isArray(body.cors.origins)
        ? body.cors.origins.filter((origin) => typeof origin === "string" && origin.length <= 500).slice(0, 10)
        : [];
      update["cors.enabled"] = enabled;
      update["cors.origins"] = origins;
    }

    if (body.rateLimit !== undefined) {
      const limit = Number(body.rateLimit.limit);
      const windowMs = Number(body.rateLimit.windowMs);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        return NextResponse.json({ error: "Invalid rate limit" }, { status: 400 });
      }
      if (!Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 3_600_000) {
        return NextResponse.json({ error: "Invalid rate limit window" }, { status: 400 });
      }
      update["rateLimit.limit"] = limit;
      update["rateLimit.windowMs"] = windowMs;
    }

    if (body.response !== undefined) {
      const statusCode = Number(body.response.statusCode);
      const maxSizeBytes = Number(body.response.maxSizeBytes);
      const contentType = body.response.contentType;
      if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) {
        return NextResponse.json({ error: "Invalid response status" }, { status: 400 });
      }
      if (!Number.isInteger(maxSizeBytes) || maxSizeBytes < 1024 || maxSizeBytes > 500_000) {
        return NextResponse.json({ error: "Invalid response size" }, { status: 400 });
      }
      if (typeof contentType !== "string" || contentType.length > 100) {
        return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
      }
      update["response.statusCode"] = statusCode;
      update["response.maxSizeBytes"] = maxSizeBytes;
      update["response.contentType"] = contentType;
    }

    if (body.source !== undefined) {
      const sourceResult = generateApiInputSchema.shape.source.safeParse(body.source);
      if (!sourceResult.success) {
        return NextResponse.json({ error: "Invalid source configuration" }, { status: 400 });
      }
      const source = sourceResult.data;
      update.source = {
        type: source.type,
        body: source.type === "static" ? (source.body ?? null) : null,
        collection: source.type === "collection" ? (source.collection ?? null) : null,
        fields: source.type === "collection" ? (source.fields ?? []) : [],
        url: source.type === "internal" ? (source.url ?? null) : null,
        method: source.type === "internal" ? (source.method ?? null) : null,
        timeout: source.timeout ?? 30000,
      };
    }

    let createdSecret: string | null = null;
    if (body.authMode !== undefined) {
      if (typeof body.authMode !== "string" || !ALLOWED_AUTH_MODES.includes(body.authMode as never)) {
        return NextResponse.json({ error: "Invalid auth mode" }, { status: 400 });
      }
      const mode = body.authMode as (typeof ALLOWED_AUTH_MODES)[number];

      if (mode === "api-key" || mode === "bearer") {
        createdSecret = generateSecret();
        update["auth.mode"] = mode;
        update["auth.secretHash"] = hashSecret(createdSecret);
        update["auth.secretPrefix"] = secretPrefix(createdSecret);
      } else {
        update["auth.mode"] = mode;
        update["auth.secretHash"] = null;
        update["auth.secretPrefix"] = null;
      }
    }

    const doc = await GeneratedApi.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true }
    ).lean();

    if (!doc) {
      return NextResponse.json({ error: "Generated API not found" }, { status: 404 });
    }

    return NextResponse.json({
      api: serializeGeneratedApi(doc as never),
      createdSecret,
    });
  } catch (error) {
    logError("generated-apis-item", "Failed to update generated API", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`generated-apis:item:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid API ID" }, { status: 400 });
    }

    const doc = await GeneratedApi.findOneAndDelete({ _id: id, userId }).lean();
    if (!doc) {
      return NextResponse.json({ error: "Generated API not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    logError("generated-apis-item", "Failed to delete generated API", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}