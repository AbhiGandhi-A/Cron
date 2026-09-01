"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/admin/Toast";
import {
  ZapIcon,
  LockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from "@/components/admin/AdminIcons";

interface CloudflareConfigState {
  accountId: string;
  zoneId: string;
  d1DatabaseId: string;
  workerName: string;
  apiTokenPresent: boolean;
  tokenPreview: string;
  configured: boolean;
  status: "connected" | "not-configured" | "configuration-required" | "connection-failed" | "unauthorized" | "not-found" | "error";
  connectionMessage: string;
  lastTested: string | null;
}

interface SettingsResponse {
  settings: {
    tempMailEnabled: boolean;
    usageProtectionEnabled: boolean;
    safetyPercent: number;
    warningPercent: number;
    blockPercent: number;
  };
  environment: string;
  version: string;
  cloudflare: CloudflareConfigState;
}

interface TestCheckResult {
  status: "CONNECTED" | "NOT CONFIGURED" | "UNAUTHORIZED" | "NOT FOUND" | "ERROR";
  message: string;
  name?: string | null;
  responseTimeMs?: number;
}

interface TestResponse {
  connected: boolean;
  status: "CONNECTED" | "NOT CONFIGURED" | "UNAUTHORIZED" | "NOT FOUND" | "ERROR";
  message: string;
  lastTested: string;
  checks?: {
    account?: TestCheckResult;
    zone?: TestCheckResult;
    d1?: TestCheckResult;
    worker?: TestCheckResult;
  };
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`Failed to fetch settings (HTTP ${res.status})`);

      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setToast({
        message: err instanceof Error ? err.message : "Failed to load settings",
        type: "error",
      });
    } finally {
      setLoading(false);
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
      });

      const json: TestResponse = await res.json();
      setTestResult(json);

      if (json.connected) {
        setToast({ message: "Cloudflare connection verified successfully!", type: "success" });
      } else {
        setToast({ message: json.message || "Cloudflare test reported issues", type: "error" });
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to run Cloudflare test",
        type: "error",
      });
    } finally {
      setTesting(false);
    }
  };

  const statusBadges: Record<string, { bg: string; text: string; label: string }> = {
    CONNECTED: { bg: "bg-emerald-50 border-emerald-200 text-emerald-700", text: "text-emerald-700", label: "Connected" },
    "NOT CONFIGURED": { bg: "bg-slate-100 border-slate-200 text-slate-700", text: "text-slate-700", label: "Not Configured" },
    UNAUTHORIZED: { bg: "bg-red-50 border-red-200 text-red-700", text: "text-red-700", label: "Unauthorized (401/403)" },
    "NOT FOUND": { bg: "bg-amber-50 border-amber-200 text-amber-700", text: "text-amber-700", label: "Not Found (404)" },
    ERROR: { bg: "bg-red-50 border-red-200 text-red-700", text: "text-red-700", label: "Error" },
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Settings</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">Server Configuration</span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Environment & Cloudflare
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Strict read-only server environment variable mapping and connection verification
          </p>
        </div>

        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
        >
          <span className={testing ? "animate-spin" : ""}>⚡</span>
          <ZapIcon className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
          {testing ? "Testing Cloudflare..." : "Test Cloudflare Connection"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-500 font-medium">Loading configuration...</div>
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-xs">
          Failed to load settings. Ensure you are signed in as admin.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Notice Alert */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs text-blue-800 flex items-start gap-3">
            <span className="text-base shrink-0">🔒</span>
            <LockIcon className="w-4 h-4 shrink-0 text-blue-700 mt-0.5" />
            <div>
              <span className="font-bold">Security Invariant:</span> Cloudflare credentials and API tokens are loaded
              strictly from server-side environment variables (<code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded">.env</code>).
              Credentials are never persisted into MongoDB and raw tokens are never exposed to the browser.
            </div>
          </div>

          {/* Test Results Banner (if tested) */}
          {testResult && (
            <div
              className={`rounded-2xl border p-5 shadow-xs space-y-4 ${
                testResult.connected
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-amber-200 bg-amber-50/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{testResult.connected ? "✅" : "⚠️"}</span>
                  {testResult.connected ? (
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangleIcon className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Connection Test: {testResult.status}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">{testResult.message}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {new Date(testResult.lastTested).toLocaleTimeString()}
                </span>
              </div>

              {testResult.checks && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200/60">
                  {/* Account check */}
                  {testResult.checks.account && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">Account API</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            statusBadges[testResult.checks.account.status]?.bg || ""
                          }`}
                        >
                          {testResult.checks.account.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {testResult.checks.account.name ? `Name: ${testResult.checks.account.name}` : testResult.checks.account.message}
                      </p>
                      {testResult.checks.account.responseTimeMs !== undefined && (
                        <p className="text-[10px] text-slate-400">Latency: {testResult.checks.account.responseTimeMs}ms</p>
                      )}
                    </div>
                  )}

                  {/* Zone check */}
                  {testResult.checks.zone && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">Zone Access</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            statusBadges[testResult.checks.zone.status]?.bg || ""
                          }`}
                        >
                          {testResult.checks.zone.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {testResult.checks.zone.name ? `Zone: ${testResult.checks.zone.name}` : testResult.checks.zone.message}
                      </p>
                      {testResult.checks.zone.responseTimeMs !== undefined && (
                        <p className="text-[10px] text-slate-400">Latency: {testResult.checks.zone.responseTimeMs}ms</p>
                      )}
                    </div>
                  )}

                  {/* D1 check */}
                  {testResult.checks.d1 && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">D1 Database</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            statusBadges[testResult.checks.d1.status]?.bg || ""
                          }`}
                        >
                          {testResult.checks.d1.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {testResult.checks.d1.name ? `DB: ${testResult.checks.d1.name}` : testResult.checks.d1.message}
                      </p>
                      {testResult.checks.d1.responseTimeMs !== undefined && (
                        <p className="text-[10px] text-slate-400">Latency: {testResult.checks.d1.responseTimeMs}ms</p>
                      )}
                    </div>
                  )}

                  {/* Worker check */}
                  {testResult.checks.worker && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">Worker Script</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            statusBadges[testResult.checks.worker.status]?.bg || ""
                          }`}
                        >
                          {testResult.checks.worker.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {testResult.checks.worker.name ? `Script: ${testResult.checks.worker.name}` : testResult.checks.worker.message}
                      </p>
                      {testResult.checks.worker.responseTimeMs !== undefined && (
                        <p className="text-[10px] text-slate-400">Latency: {testResult.checks.worker.responseTimeMs}ms</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cloudflare Environment Variable Cards */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Cloudflare Environment Variables</h2>
                <p className="text-xs text-slate-500">Configured via server-side environment (.env)</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  data.cloudflare.accountId && (data.cloudflare.apiTokenPresent || data.cloudflare.configured)
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {data.cloudflare.accountId && (data.cloudflare.apiTokenPresent || data.cloudflare.configured)
                  ? "● Configured in ENV"
                  : "● Incomplete ENV"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Account ID */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">CLOUDFLARE_ACCOUNT_ID</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Required</span>
                </div>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-800">
                  {data.cloudflare.accountId || <span className="text-slate-400 italic">Not set in .env</span>}
                </div>
                <p className="text-[11px] text-slate-500">Your 32-character Cloudflare account tag.</p>
              </div>

              {/* API Token */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">CLOUDFLARE_API_TOKEN</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Required</span>
                </div>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-800">
                  {data.cloudflare.tokenPreview || <span className="text-slate-400 italic">Not set in .env</span>}
                </div>
                <p className="text-[11px] text-slate-500">Scoped token with Account, Zone, Worker, D1 permissions.</p>
              </div>

              {/* Zone ID */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">CLOUDFLARE_ZONE_ID</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Optional</span>
                </div>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-800">
                  {data.cloudflare.zoneId || <span className="text-slate-400 italic">Not set in .env</span>}
                </div>
                <p className="text-[11px] text-slate-500">Zone identifier for DNS & CDN edge analytics.</p>
              </div>

              {/* D1 Database ID */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">CLOUDFLARE_D1_DATABASE_ID</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Optional</span>
                </div>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-800">
                  {data.cloudflare.d1DatabaseId || <span className="text-slate-400 italic">Not set in .env</span>}
                </div>
                <p className="text-[11px] text-slate-500">UUID of the primary serverless D1 database.</p>
              </div>

              {/* Worker Name */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">CLOUDFLARE_WORKER_NAME</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Optional</span>
                </div>
                <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-800">
                  {data.cloudflare.workerName || <span className="text-slate-400 italic">cronjobs-worker (default)</span>}
                </div>
                <p className="text-[11px] text-slate-500">Deployed worker script name on Cloudflare.</p>
              </div>
            </div>
          </div>

          {/* System & Application Environment */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Application & Service Flags
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Runtime Environment</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{data.environment}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Application Version</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{data.version}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Temp Mail Service</span>
                <span className={`font-bold text-sm mt-0.5 block ${data.settings.tempMailEnabled ? "text-emerald-700" : "text-slate-500"}`}>
                  {data.settings.tempMailEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block">Usage Protection</span>
                <span className={`font-bold text-sm mt-0.5 block ${data.settings.usageProtectionEnabled ? "text-emerald-700" : "text-slate-500"}`}>
                  {data.settings.usageProtectionEnabled ? "Active" : "Standard"}
                </span>
              </div>
            </div>
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

