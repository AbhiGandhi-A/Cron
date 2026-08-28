import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  enforceRateLimit,
  getAuthenticatedIdentifier,
  logError,
  redactHeaders,
  sanitizeUrlForLog,
  validateOutboundUrl,
} from "@/lib/security";

const MAX_RESPONSE_BODY_BYTES = 100_000;
const MAX_ERROR_MESSAGE_BYTES = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const rateLimited = enforceRateLimit(
      `api-tester:${getAuthenticatedIdentifier(userId)}`,
      30,
      60_000
    );
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const { method, url, headers, queryParams, bodyType, body: requestBody } = body as {
      method: string;
      url: string;
      headers?: Record<string, string>;
      queryParams?: Record<string, string>;
      bodyType?: string;
      body?: unknown;
    };

    if (!method || !url) {
      return NextResponse.json({ error: "Method and URL are required" }, { status: 400 });
    }

    const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    if (!allowedMethods.includes(method.toUpperCase())) {
      return NextResponse.json({ error: "Invalid HTTP method" }, { status: 400 });
    }

    let validatedUrl: URL;
    try {
      validatedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(validatedUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP/HTTPS URLs are allowed" }, { status: 400 });
    }

    await validateOutboundUrl(url);

    if (queryParams && typeof queryParams === "object") {
      for (const [key, value] of Object.entries(queryParams)) {
        if (typeof key === "string" && typeof value === "string") {
          validatedUrl.searchParams.set(key, value);
        }
      }
    }

    const fetchHeaders: Record<string, string> = {};
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof key === "string" && typeof value === "string" && key.trim()) {
          fetchHeaders[key] = value;
        }
      }
    }

    const hasBody = ["POST", "PUT", "PATCH"].includes(method.toUpperCase());
    if (hasBody && !fetchHeaders["Content-Type"] && bodyType !== "none") {
      if (bodyType === "json") {
        fetchHeaders["Content-Type"] = "application/json";
      } else if (bodyType === "form") {
        fetchHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      } else {
        fetchHeaders["Content-Type"] = "text/plain";
      }
    }

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: fetchHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (hasBody && bodyType !== "none" && requestBody != null) {
      if (bodyType === "json" && typeof requestBody === "string") {
        fetchOptions.body = requestBody;
      } else if (bodyType === "form" && typeof requestBody === "object") {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(requestBody as Record<string, string>)) {
          params.set(k, v);
        }
        fetchOptions.body = params.toString();
      } else if (bodyType === "text" && typeof requestBody === "string") {
        fetchOptions.body = requestBody;
      } else {
        fetchOptions.body = JSON.stringify(requestBody);
      }
    }

    const startTime = Date.now();

    try {
      const response = await fetch(validatedUrl.toString(), fetchOptions);

      if (response.url && response.url !== validatedUrl.toString()) {
        try {
          await validateOutboundUrl(response.url);
        } catch {
          return NextResponse.json({
            status: "FAILED",
            httpStatus: response.status,
            responseTime: Date.now() - startTime,
            errorMessage: "Redirect to blocked destination",
            responseBody: null,
            responseHeaders: null,
            responseSize: 0,
            requestUrl: sanitizeUrlForLog(url),
            requestMethod: method.toUpperCase(),
            requestHeaders: redactHeaders(fetchHeaders),
            sentBody: hasBody && bodyType !== "none" ? requestBody : null,
          });
        }
      }

      const responseTime = Date.now() - startTime;
      const rawBody = await response.text();
      const responseBody =
        rawBody.length > MAX_RESPONSE_BODY_BYTES
          ? rawBody.substring(0, MAX_RESPONSE_BODY_BYTES)
          : rawBody;

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      return NextResponse.json({
        status: response.status < 400 ? "SUCCESS" : "FAILED",
        httpStatus: response.status,
        responseTime,
        errorMessage: null,
        responseBody,
        responseHeaders: redactHeaders(respHeaders),
        responseSize: rawBody.length,
        requestUrl: sanitizeUrlForLog(url),
        fullRequestUrl: validatedUrl.toString(),
        requestMethod: method.toUpperCase(),
        requestHeaders: redactHeaders(fetchHeaders),
        sentBody: hasBody && bodyType !== "none" ? requestBody : null,
      });
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return NextResponse.json({
        status: "FAILED",
        httpStatus: null,
        responseTime,
        errorMessage: errorMessage.substring(0, MAX_ERROR_MESSAGE_BYTES),
        responseBody: null,
        responseHeaders: null,
        responseSize: 0,
        requestUrl: sanitizeUrlForLog(url),
        requestMethod: method.toUpperCase(),
        requestHeaders: redactHeaders(fetchHeaders),
        sentBody: hasBody && bodyType !== "none" ? requestBody : null,
      });
    }
  } catch (error) {
    logError("api-tester", "Failed to execute API test", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
