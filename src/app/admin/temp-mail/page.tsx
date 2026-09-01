"use client";

import { useState, useEffect } from "react";
import { Toast } from "@/components/admin/Toast";
import Link from "next/link";
import { RefreshIcon, BroomIcon, ArrowRightIcon } from "@/components/admin/AdminIcons";

interface CloudflareMetric {
  id: string;
  name: string;
  label: string;
  category: "workers" | "d1" | "zone" | "account";
  current: number | null;
  limit: number | null;
  remaining: number | null;
  percentage: number | null;
  status: "healthy" | "warning" | "critical" | "unavailable";
  resetPeriod: string;
  unit?: string;
  source?: string;
}

interface TempMailStats {
  mailboxes: {
    total: number;
    active: number;
    expired: number;
    deleted: number;
    createdToday: number;
  };
  emails: {
    total: number;
    createdToday: number;
  };
  storage: {
    totalBytes: number;
    averageEmailSize: number;
  };
  cloudflare?: {
    connected?: boolean;
    resources?: CloudflareMetric[];
  } | null;
}

function safeNumber(value: unknown, fallback: number | null = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatNumber(value: unknown): string {
  const num = safeNumber(value, null);
  return num === null || !Number.isFinite(num) ? "Unavailable" : num.toLocaleString();
}

function formatBytes(value: unknown): string {
  const bytesValue = safeNumber(value, null);
  if (bytesValue === null || !Number.isFinite(bytesValue)) return "Unavailable";
  const bytes = Math.max(0, bytesValue);
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export default function TempMailPage() {
  const [stats, setStats] = useState<TempMailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/temp-mail", {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`Failed to fetch temp mail stats (HTTP ${res.status})`);

      const data = await res.json();
      setStats(data);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load stats",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to mark all expired mailboxes as expired?")) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/temp-mail", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "clean-expired" }),
      });

      if (!res.ok) throw new Error("Cleanup failed");

      const data = await res.json();
      setToast({ message: data.message || "Cleanup completed", type: "success" });
      await fetchStats();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Cleanup failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const workerMetrics = stats?.cloudflare?.resources?.filter((r) => r.category === "workers") || [];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Temp Mail</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">Service Analytics</span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Temporary Mail Control
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor disposable mailbox lifecycle, inbound messages, and Cloudflare Worker traffic
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            <RefreshIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={handleCleanup}
            disabled={actionLoading || loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <span>🧹</span>
            <BroomIcon className="w-3.5 h-3.5" />
            {actionLoading ? "Processing..." : "Prune Expired Mailboxes"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-500 font-medium">Loading temp-mail metrics...</div>
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-xs">
          Failed to load temporary mail statistics. Please verify backend connection.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Mailboxes Overview */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Mailbox Lifecycle</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Total Mailboxes</span>
                <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                  {formatNumber(stats.mailboxes.total)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">All created mailboxes</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Active Mailboxes</span>
                <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                  {formatNumber(stats.mailboxes.active)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Currently accessible</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Expired Mailboxes</span>
                <span className="text-2xl font-extrabold text-amber-700 mt-1 block">
                  {formatNumber(stats.mailboxes.expired)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Past expiration time</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Deleted Mailboxes</span>
                <span className="text-2xl font-extrabold text-slate-600 mt-1 block">
                  {formatNumber(stats.mailboxes.deleted)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Replaced by new generation</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Created Today</span>
                <span className="text-2xl font-extrabold text-blue-700 mt-1 block">
                  {formatNumber(stats.mailboxes.createdToday)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Since 00:00 UTC</span>
              </div>
            </div>
          </section>

          {/* Section 2: Emails & Storage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3">Email Messages</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Total Messages Stored</span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                    {formatNumber(stats.emails.total)}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Messages Received Today</span>
                  <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                    {formatNumber(stats.emails.createdToday)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3">Storage Consumption</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Total Email Body Storage</span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                    {formatBytes(stats.storage.totalBytes)}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Average Message Size</span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                    {formatBytes(stats.storage.averageEmailSize)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Cloudflare Worker Invocations */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Cloudflare Worker Analytics (Temp Mail Microservice)</h3>
                <p className="text-xs text-slate-500">GraphQL invocations & subrequest activity from Cloudflare</p>
              </div>
              <Link
                href="/admin/settings"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Settings →
                <span>Settings</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>

            {workerMetrics.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                Cloudflare worker analytics unavailable. Ensure credentials are set in environment.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {workerMetrics.map((metric) => {
                  const hasLimit = metric.limit !== null && metric.limit > 0;
                  const isBytes = metric.unit === "bytes";
                  const currentFormatted = isBytes ? formatBytes(metric.current) : formatNumber(metric.current);
                  const limitFormatted = isBytes ? formatBytes(metric.limit) : formatNumber(metric.limit);
                  const remainingFormatted = isBytes ? formatBytes(metric.remaining) : formatNumber(metric.remaining);

                  return (
                    <div key={metric.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">{metric.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            metric.status === "critical"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : metric.status === "warning"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : metric.status === "healthy"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {metric.status.charAt(0).toUpperCase() + metric.status.slice(1)}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {currentFormatted}
                          </span>
                          {hasLimit && (
                            <span className="text-xs font-semibold text-slate-400">
                              / {limitFormatted} {metric.unit && !isBytes ? metric.unit : ""}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">Reset: {metric.resetPeriod}</span>
                      </div>

                      {metric.percentage !== null && hasLimit ? (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
                          <div className="h-2 w-full bg-slate-200/90 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                metric.status === "critical"
                                  ? "bg-red-500"
                                  : metric.status === "warning"
                                  ? "bg-amber-500"
                                  : "bg-blue-600"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(metric.current ? 0.8 : 0, metric.percentage))}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-500">
                            <span>
                              {metric.remaining !== null ? `${remainingFormatted} remaining` : `Reset: ${metric.resetPeriod}`}
                            </span>
                            <span className="font-bold text-slate-700">{metric.percentage.toFixed(2)}% used</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                          Quota: Standard Cloudflare Allowance
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Temp Mail Invariants Info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs text-xs text-slate-600 space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">Temp Mail Architecture Principles</h4>
            <ul className="space-y-1 text-slate-500">
              <li>• Mailboxes remain active indefinitely until the user explicitly requests a new mailbox.</li>
              <li>• Generating a new email address automatically deletes the previous mailbox and associated messages.</li>
              <li>• Inboxes retain the newest 6 messages; older items are automatically pruned.</li>
              <li>• Messages refresh only on manual user request (no background polling).</li>
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

