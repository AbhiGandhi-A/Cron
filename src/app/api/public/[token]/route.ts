import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import connectDb from "@/lib/mongodb";
import { GeneratedApi } from "@/lib/models";
import { enforceRateLimit, logError } from "@/lib/security";
import { buildCorsHeaders } from "@/lib/generated-apis/helpers";
import { verifyApiAuth } from "@/lib/generated-apis/auth";
import { executePublicApi, type PublicApiRequest } from "@/lib/generated-apis/executor";

const MAX_INPUT_BODY_BYTES = 256 * 1024;

function withCors(response: NextResponse, api: { cors: { enabled: boolean; origins: string[] }; methods: string[] }, origin: string | null): NextResponse {
  const headers = buildCorsHeaders(api.cors, api.methods, origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

async function loadApi(token: string) {
  await connectDb();
  return GeneratedApi.findOne({ agentId: token }).exec();
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handlePublicRequest(req, ctx);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handlePublicRequest(req, ctx);
}

export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handlePublicRequest(req, ctx);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handlePublicRequest(req, ctx);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handlePublicRequest(req, ctx);
}

export async function OPTIONS(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const api = await loadApi(token);
    if (!api) return new NextResponse(null, { status: 404 });

    const origin = req.headers.get("origin");
    const headers = buildCorsHeaders(api.cors, api.methods, origin);
    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    logError("ai-public-api", "Failed CORS preflight", error);
    return new NextResponse(null, { status: 500 });
  }
}

async function handlePublicRequest(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await ctx.params;

    const api = await loadApi(token);
    if (!api || !api.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const origin = req.headers.get("origin");

    const limited = enforceRateLimit(
      `api-public:${token}`,
      api.rateLimit.limit || 30,
      api.rateLimit.windowMs || 60_000
    );
    if (limited) {
      return withCors(limited, api, origin);
    }

    const authorized = await verifyApiAuth(api, req, {
      resolvePrivateToken: async () =>
        getToken({
          req: req as NextRequest,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "",
          secureCookie: process.env.NODE_ENV === "production",
        }),
    });

    if (!authorized) {
      if (api.auth.mode === "bearer") {
        return withCors(
          NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } }),
          api,
          origin
        );
      }
      return withCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), api, origin);
    }

    if (!api.methods.includes(req.method)) {
      return withCors(
        NextResponse.json(
          { error: "Method not allowed" },
          { status: 405, headers: { Allow: [...new Set([...api.methods, "OPTIONS"])].join(", ") } }
        ),
        api,
        origin
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_INPUT_BODY_BYTES) {
      return withCors(NextResponse.json({ error: "Request body too large" }, { status: 413 }), api, origin);
    }

    const publicRequest: PublicApiRequest = {
      method: req.method,
      searchParams: new URL(req.url).searchParams,
      rawBody,
      contentType: req.headers.get("content-type"),
    };

    const outcome = await executePublicApi(api, publicRequest);

    const headers: Record<string, string> = { ...outcome.headers };
    let response: NextResponse;
    if (typeof outcome.body === "string" && !outcome.contentType.includes("json")) {
      response = new NextResponse(outcome.body, { status: outcome.httpStatus, headers: { ...headers, "Content-Type": outcome.contentType } });
    } else {
      response = NextResponse.json(outcome.body, { status: outcome.httpStatus, headers });
    }

    return withCors(response, api, origin);
  } catch (error) {
    logError("ai-public-api", "Failed to handle public API request", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}