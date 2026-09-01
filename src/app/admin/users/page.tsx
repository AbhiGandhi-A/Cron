"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
    type: "success" | "error";
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
      });

      if (!res.ok) throw new Error("Failed to fetch users");

      const data = await res.json();
      setUsers(data.users);
      setPagination(data.pagination);
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
        message: data.message,
        type: "success",
      });

      // Refresh users list
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
    if (!confirm(`Are you sure you want to delete ${email}? This action is permanent.`)) {
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
        <p className="text-slate-400">View and manage all platform users</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              placeholder="Email or name..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Sort By</label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="createdAt">Created Date</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Order</label>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No users found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Temp Mail
                    </th>
                    <th className="px-6 py-3 text-left text-slate-300 font-semibold">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-slate-300 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-700 transition-colors">
                      <td className="px-6 py-4 text-white">{user.email}</td>
                      <td className="px-6 py-4 text-slate-300">{user.name}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            user.status === "active"
                              ? "bg-green-900 text-green-200"
                              : "bg-red-900 text-red-200"
                          }`}
                        >
                          {user.status === "active" ? "✓ Active" : "✗ Blocked"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            user.tempMailDisabled
                              ? "bg-red-900 text-red-200"
                              : "bg-green-900 text-green-200"
                          }`}
                        >
                          {user.tempMailDisabled ? "Disabled" : "Enabled"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                        >
                          Manage
                        </button>
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

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-xl font-bold text-white">Manage User</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-slate-300">
                <strong>Email:</strong> {selectedUser.email}
              </p>
              <p className="text-slate-300">
                <strong>Name:</strong> {selectedUser.name}
              </p>
              <p className="text-slate-300">
                <strong>Status:</strong>{" "}
                <span
                  className={
                    selectedUser.status === "active"
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {selectedUser.status}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              {selectedUser.status === "active" ? (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "block")}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {actionLoading ? "Loading..." : "Block User"}
                </button>
              ) : (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "unblock")}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {actionLoading ? "Loading..." : "Unblock User"}
                </button>
              )}

              {selectedUser.tempMailDisabled ? (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "enable-temp-mail")}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {actionLoading ? "Loading..." : "Enable Temp Mail"}
                </button>
              ) : (
                <button
                  onClick={() => handleUserAction(selectedUser._id, "disable-temp-mail")}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {actionLoading ? "Loading..." : "Disable Temp Mail"}
                </button>
              )}

              <button
                onClick={() => handleDeleteUser(selectedUser._id, selectedUser.email)}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-red-900 text-white rounded hover:bg-red-800 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {actionLoading ? "Loading..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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
