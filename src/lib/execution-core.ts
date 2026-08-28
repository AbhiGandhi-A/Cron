import crypto from "node:crypto";
import {
  redactHeaders,
  sanitizeForLog,
  sanitizeUrlForLog,
  validateOutboundUrl,
} from "./security-core";

/**
 * Shared HTTP execution engine used by BOTH the Vercel "Run Now" trigger
 * route and the Render scheduler worker. Keeping this logic in one place
 * guarantees scheduled executions and manual executions behave identically.
 *
 * This module must remain framework-agnostic (no next/server, no next-auth)
 * so it can be imported by the standalone scheduler process.
 */

export type BodyType = "none" | "json" | "form" | "text";
export type ExecutionStatus = "SUCCESS" | "FAILED" | "TIMEOUT";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

const MAX_RESPONSE_BODY_BYTES = 50_000;
const MAX_ERROR_MESSAGE_BYTES = 1000;

const ENCRYPTION_KEY = process.env.HEADER_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
const ALGORITHM = "aes-256-gcm";

export interface ExecutionRequestConfig {
  url: string;
  method: string;
  headers?: Record<string, string> | null;
  body?: unknown;
  bodyType?: BodyType | null;
  queryParams?: Record<string, string> | null;
  timeout: number;
  expectedStatus?: number | null;
  expectedResponseRegex?: string | null;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  httpStatus: number | null;
  responseTime: number;
  errorMessage: string | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  responseSize: number;
  timedOut: boolean;
}

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

export function decryptSensitiveValue(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith("enc:")) return encrypted;
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 4) return encrypted;
    const [, ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encryptedData = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return encrypted;
  }
}

export function buildRequestUrl(
  url: string,
  queryParams?: Record<string, string> | null
): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return url;
  }
  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(queryParams)) {
    urlObj.searchParams.set(key, value);
  }
  return urlObj.toString();
}

export function buildRequestBody(
  method: string,
  body: unknown,
  bodyType?: BodyType | null
): { body: string | undefined; contentType: string | undefined } {
  if (!BODY_METHODS.has(method.toUpperCase())) {
    return { body: undefined, contentType: undefined };
  }

  if (body == null || body === "" || bodyType === "none") {
    return { body: undefined, contentType: undefined };
  }

  if (bodyType === "form") {
    const params = new URLSearchParams();
    if (body && typeof body === "object") {
      for (const [key, value] of Object.entries(body as Record<string, string>)) {
        params.set(key, String(value));
      }
    }
    return {
      body: params.toString(),
      contentType: "application/x-www-form-urlencoded",
    };
  }

  if (bodyType === "text") {
    return {
      body: typeof body === "string" ? body : JSON.stringify(body),
      contentType: "text/plain",
    };
  }

  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    contentType: "application/json",
  };
}

export function buildExecutionHeaders(
  headers: Record<string, string> | null | undefined,
  body: string | undefined,
  method: string
): Record<string, string> {
  const resolved: Record<string, string> = {};
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      const resolvedValue =
        typeof value === "string" ? decryptSensitiveValue(value) : String(value);
      resolved[key] = resolvedValue;
    }
  }

  if (body !== undefined && BODY_METHODS.has(method.toUpperCase()) && !resolved["Content-Type"]) {
    resolved["Content-Type"] = "application/json";
  }

  return resolved;
}

export function validateResponse(
  httpStatus: number,
  responseBody: string,
  expectedStatus?: number | null,
  expectedResponseRegex?: string | null
): string | null {
  if (expectedStatus != null) {
    const expected = Number(expectedStatus);
    if (Number.isInteger(expected) && httpStatus !== expected) {
      return `Response validation failed: expected HTTP ${expected}, got ${httpStatus}`;
    }
  }

  if (expectedResponseRegex && expectedResponseRegex.trim()) {
    let pattern: RegExp;
    try {
      // No flags: cron/web users write body patterns without regex flags.
      pattern = new RegExp(expectedResponseRegex);
    } catch {
      return `Response validation failed: invalid pattern "${expectedResponseRegex}"`;
    }
    if (!pattern.test(responseBody)) {
      return `Response validation failed: body does not match pattern ${expectedResponseRegex}`;
    }
  }

  return null;
}

export async function executeHttpRequest(
  config: ExecutionRequestConfig
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const method = String(config.method || "GET").toUpperCase();

  const fullUrl = buildRequestUrl(config.url, config.queryParams);

  let safeUrl: URL;
  try {
    safeUrl = await validateOutboundUrl(fullUrl);
  } catch {
    return {
      status: "FAILED",
      httpStatus: null,
      responseTime: Date.now() - startTime,
      errorMessage: "Invalid or blocked destination URL",
      responseBody: null,
      responseHeaders: null,
      responseSize: 0,
      timedOut: false,
    };
  }

  const { body, contentType } = buildRequestBody(method, config.body, config.bodyType);
  const headers = buildExecutionHeaders(config.headers, body, method);
  if (contentType && !headers["Content-Type"]) {
    headers["Content-Type"] = contentType;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
      redirect: "manual",
    };
    if (body !== undefined) {
      fetchOptions.body = body;
    }

    const response = await fetch(safeUrl.toString(), fetchOptions);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        try {
          const redirectUrl = new URL(location, safeUrl.toString());
          await validateOutboundUrl(redirectUrl.toString());
        } catch {
          clearTimeout(timeoutId);
          return {
            status: "FAILED",
            httpStatus: response.status,
            responseTime: Date.now() - startTime,
            errorMessage: "Redirect to blocked destination",
            responseBody: null,
            responseHeaders: null,
            responseSize: 0,
            timedOut: false,
          };
        }
      }
    }

    const rawBody = await response.text();

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    clearTimeout(timeoutId);

    const responseBody =
      rawBody.length > MAX_RESPONSE_BODY_BYTES
        ? rawBody.substring(0, MAX_RESPONSE_BODY_BYTES)
        : rawBody;

    const validationError = validateResponse(
      response.status,
      responseBody,
      config.expectedStatus,
      config.expectedResponseRegex
    );

    return {
      status: validationError ? "FAILED" : response.status < 400 ? "SUCCESS" : "FAILED",
      httpStatus: response.status,
      responseTime: Date.now() - startTime,
      errorMessage: validationError,
      responseBody,
      responseHeaders: redactHeaders(responseHeaders),
      responseSize: rawBody.length,
      timedOut: false,
    };
  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;
    clearTimeout(timeoutId);

    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");

    return {
      status: isAbort ? "TIMEOUT" : "FAILED",
      httpStatus: null,
      responseTime,
      errorMessage:
        error instanceof Error
          ? sanitizeForLog(error.message, MAX_ERROR_MESSAGE_BYTES).substring(0, MAX_ERROR_MESSAGE_BYTES)
          : "Unknown error",
      responseBody: null,
      responseHeaders: null,
      responseSize: 0,
      timedOut: isAbort,
    };
  }
}

export function sanitizeRequestBodyForStorage(body: unknown): unknown {
  if (!body) return null;
  if (typeof body === "string") {
    return sanitizeForLog(body, 2048);
  }
  if (typeof body === "object") {
    try {
      return JSON.parse(sanitizeForLog(JSON.stringify(body), 2048));
    } catch {
      return null;
    }
  }
  return body;
}

export { redactHeaders, sanitizeUrlForLog };