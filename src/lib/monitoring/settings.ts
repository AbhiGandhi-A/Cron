export interface AiMonitoringSettings {
  enabled: boolean;
  autoAnalyze: boolean;
  autoOpenCritical: boolean;
  normalMs: number;
  warningMs: number;
}

export const DEFAULT_AI_SETTINGS: AiMonitoringSettings = {
  enabled: true,
  autoAnalyze: true,
  autoOpenCritical: true,
  normalMs: 1000,
  warningMs: 3000,
};

const STORAGE_KEY = "cronjobio.ai.settings";

export function clampThreshold(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

function isSetting(value: unknown): value is AiMonitoringSettings {
  return Boolean(value) && typeof value === "object";
}

export function getAiSettings(): AiMonitoringSettings {
  if (typeof window === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiMonitoringSettings>;
    if (!isSetting(parsed)) return { ...DEFAULT_AI_SETTINGS };
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_AI_SETTINGS.enabled,
      autoAnalyze: typeof parsed.autoAnalyze === "boolean" ? parsed.autoAnalyze : DEFAULT_AI_SETTINGS.autoAnalyze,
      autoOpenCritical: typeof parsed.autoOpenCritical === "boolean" ? parsed.autoOpenCritical : DEFAULT_AI_SETTINGS.autoOpenCritical,
      normalMs: clampThreshold(parsed.normalMs, DEFAULT_AI_SETTINGS.normalMs, 100, 60_000),
      warningMs: clampThreshold(parsed.warningMs, DEFAULT_AI_SETTINGS.warningMs, 500, 120_000),
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiMonitoringSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}