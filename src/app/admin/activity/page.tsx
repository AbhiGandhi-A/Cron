"use client";

import { useState, useEffect } from "react";

interface ActivityLog {
  _id: string;
  action: string;
  adminIp: string;
  targetUserId?: string;
  targetUserEmail?: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const actionLabels: Record<string, string> = {
  admin_login: "Admin Login",
  user_blocked: "User Blocked",
  user_unblocked: "User Unblocked",
  temp_mail_disabled: "Temp Mail Disabled",
  temp_mail_enabled: "Temp Mail Enabled",
  user_deleted: "User Deleted",
  mailbox_cleaned: "Mailbox Cleaned",
};

const actionBadges: Record<string, { bg: string; text: string; border: string }> = {
  admin_login: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  user_blocked: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  user_unblocked: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  temp_mail_disabled: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  temp_mail_enabled: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  user_deleted: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  mailbox_cleaned: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, days, pagination.page]);

  const fetchLogs = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        action: actionFilter,
        days: days.toString(),
      });

      const res = await fetch(`/api/admin/activity?${params}`, {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch activity logs");

      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      setActions(data.actions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Audit Trail</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">{pagination.total} recorded events</span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Activity Log
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable record of admin authentications, status overrides, and user management actions
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
        >
          <span className={refreshing ? "animate-spin" : ""}>🔄</span>
          {refreshing ? "Refreshing..." : "Refresh Logs"}
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Filter by Action</label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Action Types</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {actionLabels[action] || action}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Time Period</label>
            <select
              value={days}
              onChange={(e) => {
                setDays(parseInt(e.target.value, 10));
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">No activity logs found for the selected period.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Admin IP</th>
                    <th className="px-5 py-3">Target User</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const badge = actionBadges[log.action] || { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
                    return (
                      <tr key={log._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {actionLabels[log.action] || log.action}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                          {log.adminIp || "N/A"}
                        </td>
                        <td className="px-5 py-3.5">
                          {log.targetUserEmail ? (
                            <div>
                              <div className="font-semibold text-slate-900">{log.targetUserEmail}</div>
                              {log.targetUserId && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {log.targetUserId}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">System Event</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {log.success ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span>✓</span> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                              <span>✗</span> Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total} events
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setPagination({
                      ...pagination,
                      page: Math.max(1, pagination.page - 1),
                    })
                  }
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition font-medium"
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setPagination({
                      ...pagination,
                      page: Math.min(pagination.totalPages, pagination.page + 1),
                    })
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

