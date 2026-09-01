"use client";

import { useState, useEffect } from "react";
import { Toast } from "@/components/admin/Toast";

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
  cloudflareUsage?: {
    resources?: Record<string, any>;
  };
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
  const bytes = Math.max(0, safeNumber(value));
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

function StatBox({ label, value, unit, icon }: { label: string; value: string | number; unit?: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
            {unit ? <span className="ml-1 text-sm text-slate-500">{unit}</span> : null}
          </p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

export default function TempMailPage() {
  const [stats, setStats] = useState<TempMailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/temp-mail", {
        headers: { Authorization: token },
      });

      if (!res.ok) throw new Error("Failed to fetch temp mail stats");

      const data = await res.json();
      setStats(data);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load stats",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Clean up expired mailboxes?")) return;

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
      setToast({ message: data.message, type: "success" });
      fetchStats();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Cleanup failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const cloudflareResources = stats?.cloudflareUsage?.resources ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-600">Admin</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Temporary Email</h1>
        </div>
        <button
          onClick={handleCleanup}
          disabled={actionLoading || loading}
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLoading ? "Cleaning..." : "Clean Expired"}
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">Loading temp-mail stats...</div>
      ) : !stats ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">Failed to load temp mail statistics.</div>
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Mailbox overview</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatBox label="Total Mailboxes" value={formatNumber(stats.mailboxes.total)} icon="📬" />
              <StatBox label="Active" value={formatNumber(stats.mailboxes.active)} icon="✅" />
              <StatBox label="Expired" value={formatNumber(stats.mailboxes.expired)} icon="⏰" />
              <StatBox label="Deleted" value={formatNumber(stats.mailboxes.deleted)} icon="🗑️" />
              <StatBox label="Created Today" value={formatNumber(stats.mailboxes.createdToday)} icon="🆕" />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Email overview</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatBox label="Total Emails" value={formatNumber(stats.emails.total)} icon="📧" />
              <StatBox label="Created Today" value={formatNumber(stats.emails.createdToday)} icon="📨" />
              <StatBox label="Avg Email Size" value={formatBytes(stats.storage.averageEmailSize)} icon="📏" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Storage</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{formatBytes(stats.storage.totalBytes)}</span>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500">Total storage used</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatBytes(stats.storage.totalBytes)}</p>
              <p className="mt-2 text-sm text-slate-500">{formatNumber(stats.emails.total)} emails stored</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Cloudflare Worker Usage</h2>
            {!cloudflareResources ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-500 shadow-sm">Unavailable</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(cloudflareResources).map(([resource, usage]) => {
                  const resourceData = usage as Record<string, any> | null;
                  const used = safeNumber(resourceData?.used ?? resourceData?.usage ?? null, null);
                  const limit = safeNumber(resourceData?.actualLimit ?? resourceData?.limit ?? null, null);
                  const percentage = used !== null && limit !== null && limit > 0 ? (used / limit) * 100 : null;
                  const remaining = used !== null && limit !== null ? Math.max(limit - used, 0) : null;
                  const status = percentage === null ? "Unavailable" : percentage >= 95 ? "Critical" : percentage >= 90 ? "Warning" : "Healthy";
                  const tone = percentage === null ? "bg-slate-300" : percentage >= 95 ? "bg-red-500" : percentage >= 90 ? "bg-amber-500" : "bg-emerald-500";

                  return (
                    <div key={resource} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-semibold capitalize text-slate-900">{resource.replace(/_/g, " ")}</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${percentage === null ? "bg-slate-100 text-slate-700" : percentage >= 95 ? "bg-red-100 text-red-700" : percentage >= 90 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{used === null ? "Current Usage: Unavailable" : `${formatNumber(used)} / ${limit === null ? "Unavailable" : formatNumber(limit)}`}</p>
                      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className={`${tone} h-full rounded-full`} style={{ width: `${percentage === null ? 0 : Math.min(100, percentage)}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>Remaining: {remaining === null ? "Unavailable" : formatNumber(remaining)}</span>
                        <span>{percentage === null ? "Unavailable" : `${percentage.toFixed(2)}% used`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">System status</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <button
                onClick={() => (window.location.href = "/admin/users")}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="text-2xl mb-2">👥</div>
                <div className="font-semibold text-slate-900">Manage User Access</div>
                <div className="mt-1 text-sm text-slate-500">Disable temp mail per user</div>
              </button>
              <button
                onClick={fetchStats}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="text-2xl mb-2">🔄</div>
                <div className="font-semibold text-slate-900">Refresh Stats</div>
                <div className="mt-1 text-sm text-slate-500">Get latest usage data</div>
              </button>
            </div>
          </section>
        </>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
