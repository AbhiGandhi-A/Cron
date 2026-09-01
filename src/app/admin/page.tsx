"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Toast } from "@/components/admin/Toast";

interface CloudflareResourceMetric {
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
  description?: string;
}

interface Stats {
  users: {
    total: number;
    active: number;
    blocked: number;
  };
  tempMail: {
    mailboxes: number;
    expiredMailboxes: number;
    totalEmails: number;
    emailsToday: number;
    mailboxesToday: number;
  };
  jobs: {
    total: number;
    active: number;
    executionsToday: number;
    failedToday: number;
    totalExecutions: number;
  };
  cloudflare?: {
    connected?: boolean;
    available?: boolean;
    configured?: boolean;
    account?: { id?: string; name?: string | null; type?: string | null };
    zone?: { id?: string; name?: string | null; status?: string | null; plan?: string | null };
    worker?: { name?: string | null; scriptId?: string | null };
    d1?: { id?: string | null; name?: string | null; numTables?: number | null; fileSize?: number | null };
    resources?: CloudflareResourceMetric[];
    healthy?: number;
    warning?: number;
    critical?: number;
    unavailable?: number;
    lastUpdated?: string;
    message?: string;
    error?: string | null;
  };
  lastUpdated: string;
}

function safeNumber(value: unknown, fallback: number | null = null): number | null {
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

function formatPercent(value: unknown): string {
  const percent = safeNumber(value, null);
  return percent === null || !Number.isFinite(percent) ? "Unavailable" : `${percent.toFixed(2)}%`;
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: string;
  href?: string;
  accentColor?: "blue" | "emerald" | "amber" | "red" | "purple";
}

function SummaryCard({ title, value, subtitle, icon, href, accentColor = "blue" }: StatCardProps) {
  const iconBgs = {
    blue: "bg-blue-50 text-blue-600 border border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border border-amber-100",
    red: "bg-red-50 text-red-600 border border-red-100",
    purple: "bg-purple-50 text-purple-600 border border-purple-100",
  };

  const card = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconBgs[accentColor]}`}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch stats (HTTP ${res.status})`);
      }

      const data = await res.json();
      setStats({
        ...data,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const clearExecutionLogs = async () => {
    if (!confirm("Are you sure you want to delete all job execution history?")) return;

    const token = localStorage.getItem("adminAuthToken");
    if (!token) return;

    try {
      setDeletingLogs(true);
      const res = await fetch("/api/admin/clear-logs", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to clear execution logs");
      }

      const data = await res.json();
      setToast({ message: data.message || "Execution logs deleted successfully", type: "success" });
      await fetchStats();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to clear execution logs",
        type: "error",
      });
    } finally {
      setDeletingLogs(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-medium text-slate-500">Loading live dashboard metrics...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-xs space-y-3">
        <div className="font-bold text-lg">Unable to load dashboard</div>
        <p className="text-sm text-red-700">{error || "Could not connect to admin statistics API."}</p>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  const resources = Array.isArray(stats.cloudflare?.resources) ? stats.cloudflare?.resources ?? [] : [];
  const cfConnected = Boolean(stats.cloudflare?.connected);
  const cfConfigured = Boolean(stats.cloudflare?.configured);

  const workerMetrics = resources.filter((r) => r.category === "workers");
  const d1Metrics = resources.filter((r) => r.category === "d1");
  const zoneMetrics = resources.filter((r) => r.category === "zone");

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Overview</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">
              Updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
            </span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            System overview and live infrastructure analytics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Cloudflare Connection Status Pill */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
              cfConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : cfConfigured
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                cfConnected ? "bg-emerald-500" : cfConfigured ? "bg-amber-500" : "bg-slate-400"
              }`}
            />
            <span>
              {cfConnected
                ? "Cloudflare Connected"
                : cfConfigured
                ? "Cloudflare Pending / Error"
                : "Cloudflare Not Configured"}
            </span>
          </div>

          <button
            onClick={fetchStats}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Section 1: System Overview Cards */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">System Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Users"
            value={stats.users.total}
            subtitle="Registered accounts"
            icon="👥"
            href="/admin/users"
            accentColor="blue"
          />
          <SummaryCard
            title="Active Users"
            value={stats.users.active}
            subtitle="Logged in last 7 days"
            icon="✅"
            href="/admin/users"
            accentColor="emerald"
          />
          <SummaryCard
            title="Blocked Users"
            value={stats.users.blocked}
            subtitle="Suspended accounts"
            icon="🚫"
            href="/admin/users?status=blocked"
            accentColor="red"
          />
          <SummaryCard
            title="Temp Mailboxes"
            value={stats.tempMail.mailboxes}
            subtitle="Active disposable mailboxes"
            icon="📬"
            href="/admin/temp-mail"
            accentColor="purple"
          />
        </div>
      </section>

      {/* Section 2: Cloudflare Status Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Cloudflare Infrastructure</h2>
            <p className="text-xs text-slate-500">Server environment-connected services & verified resources</p>
          </div>
          <Link
            href="/admin/settings"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            Manage Settings →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Account */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Account</div>
            <div className="mt-1 text-sm font-bold text-slate-900 truncate">
              {stats.cloudflare?.account?.name || stats.cloudflare?.account?.id || "Unavailable"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {stats.cloudflare?.account?.type ? `Type: ${stats.cloudflare.account.type}` : "ID verified"}
            </div>
          </div>

          {/* Zone */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Zone</div>
            <div className="mt-1 text-sm font-bold text-slate-900 truncate">
              {stats.cloudflare?.zone?.name || "Unavailable"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {stats.cloudflare?.zone?.plan ? `Plan: ${stats.cloudflare.zone.plan}` : "DNS / CDN Zone"}
            </div>
          </div>

          {/* Worker */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Worker Script</div>
            <div className="mt-1 text-sm font-bold text-slate-900 truncate">
              {stats.cloudflare?.worker?.name || "cronjobs-worker"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Temp Mail Backend</div>
          </div>

          {/* D1 */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">D1 Database</div>
            <div className="mt-1 text-sm font-bold text-slate-900 truncate">
              {stats.cloudflare?.d1?.name || (stats.cloudflare?.d1?.id ? "D1 Configured" : "Unavailable")}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {stats.cloudflare?.d1?.numTables !== undefined && stats.cloudflare?.d1?.numTables !== null
                ? `${stats.cloudflare.d1.numTables} tables`
                : "Serverless SQLite"}
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Workers Usage */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Workers Analytics (Real 24h Data)</h2>
            <p className="text-xs text-slate-500">Live query from Cloudflare GraphQL workersInvocationsAdaptive</p>
          </div>
        </div>

        {workerMetrics.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Worker metrics unavailable. Verify Cloudflare Account ID and API Token in server environment.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workerMetrics.map((metric) => {
              const hasNumericUsage = metric.current !== null && Number.isFinite(metric.current);
              const hasNumericLimit = metric.limit !== null && Number.isFinite(metric.limit) && metric.limit > 0;
              const hasPercentage = metric.percentage !== null && Number.isFinite(metric.percentage);

              return (
                <div
                  key={metric.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {metric.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Reset: {metric.resetPeriod}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        metric.status === "critical"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : metric.status === "warning"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : metric.status === "healthy"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {metric.status === "unavailable"
                        ? "Unavailable"
                        : metric.status.charAt(0).toUpperCase() + metric.status.slice(1)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Current Usage</p>
                    <p className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                      {hasNumericUsage
                        ? `${formatNumber(metric.current)}${metric.unit ? " " + metric.unit : ""}`
                        : "Unavailable"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Plan Limit</span>
                      <span className="font-semibold text-slate-700">
                        {hasNumericLimit ? formatNumber(metric.limit) : "Unavailable"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Remaining</span>
                      <span className="font-semibold text-slate-700">
                        {metric.remaining !== null ? formatNumber(metric.remaining) : "Unavailable"}
                      </span>
                    </div>
                  </div>

                  {hasPercentage && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-500">Percentage Used</span>
                        <span className="text-slate-900 font-bold">{formatPercent(metric.percentage)}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            metric.status === "critical"
                              ? "bg-red-500"
                              : metric.status === "warning"
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, metric.percentage || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {metric.source && (
                    <div className="text-[10px] text-slate-400 pt-1 truncate" title={metric.source}>
                      Source: {metric.source}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 4: D1 Database Usage */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">D1 Database (Storage & Rows)</h2>
          <p className="text-xs text-slate-500">Real storage from Cloudflare D1 REST API and rows from analytics</p>
        </div>

        {d1Metrics.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            D1 metrics unavailable. Ensure CLOUDFLARE_D1_DATABASE_ID is configured in environment.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {d1Metrics.map((metric) => {
              const isBytes = metric.unit === "bytes";
              const formattedVal = isBytes ? formatBytes(metric.current) : formatNumber(metric.current);
              const formattedLimit = isBytes ? formatBytes(metric.limit) : formatNumber(metric.limit);
              const formattedRemaining = isBytes ? formatBytes(metric.remaining) : formatNumber(metric.remaining);
              const hasLimit = metric.limit !== null && metric.limit > 0;
              const hasPercentage = metric.percentage !== null;

              return (
                <div
                  key={metric.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {metric.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Reset: {metric.resetPeriod}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        metric.status === "healthy"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        metric.status === "critical"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : metric.status === "warning"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : metric.status === "healthy"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {metric.status === "unavailable"
                        ? "Unavailable"
                        : metric.status.charAt(0).toUpperCase() + metric.status.slice(1)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Current Value</p>
                    <p className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                      {formattedVal}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Plan Limit</span>
                      <span className="font-semibold text-slate-700">Unavailable</span>
                      <span className="font-semibold text-slate-700">
                        {hasLimit ? formattedLimit : "Unavailable"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Remaining</span>
                      <span className="font-semibold text-slate-700">Unavailable</span>
                      <span className="font-semibold text-slate-700">
                        {metric.remaining !== null ? formattedRemaining : "Unavailable"}
                      </span>
                    </div>
                  </div>

                  {hasPercentage && hasLimit && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-500">Percentage Used</span>
                        <span className="text-slate-900 font-bold">{formatPercent(metric.percentage)}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            metric.status === "critical"
                              ? "bg-red-500"
                              : metric.status === "warning"
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, metric.percentage || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {metric.source && (
                    <div className="text-[10px] text-slate-400 pt-1 truncate" title={metric.source}>
                      Source: {metric.source}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 5: Zone Analytics */}
      {zoneMetrics.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Zone HTTP & CDN Analytics</h2>
            <p className="text-xs text-slate-500">Inbound HTTP traffic delivered through Cloudflare edge network</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {zoneMetrics.map((metric) => {
              const isBytes = metric.unit === "bytes";
              const formattedVal = isBytes ? formatBytes(metric.current) : formatNumber(metric.current);

              return (
                <div
                  key={metric.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {metric.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Reset: {metric.resetPeriod}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Healthy
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Traffic</p>
                    <p className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                      {formattedVal}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Plan Limit</span>
                      <span className="font-semibold text-slate-700">Unmetered (CDN)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Status</span>
                      <span className="font-semibold text-emerald-700">Active</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 6: Temporary Email & Jobs Quick Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temporary Email Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Temporary Email Stats</h3>
              <p className="text-xs text-slate-500">Disposable mailboxes and message activity</p>
            </div>
            <Link href="/admin/temp-mail" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Manage →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Active Mailboxes</span>
              <span className="text-xl font-bold text-slate-900">{formatNumber(stats.tempMail.mailboxes)}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Total Emails</span>
              <span className="text-xl font-bold text-slate-900">{formatNumber(stats.tempMail.totalEmails)}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Emails Today</span>
              <span className="text-xl font-bold text-emerald-700">{formatNumber(stats.tempMail.emailsToday)}</span>
            </div>
          </div>
        </div>

        {/* Job Scheduler Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Job Scheduler Stats</h3>
              <p className="text-xs text-slate-500">Background cron tasks and execution counts</p>
            </div>
            <button
              onClick={clearExecutionLogs}
              disabled={deletingLogs}
              className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 cursor-pointer"
            >
              {deletingLogs ? "Clearing..." : "Delete Logs"}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Total Jobs</span>
              <span className="text-xl font-bold text-slate-900">{formatNumber(stats.jobs.total)}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Active Jobs</span>
              <span className="text-xl font-bold text-blue-700">{formatNumber(stats.jobs.active)}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Failed Today</span>
              <span className={`text-xl font-bold ${stats.jobs.failedToday > 0 ? "text-red-600" : "text-emerald-700"}`}>
                {formatNumber(stats.jobs.failedToday)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 7: Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/users"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 hover:shadow-sm transition group"
          >
            <div className="text-2xl mb-1.5">👥</div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition">
              Manage Users
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Block, unblock, or delete user accounts</div>
          </Link>

          <Link
            href="/admin/temp-mail"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 hover:shadow-sm transition group"
          >
            <div className="text-2xl mb-1.5">📧</div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition">
              Temp Mail Control
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Monitor disposable inboxes & storage</div>
          </Link>

          <Link
            href="/admin/health"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 hover:shadow-sm transition group"
          >
            <div className="text-2xl mb-1.5">❤️</div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition">
              System Health
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Live latency & connectivity diagnostics</div>
          </Link>

          <Link
            href="/admin/settings"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 hover:shadow-sm transition group"
          >
            <div className="text-2xl mb-1.5">⚙️</div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition">
              Cloudflare Settings
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Test connection & verify environment vars</div>
          </Link>
        </div>
      </section>

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

