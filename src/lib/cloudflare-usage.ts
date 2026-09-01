export type CloudflareMetricStatus = "healthy" | "warning" | "critical" | "unavailable";

export interface CloudflareMetric {
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
  available: boolean;
  configured: boolean;
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

function buildMetric(
  name: string,
  label: string,
  currentValue: unknown,
  limitValue: unknown,
  reset: string,
  unit?: string
): CloudflareMetric {
  const current = safeNumber(currentValue, null);
  const limit = safeNumber(limitValue, null);
  const remaining = current !== null && limit !== null && limit >= current ? Math.max(limit - current, 0) : null;
  const percentage = current !== null && limit !== null && limit > 0 ? (current / limit) * 100 : null;

  let status: CloudflareMetricStatus = "unavailable";
  if (current === null || limit === null || percentage === null) {
    status = "unavailable";
  } else if (percentage >= 95) {
    status = "critical";
  } else if (percentage >= 90) {
    status = "warning";
  } else {
    status = "healthy";
  }

  return {
    name,
    label,
    current,
    limit,
    remaining,
    percentage,
    status,
    reset,
    unit,
  };
}

export async function getCloudflareUsageData(): Promise<CloudflareUsageResponse> {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "";
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";

  if (!token || !accountId) {
    return {
      available: false,
      configured: false,
      lastUpdated: new Date().toISOString(),
      message: "Cloudflare API not configured",
      resources: [],
    };
  }

  const baseUrl = "https://api.cloudflare.com/client/v4";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const end = now.toISOString();

  const defaults = {
    workersRequests: safeNumber(process.env.CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT, 100000) ?? 100000,
    d1Read: safeNumber(process.env.CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT, 5000000) ?? 5000000,
    d1Write: safeNumber(process.env.CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT, 100000) ?? 100000,
    d1Storage: safeNumber(process.env.CLOUDFLARE_D1_STORAGE_LIMIT, null),
    kvRead: safeNumber(process.env.CLOUDFLARE_KV_READ_LIMIT, null),
    kvWrite: safeNumber(process.env.CLOUDFLARE_KV_WRITE_LIMIT, null),
    doRequests: safeNumber(process.env.CLOUDFLARE_DO_REQUESTS_LIMIT, null),
    queues: safeNumber(process.env.CLOUDFLARE_QUEUES_LIMIT, null),
  };

  const metrics: CloudflareMetric[] = [];

  try {
    const workerQuery = `query { viewer { accounts(filter: {accountTag: "${accountId}"}) { workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: "${start}", datetime_leq: "${end}"}) { sum { requests } } } } }`;
    const workerResponse = await fetch(`${baseUrl}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: workerQuery }),
      cache: "no-store",
    });

    let workerCurrent: number | null = null;
    if (workerResponse.ok) {
      const workerJson = await workerResponse.json();
      const workerData = workerJson?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.sum;
      workerCurrent = safeNumber(workerData?.requests, null);
    }

    metrics.push(
      buildMetric(
        "workers_requests",
        "Workers Requests",
        workerCurrent,
        defaults.workersRequests,
        "Daily",
        "/day"
      )
    );
  } catch {
    metrics.push(
      buildMetric("workers_requests", "Workers Requests", null, defaults.workersRequests, "Daily", "/day")
    );
  }

  const unavailableDefaults: Array<[string, string, number | null, string, string]> = [
    ["cpu_time", "CPU Time", defaults.workersRequests, "Daily", "/day"],
    ["d1_rows_read", "D1 Rows Read", defaults.d1Read, "Daily", "/day"],
    ["d1_rows_written", "D1 Rows Written", defaults.d1Write, "Daily", "/day"],
    ["d1_storage", "D1 Storage", defaults.d1Storage ?? null, "Daily", "B"],
    ["kv_read_requests", "KV Read Requests", defaults.kvRead ?? null, "Daily", "/day"],
    ["kv_write_requests", "KV Write/Delete/List Requests", defaults.kvWrite ?? null, "Daily", "/day"],
    ["kv_stored_data", "KV Stored Data", defaults.kvRead ?? null, "Daily", "B"],
    ["durable_objects_requests", "Durable Objects Requests", defaults.doRequests ?? null, "Daily", "/day"],
    ["durable_objects_duration", "Durable Objects Duration", defaults.doRequests ?? null, "Daily", "ms"],
    ["durable_objects_sql_rows_read", "Durable Objects SQL Rows Read", defaults.doRequests ?? null, "Daily", "/day"],
    ["durable_objects_sql_rows_written", "Durable Objects SQL Rows Written", defaults.doRequests ?? null, "Daily", "/day"],
    ["durable_objects_stored_data", "Durable Objects Stored Data", defaults.doRequests ?? null, "Daily", "B"],
    ["queues_operations", "Queues Operations", defaults.queues ?? null, "Daily", "/day"],
    ["workers_ai_neurons", "Workers AI Neurons", null, "Daily", "neurons"],
    ["vectorize_queried_dimensions", "Vectorize Queried Dimensions", null, "Daily", "dims"],
    ["vectorize_stored_dimensions", "Vectorize Stored Dimensions", null, "Daily", "dims"],
    ["workers_logs_events", "Workers Logs Events", null, "Daily", "/day"],
    ["workers_build_minutes", "Workers Builds Minutes", null, "Daily", "min"],
    ["containers_cpu", "Containers CPU", null, "Daily", "%"],
    ["containers_memory", "Containers Memory", null, "Daily", "MB"],
    ["containers_disk", "Containers Disk", null, "Daily", "GB"],
    ["containers_network_egress", "Containers Network Egress", null, "Daily", "GB"],
  ];

  for (const [name, label, limit, reset, unit] of unavailableDefaults) {
    metrics.push(buildMetric(name, label, null, limit ?? null, reset, unit));
  }

  const normalized = metrics.filter((metric, idx, arr) => {
    const first = arr.findIndex((m) => m.name === metric.name);
    return first === idx;
  });

  return {
    available: normalized.length > 0,
    configured: true,
    lastUpdated: new Date().toISOString(),
    resources: normalized,
  };
}
