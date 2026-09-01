"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

interface User {
  _id: string;
  email: string;
  name: string;
  status: "active" | "blocked";
  tempMailDisabled: boolean;
  plan: string;
  maxJobs: number;
  maxExecutions: number;
  createdAt: string;
  lastLoginAt?: string;
  tempMailboxes?: number;
  tempEmails?: number;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export default function UsersPage() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || ""
  );
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [search, statusFilter, sort, order, pagination.page]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search,
        status: statusFilter,
        sort,
        order,
      });

      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch users");

      const data = await res.json();
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load users",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (userId: string, action: string) => {
    try {
      setActionLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error("Action failed");

      const data = await res.json();
      setToast({
        message: data.message || "Action completed successfully",
        type: "success",
      });

      fetchUsers();
      setSelectedUser(null);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Action failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${email}? All user jobs and data will be removed.`)) {
      return;
    }

    try {
      setActionLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: token },
      });

      if (!res.ok) throw new Error("Delete failed");

      setToast({
        message: `User ${email} deleted successfully`,
        type: "success",
      });

      fetchUsers();
      setSelectedUser(null);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Delete failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Users</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">{pagination.total} registered</span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            User Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Search, inspect, block, or manage permissions for registered user accounts
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              placeholder="Search by name or email..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Accounts</option>
              <option value="active">Active Only</option>
              <option value="blocked">Blocked Only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Sort By</label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="createdAt">Registration Date</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Order</label>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading user list...
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">No users match the search criteria.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Temp Mail</th>
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-5 py-3">Registered</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{user.name || "Anonymous"}</div>
                        <div className="text-slate-500 font-mono text-[11px]">{user.email}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            user.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                          {user.status === "active" ? "Active" : "Blocked"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            user.tempMailDisabled
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {user.tempMailDisabled ? "Disabled" : "Enabled"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-slate-700 uppercase text-[11px]">{user.plan || "Free"}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total} users
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

      {/* User Management Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Manage User Account</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-semibold">{selectedUser.name || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className={`font-bold ${selectedUser.status === "active" ? "text-emerald-700" : "text-red-700"}`}>
                  {selectedUser.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Temp Mail Access:</span>
                <span className="font-semibold">
                  {selectedUser.tempMailDisabled ? "Disabled" : "Active"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Registered:</span>
                <span>{new Date(selectedUser.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {selectedUser.status === "active" ? (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "block")}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition font-semibold text-xs disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Block User (Prevent Sign In)"}
                </button>
              ) : (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "unblock")}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition font-semibold text-xs disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Unblock User"}
                </button>
              )}

              {selectedUser.tempMailDisabled ? (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "enable-temp-mail")}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition font-semibold text-xs disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Enable Temporary Mail Service"}
                </button>
              ) : (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "disable-temp-mail")}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 transition font-semibold text-xs disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Disable Temporary Mail Service"}
                </button>
              )}

              <button
                onClick={() => handleDeleteUser(selectedUser._id, selectedUser.email)}
                disabled={actionLoading}
                className="w-full py-2.5 px-4 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition font-semibold text-xs disabled:opacity-50"
              >
                {actionLoading ? "Processing..." : "Delete User Account Permanently"}
              </button>
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

