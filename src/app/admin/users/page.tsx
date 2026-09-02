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

interface AdminJob {
  _id: string;
  name: string;
  url: string;
  method: string;
  schedule: string;
  timezone?: string;
  isActive: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  totalExecutions: number;
}

interface JobExecutionItem {
  id: string;
  status: string;
  httpStatus: number | null;
  responseTime: number | null;
  errorMessage: string | null;
  retryNumber: number;
  startedAt: string;
  completedAt: string | null;
  requestUrl: string;
  requestMethod: string;
  requestBody: unknown;
  requestHeaders: Record<string, string> | null;
  queryParams: Record<string, string> | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  responseSize: number;
  triggeredBy: string;
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
  const [userDetails, setUserDetails] = useState<{
    jobs?: {
      total: number;
      totalExecutions: number;
      list?: AdminJob[];
    };
    tempMail?: { enabled: boolean; mailboxes: number; emails: number };
  } | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    plan: string;
    maxJobs: number;
    maxExecutions: number;
    status: "active" | "blocked";
    tempMailDisabled: boolean;
  }>({
    name: "",
    plan: "free",
    maxJobs: 10,
    maxExecutions: 1000,
    status: "active",
    tempMailDisabled: false,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AdminJob | null>(null);
  const [executions, setExecutions] = useState<JobExecutionItem[]>([]);
  const [executionsPagination, setExecutionsPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);

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

  const openManageModal = async (user: User) => {
    const isBlocked = user.status === "blocked";
    setSelectedUser(user);
    setEditForm({
      name: user.name || "",
      plan: user.plan || "free",
      maxJobs: user.maxJobs || 10,
      maxExecutions: user.maxExecutions || 1000,
      status: isBlocked ? "blocked" : "active",
      tempMailDisabled: Boolean(user.tempMailDisabled),
    });
    setUserDetails(null);
    setModalLoading(true);

    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/users/${user._id}`, {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        setUserDetails({
          jobs: data.jobs,
          tempMail: data.tempMail,
        });
        if (data.user) {
          const apiBlocked = data.user.status === "blocked";
          setEditForm({
            name: data.user.name || "",
            plan: data.user.plan || "free",
            maxJobs: data.user.maxJobs || 10,
            maxExecutions: data.user.maxExecutions || 1000,
            status: apiBlocked ? "blocked" : "active",
            tempMailDisabled: Boolean(data.user.tempMailDisabled),
          });
        }
      }
    } catch {
      // Graceful fallback to table data
    } finally {
      setModalLoading(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/users/${selectedUser._id}`, {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update user");
      }

      const data = await res.json();
      setToast({
        message: data.message || "User updated successfully",
        type: "success",
      });

      // Update in place
      setSelectedUser(data.user);
      fetchUsers();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Update failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Action failed");
      }

      const data = await res.json();
      setToast({
        message: data.message || "Action completed successfully",
        type: "success",
      });

      if (data.user && selectedUser) {
        setSelectedUser(data.user);
        setEditForm((prev) => ({
          ...prev,
          status: data.user.status,
          tempMailDisabled: data.user.tempMailDisabled,
        }));
      }

      fetchUsers();
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
    if (!confirm(`Are you sure you want to permanently delete ${email}? All user jobs, mailboxes, and data will be removed.`)) {
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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Delete failed");
      }

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

  const reloadJobList = async () => {
    if (!selectedUser) return;
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;
      const res = await fetch(`/api/admin/users/${selectedUser._id}`, {
        headers: { Authorization: token },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setUserDetails((prev) => ({
          ...(prev || {}),
          jobs: data.jobs,
          tempMail: data.tempMail,
        }));
      }
    } catch {
      // Graceful fallback - keep current list
    }
  };

  const toggleJob = async (job: AdminJob) => {
    try {
      setActionLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/jobs/${job._id}`, {
        method: "PATCH",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !job.isActive }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update cron job");
      }

      const data = await res.json();
      setToast({
        message: data.message || "Cron job updated successfully",
        type: "success",
      });
      await reloadJobList();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Cron job update failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const deleteJob = async (job: AdminJob) => {
    if (
      !confirm(
        `Are you sure you want to delete cron job "${job.name}" and all its execution logs?`
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/jobs/${job._id}`, {
        method: "DELETE",
        headers: { Authorization: token },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Delete failed");
      }

      const data = await res.json();
      setToast({
        message: data.message || "Cron job deleted successfully",
        type: "success",
      });
      if (selectedJob && selectedJob._id === job._id) setSelectedJob(null);
      await reloadJobList();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Delete failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openJobExecutions = async (job: AdminJob) => {
    setSelectedJob(job);
    setExpandedExecutionId(null);
    setExecutions([]);
    setExecutionsLoading(true);
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(`/api/admin/jobs/${job._id}/executions?page=1&limit=10`, {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch execution logs");

      const data = await res.json();
      setExecutions(data.executions || []);
      setExecutionsPagination(
        data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 }
      );
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load execution logs",
        type: "error",
      });
    } finally {
      setExecutionsLoading(false);
    }
  };

  const loadMoreExecutions = async () => {
    if (!selectedJob) return;
    const nextPage = executionsPagination.page + 1;
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch(
        `/api/admin/jobs/${selectedJob._id}/executions?page=${nextPage}&limit=10`,
        {
          headers: { Authorization: token },
          cache: "no-store",
        }
      );

      if (!res.ok) throw new Error("Failed to fetch execution logs");

      const data = await res.json();
      setExecutions((prev) => [...prev, ...(data.executions || [])]);
      setExecutionsPagination(
        data.pagination || { page: nextPage, limit: 10, total: 0, totalPages: 0 }
      );
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load execution logs",
        type: "error",
      });
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
            Search, inspect, manage plans, block accounts, and configure permissions
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
                  {users.map((user) => {
                    const isBlocked = user.status === "blocked";
                    return (
                      <tr key={user._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900">{user.name || "Anonymous"}</div>
                          <div className="text-slate-500 font-mono text-[11px]">{user.email}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isBlocked
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isBlocked ? "bg-red-500" : "bg-emerald-500"}`} />
                            {isBlocked ? "Blocked" : "Active"}
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
                          onClick={() => openManageModal(user)}
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                        >
                          Manage
                        </button>
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

      {/* User Management & Quota Configuration Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Manage User Account</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-base font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Live Stats Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Cron Jobs</span>
                <span className="text-lg font-extrabold text-slate-900 block mt-0.5">
                  {modalLoading ? "..." : userDetails?.jobs?.total ?? "0"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Executions</span>
                <span className="text-lg font-extrabold text-slate-900 block mt-0.5">
                  {modalLoading ? "..." : userDetails?.jobs?.totalExecutions ?? "0"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Mailboxes</span>
                <span className="text-lg font-extrabold text-slate-900 block mt-0.5">
                  {modalLoading ? "..." : userDetails?.tempMail?.mailboxes ?? "0"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Messages</span>
                <span className="text-lg font-extrabold text-slate-900 block mt-0.5">
                  {modalLoading ? "..." : userDetails?.tempMail?.emails ?? "0"}
                </span>
              </div>
            </div>

            {/* Quick Status Toggles */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {editForm.status === "blocked" ? (
                <button
                  type="button"
                  onClick={() => handleUserAction(selectedUser._id, "unblock")}
                  disabled={actionLoading}
                  className="flex-1 py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition font-semibold text-xs disabled:opacity-50 text-center cursor-pointer"
                >
                  ✅ {actionLoading ? "Processing..." : "Unblock Account"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUserAction(selectedUser._id, "block")}
                  disabled={actionLoading}
                  className="flex-1 py-2 px-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition font-semibold text-xs disabled:opacity-50 text-center cursor-pointer"
                >
                  🚫 {actionLoading ? "Processing..." : "Block Account"}
                </button>
              )}

              {editForm.tempMailDisabled ? (
                <button
                  type="button"
                  onClick={() => handleUserAction(selectedUser._id, "enable-temp-mail")}
                  disabled={actionLoading}
                  className="flex-1 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition font-semibold text-xs disabled:opacity-50 text-center cursor-pointer"
                >
                  📬 {actionLoading ? "Processing..." : "Enable Temp Mail"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUserAction(selectedUser._id, "disable-temp-mail")}
                  disabled={actionLoading}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 transition font-semibold text-xs disabled:opacity-50 text-center cursor-pointer"
                >
                  📭 {actionLoading ? "Processing..." : "Disable Temp Mail"}
                </button>
              )}
            </div>

            {/* Cron Jobs */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Cron Jobs ({userDetails?.jobs?.total ?? 0})
                </h4>
                <span className="text-[10px] text-slate-400">
                  Click a job to view execution logs
                </span>
              </div>

              {modalLoading ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  Loading cron jobs...
                </div>
              ) : !userDetails?.jobs?.list || userDetails.jobs.list.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  No cron jobs for this user.
                </div>
              ) : (
                <div className="space-y-2">
                  {userDetails.jobs.list.map((job) => (
                    <div
                      key={job._id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <button
                        type="button"
                        onClick={() => openJobExecutions(job)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs truncate">
                              {job.name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                              {job.url}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                              job.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {job.isActive ? "Active" : "Disabled"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">
                            {job.method}
                          </span>
                          <span className="font-mono">{job.schedule}</span>
                          <span className="text-slate-400">
                            {job.totalExecutions} executions
                          </span>
                          {job.lastRunAt && (
                            <span className="text-slate-400">
                              Last run: {new Date(job.lastRunAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </button>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleJob(job)}
                          disabled={actionLoading}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer border ${
                            job.isActive
                              ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                              : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          {job.isActive ? "Turn Off" : "Turn On"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openJobExecutions(job)}
                          className="py-1.5 px-3 rounded-lg text-[11px] font-semibold transition cursor-pointer border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          View Logs
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteJob(job)}
                          disabled={actionLoading}
                          className="py-1.5 px-3 rounded-lg text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Edit User Quotas & Settings Form */}
            <form onSubmit={handleSaveUser} className="space-y-4 pt-2 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Plan & Quotas Configuration</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="User Name"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Plan</label>
                  <select
                    value={editForm.plan}
                    onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Cron Jobs</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={editForm.maxJobs}
                    onChange={(e) => setEditForm({ ...editForm, maxJobs: parseInt(e.target.value, 10) || 10 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Monthly Executions</label>
                  <input
                    type="number"
                    min="10"
                    max="10000000"
                    value={editForm.maxExecutions}
                    onChange={(e) => setEditForm({ ...editForm, maxExecutions: parseInt(e.target.value, 10) || 1000 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? "Saving Changes..." : "Save User Settings & Quotas"}
                </button>
              </div>
            </form>

            {/* Danger Zone */}
            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleDeleteUser(selectedUser._id, selectedUser.email)}
                disabled={actionLoading}
                className="w-full py-2.5 px-4 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition font-semibold text-xs disabled:opacity-50 cursor-pointer"
              >
                🗑️ Permanently Delete User & All Data
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

      {/* Cron Job Execution Logs Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900 truncate">
                  {selectedJob.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                  {selectedJob.url}
                </p>
                <span
                  className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    selectedJob.isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  {selectedJob.isActive ? "Active" : "Disabled"}
                </span>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-base font-bold transition"
              >
                ✕
              </button>
            </div>

            {executionsLoading ? (
              <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Loading execution logs...
              </div>
            ) : executions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No executions recorded for this cron job.
              </div>
            ) : (
              <div className="space-y-2">
                {executions.map((exec) => {
                  const isOpen = expandedExecutionId === exec.id;
                  const detailRows: { label: string; value: string }[] = [];
                  detailRows.push({ label: "Request", value: `${exec.requestMethod} ${exec.requestUrl}` });
                  if (exec.httpStatus != null) detailRows.push({ label: "HTTP Status", value: String(exec.httpStatus) });
                  if (exec.responseTime != null) detailRows.push({ label: "Response Time", value: `${exec.responseTime} ms` });
                  if (exec.responseSize != null && exec.responseSize > 0) detailRows.push({ label: "Response Size", value: `${exec.responseSize} bytes` });
                  if (exec.retryNumber > 0) detailRows.push({ label: "Retry", value: `Attempt ${exec.retryNumber}` });
                  if (exec.triggeredBy) detailRows.push({ label: "Triggered By", value: exec.triggeredBy });
                  if (exec.completedAt) detailRows.push({ label: "Completed", value: new Date(exec.completedAt).toLocaleString() });
                  if (exec.errorMessage) detailRows.push({ label: "Error", value: exec.errorMessage });

                  return (
                    <div
                      key={exec.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedExecutionId(isOpen ? null : exec.id)
                        }
                        className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-100/80 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                              exec.status === "SUCCESS"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : exec.status === "FAILED" || exec.status === "TIMEOUT"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : exec.status === "RUNNING"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : exec.status === "RETRY"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {exec.status}
                          </span>
                          <span className="text-[11px] font-mono text-slate-700 truncate">
                            {new Date(exec.startedAt).toLocaleString()}
                          </span>
                          {exec.httpStatus != null && (
                            <span className="text-[10px] text-slate-500 shrink-0">
                              HTTP {exec.httpStatus}
                            </span>
                          )}
                          {exec.responseTime != null && (
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {exec.responseTime} ms
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 text-xs shrink-0">
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="px-3.5 pb-3.5 space-y-2.5 text-[11px] border-t border-slate-200 pt-2.5">
                          <div className="space-y-1.5">
                            {detailRows.map((row) => (
                              <div key={row.label} className="flex gap-2">
                                <span className="text-slate-400 w-28 shrink-0">
                                  {row.label}
                                </span>
                                <span className="text-slate-800 font-mono break-all">
                                  {row.value}
                                </span>
                              </div>
                            ))}
                          </div>

                          {exec.queryParams && Object.keys(exec.queryParams).length > 0 && (
                            <div>
                              <div className="text-slate-400 mb-0.5">Query Params</div>
                              <pre className="bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto text-[10px] text-slate-800 whitespace-pre-wrap break-all">
                                {JSON.stringify(exec.queryParams, null, 2)}
                              </pre>
                            </div>
                          )}

                          {exec.requestHeaders && Object.keys(exec.requestHeaders).length > 0 && (
                            <div>
                              <div className="text-slate-400 mb-0.5">Request Headers</div>
                              <pre className="bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto text-[10px] text-slate-800 whitespace-pre-wrap break-all">
                                {JSON.stringify(exec.requestHeaders, null, 2)}
                              </pre>
                            </div>
                          )}

                          {exec.requestBody !== null && exec.requestBody !== undefined && (
                            <div>
                              <div className="text-slate-400 mb-0.5">Request Body</div>
                              <pre className="bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto text-[10px] text-slate-800 whitespace-pre-wrap break-all">
                                {typeof exec.requestBody === "string"
                                  ? exec.requestBody
                                  : JSON.stringify(exec.requestBody, null, 2)}
                              </pre>
                            </div>
                          )}

                          {exec.responseHeaders && Object.keys(exec.responseHeaders).length > 0 && (
                            <div>
                              <div className="text-slate-400 mb-0.5">Response Headers</div>
                              <pre className="bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto text-[10px] text-slate-800 whitespace-pre-wrap break-all">
                                {JSON.stringify(exec.responseHeaders, null, 2)}
                              </pre>
                            </div>
                          )}

                          {exec.responseBody ? (
                            <div>
                              <div className="text-slate-400 mb-0.5">Response Body</div>
                              <pre className="bg-white border border-slate-200 rounded-lg p-2 max-h-56 overflow-y-auto text-[10px] text-slate-800 whitespace-pre-wrap break-all">
                                {exec.responseBody}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-slate-400">
                              No response body recorded.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {executionsPagination.totalPages > executionsPagination.page && (
              <button
                type="button"
                onClick={loadMoreExecutions}
                disabled={executionsLoading}
                className="w-full py-2 px-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition font-semibold text-xs disabled:opacity-50 cursor-pointer"
              >
                Load More Logs
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

