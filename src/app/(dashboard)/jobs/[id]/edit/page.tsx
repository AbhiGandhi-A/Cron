"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/components/Toast";
import { SCHEDULE_OPTIONS } from "@/lib/validation";

type BodyType = "none" | "json" | "form" | "text";

interface Notifications {
  enabled: boolean;
  url: string;
  failureThreshold: number;
  notifyOnRecovery: boolean;
}

interface Form {
  name: string;
  url: string;
  method: string;
  headers: { key: string; value: string }[];
  bodyType: BodyType;
  jsonBody: string;
  formBody: { key: string; value: string }[];
  rawBody: string;
  queryParams: { key: string; value: string }[];
  schedule: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
  notifications: Notifications;
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
  isActive: boolean;
  timeout: number;
  retryCount: number;
  notifications?: {
    enabled: boolean;
    url: string;
    failureThreshold: number;
    notifyOnRecovery: boolean;
  } | null;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const INPUT_CLS = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";
const SMALL_INPUT_CLS = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";
const SECTION_CLS = "bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5";
const SECTION_TITLE = "text-base font-bold text-gray-900";
const LABEL_CLS = "block text-sm font-semibold text-gray-700 mb-1.5";

function buildPairs(pairs: { key: string; value: string }[]): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const p of pairs) {
    if (p.key.trim()) result[p.key.trim()] = p.value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function parsePairs(data: Record<string, string> | null | undefined): { key: string; value: string }[] {
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

export default function EditJobPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useCustomSchedule, setUseCustomSchedule] = useState(false);
  const [showQueryParams, setShowQueryParams] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [form, setForm] = useState<Form>({
    name: "",
    url: "",
    method: "GET",
    headers: [],
    bodyType: "none",
    jsonBody: "",
    formBody: [],
    rawBody: "",
    queryParams: [],
    schedule: "* * * * *",
    isActive: true,
    timeout: 30000,
    retryCount: 3,
    notifications: {
      enabled: false,
      url: "",
      failureThreshold: 1,
      notifyOnRecovery: true,
    },
  });

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/" + params.id);
      if (!res.ok) { showToast("Job not found", "error"); router.push("/jobs"); return; }
      const data = await res.json();
      const job: JobData = data.job;

      const bt = inferBodyType(job.body, job.bodyType);
      let jsonBody = "";
      let rawBody = "";
      let formBody: { key: string; value: string }[] = [];

      if (bt === "json" && job.body) {
        jsonBody = typeof job.body === "string" ? job.body : JSON.stringify(job.body, null, 2);
      } else if (bt === "text" && typeof job.body === "string") {
        rawBody = job.body;
      } else if (bt === "form" && job.body && typeof job.body === "object") {
        formBody = parsePairs(job.body as Record<string, string>);
      }

      const notif = job.notifications || { enabled: false, url: "", failureThreshold: 1, notifyOnRecovery: true };

      const isPreset = SCHEDULE_OPTIONS.some((o) => o.value === job.schedule && o.value !== "custom");
      if (!isPreset) setUseCustomSchedule(true);

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
        isActive: job.isActive,
        timeout: job.timeout,
        retryCount: job.retryCount,
        notifications: {
          enabled: notif.enabled,
          url: notif.url,
          failureThreshold: notif.failureThreshold,
          notifyOnRecovery: notif.notifyOnRecovery,
        },
      });

      if (notif.enabled || (notif.url && notif.url.length > 0)) {
        setShowNotifications(true);
      }
      if (job.queryParams && Object.keys(job.queryParams).length > 0) {
        setShowQueryParams(true);
      }
      if (job.headers && Object.keys(job.headers).length > 0) {
        setShowHeaders(true);
      }
    } catch {
      showToast("Failed to load job", "error");
    } finally {
      setLoading(false);
    }
  }, [params.id, showToast, router]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  function updateForm<K extends keyof Form>(key: K, value: Form[K]) {
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
            try { body = JSON.parse(form.jsonBody); } catch { showToast("Invalid JSON body", "error"); setSaving(false); return; }
          }
        } else if (form.bodyType === "form") {
          const parsed = buildPairs(form.formBody);
          if (parsed) body = parsed;
        } else if (form.bodyType === "text") {
          if (form.rawBody.trim()) body = form.rawBody;
        }
      }

      const notifications = form.notifications.enabled ? {
        enabled: true,
        url: form.notifications.url,
        failureThreshold: form.notifications.failureThreshold,
        notifyOnRecovery: form.notifications.notifyOnRecovery,
      } : { enabled: false, url: "", failureThreshold: 1, notifyOnRecovery: true };

      const res = await fetch("/api/jobs/" + params.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          method: form.method,
          headers,
          body,
          bodyType: hasBody ? form.bodyType : "none",
          queryParams,
          schedule: form.schedule,
          isActive: form.isActive,
          timeout: Number(form.timeout),
          retryCount: Number(form.retryCount),
          notifications,
        }),
      });

      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to update job", "error"); return; }
      showToast("Job updated successfully", "success");
      router.push("/jobs/" + params.id);
    } catch {
      showToast("Failed to update job", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const showBody = ["POST", "PUT", "PATCH"].includes(form.method);
  const bodyTypes: { value: BodyType; label: string }[] = [
    { value: "none", label: "No Body" },
    { value: "json", label: "JSON" },
    { value: "form", label: "Form Data" },
    { value: "text", label: "Raw Text" },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Edit Cron Job</h1>
          <p className="text-sm text-gray-500 mt-1">Update your scheduled API job</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className={SECTION_CLS}>
            <h2 className={SECTION_TITLE}>Basic Info</h2>
            <div>
              <label className={LABEL_CLS}>Job Name</label>
              <input type="text" required value={form.name} onChange={(e) => updateForm("name", e.target.value)}
                className={INPUT_CLS} placeholder="e.g., Health Check API" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className={LABEL_CLS}>Method</label>
                <select value={form.method} onChange={(e) => updateForm("method", e.target.value)} className={INPUT_CLS}>
                  {HTTP_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className={LABEL_CLS}>API URL</label>
                <input type="url" required value={form.url} onChange={(e) => updateForm("url", e.target.value)}
                  className={INPUT_CLS} placeholder="https://api.example.com/endpoint" />
              </div>
            </div>
          </div>

          <div className={SECTION_CLS}>
            <button type="button" onClick={() => setShowQueryParams(!showQueryParams)}
              className="flex items-center justify-between w-full">
              <h2 className={SECTION_TITLE}>Query Parameters</h2>
              <svg className={"w-5 h-5 text-gray-400 transition-transform " + (showQueryParams ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showQueryParams && (
              <div className="space-y-3">
                {form.queryParams.map((pair, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                    <input type="text" value={pair.key} onChange={(e) => updatePair("queryParams", i, "key", e.target.value)}
                      className={SMALL_INPUT_CLS} placeholder="Key" />
                    <input type="text" value={pair.value} onChange={(e) => updatePair("queryParams", i, "value", e.target.value)}
                      className={SMALL_INPUT_CLS} placeholder="Value" />
                    <button type="button" onClick={() => removePair("queryParams", i)}
                      className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addPair("queryParams")}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
                  + Add Parameter
                </button>
              </div>
            )}
          </div>

          <div className={SECTION_CLS}>
            <button type="button" onClick={() => setShowHeaders(!showHeaders)}
              className="flex items-center justify-between w-full">
              <h2 className={SECTION_TITLE}>Headers</h2>
              <svg className={"w-5 h-5 text-gray-400 transition-transform " + (showHeaders ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showHeaders && (
              <div className="space-y-3">
                {form.headers.map((pair, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                    <input type="text" value={pair.key} onChange={(e) => updatePair("headers", i, "key", e.target.value)}
                      className={SMALL_INPUT_CLS} placeholder="Content-Type, Authorization, X-API-Key..." />
                    <input type="text" value={pair.value} onChange={(e) => updatePair("headers", i, "value", e.target.value)}
                      className={SMALL_INPUT_CLS} placeholder="Value" />
                    <button type="button" onClick={() => removePair("headers", i)}
                      className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addPair("headers")}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
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
                  <button key={bt.value} type="button" onClick={() => updateForm("bodyType", bt.value)}
                    className={"px-4 py-2 border rounded-lg text-sm font-medium transition-all " + (form.bodyType === bt.value
                      ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")}>
                    {bt.label}
                  </button>
                ))}
              </div>
              {form.bodyType === "json" && (
                <div>
                  <label className={LABEL_CLS}>JSON Body</label>
                  <textarea value={form.jsonBody} onChange={(e) => updateForm("jsonBody", e.target.value)}
                    className={INPUT_CLS + " font-mono text-xs"} rows={6} placeholder='{"key": "value"}' />
                </div>
              )}
              {form.bodyType === "form" && (
                <div className="space-y-3">
                  {form.formBody.map((pair, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                      <input type="text" value={pair.key} onChange={(e) => updatePair("formBody", i, "key", e.target.value)}
                        className={SMALL_INPUT_CLS} placeholder="Field name" />
                      <input type="text" value={pair.value} onChange={(e) => updatePair("formBody", i, "value", e.target.value)}
                        className={SMALL_INPUT_CLS} placeholder="Value" />
                      <button type="button" onClick={() => removePair("formBody", i)}
                        className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addPair("formBody")}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
                    + Add Field
                  </button>
                </div>
              )}
              {form.bodyType === "text" && (
                <div>
                  <label className={LABEL_CLS}>Raw Body</label>
                  <textarea value={form.rawBody} onChange={(e) => updateForm("rawBody", e.target.value)}
                    className={INPUT_CLS + " font-mono text-xs"} rows={6} placeholder="Plain text body content" />
                </div>
              )}
            </div>
          )}

          <div className={SECTION_CLS}>
            <h2 className={SECTION_TITLE}>Schedule</h2>
            {!useCustomSchedule ? (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Preset Schedule</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => { if (opt.value === "custom") setUseCustomSchedule(true); else updateForm("schedule", opt.value); }}
                      className={"px-4 py-3 border rounded-xl text-sm font-medium transition-all " + (form.schedule === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className={LABEL_CLS}>Cron Expression</label>
                <input type="text" value={form.schedule} onChange={(e) => updateForm("schedule", e.target.value)}
                  className={INPUT_CLS + " font-mono"} placeholder="*/5 * * * *" />
                <p className="text-xs text-gray-400 mt-1.5">Format: minute hour day-of-month month day-of-week</p>
                <button type="button" onClick={() => setUseCustomSchedule(false)}
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium mt-2">
                  Use preset schedule
                </button>
              </div>
            )}
          </div>

          <div className={SECTION_CLS}>
            <h2 className={SECTION_TITLE}>Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Timeout (ms)</label>
                <input type="number" min={1000} max={300000} value={form.timeout}
                  onChange={(e) => updateForm("timeout", Number(e.target.value))} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Retry Count</label>
                <input type="number" min={0} max={10} value={form.retryCount}
                  onChange={(e) => updateForm("retryCount", Number(e.target.value))} className={INPUT_CLS} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={() => updateForm("isActive", !form.isActive)}
                className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (form.isActive ? "bg-brand-600" : "bg-gray-300")}>
                <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (form.isActive ? "translate-x-6" : "translate-x-1")} />
              </button>
              <span className="text-sm font-medium text-gray-700">{form.isActive ? "Active" : "Inactive"}</span>
            </div>
          </div>

          <div className={SECTION_CLS}>
            <button type="button" onClick={() => setShowNotifications(!showNotifications)}
              className="flex items-center justify-between w-full">
              <h2 className={SECTION_TITLE}>Notifications</h2>
              <svg className={"w-5 h-5 text-gray-400 transition-transform " + (showNotifications ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showNotifications && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => updateForm("notifications", { ...form.notifications, enabled: !form.notifications.enabled })}
                    className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (form.notifications.enabled ? "bg-brand-600" : "bg-gray-300")}>
                    <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (form.notifications.enabled ? "translate-x-6" : "translate-x-1")} />
                  </button>
                  <span className="text-sm font-medium text-gray-700">{form.notifications.enabled ? "Notifications enabled" : "Notifications disabled"}</span>
                </div>
                {form.notifications.enabled && (
                  <>
                    <div>
                      <label className={LABEL_CLS}>Notification URL</label>
                      <input type="url" value={form.notifications.url}
                        onChange={(e) => updateForm("notifications", { ...form.notifications, url: e.target.value })}
                        className={INPUT_CLS} placeholder="https://hooks.slack.com/..." />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Failure Threshold</label>
                      <select value={form.notifications.failureThreshold}
                        onChange={(e) => updateForm("notifications", { ...form.notifications, failureThreshold: Number(e.target.value) })}
                        className={INPUT_CLS}>
                        {[1, 3, 5, 10].map((n) => (
                          <option key={n} value={n}>{n} consecutive failure{n > 1 ? "s" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button"
                        onClick={() => updateForm("notifications", { ...form.notifications, notifyOnRecovery: !form.notifications.notifyOnRecovery })}
                        className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (form.notifications.notifyOnRecovery ? "bg-brand-600" : "bg-gray-300")}>
                        <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (form.notifications.notifyOnRecovery ? "translate-x-6" : "translate-x-1")} />
                      </button>
                      <span className="text-sm font-medium text-gray-700">{form.notifications.notifyOnRecovery ? "Notify on recovery" : "No recovery notification"}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.back()}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
