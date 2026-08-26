"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/components/Toast";
import { SCHEDULE_OPTIONS } from "@/lib/validation";

export default function NewJobPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [useCustomSchedule, setUseCustomSchedule] = useState(false);

  const [form, setForm] = useState({
    name: "",
    url: "https://",
    method: "GET",
    headers: "",
    body: "",
    schedule: "* * * * *",
    isActive: true,
    timeout: 30000,
    retryCount: 3,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      let headers = null;
      if (form.headers.trim()) {
        try { headers = JSON.parse(form.headers); } catch { showToast("Invalid headers JSON", "error"); setLoading(false); return; }
      }

      let body = null;
      if (form.body.trim() && form.method !== "GET") {
        try { body = JSON.parse(form.body); } catch { showToast("Invalid body JSON", "error"); setLoading(false); return; }
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, url: form.url, method: form.method,
          headers, body, schedule: form.schedule, isActive: form.isActive,
          timeout: Number(form.timeout), retryCount: Number(form.retryCount),
        }),
      });

      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to create job", "error"); return; }
      showToast("Job created successfully", "success");
      router.push("/jobs");
    } catch {
      showToast("Failed to create job", "error");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Create Cron Job</h1>
          <p className="text-sm text-gray-500 mt-1">Set up a new scheduled API job</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-900">Basic Info</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Job Name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls} placeholder="e.g., Health Check API" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Method</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}
                  className={inputCls}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">API URL</label>
                <input type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className={inputCls} placeholder="https://api.example.com/health" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-900">Request Config</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Request Headers (JSON)</label>
              <textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })}
                className={inputCls + " font-mono text-xs"} rows={3}
                placeholder='{"Authorization": "Bearer token"}' />
            </div>
            {form.method !== "GET" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Request Body (JSON)</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className={inputCls + " font-mono text-xs"} rows={4} placeholder='{"key": "value"}' />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-900">Schedule</h2>
            {!useCustomSchedule ? (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Preset Schedule</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => { if (opt.value === "custom") setUseCustomSchedule(true); else setForm({ ...form, schedule: opt.value }); }}
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
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cron Expression</label>
                <input type="text" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                  className={inputCls + " font-mono"} placeholder="*/5 * * * *" />
                <p className="text-xs text-gray-400 mt-1.5">Format: minute hour day-of-month month day-of-week</p>
                <button type="button" onClick={() => setUseCustomSchedule(false)}
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium mt-2">
                  Use preset schedule
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Timeout (ms)</label>
                <input type="number" min={1000} max={300000} value={form.timeout}
                  onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Retry Count</label>
                <input type="number" min={0} max={10} value={form.retryCount}
                  onChange={(e) => setForm({ ...form, retryCount: Number(e.target.value) })} className={inputCls} />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (form.isActive ? "bg-brand-600" : "bg-gray-300")}>
                <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (form.isActive ? "translate-x-6" : "translate-x-1")} />
              </button>
              <span className="text-sm font-medium text-gray-700">{form.isActive ? "Active immediately" : "Create as inactive"}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.back()}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors">
              {loading ? "Creating..." : "Create Job"}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
