export type CloudflareMetricStatus = "healthy" | "warning" | "critical" | "unavailable";

export interface CloudflareAccountRef {
  id: string;
  name: string | null;
}

export interface CloudflareZoneRef {
  id: string;
  name: string | null;
}

export interface CloudflareMetric {
  id: string;
  name: string;
  label: string;
  current: number | null;
  limit: number | null;
  remaining: number | null;
  percentage: number | null;
  status: CloudflareMetricStatus;
  reset: string;
  unit?: string;
}

export interface CloudflareUsageResponse {
  connected: boolean;
  available: boolean;
  configured: boolean;
  account: CloudflareAccountRef | null;
  zone: CloudflareZoneRef | null;
  lastUpdated: string;
  message?: string;
  resources: CloudflareMetric[];
}

function safeNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function computeDerivedMetrics(usage: number | null, limit: number | null) {
  if (usage === null || limit === null || limit <= 0) {
    return { remaining: null, percentage: null };
  }

  const remaining = limit >= usage ? Math.max(limit - usage, 0) : null;
  const percentage = (usage / limit) * 100;

  return {
    remaining,
    percentage,
  };
}

function buildMetric(
  id: string,
  name: string,
  usage: number | null,
  limit: number | null,
  reset: string,
  unit?: string
): CloudflareMetric {
  const { remaining, percentage } = computeDerivedMetrics(usage, limit);

  let status: CloudflareMetricStatus = "unavailable";
  if (usage !== null && limit !== null && percentage !== null) {
    if (percentage >= 95) {
      status = "critical";
    } else if (percentage >= 90) {
      status = "warning";
    } else {
      status = "healthy";
    }
  }

  return {
    id,
    name,
    label: name,
    current: usage,
    limit,
    remaining,
    percentage,
    status,
    reset,
    unit,
  };
}

async function fetchJson<T>(path: string, token: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${"https://api.cloudflare.com/client/v4"}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getCloudflareUsageData(): Promise<CloudflareUsageResponse> {
  const token = (process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "").trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "").trim();
  const zoneId = (process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID || "").trim();
  const d1DatabaseId = (process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CF_D1_DATABASE_ID || "").trim();
  const lastUpdated = new Date().toISOString();

  if (!token || !accountId) {
    return {
      connected: false,
      available: false,
      configured: false,
      account: null,
      zone: zoneId ? { id: zoneId, name: null } : null,
      lastUpdated,
      message: "Cloudflare Configuration Required",
      resources: [],
    };
  }

  const accountInfo = await fetchJson<{ result?: { id?: string; name?: string } }>(`/accounts/${encodeURIComponent(accountId)}`, token);
  const zoneInfo = zoneId ? await fetchJson<{ result?: { id?: string; name?: string } }>(`/zones/${encodeURIComponent(zoneId)}`, token) : null;

  if (!accountInfo?.result?.id) {
    return {
      connected: false,
      available: false,
      configured: true,
      account: { id: accountId, name: null },
      zone: zoneId ? { id: zoneId, name: null } : null,
      lastUpdated,
      message: "Cloudflare Authentication Failed",
      resources: [],
    };
  }

  const resources: CloudflareMetric[] = [];

  // Fetch Workers usage
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const end = new Date().toISOString();
  
  const workerQuery = `query {
    viewer {
      accounts(filter: {accountTag: "${accountId}"}) {
        workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: "${start}", datetime_leq: "${end}"}) {
          sum { requests }
        }
      }
    }
  }`;

  const graphql = await fetchJson<{ data?: { viewer?: { accounts?: Array<{ workersInvocationsAdaptive?: { sum?: { requests?: unknown } } }> } } }>(`/graphql`, token, {
    method: "POST",
    body: JSON.stringify({ query: workerQuery }),
  });

  const workersUsage = graphql?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.sum?.requests;
  const workerLimit = safeNumber(process.env.CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT, null);

  resources.push(
    buildMetric(
      "workers_requests",
      "Workers Requests",
      safeNumber(workersUsage, null),
      workerLimit,
      "Daily",
      "requests"
    )
  );

  // Fetch D1 Database usage if configured
  if (d1DatabaseId) {
    const d1Info = await fetchJson<{ result?: { size_bytes?: unknown; created_on?: string } }>(`/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(d1DatabaseId)}`, token);
    
    if (d1Info?.result) {
      const d1SizeBytes = safeNumber(d1Info.result.size_bytes, null);
      const d1Limit = safeNumber(process.env.CLOUDFLARE_D1_STORAGE_LIMIT_MB, null);
      let d1LimitBytes: number | null = null;
      if (d1Limit !== null && d1Limit > 0) {
        d1LimitBytes = d1Limit * 1024 * 1024; // Convert MB to bytes
      }

      resources.push(
        buildMetric(
          "d1_storage",
          "D1 Database Storage",
          d1SizeBytes,
          d1LimitBytes,
          "Plan Limit",
          "bytes"
        )
      );
    }
  }

  // Fetch Zone analytics if configured
  if (zoneId) {
    // Zone requests (requires Logpush or GraphQL analytics)
    const zoneAnalyticsQuery = `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequests1dGroups(limit: 1, filter: {date_geq: "${start.split('T')[0]}", date_leq: "${end.split('T')[0]}"}) {
            sum { requests }
          }
        }
      }
    }`;

    const zoneGraphql = await fetchJson<{ data?: { viewer?: { zones?: Array<{ httpRequests1dGroups?: Array<{ sum?: { requests?: unknown } }> }> } } }>(`/graphql`, token, {
      method: "POST",
      body: JSON.stringify({ query: zoneAnalyticsQuery }),
    });

    const zoneRequests = zoneGraphql?.data?.viewer?.zones?.[0]?.httpRequests1dGroups?.[0]?.sum?.requests;
    
    if (zoneRequests !== undefined && zoneRequests !== null) {
      const zoneRequestLimit = safeNumber(process.env.CLOUDFLARE_ZONE_REQUESTS_DAILY_LIMIT, null);
      resources.push(
        buildMetric(
          "zone_requests",
          "Zone Requests",
          safeNumber(zoneRequests, null),
          zoneRequestLimit,
          "Daily",
          "requests"
        )
      );
    }
  }

  return {
    connected: true,
    available: true,
    configured: true,
    account: {
      id: accountId,
      name: accountInfo.result?.name ?? null,
    },
    zone: zoneId
      ? {
          id: zoneId,
          name: zoneInfo?.result?.name ?? null,
        }
      : null,
    lastUpdated,
    message: "Cloudflare usage loaded successfully.",
    resources,
  };
}

