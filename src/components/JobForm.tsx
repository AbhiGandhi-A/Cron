"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  intervalToCron,
  parseIntervalSchedule,
  isValidTimeZone,
  type IntervalUnit,
} from "@/lib/cron";

type BodyType = "none" | "json" | "form" | "text";
type ScheduleMode = "interval" | "cron";

interface Pair {
  key: string;
  value: string;
}

interface NotificationsForm {
  enabled: boolean;
  url: string;
  failureThreshold: number;
  notifyOnRecovery: boolean;
  notifyEveryExecution: boolean;
}

interface FormState {
  name: string;
  url: string;
  method: string;
  headers: Pair[];
  bodyType: BodyType;
  jsonBody: string;
  formBody: Pair[];
  rawBody: string;
  queryParams: Pair[];
  schedule: string;
  scheduleMode: ScheduleMode;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  timezone: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
  validateResponse: boolean;
  expectedStatus: string;
  expectedResponseRegex: string;
  notifications: NotificationsForm;
}

interface JobData {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string> | null;
  body: unknown;
  bodyType?: string;
  queryParams: Record<string, string> | null;
  schedule: string;
  timezone?: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
  expectedStatus?: number | null;
  expectedResponseRegex?: string | null;
  notifications?: {
    enabled: boolean;
    url: string;
    failureThreshold: number;
    notifyOnRecovery: boolean;
    notifyEveryExecution?: boolean;
  } | null;
}

interface Preview {
  nextRunAt: string | null;
  upcoming: string[];
  error: string | null;
}

interface JobFormProps {
  mode: "create" | "edit";
  jobId?: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const INTERVAL_PRESETS: { label: string; value: number; unit: IntervalUnit }[] = [
  { label: "Every 1 minute", value: 1, unit: "minute" },
  { label: "Every 5 minutes", value: 5, unit: "minute" },
  { label: "Every 15 minutes", value: 15, unit: "minute" },
  { label: "Every 30 minutes", value: 30, unit: "minute" },
  { label: "Every hour", value: 1, unit: "hour" },
  { label: "Every 2 hours", value: 2, unit: "hour" },
  { label: "Every day", value: 1, unit: "day" },
];

const CRON_EXAMPLES = [
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every Monday 9am", value: "0 9 * * 1" },
  { label: "Weekdays 8am", value: "0 8 * * 1-5" },
];

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Brisbane",
];

const INPUT_CLS = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";
const SMALL_INPUT_CLS = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";
const SECTION_CLS = "bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5";
const SECTION_TITLE = "text-base font-bold text-gray-900";
const LABEL_CLS = "block text-sm font-semibold text-gray-700 mb-1.5";

function buildPairs(pairs: Pair[]): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const p of pairs) {
    if (p.key.trim()) result[p.key.trim()] = p.value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function parsePairs(data: Record<string, string> | null | undefined): Pair[] {
  if (!data) return [];
  return Object.entries(data).map(([key, value]) => ({ key, value }));
}

function inferBodyType(body: unknown, bodyType?: string): BodyType {
  if (bodyType && bodyType !== "none") return bodyType as BodyType;
  if (body === null || body === undefined) return "none";
  if (typeof body === "string") return "text";
  if (typeof body === "object") return "json";
  return "none";
}

function formatInTimezone(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={"relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " + (checked ? "bg-brand-600" : "bg-gray-300")}
    >
      <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

export default function JobForm({ mode, jobId }: JobFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const editing = mode === "edit";

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [showIdleSections, setShowIdleSections] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [preview, setPreview] = useState<Preview>({ nextRunAt: null, upcoming: [], error: null });
  const [previewing, setPreviewing] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: "",
    url: "https://",
    method: "GET",
    headers: [],
    bodyType: "none",
    jsonBody: "",
    formBody: [],
    rawBody: "",
    queryParams: [],
    schedule: "*/5 * * * *",
    scheduleMode: "interval",
    intervalValue: 5,
    intervalUnit: "minute",
    timezone: "UTC",
    isActive: true,
    timeout: 30000,
    retryCount: 3,
    validateResponse: false,
    expectedStatus: "",
    expectedResponseRegex: "",
    notifications: {
      enabled: false,
      url: "",
      failureThreshold: 1,
      notifyOnRecovery: true,
      notifyEveryExecution: false,
    },
  });

  const resolveSchedule = useCallback((): string => {
    if (form.scheduleMode === "interval") {
      return intervalToCron(form.intervalValue, form.intervalUnit);
    }
    return form.schedule;
  }, [form.scheduleMode, form.intervalValue, form.intervalUnit, form.schedule]);

  const fetchPreview = useCallback(async () => {
    const cron = resolveSchedule();
    const tz = isValidTimeZone(form.timezone) ? form.timezone : "UTC";
    const params = new URLSearchParams({ schedule: cron, timezone: tz, count: "5" });
    setPreviewing(true);
    try {
      const res = await fetch("/api/jobs/preview?" + params.toString());
      const data = await res.json();
      if (res.ok) {
        setPreview({ nextRunAt: data.nextRunAt, upcoming: data.upcoming, error: null });
      } else {
        setPreview({ nextRunAt: null, upcoming: [], error: data.error || "Invalid schedule" });
      }
    } catch {
      setPreview({ nextRunAt: null, upcoming: [], error: "Could not compute schedule preview" });
    } finally {
      setPreviewing(false);
    }
  }, [resolveSchedule, form.timezone]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchPreview();
    }, 450);
    return () => clearTimeout(handle);
  }, [fetchPreview, resolveSchedule]);

  useEffect(() => {
    if (!editing || !jobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs/" + jobId);
        if (!res.ok) {
          showToast("Job not found", "error");
          router.push("/jobs");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const job: JobData = data.job;

        const bt = inferBodyType(job.body, job.bodyType);
        let jsonBody = "";
        let rawBody = "";
        let formBody: Pair[] = [];
        if (bt === "json" && job.body) {
          jsonBody = typeof job.body === "string" ? job.body : JSON.stringify(job.body, null, 2);
        } else if (bt === "text" && typeof job.body === "string") {
          rawBody = job.body;
        } else if (bt === "form" && job.body && typeof job.body === "object") {
          formBody = parsePairs(job.body as Record<string, string>);
        }

        const notif = job.notifications || {
          enabled: false,
          url: "",
          failureThreshold: 1,
          notifyOnRecovery: true,
          notifyEveryExecution: false,
        };

        const parsedInterval = parseIntervalSchedule(job.schedule);
        const tz = job.timezone || "UTC";

        setForm({
          name: job.name,
          url: job.url,
          method: job.method,
          headers: parsePairs(job.headers),
          bodyType: bt,
          jsonBody,
          formBody,
          rawBody,
          queryParams: parsePairs(job.queryParams),
          schedule: job.schedule,
          scheduleMode: parsedInterval ? "interval" : "cron",
          intervalValue: parsedInterval ? parsedInterval.value : 5,
          intervalUnit: parsedInterval ? parsedInterval.unit : "minute",
          timezone: tz,
          isActive: job.isActive,
          timeout: job.timeout,
          retryCount: job.retryCount,
          validateResponse: !!(job.expectedStatus != null || job.expectedResponseRegex),
          expectedStatus: job.expectedStatus != null ? String(job.expectedStatus) : "",
          expectedResponseRegex: job.expectedResponseRegex || "",
          notifications: {
            enabled: !!notif.enabled,
            url: notif.url || "",
            failureThreshold: notif.failureThreshold || 1,
            notifyOnRecovery: !!notif.notifyOnRecovery,
            notifyEveryExecution: !!notif.notifyEveryExecution,
          },
        });

        if (notif.enabled || notif.url) setShowNotifications(true);
        if (job.queryParams && Object.keys(job.queryParams).length > 0) setShowIdleSections(true);
        if (job.headers && Object.keys(job.headers).length > 0) setShowHeaders(true);
      } catch {
        showToast("Failed to load job", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, jobId, router, showToast]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addPair(type: "headers" | "queryParams" | "formBody") {
    setForm((prev) => ({ ...prev, [type]: [...prev[type], { key: "", value: "" }] }));
  }

  function removePair(type: "headers" | "queryParams" | "formBody", index: number) {
    setForm((prev) => ({ ...prev, [type]: prev[type].filter((_, i) => i !== index) }));
  }

  function updatePair(type: "headers" | "queryParams" | "formBody", index: number, field: "key" | "value", value: string) {
    setForm((prev) => {
      const updated = [...prev[type]];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, [type]: updated };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const headers = buildPairs(form.headers);
      const queryParams = buildPairs(form.queryParams);

      let body: unknown = null;
      const hasBody = ["POST", "PUT", "PATCH"].includes(form.method);

      if (hasBody) {
        if (form.bodyType === "json") {
          if (form.jsonBody.trim()) {
            try {
              body = JSON.parse(form.jsonBody);
            } catch {
              showToast("Invalid JSON body", "error");
              setSaving(false);
              return;
            }
          }
        } else if (form.bodyType === "form") {
          const parsed = buildPairs(form.formBody);
          if (parsed) body = parsed;
        } else if (form.bodyType === "text") {
          if (form.rawBody.trim()) body = form.rawBody;
        }
      }

      const notifications = form.notifications.enabled
        ? {
            enabled: true,
            url: form.notifications.url,
            failureThreshold: form.notifications.failureThreshold,
            notifyOnRecovery: form.notifications.notifyOnRecovery,
            notifyEveryExecution: form.notifications.notifyEveryExecution,
          }
        : {
            enabled: false,
            url: "",
            failureThreshold: 1,
            notifyOnRecovery: true,
            notifyEveryExecution: false,
          };

      const expectedStatus = form.validateResponse && form.expectedStatus.trim()
        ? Number(form.expectedStatus)
        : null;
      const expectedResponseRegex =
        form.validateResponse && form.expectedResponseRegex.trim()
          ? form.expectedResponseRegex.trim()
          : null;

      const payload = {
        name: form.name,
        url: form.url,
        method: form.method,
        headers,
        body,
        bodyType: hasBody ? form.bodyType : "none",
        queryParams,
        schedule: resolveSchedule(),
        timezone: isValidTimeZone(form.timezone) ? form.timezone : "UTC",
        isActive: form.isActive,
        timeout: Number(form.timeout),
        retryCount: Number(form.retryCount),
        expectedStatus,
        expectedResponseRegex,
        notifications,
      };

      const res = await fetch(editing ? "/api/jobs/" + jobId : "/api/jobs", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to save job", "error");
        return;
      }
      showToast(editing ? "Job updated successfully" : "Job created successfully", "success");
      router.push(editing ? "/jobs/" + jobId : "/jobs");
    } catch {
      showToast("Failed to save job", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  const showBody = ["POST", "PUT", "PATCH"].includes(form.method);
  const bodyTypes: { value: BodyType; label: string }[] = [
    { value: "none", label: "No Body" },
    { value: "json", label: "JSON" },
    { value: "form", label: "Form Data" },
    { value: "text", label: "Raw Text" },
  ];

  const cronSchedule = resolveSchedule();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className={SECTION_CLS}>
        <h2 className={SECTION_TITLE}>Basic Info</h2>
        <div>
          <label className={LABEL_CLS}>Job Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
            className={INPUT_CLS}
            placeholder="e.g., Health Check API"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className={LABEL_CLS}>Method</label>
            <select
              value={form.method}
              onChange={(e) => updateForm("method", e.target.value)}
              className={INPUT_CLS}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={LABEL_CLS}>API URL</label>
            <input
              type="url"
              required
              value={form.url}
              onChange={(e) => updateForm("url", e.target.value)}
              className={INPUT_CLS}
              placeholder="https://api.example.com/endpoint"
            />
          </div>
        </div>
      </div>

      <div className={SECTION_CLS}>
        <h2 className={SECTION_TITLE}>Schedule</h2>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateForm("scheduleMode", "interval")}
            className={"px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all " + (form.scheduleMode === "interval"
              ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
              : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")}
          >
            Interval
          </button>
          <button
            type="button"
            onClick={() => updateForm("scheduleMode", "cron")}
            className={"px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all " + (form.scheduleMode === "cron"
              ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
              : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")}
          >
            Cron Expression
          </button>
        </div>

        {form.scheduleMode === "interval" ? (
          <div className="space-y-5">
            <div>
              <label className={LABEL_CLS}>Quick presets</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {INTERVAL_PRESETS.map((preset) => {
                  const active =
                    form.intervalValue === preset.value && form.intervalUnit === preset.unit;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        updateForm("intervalValue", preset.value);
                        updateForm("intervalUnit", preset.unit);
                      }}
                      className={"px-3 py-2.5 border rounded-xl text-sm font-medium transition-all " + (active
                        ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-28">
                <label className={LABEL_CLS}>Every</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={form.intervalValue}
                  onChange={(e) => updateForm("intervalValue", Number(e.target.value))}
                  className={SMALL_INPUT_CLS}
                />
              </div>
              <div className="flex-1">
                <label className={LABEL_CLS}>Unit</label>
                <select
                  value={form.intervalUnit}
                  onChange={(e) => updateForm("intervalUnit", e.target.value as IntervalUnit)}
                  className={SMALL_INPUT_CLS}
                >
                  <option value="minute">minute(s)</option>
                  <option value="hour">hour(s)</option>
                  <option value="day">day(s)</option>
                </select>
              </div>
              <div className="pb-2">
                <span className="text-sm text-gray-400">= <span className="font-mono text-gray-600">{cronSchedule}</span></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Cron Expression</label>
              <input
                type="text"
                value={form.schedule}
                onChange={(e) => updateForm("schedule", e.target.value)}
                className={INPUT_CLS + " font-mono"}
                placeholder="*/5 * * * *"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Format: <span className="font-mono">minute hour day-of-month month day-of-week</span> (e.g. <span className="font-mono">0 9 * * 1-5</span> = weekdays at 9am)
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Examples</label>
              <div className="flex flex-wrap gap-2">
                {CRON_EXAMPLES.map((ex) => (
                  <button
                    key={ex.value}
                    type="button"
                    onClick={() => updateForm("schedule", ex.value)}
                    className={"px-3 py-1.5 border rounded-lg text-xs font-mono transition-all " + (form.schedule === ex.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50")}
                    title={ex.label}
                  >
                    {ex.value}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className={LABEL_CLS}>Timezone</label>
          <input
            type="text"
            value={form.timezone}
            onChange={(e) => updateForm("timezone", e.target.value)}
            className={INPUT_CLS + " font-mono"}
            placeholder="UTC"
            list="job-timezones"
          />
          <datalist id="job-timezones">
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          <p className="text-xs text-gray-400 mt-1.5">
            All execution times are interpreted in this IANA timezone (e.g. <span className="font-mono">America/New_York</span>).
            {!isValidTimeZone(form.timezone) && form.timezone && (
              <span className="text-red-500"> Invalid timezone.</span>
            )}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Next + 4 upcoming runs
            </p>
            {previewing && (
              <div className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            )}
          </div>
          {preview.error ? (
            <p className="text-sm text-red-500 font-medium">{preview.error}</p>
          ) : preview.upcoming.length > 0 ? (
            <ol className="space-y-1.5">
              {preview.upcoming.slice(0, 5).map((run, i) => (
                <li key={run + i} className="flex items-center gap-3 text-sm">
                  <span className={"inline-block h-1.5 w-1.5 rounded-full " + (i === 0 ? "bg-brand-600" : "bg-gray-300")} />
                  <span className={"font-mono font-medium " + (i === 0 ? "text-gray-900" : "text-gray-500")}>
                    {formatInTimezone(run, isValidTimeZone(form.timezone) ? form.timezone : "UTC")}
                  </span>
                  {i === 0 && <span className="text-[11px] font-semibold text-brand-600 uppercase tracking-wider">Next</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-400">Enter a valid schedule to see upcoming runs.</p>
          )}
        </div>
      </div>

      <div className={SECTION_CLS}>
        <button
          type="button"
          onClick={() => setShowIdleSections(!showIdleSections)}
          className="flex items-center justify-between w-full"
        >
          <h2 className={SECTION_TITLE}>Query Parameters</h2>
          <svg className={"w-5 h-5 text-gray-400 transition-transform " + (showIdleSections ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showIdleSections && (
          <div className="space-y-3">
            {form.queryParams.map((pair, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                <input type="text" value={pair.key} onChange={(e) => updatePair("queryParams", i, "key", e.target.value)} className={SMALL_INPUT_CLS} placeholder="Key" />
                <input type="text" value={pair.value} onChange={(e) => updatePair("queryParams", i, "value", e.target.value)} className={SMALL_INPUT_CLS} placeholder="Value" />
                <button type="button" onClick={() => removePair("queryParams", i)} className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addPair("queryParams")} className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
              + Add Parameter
            </button>
          </div>
        )}
      </div>

      <div className={SECTION_CLS}>
        <button type="button" onClick={() => setShowHeaders(!showHeaders)} className="flex items-center justify-between w-full">
          <h2 className={SECTION_TITLE}>Headers</h2>
          <svg className={"w-5 h-5 text-gray-400 transition-transform " + (showHeaders ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showHeaders && (
          <div className="space-y-3">
            {form.headers.map((pair, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                <input type="text" value={pair.key} onChange={(e) => updatePair("headers", i, "key", e.target.value)} className={SMALL_INPUT_CLS} placeholder="Content-Type, Authorization, X-API-Key..." />
                <input type="text" value={pair.value} onChange={(e) => updatePair("headers", i, "value", e.target.value)} className={SMALL_INPUT_CLS} placeholder="Value" />
                <button type="button" onClick={() => removePair("headers", i)} className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addPair("headers")} className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
              + Add Header
            </button>
          </div>
        )}
      </div>

      {showBody && (
        <div className={SECTION_CLS}>
          <h2 className={SECTION_TITLE}>Request Body</h2>
          <div className="flex flex-wrap gap-2">
            {bodyTypes.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => updateForm("bodyType", bt.value)}
                className={"px-4 py-2 border rounded-lg text-sm font-medium transition-all " + (form.bodyType === bt.value
                  ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")}
              >
                {bt.label}
              </button>
            ))}
          </div>
          {form.bodyType === "json" && (
            <div>
              <label className={LABEL_CLS}>JSON Body</label>
              <textarea value={form.jsonBody} onChange={(e) => updateForm("jsonBody", e.target.value)} className={INPUT_CLS + " font-mono text-xs"} rows={6} placeholder='{"key": "value"}' />
            </div>
          )}
          {form.bodyType === "form" && (
            <div className="space-y-3">
              {form.formBody.map((pair, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                  <input type="text" value={pair.key} onChange={(e) => updatePair("formBody", i, "key", e.target.value)} className={SMALL_INPUT_CLS} placeholder="Field name" />
                  <input type="text" value={pair.value} onChange={(e) => updatePair("formBody", i, "value", e.target.value)} className={SMALL_INPUT_CLS} placeholder="Value" />
                  <button type="button" onClick={() => removePair("formBody", i)} className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => addPair("formBody")} className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
                + Add Field
              </button>
            </div>
          )}
          {form.bodyType === "text" && (
            <div>
              <label className={LABEL_CLS}>Raw Body</label>
              <textarea value={form.rawBody} onChange={(e) => updateForm("rawBody", e.target.value)} className={INPUT_CLS + " font-mono text-xs"} rows={6} placeholder="Plain text body content" />
            </div>
          )}
        </div>
      )}

      <div className={SECTION_CLS}>
        <h2 className={SECTION_TITLE}>Response Validation</h2>
        <div className="flex items-center gap-3">
          <Toggle
            checked={form.validateResponse}
            onChange={() => updateForm("validateResponse", !form.validateResponse)}
          />
          <span className="text-sm font-medium text-gray-700">
            {form.validateResponse ? "Mark execution as failed when the response does not match" : "Only HTTP 4xx/5xx count as failures"}
          </span>
        </div>
        {form.validateResponse && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Expected Status Code</label>
              <input
                type="number"
                min={100}
                max={599}
                value={form.expectedStatus}
                onChange={(e) => updateForm("expectedStatus", e.target.value)}
                className={SMALL_INPUT_CLS}
                placeholder="200"
              />
              <p className="text-xs text-gray-400 mt-1">Leave empty to skip</p>
            </div>
            <div>
              <label className={LABEL_CLS}>Expected Body Pattern (regex)</label>
              <input
                type="text"
                value={form.expectedResponseRegex}
                onChange={(e) => updateForm("expectedResponseRegex", e.target.value)}
                className={SMALL_INPUT_CLS + " font-mono"}
                placeholder='"ok"|success|UP'
              />
              <p className="text-xs text-gray-400 mt-1">Body must contain a match. Leave empty to skip</p>
            </div>
          </div>
        )}
      </div>

      <div className={SECTION_CLS}>
        <h2 className={SECTION_TITLE}>Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Timeout (ms)</label>
            <input type="number" min={1000} max={300000} value={form.timeout} onChange={(e) => updateForm("timeout", Number(e.target.value))} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Retry Count</label>
            <input type="number" min={0} max={10} value={form.retryCount} onChange={(e) => updateForm("retryCount", Number(e.target.value))} className={INPUT_CLS} />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Toggle checked={form.isActive} onChange={() => updateForm("isActive", !form.isActive)} />
          <span className="text-sm font-medium text-gray-700">{editing ? (form.isActive ? "Active" : "Inactive") : (form.isActive ? "Active immediately" : "Create as inactive")}</span>
        </div>
      </div>

      <div className={SECTION_CLS}>
        <button type="button" onClick={() => setShowNotifications(!showNotifications)} className="flex items-center justify-between w-full">
          <h2 className={SECTION_TITLE}>Notifications</h2>
          <svg className={"w-5 h-5 text-gray-400 transition-transform " + (showNotifications ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showNotifications && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Toggle
                checked={form.notifications.enabled}
                onChange={() => updateForm("notifications", { ...form.notifications, enabled: !form.notifications.enabled })}
              />
              <span className="text-sm font-medium text-gray-700">{form.notifications.enabled ? "Notifications enabled" : "Notifications disabled"}</span>
            </div>
            {form.notifications.enabled && (
              <>
                <div>
                  <label className={LABEL_CLS}>Notification URL (webhook)</label>
                  <input
                    type="url"
                    value={form.notifications.url}
                    onChange={(e) => updateForm("notifications", { ...form.notifications, url: e.target.value })}
                    className={INPUT_CLS}
                    placeholder="https://hooks.slack.com/..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={form.notifications.notifyEveryExecution}
                    onChange={() => updateForm("notifications", { ...form.notifications, notifyEveryExecution: !form.notifications.notifyEveryExecution })}
                  />
                  <span className="text-sm font-medium text-gray-700">Notify on every execution</span>
                </div>
                <div>
                  <label className={LABEL_CLS}>Failure Threshold</label>
                  <select
                    value={form.notifications.failureThreshold}
                    onChange={(e) => updateForm("notifications", { ...form.notifications, failureThreshold: Number(e.target.value) })}
                    className={INPUT_CLS}
                  >
                    {[1, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n} consecutive failure{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={form.notifications.notifyOnRecovery}
                    onChange={() => updateForm("notifications", { ...form.notifications, notifyOnRecovery: !form.notifications.notifyOnRecovery })}
                  />
                  <span className="text-sm font-medium text-gray-700">{form.notifications.notifyOnRecovery ? "Notify on recovery" : "No recovery notification"}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? "Saving..." : editing ? "Save Changes" : "Create Job"}
        </button>
      </div>
    </form>
  );
}