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
    resources?: {
      [key: string]: {
        usage: number;
        limit: number;
        percentage: number;
      };
    };
  };
}

interface StatBoxProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
}

function StatBox({ label, value, unit, icon }: StatBoxProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">
            {value}
            {unit && <span className="text-sm text-slate-400 ml-1">{unit}</span>}
          </p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

export default function TempMailPage() {
  const [stats, setStats] = useState<TempMailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

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
      setToast({
        message: data.message,
        type: "success",
      });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Temporary Email</h1>
          <p className="text-slate-400">Monitor and manage temporary mailboxes</p>
        </div>
        <button
          onClick={handleCleanup}
          disabled={actionLoading || loading}
          className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors font-medium"
        >
          {actionLoading ? "Cleaning..." : "Clean Expired"}
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-8">Loading...</div>
      ) : !stats ? (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">
          Failed to load temp mail statistics
        </div>
      ) : (
        <>
          {/* Mailbox Stats */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Mailbox Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatBox label="Total Mailboxes" value={stats.mailboxes.total} icon="📬" />
              <StatBox label="Active" value={stats.mailboxes.active} icon="✅" />
              <StatBox label="Expired" value={stats.mailboxes.expired} icon="⏰" />
              <StatBox label="Deleted" value={stats.mailboxes.deleted} icon="🗑️" />
              <StatBox
                label="Created Today"
                value={stats.mailboxes.createdToday}
                icon="🆕"
              />
            </div>
          </div>

          {/* Email Stats */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Email Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatBox label="Total Emails" value={stats.emails.total} icon="📧" />
              <StatBox
                label="Created Today"
                value={stats.emails.createdToday}
                icon="📨"
              />
              <StatBox
                label="Avg Email Size"
                value={(stats.storage.averageEmailSize / 1024).toFixed(2)}
                unit="KB"
                icon="📏"
              />
            </div>
          </div>

          {/* Storage Stats */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Storage</h2>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <p className="text-slate-400 text-sm mb-2">Total Storage Used</p>
              <div>
                <p className="text-3xl font-bold text-white">
                  {(stats.storage.totalBytes / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="text-slate-500 text-sm mt-2">
                  {stats.emails.total} emails stored
                </p>
              </div>
            </div>
          </div>

          {/* Cloudflare Usage */}
          {stats.cloudflareUsage?.resources && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">
                Cloudflare Worker Usage
              </h2>
              <div className="space-y-4">
                {Object.entries(stats.cloudflareUsage.resources).map(
                  ([resource, usage]) => {
                    const percentage = usage.percentage || 0;
                    const isWarning = percentage > 75;
                    const isDanger = percentage > 90;

                    return (
                      <div
                        key={resource}
                        className="bg-slate-800 border border-slate-700 rounded-lg p-4"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-white font-medium capitalize">
                            {resource.replace(/_/g, " ")}
                          </p>
                          <p
                            className={`text-sm font-bold ${
                              isDanger
                                ? "text-red-400"
                                : isWarning
                                  ? "text-yellow-400"
                                  : "text-green-400"
                            }`}
                          >
                            {percentage.toFixed(1)}%
                          </p>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              isDanger
                                ? "bg-red-500"
                                : isWarning
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(100, percentage)}%` }}
                          />
                        </div>
                        <p className="text-slate-400 text-xs mt-2">
                          {usage.usage.toLocaleString()} /{" "}
                          {usage.limit.toLocaleString()} available
                        </p>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => window.location.href = "/admin/users"}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-left text-white transition-colors"
              >
                <div className="text-2xl mb-2">👥</div>
                <div className="font-semibold">Manage User Access</div>
                <div className="text-sm text-slate-400">
                  Disable temp mail per user
                </div>
              </button>
              <button
                onClick={fetchStats}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-left text-white transition-colors"
              >
                <div className="text-2xl mb-2">🔄</div>
                <div className="font-semibold">Refresh Stats</div>
                <div className="text-sm text-slate-400">
                  Get latest usage data
                </div>
              </button>
            </div>
          </div>
        </>
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
