import { getCloudflareConfigFromEnv } from "@/lib/cloudflare-config";

export type CloudflareMetricStatus = "healthy" | "warning" | "critical" | "unavailable";

export interface CloudflareAccountRef {
  id: string;
  name: string | null;
  type?: string | null;
}

export interface CloudflareZoneRef {
  id: string;
  name: string | null;
  status?: string | null;
  plan?: string | null;
}

export interface CloudflareWorkerRef {
  name: string | null;
  scriptId?: string | null;
  modifiedOn?: string | null;
}

export interface CloudflareD1Ref {
  id: string | null;
  name: string | null;
  numTables?: number | null;
  fileSize?: number | null;
}

export interface CloudflareMetric {
  id: string;
  name: string;
  label: string;
  category: "workers" | "d1" | "zone" | "account";
  current: number | null;
  limit: number | null;
  remaining: number | null;
  percentage: number | null;
  status: CloudflareMetricStatus;
  resetPeriod: string;
  unit?: string;
  source: string;
  description?: string;
}

export interface CloudflareUsageResponse {
  connected: boolean;
  available: boolean;
  configured: boolean;
  account: CloudflareAccountRef | null;
  zone: CloudflareZoneRef | null;
  worker: CloudflareWorkerRef | null;
  d1: CloudflareD1Ref | null;
  lastUpdated: string;
  message?: string;
  error?: string | null;
  resources: CloudflareMetric[];
}

export function safeNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function computeDerivedMetrics(usage: number | null, limit: number | null): {
  remaining: number | null;
  percentage: number | null;
} {
  if (
    usage === null ||
    limit === null ||
    limit <= 0 ||
    !Number.isFinite(usage) ||
    !Number.isFinite(limit)
  ) {
    return { remaining: null, percentage: null };
  }

  const remaining = limit >= usage ? Math.max(limit - usage, 0) : 0;
  const percentage = (usage / limit) * 100;

  return {
    remaining,
    percentage: Number.isFinite(percentage) ? percentage : null,
  };
}

export function buildMetric(options: {
  id: string;
  name: string;
  label: string;
  category: "workers" | "d1" | "zone" | "account";
  usage: number | null;
  limit: number | null;
  resetPeriod?: string;
  unit?: string;
  source: string;
  description?: string;
  forcedStatus?: CloudflareMetricStatus;
}): CloudflareMetric {
  const {
    id,
    name,
    label,
    category,
    usage,
    limit,
    resetPeriod = "Daily",
    unit,
    source,
    description,
    forcedStatus,
  } = options;

  const { remaining, percentage } = computeDerivedMetrics(usage, limit);

  let status: CloudflareMetricStatus = "unavailable";
  if (forcedStatus) {
    status = forcedStatus;
  } else if (usage === null) {
    status = "unavailable";
  } else if (percentage !== null) {
    if (percentage >= 95) {
      status = "critical";
    } else if (percentage >= 90) {
      status = "warning";
    } else {
      status = "healthy";
    }
  } else {
    // Usage is a valid number, but limit is unavailable from Cloudflare
    status = "healthy";
  }

  return {
    id,
    name,
    label,
    category,
    current: usage,
    limit,
    remaining,
    percentage,
    status,
    resetPeriod,
    unit,
    source,
    description,
  };
}

async function fetchJson<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      const errMsg =
        errBody?.errors?.[0]?.message ||
        `Cloudflare API error (${response.status}: ${response.statusText})`;
      return { ok: false, status: response.status, data: null, error: errMsg };
    }

    const data = (await response.json()) as T;
    return { ok: true, status: response.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "Network error contacting Cloudflare API",
    };
  }
}

export async function getCloudflareUsageData(): Promise<CloudflareUsageResponse> {
  const config = getCloudflareConfigFromEnv();

  const token = config.apiToken.trim();
  const accountId = config.accountId.trim();
  const zoneId = config.zoneId.trim();
  const d1DatabaseId = config.d1DatabaseId.trim();
  const workerName = config.workerName.trim();
  const lastUpdated = new Date().toISOString();

  if (!token || !accountId) {
    return {
      connected: false,
      available: false,
      configured: false,
      account: null,
      zone: zoneId ? { id: zoneId, name: null } : null,
      worker: workerName ? { name: workerName } : null,
      d1: d1DatabaseId ? { id: d1DatabaseId, name: null } : null,
      lastUpdated,
      message: "Cloudflare Configuration Required",
      error: "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in environment",
      resources: [],
    };
  }

  // 1. Verify and retrieve Account details
  const accountRes = await fetchJson<{
    result?: { id?: string; name?: string; type?: string };
    errors?: Array<{ message: string }>;
  }>(`/accounts/${encodeURIComponent(accountId)}`, token);

  if (!accountRes.ok || !accountRes.data?.result?.id) {
    const errorMsg =
      accountRes.status === 401 || accountRes.status === 403
        ? "Unauthorized: Invalid CLOUDFLARE_API_TOKEN or insufficient permissions"
        : accountRes.status === 404
        ? `Account not found: ${accountId}`
        : accountRes.error || "Failed to authenticate with Cloudflare API";

    return {
      connected: false,
      available: false,
      configured: true,
      account: { id: accountId, name: null },
      zone: zoneId ? { id: zoneId, name: null } : null,
      worker: workerName ? { name: workerName } : null,
      d1: d1DatabaseId ? { id: d1DatabaseId, name: null } : null,
      lastUpdated,
      message: "Cloudflare Authentication Failed",
      error: errorMsg,
      resources: [],
    };
  }

  const accountRef: CloudflareAccountRef = {
    id: accountId,
    name: accountRes.data.result.name ?? null,
    type: accountRes.data.result.type ?? null,
  };

  const resources: CloudflareMetric[] = [];

  // 2. Query Workers Usage & Analytics (GraphQL)
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startIso = oneDayAgo.toISOString();
  const endIso = now.toISOString();

  const workerQuery = `query GetWorkerAnalytics($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(
          limit: 10000,
          filter: { datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }
        ) {
          sum {
            requests
            errors
            subrequests
          }
        }
      }
    }
  }`;

  const workerGraphqlRes = await fetchJson<{
    data?: {
      viewer?: {
        accounts?: Array<{
          workersInvocationsAdaptive?: Array<{
            sum?: {
              requests?: unknown;
              errors?: unknown;
              subrequests?: unknown;
            };
          }>;
        }>;
      };
    };
  }>("/graphql", token, {
    method: "POST",
    body: JSON.stringify({
      query: workerQuery,
      variables: {
        accountTag: accountId,
        datetimeStart: startIso,
        datetimeEnd: endIso,
      },
    }),
  });

  const workerInvocations =
    workerGraphqlRes.data?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;

  let totalWorkerRequests: number | null = null;
  let totalWorkerErrors: number | null = null;
  let totalWorkerSubrequests: number | null = null;

  if (Array.isArray(workerInvocations)) {
    let reqSum = 0;
    let errSum = 0;
    let subSum = 0;
    let hasValidItem = false;

    for (const item of workerInvocations) {
      if (item.sum) {
        hasValidItem = true;
        reqSum += safeNumber(item.sum.requests, 0) || 0;
        errSum += safeNumber(item.sum.errors, 0) || 0;
        subSum += safeNumber(item.sum.subrequests, 0) || 0;
      }
    }

    if (hasValidItem) {
      totalWorkerRequests = reqSum;
      totalWorkerErrors = errSum;
      totalWorkerSubrequests = subSum;
    }
  }

  // Fetch Zone details to dynamically identify Cloudflare Plan
  let detectedPlanName = "Free";
  let zoneRef: CloudflareZoneRef | null = zoneId ? { id: zoneId, name: null } : null;
  if (zoneId) {
    const zoneInfoRes = await fetchJson<{
      result?: {
        id?: string;
        name?: string;
        status?: string;
        plan?: { name?: string; legacy_id?: string };
      };
    }>(`/zones/${encodeURIComponent(zoneId)}`, token);

    if (zoneInfoRes.ok && zoneInfoRes.data?.result) {
      const zRes = zoneInfoRes.data.result;
      detectedPlanName = zRes.plan?.name || zRes.plan?.legacy_id || "Free";
      zoneRef = {
        id: zRes.id || zoneId,
        name: zRes.name || null,
        status: zRes.status || null,
        plan: detectedPlanName,
      };
    }
  }

  // Determine official Cloudflare Plan Quotas dynamically based on Cloudflare plan tier
  const isPaidTier = /paid|pro|business|enterprise/i.test(detectedPlanName);

  const defaultWorkerRequestsLimit = isPaidTier ? 10000000 : 100000; // 10M for Paid / 100k for Free
  const defaultWorkerSubrequestsLimit = isPaidTier ? 10000 : 500000;
  const defaultD1StorageLimit = isPaidTier ? 1099511627776 : 5368709120; // 1 TB for Paid / 5 GB (5,368,709,120 bytes) for Free
  const defaultD1RowsReadLimit = isPaidTier ? 500000000 : 5000000; // 500M for Paid / 5M for Free
  const defaultD1RowsWrittenLimit = isPaidTier ? 50000000 : 100000; // 50M for Paid / 100k for Free
  const defaultZoneRequestsLimit = isPaidTier ? 100000000 : 1000000; // 100M for Paid / 1,000,000 requests/day for Free
  const defaultZoneBandwidthLimit = isPaidTier ? 1099511627776 : 107374182400; // 1 TB for Paid / 100 GB for Free

  const workerRequestsLimit = safeNumber(
    process.env.CLOUDFLARE_WORKERS_REQUEST_LIMIT || process.env.CLOUDFLARE_WORKER_REQUEST_LIMIT,
    defaultWorkerRequestsLimit
  );
  const workerSubrequestsLimit = safeNumber(
    process.env.CLOUDFLARE_WORKERS_SUBREQUEST_LIMIT || process.env.CLOUDFLARE_WORKER_SUBREQUEST_LIMIT,
    defaultWorkerSubrequestsLimit
  );
  const d1StorageLimit = safeNumber(
    process.env.CLOUDFLARE_D1_STORAGE_LIMIT_BYTES || process.env.CLOUDFLARE_D1_STORAGE_LIMIT,
    defaultD1StorageLimit
  );
  const d1RowsReadLimit = safeNumber(
    process.env.CLOUDFLARE_D1_ROWS_READ_LIMIT,
    defaultD1RowsReadLimit
  );
  const d1RowsWrittenLimit = safeNumber(
    process.env.CLOUDFLARE_D1_ROWS_WRITTEN_LIMIT,
    defaultD1RowsWrittenLimit
  );
  const zoneRequestsLimit = safeNumber(
    process.env.CLOUDFLARE_ZONE_REQUESTS_LIMIT || process.env.CLOUDFLARE_ZONE_REQUEST_LIMIT,
    defaultZoneRequestsLimit
  );
  const zoneBandwidthLimit = safeNumber(
    process.env.CLOUDFLARE_ZONE_BANDWIDTH_LIMIT_BYTES || process.env.CLOUDFLARE_ZONE_BANDWIDTH_LIMIT,
    defaultZoneBandwidthLimit
  );

  // Worker Requests Metric
  resources.push(
    buildMetric({
      id: "worker_requests",
      name: "Worker Requests",
      label: "Worker Requests (24h)",
      category: "workers",
      usage: totalWorkerRequests,
      limit: workerRequestsLimit,
      resetPeriod: "Last 24 Hours",
      unit: "requests",
      source: "Cloudflare GraphQL: workersInvocationsAdaptive.sum.requests",
      description: "Total worker invocations processed across your account in the last 24 hours.",
    })
  );

  // Worker Errors Metric
  if (totalWorkerErrors !== null) {
    resources.push(
      buildMetric({
        id: "worker_errors",
        name: "Worker Errors",
        label: "Worker Errors (24h)",
        category: "workers",
        usage: totalWorkerErrors,
        limit: null,
        resetPeriod: "Last 24 Hours",
        unit: "errors",
        source: "Cloudflare GraphQL: workersInvocationsAdaptive.sum.errors",
        description: "Invocations that resulted in an uncaught runtime exception.",
        forcedStatus:
          totalWorkerRequests && totalWorkerErrors / totalWorkerRequests > 0.05
            ? "critical"
            : totalWorkerErrors > 0
            ? "warning"
            : "healthy",
      })
    );
  }

  // Worker Subrequests Metric
  if (totalWorkerSubrequests !== null) {
    resources.push(
      buildMetric({
        id: "worker_subrequests",
        name: "Worker Subrequests",
        label: "Worker Subrequests (24h)",
        category: "workers",
        usage: totalWorkerSubrequests,
        limit: workerSubrequestsLimit,
        resetPeriod: "Last 24 Hours",
        unit: "subrequests",
        source: "Cloudflare GraphQL: workersInvocationsAdaptive.sum.subrequests",
        description: "Outbound fetch calls made by your workers in the last 24 hours.",
      })
    );
  }

  // 3. Worker Script Details (REST)
  let workerRef: CloudflareWorkerRef | null = workerName ? { name: workerName } : null;
  if (workerName) {
    const workerScriptRes = await fetchJson<{
      result?: { id?: string; modified_on?: string; created_on?: string };
    }>(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}`, token);

    if (workerScriptRes.ok && workerScriptRes.data?.result) {
      workerRef = {
        name: workerName,
        scriptId: workerScriptRes.data.result.id ?? workerName,
        modifiedOn: workerScriptRes.data.result.modified_on ?? null,
      };
    }
  }

  // 4. Query D1 Database Details & Analytics
  let d1Ref: CloudflareD1Ref | null = d1DatabaseId ? { id: d1DatabaseId, name: null } : null;
  if (d1DatabaseId) {
    const d1InfoRes = await fetchJson<{
      result?: {
        uuid?: string;
        name?: string;
        file_size?: unknown;
        size_bytes?: unknown;
        num_tables?: unknown;
        created_at?: string;
        version?: string;
      };
    }>(`/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(d1DatabaseId)}`, token);

    if (d1InfoRes.ok && d1InfoRes.data?.result) {
      const d1Res = d1InfoRes.data.result;
      const d1SizeBytes = safeNumber(d1Res.file_size ?? d1Res.size_bytes, null);
      const numTables = safeNumber(d1Res.num_tables, null);

      d1Ref = {
        id: d1Res.uuid || d1DatabaseId,
        name: d1Res.name || null,
        numTables,
        fileSize: d1SizeBytes,
      };

      // D1 Storage Metric
      resources.push(
        buildMetric({
          id: "d1_storage",
          name: "D1 Database Storage",
          label: "D1 Storage Size",
          category: "d1",
          usage: d1SizeBytes,
          limit: d1StorageLimit,
          resetPeriod: "Total Size",
          unit: "bytes",
          source: "Cloudflare D1 REST: /accounts/{id}/d1/database/{id} file_size",
          description: `Current physical storage used by D1 database ${d1Res.name || d1DatabaseId}.`,
        })
      );
    } else {
      // D1 database not accessible or not found
      resources.push(
        buildMetric({
          id: "d1_storage",
          name: "D1 Database Storage",
          label: "D1 Storage Size",
          category: "d1",
          usage: null,
          limit: d1StorageLimit,
          resetPeriod: "Total Size",
          unit: "bytes",
          source: "Cloudflare D1 REST: /accounts/{id}/d1/database/{id}",
          description: "Database details unavailable from Cloudflare.",
        })
      );
    }

    // Try D1 Analytics (GraphQL)
    const d1AnalyticsQuery = `query GetD1Analytics($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(
            limit: 1000,
            filter: { datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }
          ) {
            sum {
              readQueries
              writeQueries
              rowsRead
              rowsWritten
            }
          }
        }
      }
    }`;

    const d1GraphqlRes = await fetchJson<{
      data?: {
        viewer?: {
          accounts?: Array<{
            d1AnalyticsAdaptiveGroups?: Array<{
              sum?: {
                readQueries?: unknown;
                writeQueries?: unknown;
                rowsRead?: unknown;
                rowsWritten?: unknown;
              };
            }>;
          }>;
        };
      };
    }>("/graphql", token, {
      method: "POST",
      body: JSON.stringify({
        query: d1AnalyticsQuery,
        variables: {
          accountTag: accountId,
          datetimeStart: startIso,
          datetimeEnd: endIso,
        },
      }),
    });

    const d1Groups =
      d1GraphqlRes.data?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;

    let d1RowsRead: number | null = null;
    let d1RowsWritten: number | null = null;

    if (Array.isArray(d1Groups)) {
      let rSum = 0;
      let wSum = 0;
      let valid = false;
      for (const g of d1Groups) {
        if (g.sum) {
          valid = true;
          rSum += safeNumber(g.sum.rowsRead, 0) || 0;
          wSum += safeNumber(g.sum.rowsWritten, 0) || 0;
        }
      }
      if (valid) {
        d1RowsRead = rSum;
        d1RowsWritten = wSum;
      }
    }

    // D1 Rows Read Metric
    resources.push(
      buildMetric({
        id: "d1_rows_read",
        name: "D1 Rows Read",
        label: "D1 Rows Read (24h)",
        category: "d1",
        usage: d1RowsRead,
        limit: d1RowsReadLimit,
        resetPeriod: "Last 24 Hours",
        unit: "rows",
        source: "Cloudflare GraphQL: d1AnalyticsAdaptiveGroups.sum.rowsRead",
        description: "Total rows read across queries in the last 24 hours.",
      })
    );

    // D1 Rows Written Metric
    resources.push(
      buildMetric({
        id: "d1_rows_written",
        name: "D1 Rows Written",
        label: "D1 Rows Written (24h)",
        category: "d1",
        usage: d1RowsWritten,
        limit: d1RowsWrittenLimit,
        resetPeriod: "Last 24 Hours",
        unit: "rows",
        source: "Cloudflare GraphQL: d1AnalyticsAdaptiveGroups.sum.rowsWritten",
        description: "Total rows inserted, updated, or deleted in the last 24 hours.",
      })
    );
  }

  // 5. Query Zone Analytics (GraphQL)
  if (zoneId) {
    const dateStart = startIso.split("T")[0];
    const dateEnd = endIso.split("T")[0];

    const zoneAnalyticsQuery = `query GetZoneAnalytics($zoneTag: string!, $dateStart: string!, $dateEnd: string!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 10,
            filter: { date_geq: $dateStart, date_leq: $dateEnd }
          ) {
            sum {
              requests
              bytes
              cachedRequests
              cachedBytes
              pageViews
            }
          }
        }
      }
    }`;

    const zoneGraphqlRes = await fetchJson<{
      data?: {
        viewer?: {
          zones?: Array<{
            httpRequests1dGroups?: Array<{
              sum?: {
                requests?: unknown;
                bytes?: unknown;
                cachedRequests?: unknown;
                cachedBytes?: unknown;
                pageViews?: unknown;
              };
            }>;
          }>;
        };
      };
    }>("/graphql", token, {
      method: "POST",
      body: JSON.stringify({
        query: zoneAnalyticsQuery,
        variables: {
          zoneTag: zoneId,
          dateStart,
          dateEnd,
        },
      }),
    });

    const zoneGroups =
      zoneGraphqlRes.data?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;

    let zoneRequests: number | null = null;
    let zoneBandwidth: number | null = null;
    let zoneCachedRequests: number | null = null;

    if (Array.isArray(zoneGroups)) {
      let reqSum = 0;
      let bytesSum = 0;
      let cachedSum = 0;
      let valid = false;

      for (const g of zoneGroups) {
        if (g.sum) {
          valid = true;
          reqSum += safeNumber(g.sum.requests, 0) || 0;
          bytesSum += safeNumber(g.sum.bytes, 0) || 0;
          cachedSum += safeNumber(g.sum.cachedRequests, 0) || 0;
        }
      }

      if (valid) {
        zoneRequests = reqSum;
        zoneBandwidth = bytesSum;
        zoneCachedRequests = cachedSum;
      }
    }

    resources.push(
      buildMetric({
        id: "zone_requests",
        name: "Zone HTTP Requests",
        label: "Zone Requests (24h)",
        category: "zone",
        usage: zoneRequests,
        limit: zoneRequestsLimit,
        resetPeriod: "Last 24 Hours",
        unit: "requests",
        source: "Cloudflare GraphQL: httpRequests1dGroups.sum.requests",
        description: `Inbound HTTP traffic delivered to zone ${zoneRef?.name || zoneId}.`,
      })
    );

    if (zoneBandwidth !== null) {
      resources.push(
        buildMetric({
          id: "zone_bandwidth",
          name: "Zone Bandwidth",
          label: "Bandwidth Transferred (24h)",
          category: "zone",
          usage: zoneBandwidth,
          limit: zoneBandwidthLimit,
          resetPeriod: "Last 24 Hours",
          unit: "bytes",
          source: "Cloudflare GraphQL: httpRequests1dGroups.sum.bytes",
          description: "Total bytes transferred via Cloudflare CDN in the last 24 hours.",
        })
      );
    }

    if (zoneCachedRequests !== null) {
      const cacheTarget = zoneRequests && zoneRequests > 0 ? zoneRequests : null;
      resources.push(
        buildMetric({
          id: "zone_cached_requests",
          name: "Cached Requests",
          label: "Cached Requests (24h)",
          category: "zone",
          usage: zoneCachedRequests,
          limit: cacheTarget,
          resetPeriod: "Last 24 Hours",
          unit: "requests",
          source: "Cloudflare GraphQL: httpRequests1dGroups.sum.cachedRequests",
          description: "Edge-cached requests served without origin roundtrip.",
        })
      );
    }
  }

  return {
    connected: true,
    available: true,
    configured: true,
    account: accountRef,
    zone: zoneRef,
    worker: workerRef,
    d1: d1Ref,
    lastUpdated,
    message: "Cloudflare metrics loaded successfully.",
    resources,
  };
}


