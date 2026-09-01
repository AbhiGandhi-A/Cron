export type CloudflareConnectionStatus =
  | "connected"
  | "not-configured"
  | "configuration-required"
  | "connection-failed"
  | "zone-error";

export interface CloudflareConfigState {
  accountId: string;
  zoneId: string;
  apiToken: string;
  status: CloudflareConnectionStatus;
  connectionMessage: string;
  lastTested: string | null;
}

const runtimeConfig: Partial<CloudflareConfigState> = {};

export function getCloudflareConfigFromEnv(): CloudflareConfigState {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const zoneId = (process.env.CLOUDFLARE_ZONE_ID || "").trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || "").trim();

  return {
    accountId,
    zoneId,
    apiToken,
    status: accountId && apiToken ? "configuration-required" : "not-configured",
    connectionMessage:
      accountId && apiToken
        ? "Cloudflare credentials configured. Test the connection to validate access."
        : "Cloudflare Configuration Required",
    lastTested: null,
  };
}

export function getCloudflareRuntimeConfig(): CloudflareConfigState {
  const envState = getCloudflareConfigFromEnv();
  return {
    accountId: (runtimeConfig.accountId ?? envState.accountId ?? "").trim(),
    zoneId: (runtimeConfig.zoneId ?? envState.zoneId ?? "").trim(),
    apiToken: (runtimeConfig.apiToken ?? envState.apiToken ?? "").trim(),
    status: runtimeConfig.status ?? envState.status,
    connectionMessage: runtimeConfig.connectionMessage ?? envState.connectionMessage,
    lastTested: runtimeConfig.lastTested ?? envState.lastTested ?? null,
  };
}

export function setCloudflareRuntimeConfig(
  partial: Partial<CloudflareConfigState>
): CloudflareConfigState {
  const next = getCloudflareRuntimeConfig();
  const merged = { ...next, ...partial };

  if (typeof merged.accountId === "string") {
    runtimeConfig.accountId = merged.accountId.trim();
    process.env.CLOUDFLARE_ACCOUNT_ID = merged.accountId.trim();
  }

  if (typeof merged.zoneId === "string") {
    runtimeConfig.zoneId = merged.zoneId.trim();
    process.env.CLOUDFLARE_ZONE_ID = merged.zoneId.trim();
  }

  if (typeof merged.apiToken === "string") {
    runtimeConfig.apiToken = merged.apiToken.trim();
    process.env.CLOUDFLARE_API_TOKEN = merged.apiToken.trim();
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

  return getCloudflareRuntimeConfig();
}

export function clearCloudflareRuntimeConfig(): CloudflareConfigState {
  delete runtimeConfig.accountId;
  delete runtimeConfig.zoneId;
  delete runtimeConfig.apiToken;
  delete runtimeConfig.status;
  delete runtimeConfig.connectionMessage;
  delete runtimeConfig.lastTested;

  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_ZONE_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;

  return getCloudflareRuntimeConfig();
}

export function maskCloudflareSecret(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(0, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

export function serializeCloudflareConfig(config: Partial<CloudflareConfigState>) {
  const state = getCloudflareRuntimeConfig();
  const accountId = (config.accountId ?? state.accountId ?? "").trim();
  const zoneId = (config.zoneId ?? state.zoneId ?? "").trim();
  const apiToken = (config.apiToken ?? state.apiToken ?? "").trim();
  const lastTested = config.lastTested ?? state.lastTested ?? null;
  const status = config.status ?? state.status ?? "not-configured";
  const connectionMessage =
    config.connectionMessage ?? state.connectionMessage ?? "Cloudflare Configuration Required";

  return {
    accountId,
    zoneId,
    apiToken: undefined,
    apiTokenPresent: Boolean(apiToken),
    tokenPreview: apiToken ? maskCloudflareSecret(apiToken) : "",
    status,
    connectionMessage,
    lastTested,
  };
}
