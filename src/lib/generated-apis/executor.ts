import mongoose from "mongoose";
import { GeneratedApi, type IGeneratedApi } from "@/lib/models";
import { validateOutboundUrl } from "@/lib/security-core";
import { capString } from "@/lib/monitoring/normalize";
import { currentDayKey } from "./helpers";

export interface PublicApiRequest {
  method: string;
  searchParams: URLSearchParams;
  rawBody: string;
  contentType: string | null;
}

export interface PublicApiOutcome {
  httpStatus: number;
  contentType: string;
  headers: Record<string, string>;
  body: unknown;
  successful: boolean;
  error?: string;
}

const MAX_COLLECTION_LIMIT = 100;

function parseJsonLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function collectionQuery(
  source: { collection?: string | null; fields?: string[] | null },
  api: IGeneratedApi,
  searchParams: URLSearchParams
): Promise<unknown[]> {
  const collectionName = source.collection;
  if (!collectionName) {
    throw new Error("Missing collection source");
  }
  const fields = source.fields ?? [];
  const projection: Record<string, number> = {};
  for (const field of fields) projection[field] = 1;

  const rawLimit = parseInt(searchParams.get("limit") || "20", 10) || 20;
  const limit = Math.min(Math.max(rawLimit, 1), MAX_COLLECTION_LIMIT);

  const filter: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(api.userId.toString()) };

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database not connected");
  }

  return db
    .collection(collectionName)
    .find(filter, { projection })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray()
    .then((docs) =>
      docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { id: _id?.toString?.() ?? null, ...rest };
      })
    );
}

async function internalProxy(
  source: { url?: string | null; method?: string | null; timeout?: number | null },
  api: IGeneratedApi,
  request: PublicApiRequest
): Promise<PublicApiOutcome> {
  const target = source.url;
  const targetMethod = source.method?.toUpperCase() || "GET";
  if (!target) {
    throw new Error("Missing internal source URL");
  }

  const safeUrl = await validateOutboundUrl(target);
  const url = new URL(safeUrl.toString());
  request.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {};
  if (request.rawBody && request.contentType) {
    headers["Content-Type"] = request.contentType;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), source.timeout ?? 30_000);

  try {
    const response = await fetch(url.toString(), {
      method: targetMethod,
      headers,
      signal: controller.signal,
      ...(request.rawBody ? { body: request.rawBody } : {}),
    });

    const rawText = await response.text();
    const maxBytes = api.response.maxSizeBytes || 100_000;
    const body = rawText.length > maxBytes ? rawText.slice(0, maxBytes) : rawText;
    const contentType = response.headers.get("content-type") || api.response.contentType;

    return {
      httpStatus: response.status,
      contentType,
      headers: {},
      body,
      successful: response.status < 400,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      httpStatus: 502,
      contentType: "application/json",
      headers: {},
      body: { error: "Upstream request failed", detail: capString(message, 500) },
      successful: false,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function executeSource(
  api: IGeneratedApi,
  request: PublicApiRequest
): Promise<PublicApiOutcome> {
  const source = api.source;

  if (!source || !source.type) {
    throw new Error("Missing API source configuration");
  }

  switch (source.type) {
    case "static": {
      return {
        httpStatus: api.response.statusCode || 200,
        contentType: api.response.contentType || "application/json",
        headers: {},
        body: source.body ?? null,
        successful: true,
      };
    }
    case "collection": {
      const data = await collectionQuery(source, api, request.searchParams);
      return {
        httpStatus: api.response.statusCode || 200,
        contentType: "application/json",
        headers: {},
        body: { data },
        successful: true,
      };
    }
    case "internal": {
      return internalProxy(source, api, request);
    }
    default:
      throw new Error("Unsupported API source type");
  }
}

export async function executePublicApi(
  api: IGeneratedApi,
  request: PublicApiRequest,
  now = new Date()
): Promise<PublicApiOutcome> {
  const start = Date.now();
  try {
    const outcome = await executeSource(api, request);
    const duration = Date.now() - start;
    await recordAnalytics(api._id.toString(), outcome.successful, duration, now);
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - start;
    await recordAnalytics(api._id.toString(), false, duration, now);
    return {
      httpStatus: 500,
      contentType: "application/json",
      headers: {},
      body: { error: "Internal error" },
      successful: false,
      error: message,
    };
  }
}

async function recordAnalytics(
  apiId: string,
  successful: boolean,
  durationMs: number,
  now: Date
): Promise<void> {
  const api = await GeneratedApi.findById(apiId).exec();
  if (!api) return;

  const analytics = api.analytics;
  const dayKey = currentDayKey(now);
  const fresh = analytics.dayKey === dayKey;

  const update: Record<string, unknown> = {
    "analytics.dayKey": dayKey,
    "analytics.requestsToday": (fresh ? analytics.requestsToday : 0) + 1,
    "analytics.lastRequestAt": now,
    "analytics.totalResponseTimeMs": (fresh ? analytics.totalResponseTimeMs : 0) + durationMs,
  };
  if (successful) {
    update["analytics.successCount"] = (fresh ? analytics.successCount : 0) + 1;
  } else {
    update["analytics.errorCount"] = (fresh ? analytics.errorCount : 0) + 1;
  }

  await GeneratedApi.findByIdAndUpdate(apiId, { $set: update }).exec();
}

export function parseRequestBody(rawBody: string, contentType: string | null): unknown {
  if (!rawBody) return null;
  const isJson = !contentType || contentType.includes("json");
  return isJson ? parseJsonLoose(rawBody) : rawBody;
}