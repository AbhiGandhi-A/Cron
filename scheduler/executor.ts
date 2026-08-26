import crypto from "node:crypto";
import { logger } from "./logger";
import { assertAllowedRedirect, validateOutboundUrl, sanitizeUrlForLog, sensitiveHeaderNames } from "../src/lib/security-core";

export interface ExecutionResult {
  httpStatus: number | null;
  responseTime: number;
  errorMessage: string | null;
  responseBody: string | null;
}

const MAX_RESPONSE_BODY_BYTES = 50_000;
const MAX_ERROR_MESSAGE_BYTES = 1000;

const ENCRYPTION_KEY = process.env.HEADER_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function decryptSensitiveValue(encrypted: string): string {
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

export async function executeJobRequest(config: {
  url: string;
  method: string;
  headers: unknown;
  body: unknown;
  timeout: number;
}): Promise<ExecutionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);
  const startTime = Date.now();

  try {
    const safeUrl = await validateOutboundUrl(config.url);

    const headers: Record<string, string> = {};
    if (config.headers && typeof config.headers === "object") {
      for (const [key, value] of Object.entries(config.headers as Record<string, string>)) {
        const resolved = typeof value === "string" && value.startsWith("enc:")
          ? decryptSensitiveValue(value)
          : String(value);
        headers[key] = resolved;
      }
    }

    if (!headers["Content-Type"] && config.method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    const fetchOptions: RequestInit = {
      method: config.method,
      headers,
      signal: controller.signal,
      redirect: "manual",
    };

    if (config.method !== "GET" && config.body) {
      fetchOptions.body = JSON.stringify(config.body);
    }

    logger.info("executor", "Executing " + config.method + " " + sanitizeUrlForLog(safeUrl.toString()));

    const response = await fetch(safeUrl, fetchOptions);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await assertAllowedRedirect(response.headers.get("location"));
    }

    const responseTime = Date.now() - startTime;
    const rawBody = await response.text();
    const responseBody = rawBody.length > MAX_RESPONSE_BODY_BYTES
      ? rawBody.substring(0, MAX_RESPONSE_BODY_BYTES)
      : rawBody;

    clearTimeout(timeoutId);

    logger.info("executor", "Completed: HTTP " + response.status + " in " + responseTime + "ms");

    return {
      httpStatus: response.status,
      responseTime,
      errorMessage: null,
      responseBody,
    };
  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;
    clearTimeout(timeoutId);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.error("executor", "Failed: " + sanitizeUrlForLog(config.url), error);

    return {
      httpStatus: null,
      responseTime,
      errorMessage: errorMessage.substring(0, MAX_ERROR_MESSAGE_BYTES),
      responseBody: null,
    };
  }
}
