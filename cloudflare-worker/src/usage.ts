export type UsageResourceName = "worker_requests" | "d1_reads" | "d1_writes";

export type UsageStatus = "healthy" | "warning" | "blocked";

export type UsageConfig = {
  enabled: boolean;
  safetyPercent: number;
  warningPercent: number;
  blockPercent: number;
  workerRequestsDailyLimit: number;
  d1RowsReadDailyLimit: number;
  d1RowsWrittenDailyLimit: number;
  workerRequestsSafetyLimit: number;
  d1RowsReadSafetyLimit: number;
  d1RowsWrittenSafetyLimit: number;
  workerRequestsWarningLimit: number;
  d1RowsReadWarningLimit: number;
  d1RowsWrittenWarningLimit: number;
  workerRequestsBlockLimit: number;
  d1RowsReadBlockLimit: number;
  d1RowsWrittenBlockLimit: number;
};

export type UsageResourceSnapshot = {
  actualLimit: number;
  safetyLimit: number;
  warningLimit: number;
  blockLimit: number;
  used: number;
  remainingToSafetyLimit: number;
  remainingBeforeBlock: number;
  percentageOfSafetyLimit: number;
  status: UsageStatus;
  resource: UsageResourceName;
};

export type UsageSnapshot = {
  enabled: boolean;
  date: string;
  status: UsageStatus;
  resource: UsageResourceName | null;
  resources: Record<UsageResourceName, UsageResourceSnapshot>;
  resetsAt: string;
};

function parseBool(value: string | undefined, fallback = true): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getNextUtcReset(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return next;
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 1) return 1;
  if (value > 100) return 100;
  return value;
}

function calculateSafetyLimit(actualLimit: number, percent: number): number {
  return Math.max(0, Math.round((actualLimit * percent) / 100));
}

export function getUsageConfig(env: Record<string, string | undefined>): UsageConfig {
  const enabled = parseBool(env.CLOUDFLARE_USAGE_PROTECTION_ENABLED, true);
  const safetyPercent = clampPercent(parseNumber(env.CLOUDFLARE_SAFETY_PERCENT, 90), 90);
  const warningPercent = clampPercent(parseNumber(env.CLOUDFLARE_WARNING_PERCENT, 90), 90);
  const blockPercent = clampPercent(parseNumber(env.CLOUDFLARE_BLOCK_PERCENT, 95), 95);

  const workerRequestsActual = parseNumber(env.CLOUDFLARE_WORKER_REQUESTS_DAILY_LIMIT, 100000);
  const d1ReadsActual = parseNumber(env.CLOUDFLARE_D1_ROWS_READ_DAILY_LIMIT, 5000000);
  const d1WritesActual = parseNumber(env.CLOUDFLARE_D1_ROWS_WRITTEN_DAILY_LIMIT, 100000);

  const workerRequestsSafetyLimit = calculateSafetyLimit(workerRequestsActual, safetyPercent);
  const d1RowsReadSafetyLimit = calculateSafetyLimit(d1ReadsActual, safetyPercent);
  const d1RowsWrittenSafetyLimit = calculateSafetyLimit(d1WritesActual, safetyPercent);

  const workerRequestsWarningLimit = Math.round((workerRequestsSafetyLimit * warningPercent) / 100);
  const d1RowsReadWarningLimit = Math.round((d1RowsReadSafetyLimit * warningPercent) / 100);
  const d1RowsWrittenWarningLimit = Math.round((d1RowsWrittenSafetyLimit * warningPercent) / 100);

  const workerRequestsBlockLimit = Math.round((workerRequestsSafetyLimit * blockPercent) / 100);
  const d1RowsReadBlockLimit = Math.round((d1RowsReadSafetyLimit * blockPercent) / 100);
  const d1RowsWrittenBlockLimit = Math.round((d1RowsWrittenSafetyLimit * blockPercent) / 100);

  return {
    enabled,
    safetyPercent,
    warningPercent,
    blockPercent,
    workerRequestsDailyLimit: workerRequestsActual,
    d1RowsReadDailyLimit: d1ReadsActual,
    d1RowsWrittenDailyLimit: d1WritesActual,
    workerRequestsSafetyLimit,
    d1RowsReadSafetyLimit,
    d1RowsWrittenSafetyLimit,
    workerRequestsWarningLimit,
    d1RowsReadWarningLimit,
    d1RowsWrittenWarningLimit,
    workerRequestsBlockLimit,
    d1RowsReadBlockLimit,
    d1RowsWrittenBlockLimit,
  };
}

function getResourceConfig(resource: UsageResourceName, config: UsageConfig): { actualLimit: number; safetyLimit: number; warningLimit: number; blockLimit: number } {
  switch (resource) {
    case "worker_requests":
      return {
        actualLimit: config.workerRequestsDailyLimit,
        safetyLimit: config.workerRequestsSafetyLimit,
        warningLimit: config.workerRequestsWarningLimit,
        blockLimit: config.workerRequestsBlockLimit,
      };
    case "d1_reads":
      return {
        actualLimit: config.d1RowsReadDailyLimit,
        safetyLimit: config.d1RowsReadSafetyLimit,
        warningLimit: config.d1RowsReadWarningLimit,
        blockLimit: config.d1RowsReadBlockLimit,
      };
    case "d1_writes":
      return {
        actualLimit: config.d1RowsWrittenDailyLimit,
        safetyLimit: config.d1RowsWrittenSafetyLimit,
        warningLimit: config.d1RowsWrittenWarningLimit,
        blockLimit: config.d1RowsWrittenBlockLimit,
      };
  }
}

export function getUsageProtectionStatus(
  resource: UsageResourceName,
  config: UsageConfig,
  used: number,
  now: Date = new Date(),
): Omit<UsageResourceSnapshot, "resource"> & { resource: UsageResourceName; status: UsageStatus; resetsAt: string } {
  const limits = getResourceConfig(resource, config);
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const status: UsageStatus = !config.enabled || safeUsed === 0
    ? "healthy"
    : safeUsed >= limits.blockLimit
      ? "blocked"
      : safeUsed >= limits.warningLimit
        ? "warning"
        : "healthy";

  const percentageOfSafetyLimit = limits.safetyLimit > 0 ? (safeUsed / limits.safetyLimit) * 100 : 0;

  return {
    ...limits,
    used: safeUsed,
    remainingToSafetyLimit: Math.max(0, limits.safetyLimit - safeUsed),
    remainingBeforeBlock: Math.max(0, limits.blockLimit - safeUsed),
    percentageOfSafetyLimit: Number(percentageOfSafetyLimit.toFixed(2)),
    status,
    resource,
    resetsAt: getNextUtcReset(now).toISOString(),
  };
}

type UsageStore = {
  dateKey: string;
  resources: Record<UsageResourceName, { used: number }>;
};

function ensureUsageStore(now: Date): UsageStore {
  const root = globalThis as typeof globalThis & { __TEMP_MAIL_USAGE__?: UsageStore };
  const dateKey = toUtcDateKey(now);
  if (!root.__TEMP_MAIL_USAGE__ || root.__TEMP_MAIL_USAGE__.dateKey !== dateKey) {
    root.__TEMP_MAIL_USAGE__ = {
      dateKey,
      resources: {
        worker_requests: { used: 0 },
        d1_reads: { used: 0 },
        d1_writes: { used: 0 },
      },
    };
  }
  return root.__TEMP_MAIL_USAGE__;
}

export function recordUsage(
  resource: UsageResourceName,
  amount: number,
  config: UsageConfig,
  now: Date = new Date(),
): Omit<UsageResourceSnapshot, "resource"> & { resource: UsageResourceName; status: UsageStatus; resetsAt: string } {
  if (!config.enabled || !Number.isFinite(amount) || amount <= 0) {
    return getUsageProtectionStatus(resource, config, 0, now);
  }
  const store = ensureUsageStore(now);
  store.resources[resource].used = (store.resources[resource].used || 0) + amount;
  return getUsageProtectionStatus(resource, config, store.resources[resource].used, now);
}

export function getUsageSnapshot(env: Record<string, string | undefined>, now: Date = new Date()): UsageSnapshot {
  const config = getUsageConfig(env);
  const store = ensureUsageStore(now);
  const resources = {
    worker_requests: getUsageProtectionStatus("worker_requests", config, store.resources.worker_requests.used, now),
    d1_reads: getUsageProtectionStatus("d1_reads", config, store.resources.d1_reads.used, now),
    d1_writes: getUsageProtectionStatus("d1_writes", config, store.resources.d1_writes.used, now),
  };

  const prioritized = [resources.worker_requests, resources.d1_reads, resources.d1_writes].sort((a, b) => {
    const order: Record<UsageStatus, number> = { blocked: 3, warning: 2, healthy: 1 };
    return order[b.status] - order[a.status];
  })[0];

  return {
    enabled: config.enabled,
    date: toUtcDateKey(now),
    status: prioritized ? prioritized.status : "healthy",
    resource: prioritized && prioritized.status !== "healthy" ? prioritized.resource : null,
    resources,
    resetsAt: getNextUtcReset(now).toISOString(),
  };
}
