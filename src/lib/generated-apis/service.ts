import type { GenerateApiInput } from "@/lib/ai/validate";
import { generateAgentId, generateSecret, hashSecret, secretPrefix } from "./helpers";
import { GeneratedApi, type IGeneratedApi } from "@/lib/models";

export interface BuiltGeneratedApi {
  record: Record<string, unknown>;
  createdSecret: string | null;
}

export function buildGeneratedApiRecord(userId: string, input: GenerateApiInput): BuiltGeneratedApi {
  const agentId = generateAgentId();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

  let secretHash: string | null = null;
  let prefix: string | null = null;
  let createdSecret: string | null = null;

  if (input.authMode === "api-key" || input.authMode === "bearer") {
    createdSecret = generateSecret();
    secretHash = hashSecret(createdSecret);
    prefix = secretPrefix(createdSecret);
  }

  return {
    record: {
      userId,
      name: input.name,
      description: input.description,
      agentId,
      publicUrl: `${baseUrl.replace(/\/$/g, "")}/api/public/${agentId}`,
      source: {
        type: input.source.type,
        body: input.source.type === "static" ? (input.source.body ?? null) : null,
        collection: input.source.type === "collection" ? (input.source.collection ?? null) : null,
        fields: input.source.type === "collection" ? (input.source.fields ?? []) : [],
        url: input.source.type === "internal" ? (input.source.url ?? null) : null,
        method: input.source.type === "internal" ? (input.source.method ?? null) : null,
        timeout: input.source.timeout ?? 30000,
      },
      methods: input.methods,
      auth: {
        mode: input.authMode,
        secretHash,
        secretPrefix: prefix,
      },
      cors: {
        enabled: input.cors.enabled,
        origins: input.cors.origins,
      },
      rateLimit: {
        limit: input.rateLimit.limit,
        windowMs: input.rateLimit.windowMs,
      },
      response: {
        statusCode: input.response.statusCode,
        maxSizeBytes: input.response.maxSizeBytes,
        contentType: input.response.contentType,
      },
      isActive: true,
    },
    createdSecret,
  };
}

export function serializeGeneratedApi(doc: IGeneratedApi): Record<string, unknown> {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    agentId: doc.agentId,
    publicUrl: doc.publicUrl,
    source: doc.source,
    methods: doc.methods,
    auth: {
      mode: doc.auth.mode,
      secretPrefix: doc.auth.secretPrefix,
    },
    cors: doc.cors,
    rateLimit: doc.rateLimit,
    response: doc.response,
    isActive: doc.isActive,
    analytics: doc.analytics,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createGeneratedApi(
  userId: string,
  input: GenerateApiInput
): Promise<{ doc: IGeneratedApi; createdSecret: string | null }> {
  const { record, createdSecret } = buildGeneratedApiRecord(userId, input);
  const doc = await GeneratedApi.create(record);
  return { doc, createdSecret };
}