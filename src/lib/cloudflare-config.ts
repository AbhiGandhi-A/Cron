import connectDb from "@/lib/mongodb";
import { CloudflareConfig } from "@/lib/models";

export type CloudflareConnectionStatus =
  | "connected"
  | "not-configured"
  | "configuration-required"
  | "connection-failed"
  | "zone-error";

export interface CloudflareConfigState {
  accountId: string;
  zoneId: string;
  d1DatabaseId: string;
  workerName: string;
  apiToken: string;
  status: CloudflareConnectionStatus;
  connectionMessage: string;
  lastTested: string | null;
}

const runtimeConfig: Partial<CloudflareConfigState> = {};

export async function getCloudflareConfigFromDb(): Promise<CloudflareConfigState | null> {
  try {
    await connectDb();
    const config = await CloudflareConfig.findOne().sort({ createdAt: -1 }).exec();
    if (!config) return null;

    return {
      accountId: config.accountId?.trim() || "",
      zoneId: config.zoneId?.trim() || "",
      d1DatabaseId: config.d1DatabaseId?.trim() || "",
      workerName: config.workerName?.trim() || "",
      apiToken: config.apiToken?.trim() || "",
      status: config.connectionStatus,
      connectionMessage: config.connectionMessage,
      lastTested: config.lastConnectionTest?.toISOString() || null,
    };
  } catch (error) {
    console.error("[Cloudflare Config] Database retrieval failed:", error);
    return null;
  }
}

export async function saveCloudflareConfigToDb(config: Partial<CloudflareConfigState>): Promise<CloudflareConfigState | null> {
  try {
    await connectDb();
    
    // Remove any existing config and save new one (single active config)
    const merged = {
      accountId: (config.accountId || "").trim(),
      zoneId: (config.zoneId || "").trim(),
      d1DatabaseId: (config.d1DatabaseId || "").trim(),
      workerName: (config.workerName || "").trim(),
      apiToken: (config.apiToken || "").trim(),
      connectionStatus: config.status || "configuration-required",
      connectionMessage: config.connectionMessage || "Cloudflare credentials configured. Test the connection to validate access.",
      lastConnectionTest: config.lastTested ? new Date(config.lastTested) : null,
    };

    const saved = await CloudflareConfig.findOneAndUpdate(
      {},
      merged,
      { upsert: true, new: true }
    ).exec();

    return {
      accountId: saved.accountId?.trim() || "",
      zoneId: saved.zoneId?.trim() || "",
      d1DatabaseId: saved.d1DatabaseId?.trim() || "",
      workerName: saved.workerName?.trim() || "",
      apiToken: saved.apiToken?.trim() || "",
      status: saved.connectionStatus,
      connectionMessage: saved.connectionMessage,
      lastTested: saved.lastConnectionTest?.toISOString() || null,
    };
  } catch (error) {
    console.error("[Cloudflare Config] Database save failed:", error);
    return null;
  }
}

export function getCloudflareConfigFromEnv(): CloudflareConfigState {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const zoneId = (process.env.CLOUDFLARE_ZONE_ID || "").trim();
  const d1DatabaseId = (process.env.CLOUDFLARE_D1_DATABASE_ID || "").trim();
  const workerName = (process.env.CLOUDFLARE_WORKER_NAME || "").trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || "").trim();

  return {
    accountId,
    zoneId,
    d1DatabaseId,
    workerName,
    apiToken,
    status: accountId && apiToken ? "configuration-required" : "not-configured",
    connectionMessage:
      accountId && apiToken
        ? "Cloudflare credentials configured. Test the connection to validate access."
        : "Cloudflare Configuration Required",
    lastTested: null,
  };
}

export async function getCloudflareRuntimeConfig(): Promise<CloudflareConfigState> {
  const dbConfig = await getCloudflareConfigFromDb();
  const envConfig = getCloudflareConfigFromEnv();
  
  // Database takes precedence, fall back to environment
  const source = dbConfig || envConfig;
  
  return {
    accountId: (runtimeConfig.accountId ?? source.accountId ?? "").trim(),
    zoneId: (runtimeConfig.zoneId ?? source.zoneId ?? "").trim(),
    d1DatabaseId: (runtimeConfig.d1DatabaseId ?? source.d1DatabaseId ?? "").trim(),
    workerName: (runtimeConfig.workerName ?? source.workerName ?? "").trim(),
    apiToken: (runtimeConfig.apiToken ?? source.apiToken ?? "").trim(),
    status: runtimeConfig.status ?? source.status,
    connectionMessage: runtimeConfig.connectionMessage ?? source.connectionMessage,
    lastTested: runtimeConfig.lastTested ?? source.lastTested ?? null,
  };
}

export async function setCloudflareRuntimeConfig(
  partial: Partial<CloudflareConfigState>
): Promise<CloudflareConfigState> {
  const next = await getCloudflareRuntimeConfig();
  const merged = { ...next, ...partial };

  if (typeof merged.accountId === "string") {
    runtimeConfig.accountId = merged.accountId.trim();
  }

  if (typeof merged.zoneId === "string") {
    runtimeConfig.zoneId = merged.zoneId.trim();
  }

  if (typeof merged.d1DatabaseId === "string") {
    runtimeConfig.d1DatabaseId = merged.d1DatabaseId.trim();
  }

  if (typeof merged.workerName === "string") {
    runtimeConfig.workerName = merged.workerName.trim();
  }

  if (typeof merged.apiToken === "string") {
    runtimeConfig.apiToken = merged.apiToken.trim();
  }

  if (typeof merged.status === "string") {
    runtimeConfig.status = merged.status;
  }

  if (typeof merged.connectionMessage === "string") {
    runtimeConfig.connectionMessage = merged.connectionMessage;
  }

  if (typeof merged.lastTested === "string" || merged.lastTested === null) {
    runtimeConfig.lastTested = merged.lastTested;
  }

  // Persist to database
  const dbSaved = await saveCloudflareConfigToDb(merged);
  
  return await getCloudflareRuntimeConfig();
}

export async function clearCloudflareRuntimeConfig(): Promise<CloudflareConfigState> {
  delete runtimeConfig.accountId;
  delete runtimeConfig.zoneId;
  delete runtimeConfig.d1DatabaseId;
  delete runtimeConfig.workerName;
  delete runtimeConfig.apiToken;
  delete runtimeConfig.status;
  delete runtimeConfig.connectionMessage;
  delete runtimeConfig.lastTested;

  try {
    await connectDb();
    await CloudflareConfig.deleteMany({}).exec();
  } catch (error) {
    console.error("[Cloudflare Config] Database clear failed:", error);
  }

  return getCloudflareConfigFromEnv();
}

export function maskCloudflareSecret(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(0, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

export function serializeCloudflareConfig(config: Partial<CloudflareConfigState>) {
  const state = getCloudflareConfigFromEnv(); // Fallback to env since this might be called without await
  const accountId = (config.accountId ?? state.accountId ?? "").trim();
  const zoneId = (config.zoneId ?? state.zoneId ?? "").trim();
  const d1DatabaseId = (config.d1DatabaseId ?? state.d1DatabaseId ?? "").trim();
  const workerName = (config.workerName ?? state.workerName ?? "").trim();
  const apiToken = (config.apiToken ?? state.apiToken ?? "").trim();
  const lastTested = config.lastTested ?? state.lastTested ?? null;
  const status = config.status ?? state.status ?? "not-configured";
  const connectionMessage =
    config.connectionMessage ?? state.connectionMessage ?? "Cloudflare Configuration Required";

  return {
    accountId,
    zoneId,
    d1DatabaseId,
    workerName,
    apiToken: undefined,
    apiTokenPresent: Boolean(apiToken),
    tokenPreview: apiToken ? maskCloudflareSecret(apiToken) : "",
    status,
    connectionMessage,
    lastTested,
  };
}
