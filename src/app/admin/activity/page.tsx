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

const actionColors: Record<string, string> = {
  admin_login: "bg-blue-900 text-blue-200",
  user_blocked: "bg-red-900 text-red-200",
  user_unblocked: "bg-green-900 text-green-200",
  temp_mail_disabled: "bg-orange-900 text-orange-200",
  temp_mail_enabled: "bg-green-900 text-green-200",
  user_deleted: "bg-red-900 text-red-200",
  mailbox_cleaned: "bg-purple-900 text-purple-200",
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
  const [actionFilter, setActionFilter] = useState("");
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, days, pagination.page]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
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
      });

      if (!res.ok) throw new Error("Failed to fetch activity logs");

      const data = await res.json();
      setLogs(data.logs);
      setPagination(data.pagination);
      setActions(data.actions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Activity Log</h1>
        <p className="text-slate-400">View admin action history</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-slate-300 mb-2">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPagination({ ...pagination, page: 1 });
            }}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {actionLabels[action] || action}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-2">Time Period</label>
          <select
            value={days}
            onChange={(e) => {
              setDays(parseInt(e.target.value));
              setPagination({ ...pagination, page: 1 });
            }}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={fetchLogs}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading activity...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No activity found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Admin IP
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Target User
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-700 transition-colors">
                      <td className="px-6 py-4 text-slate-300 text-xs">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            actionColors[log.action] ||
                            "bg-slate-700 text-slate-200"
                          }`}
                        >
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs font-mono">
                        {log.adminIp || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm">
                        {log.targetUserEmail ? (
                          <div>
                            <div>{log.targetUserEmail}</div>
                            <div className="text-xs text-slate-500">
                              {log.targetUserId?.substring(0, 8)}...
                            </div>
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {log.success ? (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-900 text-green-200">
                            ✓ Success
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-red-900 text-red-200">
                            ✗ Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-slate-900 border-t border-slate-700 px-6 py-4 flex justify-between items-center">
              <div className="text-sm text-slate-400">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total} activities
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setPagination({
                      ...pagination,
                      page: Math.max(1, pagination.page - 1),
                    })
                  }
                  disabled={pagination.page === 1}
                  className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm"
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
                  disabled={pagination.page === pagination.totalPages}
                  className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm"
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
