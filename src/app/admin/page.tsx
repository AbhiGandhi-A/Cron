"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CloudflareResourceMetric {
  name: string;
  label: string;
  current: number | null;
  limit: number;
  remaining: number;
  percentage: number;
  status: "healthy" | "warning" | "critical" | "unavailable";
  resetPeriod: string;
  unit?: string;
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
    resources?: CloudflareResourceMetric[];
    healthy?: number;
    warning?: number;
    critical?: number;
    unavailable?: number;
    timestamp?: string;
  };
  lastUpdated: string;
}

function safeNumber(value: unknown, fallback = 0): number {
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

function formatPercent(value: unknown): string {
  const percent = safeNumber(value, null);
  return percent === null || !Number.isFinite(percent) ? "Unavailable" : `${percent.toFixed(2)}%`;
}

function formatStatus(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return "Unavailable";
  if (percent >= 95) return "Critical";
  if (percent >= 90) return "Warning";
  return "Healthy";
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: string;
  href?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
}

function StatCard({ title, value, subtitle, icon, href, color = "blue" }: StatCardProps) {
  const colors = {
    blue: "from-blue-600 to-blue-700",
    green: "from-green-600 to-green-700",
    yellow: "from-yellow-600 to-yellow-700",
    red: "from-red-600 to-red-700",
    purple: "from-purple-600 to-purple-700",
  };

  const content = (
    <div className={`rounded-2xl bg-gradient-to-br ${colors[color]} p-5 text-white shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-100">{title}</p>
          <p className="mt-3 text-3xl font-bold">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-blue-50">{subtitle}</p>}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deletingLogs, setDeletingLogs] = useState(false);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: token },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch stats");
      }

      const data = await res.json();
      setStats({
        ...data,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const clearExecutionLogs = async () => {
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
      setStats((prev) =>
        prev
          ? {
              ...prev,
              jobs: {
                ...prev.jobs,
                totalExecutions: 0,
                executionsToday: 0,
                failedToday: 0,
              },
            }
          : prev
      );
      setError(data.message || "Execution logs cleared");
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear execution logs");
    } finally {
      setDeletingLogs(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">
        {error || "Failed to load dashboard"}
        <button
          onClick={fetchStats}
          className="ml-4 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const resources = Array.isArray(stats.cloudflare?.resources) ? stats.cloudflare?.resources ?? [] : [];
  const healthy = safeNumber(stats.cloudflare?.healthy, 0) || 0;
  const warning = safeNumber(stats.cloudflare?.warning, 0) || 0;
  const critical = safeNumber(stats.cloudflare?.critical, 0) || 0;
  const unavailable = safeNumber(stats.cloudflare?.unavailable, 0) || 0;

  return (
    <div className="space-y-6 pb-8 text-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Admin</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Dashboard</h1>
        </div>
        <button
          onClick={fetchStats}
          disabled={refreshing}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Last updated</p>
            <p className="text-lg font-semibold text-slate-900">
              {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : "Just now"}
            </p>
          </div>
          <div className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">Live</div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Overview</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Users" value={stats.users.total} icon="👥" href="/admin/users" color="blue" />
          <StatCard title="Active Users" value={stats.users.active} subtitle="Last 7 days" icon="✅" color="green" />
          <StatCard title="Blocked Users" value={stats.users.blocked} icon="🚫" href="/admin/users?status=blocked" color="red" />
          <StatCard title="Temp Mailboxes" value={stats.tempMail.mailboxes} icon="📬" href="/admin/temp-mail" color="purple" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Cloudflare Resource Usage</h2>
          <div className="flex gap-2">
            {healthy > 0 && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">{healthy} Healthy</span>}
            {warning > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">{warning} Warning</span>}
            {critical > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">{critical} Critical</span>}
            {unavailable > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{unavailable} Unavailable</span>}
          </div>
        </div>
        {resources.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
            <p className="text-sm">Cloudflare usage data unavailable</p>
            <p className="mt-1 text-xs text-slate-400">Check that the worker endpoint is accessible and the service secret is configured.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {resources.map((metric) => {
              const tone = metric.status === "critical" ? "bg-red-500" : metric.status === "warning" ? "bg-amber-500" : metric.status === "unavailable" ? "bg-slate-300" : "bg-emerald-500";
              const bgColor = metric.status === "critical" ? "bg-red-50" : metric.status === "warning" ? "bg-amber-50" : metric.status === "unavailable" ? "bg-slate-50" : "bg-emerald-50";
              const textColor = metric.status === "critical" ? "text-red-700" : metric.status === "warning" ? "text-amber-700" : metric.status === "unavailable" ? "text-slate-700" : "text-emerald-700";

              return (
                <div key={metric.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">{metric.label}</p>
                      <p className="mt-1 text-xs text-slate-400">Resets: {metric.resetPeriod}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}>
                      {metric.status === "unavailable" ? "Unavailable" : metric.status.charAt(0).toUpperCase() + metric.status.slice(1)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Current Usage</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {metric.current === null ? "Unavailable" : `${formatNumber(metric.current)}${metric.unit ? " " + metric.unit : ""}`}
                      </p>
                    </div>

                    {metric.current !== null && (
                      <>
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">Plan Limit</p>
                            <p className="text-sm font-semibold text-slate-900">{formatNumber(metric.limit)}{metric.unit ? " " + metric.unit : ""}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-0.5">Remaining</p>
                            <p className="text-sm font-semibold text-slate-900">{formatNumber(metric.remaining)}{metric.unit ? " " + metric.unit : ""}</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-slate-500">Percentage Used</p>
                            <p className="text-sm font-semibold text-slate-900">{formatPercent(metric.percentage)}</p>
                          </div>
                          <div className="w-full h-2.5 rounded-full overflow-hidden bg-slate-200">
                            <div className={`${tone} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, metric.percentage)}%` }} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Temporary Email</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Active Mailboxes" value={stats.tempMail.mailboxes} icon="📬" href="/admin/temp-mail" color="blue" />
          <StatCard title="Expired Mailboxes" value={stats.tempMail.expiredMailboxes} icon="⏰" color="yellow" />
          <StatCard title="Total Emails" value={stats.tempMail.totalEmails} icon="📧" color="purple" />
          <StatCard title="Emails Today" value={stats.tempMail.emailsToday} icon="📨" color="green" />
          <StatCard title="Mailboxes Today" value={stats.tempMail.mailboxesToday} icon="🆕" color="blue" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Job Scheduler</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Total Jobs" value={stats.jobs.total} icon="⚙️" color="blue" />
          <StatCard title="Active Jobs" value={stats.jobs.active} icon="▶️" color="green" />
          <StatCard title="Executions Today" value={stats.jobs.executionsToday} icon="⏱️" color="purple" />
          <StatCard title="Failed Today" value={stats.jobs.failedToday} icon="❌" color={stats.jobs.failedToday > 0 ? "red" : "green"} />
          <StatCard title="Execution Logs" value={stats.jobs.totalExecutions} icon="🧹" color="yellow" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Quick actions</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/admin/users" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"> 
            <div className="text-2xl mb-2">👥</div>
            <div className="font-semibold text-slate-900">Manage Users</div>
            <div className="mt-1 text-sm text-slate-500">Block, unblock, or delete users</div>
          </Link>
          <Link href="/admin/temp-mail" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"> 
            <div className="text-2xl mb-2">📧</div>
            <div className="font-semibold text-slate-900">Temp Mail Control</div>
            <div className="mt-1 text-sm text-slate-500">Monitor and manage mailboxes</div>
          </Link>
          <Link href="/admin/activity" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"> 
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold text-slate-900">Activity Log</div>
            <div className="mt-1 text-sm text-slate-500">View admin action history</div>
          </Link>
          <button onClick={clearExecutionLogs} disabled={deletingLogs} className="rounded-2xl border border-red-200 bg-white p-4 text-left shadow-sm transition hover:border-red-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">
            <div className="text-2xl mb-2">🧹</div>
            <div className="font-semibold text-slate-900">Delete Execution Logs</div>
            <div className="mt-1 text-sm text-slate-500">{deletingLogs ? "Deleting..." : "Clear stored execution records"}</div>
          </button>
        </div>
      </section>
    </div>
  );
}
