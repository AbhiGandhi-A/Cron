"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  lastUpdated: string;
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
    <div className={`bg-gradient-to-br ${colors[color]} rounded-lg p-6 text-white`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-200 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          {subtitle && <p className="text-slate-300 text-xs mt-1">{subtitle}</p>}
        </div>
        <span className="text-4xl">{icon}</span>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <button
          onClick={fetchStats}
          disabled={refreshing}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* User Stats */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">User Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Users"
            value={stats.users.total}
            icon="👥"
            href="/admin/users"
            color="blue"
          />
          <StatCard
            title="Active Users"
            value={stats.users.active}
            subtitle="Last 7 days"
            icon="✅"
            color="green"
          />
          <StatCard
            title="Blocked Users"
            value={stats.users.blocked}
            icon="🚫"
            href="/admin/users?status=blocked"
            color="red"
          />
        </div>
      </div>

      {/* Temp Mail Stats */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Temporary Email</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Active Mailboxes"
            value={stats.tempMail.mailboxes}
            icon="📬"
            href="/admin/temp-mail"
            color="blue"
          />
          <StatCard
            title="Expired Mailboxes"
            value={stats.tempMail.expiredMailboxes}
            icon="⏰"
            color="yellow"
          />
          <StatCard
            title="Total Emails"
            value={stats.tempMail.totalEmails}
            icon="📧"
            color="purple"
          />
          <StatCard
            title="Emails Today"
            value={stats.tempMail.emailsToday}
            icon="📨"
            color="green"
          />
          <StatCard
            title="Mailboxes Today"
            value={stats.tempMail.mailboxesToday}
            icon="🆕"
            color="blue"
          />
        </div>
      </div>

      {/* Job Stats */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Job Scheduler</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard
            title="Total Jobs"
            value={stats.jobs.total}
            icon="⚙️"
            color="blue"
          />
          <StatCard
            title="Active Jobs"
            value={stats.jobs.active}
            icon="▶️"
            color="green"
          />
          <StatCard
            title="Executions Today"
            value={stats.jobs.executionsToday}
            icon="⏱️"
            color="purple"
          />
          <StatCard
            title="Failed Today"
            value={stats.jobs.failedToday}
            icon="❌"
            color="red"
          />
          <StatCard
            title="Execution Logs"
            value={stats.jobs.totalExecutions}
            icon="🧹"
            color="yellow"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            href="/admin/users"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-white transition-colors"
          >
            <div className="text-2xl mb-2">👥</div>
            <div className="font-semibold">Manage Users</div>
            <div className="text-sm text-slate-400">Block, unblock, or delete users</div>
          </Link>
          <Link
            href="/admin/temp-mail"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-white transition-colors"
          >
            <div className="text-2xl mb-2">📧</div>
            <div className="font-semibold">Temp Mail Control</div>
            <div className="text-sm text-slate-400">Monitor and manage mailboxes</div>
          </Link>
          <Link
            href="/admin/activity"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-white transition-colors"
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold">Activity Log</div>
            <div className="text-sm text-slate-400">View admin action history</div>
          </Link>
          <button
            onClick={clearExecutionLogs}
            disabled={deletingLogs}
            className="bg-slate-800 hover:bg-slate-700 border border-red-700 rounded-lg p-4 text-left text-white transition-colors disabled:opacity-60"
          >
            <div className="text-2xl mb-2">🧹</div>
            <div className="font-semibold">Delete Execution Logs</div>
            <div className="text-sm text-slate-400">
              {deletingLogs ? "Deleting..." : "Clear stored execution records"}
            </div>
          </button>
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-right text-slate-500 text-xs">
        Last updated: {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : "Just now"}
      </div>
    </div>
  );
}
