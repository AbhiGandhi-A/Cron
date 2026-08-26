import { NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";
import { TestUrl, TestUrlRequest } from "@/lib/models";
import { enforceRateLimit, logError, redactHeaders } from "@/lib/security";

const SENSITIVE_INCOMING_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);

const MAX_BODY_BYTES = 100 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return handleRequest(req, params);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return handleRequest(req, params);
}

async function handleRequest(
  req: Request,
  paramsPromise: Promise<{ token: string }>
) {
  try {
    await connectDb();

    const { token } = await paramsPromise;

    const rateLimited = enforceRateLimit(`test:${token}`, 30, 60_000);
    if (rateLimited) return rateLimited;

    const testUrl = await TestUrl.findOne({ token }).lean();

    if (!testUrl || !testUrl.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    let body: unknown = null;
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }

    const url = new URL(req.url);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    const rawHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (!SENSITIVE_INCOMING_HEADERS.has(key.toLowerCase())) {
        rawHeaders[key] = value;
      } else {
        rawHeaders[key] = "***REDACTED***";
      }
    });

    const contentType = req.headers.get("content-type") || null;

    await TestUrlRequest.create({
      testUrlId: testUrl._id,
      method: req.method,
      url: req.url,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : null,
      headers: rawHeaders,
      body,
      contentType,
      requestSize: rawBody.length,
      receivedAt: new Date(),
    });

    return NextResponse.json({ success: true, message: "Request received" });
  } catch (error) {
    logError("test-webhook", "Failed to process test request", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
