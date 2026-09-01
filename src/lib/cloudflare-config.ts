/**
 * Cloudflare Configuration Module (Server-Side Only)
 *
 * Reads Cloudflare credentials strictly from server environment variables:
 * - CLOUDFLARE_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_TAG)
 * - CLOUDFLARE_ZONE_ID (or CLOUDFLARE_ZONE_TAG)
 * - CLOUDFLARE_D1_DATABASE_ID
 * - CLOUDFLARE_API_TOKEN
 * - CLOUDFLARE_WORKER_NAME
 *
 * ZERO credentials are stored in MongoDB.
 * ZERO raw tokens are exposed to the browser.
 */

export type CloudflareConfigStatus =
  | "configured"
  | "partially-configured"
  | "not-configured";

export type CloudflareConnectionStatus =
  | "connected"
  | "not-configured"
  | "configuration-required"
  | "unauthorized"
  | "not-found"
  | "connection-failed"
  | "zone-error"
  | "error";

export interface CloudflareConfigState {
  accountId: string;
  zoneId: string;
  d1DatabaseId: string;
  workerName: string;
  apiToken: string;
  configStatus: CloudflareConfigStatus;
  status: CloudflareConnectionStatus;
  connectionMessage: string;
  lastTested: string | null;
}

export interface SerializedCloudflareConfig {
  accountId: string;
  zoneId: string;
  d1DatabaseId: string;
  workerName: string;
  apiToken?: undefined;
  apiTokenPresent: boolean;
  apiTokenConfigured: boolean;
  configured: boolean;
  tokenPreview: string;
  configStatus: CloudflareConfigStatus;
  status: CloudflareConnectionStatus;
  connectionMessage: string;
  lastTested: string | null;
}

/**
 * Mask a secret string (token, credential ID) for safe display in UI/logs.
 * Never reveals full value.
 */
export function maskCloudflareSecret(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(0, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

/**
 * Safely reads Cloudflare configuration strictly from server environment variables.
 */
export function getCloudflareConfigFromEnv(): CloudflareConfigState {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_TAG ||
    ""
  ).trim();

  const zoneId = (
    process.env.CLOUDFLARE_ZONE_ID ||
    process.env.CLOUDFLARE_ZONE_TAG ||
    ""
  ).trim();

  const d1DatabaseId = (
    process.env.CLOUDFLARE_D1_DATABASE_ID || ""
  ).trim();

  const workerName = (
    process.env.CLOUDFLARE_WORKER_NAME || "cronjobs-worker"
  ).trim();

  const apiToken = (
    process.env.CLOUDFLARE_API_TOKEN || ""
  ).trim();

  let configStatus: CloudflareConfigStatus = "not-configured";
  let status: CloudflareConnectionStatus = "not-configured";
  let connectionMessage = "Cloudflare Configuration Required";

  if (accountId && apiToken) {
    if (zoneId && d1DatabaseId && workerName) {
      configStatus = "configured";
      status = "configuration-required";
      connectionMessage =
        "Cloudflare credentials configured from environment. Test connection to verify.";
    } else {
      configStatus = "partially-configured";
      status = "configuration-required";
      connectionMessage =
        "Cloudflare credentials partially configured from environment. Test connection to verify.";
    }
  } else if (accountId || apiToken || zoneId || d1DatabaseId) {
    configStatus = "partially-configured";
    status = "not-configured";
    connectionMessage =
      "Incomplete Cloudflare credentials. Account ID and API Token are required.";
  }

  return {
    accountId,
    zoneId,
    d1DatabaseId,
    workerName,
    apiToken,
    configStatus,
    status,
    connectionMessage,
    lastTested: null,
  };
}

/**
 * Returns runtime Cloudflare config from environment.
 * (Preserved async signature for compatibility).
 */
export async function getCloudflareRuntimeConfig(): Promise<CloudflareConfigState> {
  return getCloudflareConfigFromEnv();
}

/**
 * Serializes Cloudflare config for client-safe consumption.
 * Strictly omits the raw API token and includes masked previews.
 */
export function serializeCloudflareConfig(
  config?: Partial<CloudflareConfigState>
): SerializedCloudflareConfig {
  const state = getCloudflareConfigFromEnv();
  const accountId = (config?.accountId ?? state.accountId ?? "").trim();
  const zoneId = (config?.zoneId ?? state.zoneId ?? "").trim();
  const d1DatabaseId = (config?.d1DatabaseId ?? state.d1DatabaseId ?? "").trim();
  const workerName = (config?.workerName ?? state.workerName ?? "").trim();
  const apiToken = (config?.apiToken ?? state.apiToken ?? "").trim();
  const lastTested = config?.lastTested ?? state.lastTested ?? null;
  const configStatus = config?.configStatus ?? state.configStatus ?? "not-configured";
  const status = config?.status ?? state.status ?? "not-configured";
  const connectionMessage =
    config?.connectionMessage ?? state.connectionMessage ?? "Cloudflare Configuration Required";

  return {
    accountId,
    zoneId,
    d1DatabaseId,
    workerName,
    apiToken: undefined,
    apiTokenPresent: Boolean(apiToken),
    apiTokenConfigured: Boolean(apiToken),
    configured: Boolean(accountId && apiToken),
    tokenPreview: apiToken ? maskCloudflareSecret(apiToken) : "",
    configStatus,
    status,
    connectionMessage,
    lastTested,
  };
}
