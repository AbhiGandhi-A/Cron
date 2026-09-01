"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/admin/Toast";

interface CloudflareSettingsSnapshot {
  accountId: string;
  zoneId: string;
  d1DatabaseId: string;
  workerName: string;
  apiTokenPresent: boolean;
  status: "connected" | "not-configured" | "configuration-required" | "connection-failed" | "zone-error";
  connectionMessage: string;
  lastTested: string | null;
}

export default function SettingsPage() {
  const [form, setForm] = useState({ accountId: "", zoneId: "", d1DatabaseId: "", workerName: "", apiToken: "" });
  const [accountInfo, setAccountInfo] = useState<CloudflareSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: token },
      });

      if (!res.ok) throw new Error("Failed to fetch settings");

      const data = await res.json();
      setAccountInfo({
        accountId: data.accountId || "",
        zoneId: data.zoneId || "",
        d1DatabaseId: data.d1DatabaseId || "",
        workerName: data.workerName || "",
        apiTokenPresent: Boolean(data.apiTokenPresent),
        status: data.status || "not-configured",
        connectionMessage: data.connectionMessage || "Cloudflare Configuration Required",
        lastTested: data.lastTested || null,
      });
      setForm({
        accountId: data.accountId || "",
        zoneId: data.zoneId || "",
        d1DatabaseId: data.d1DatabaseId || "",
        workerName: data.workerName || "",
        apiToken: "",
      });
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to load Cloudflare settings", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) {
        setToast({ message: "Admin authentication required", type: "error" });
        return;
      }

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");

      setAccountInfo({
        accountId: data.accountId || "",
        zoneId: data.zoneId || "",
        d1DatabaseId: data.d1DatabaseId || "",
        workerName: data.workerName || "",
        apiTokenPresent: Boolean(data.apiTokenPresent),
        status: data.status || "not-configured",
        connectionMessage: data.connectionMessage || "Cloudflare Configuration Required",
        lastTested: data.lastTested || null,
      });
      setForm((prev) => ({ ...prev, apiToken: "" }));
      setToast({ message: data.message || "Cloudflare configuration saved", type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to save Cloudflare configuration",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) {
        setToast({ message: "Admin authentication required", type: "error" });
        return;
      }

      const res = await fetch("/api/admin/cloudflare-test", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Cloudflare connection test failed");
      }

      const nextStatus = data.connected ? "connected" : data.accountAccessible ? "configuration-required" : "connection-failed";
      setAccountInfo({
        accountId: form.accountId,
        zoneId: form.zoneId,
        d1DatabaseId: form.d1DatabaseId,
        workerName: form.workerName,
        apiTokenPresent: Boolean(form.apiToken || data.apiTokenPresent),
        status: nextStatus,
        connectionMessage: data.message || "Cloudflare connection test completed.",
        lastTested: data.lastTested || new Date().toISOString(),
      });
      setForm((prev) => ({ ...prev, apiToken: "" }));
      setToast({ message: data.message || "Cloudflare connection verified", type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Cloudflare authentication failed",
        type: "error",
      });
    } finally {
      setTesting(false);
    }
  };

  const statusConfig = {
    connected: { label: "Connected", tone: "bg-emerald-100 text-emerald-700 border border-emerald-200", dot: "🟢" },
    "configuration-required": { label: "Configuration Required", tone: "bg-amber-100 text-amber-700 border border-amber-200", dot: "🟡" },
    "not-configured": { label: "Not Configured", tone: "bg-slate-100 text-slate-700 border border-slate-200", dot: "🔴" },
    "connection-failed": { label: "Connection Failed", tone: "bg-red-100 text-red-700 border border-red-200", dot: "🔴" },
    "zone-error": { label: "Zone Error", tone: "bg-amber-100 text-amber-700 border border-amber-200", dot: "🟡" },
  };

  const currentStatus = accountInfo?.status || "not-configured";
  const statusMeta = statusConfig[currentStatus] ?? statusConfig["not-configured"];

  return (
    <div className="space-y-6 pb-8 text-slate-900">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Admin</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Settings</h1>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">Loading settings...</div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Cloudflare Configuration</h2>
              <p className="text-sm text-slate-500">Server-side account credentials for live resource usage</p>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${statusMeta.tone}`}>
              <span>{statusMeta.dot}</span>
              {statusMeta.label}
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Cloudflare Status</span>
              <span className="font-semibold text-slate-900">{accountInfo?.connectionMessage || "Cloudflare Configuration Required"}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {accountInfo?.lastTested ? `Last checked: ${new Date(accountInfo.lastTested).toLocaleString()}` : "No connection test has been run yet."}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Account ID
              <input
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter Cloudflare account ID"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Zone ID
              <input
                value={form.zoneId}
                onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter Cloudflare zone ID"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              D1 Database ID
              <input
                value={form.d1DatabaseId}
                onChange={(e) => setForm({ ...form, d1DatabaseId: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter Cloudflare D1 database ID (optional)"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Worker Name
              <input
                value={form.workerName}
                onChange={(e) => setForm({ ...form, workerName: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
                placeholder="Enter Cloudflare worker name (optional)"
              />
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">
              API Token
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 focus-within:border-blue-300 focus-within:bg-white">
                <input
                  type={showToken ? "text" : "password"}
                  value={form.apiToken}
                  onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
                  className="w-full bg-transparent px-3 py-2.5 text-slate-900 outline-none"
                  placeholder="Enter Cloudflare API token"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  className="mr-2 text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Usage Configuration</div>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              <li>• The token is never returned to the browser and is stored only in secure server-side configuration.</li>
              <li>• The Admin Dashboard uses the configured Cloudflare account for live usage data.</li>
              <li>• Unsupported metrics display as Unavailable instead of fake zero values.</li>
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
