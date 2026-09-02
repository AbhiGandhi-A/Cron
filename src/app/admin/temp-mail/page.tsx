"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Toast } from "@/components/admin/Toast";
import Link from "next/link";
import { getSessionCache, setSessionCache } from "@/lib/admin-session-cache";
import {
  MailIcon,
  RefreshIcon,
  BroomIcon,
  TrashIcon,
  UsersIcon,
  CheckCircleIcon,
  CloseIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from "@/components/admin/AdminIcons";

interface CloudflareMetric {
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
}

export interface ActiveMailboxItem {
  id: string;
  publicAddress: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  status: "active" | "expired" | "deleted";
  createdAt: string;
  expiresAt: string;
  messageCount: number;
  source: "cloudflare_d1" | "mongodb";
}

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
  activeMailboxes?: ActiveMailboxItem[];
  cloudflare?: {
    connected?: boolean;
    resources?: CloudflareMetric[];
  } | null;
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

export default function TempMailPage() {
  const [stats, setStats] = useState<TempMailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAddress, setDeletingAddress] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // UI Confirmation Drop Box States
  const [mailboxToDelete, setMailboxToDelete] = useState<ActiveMailboxItem | null>(null);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);

  const activeMailboxTableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = getSessionCache<TempMailStats>("adminTempMailCache");
    if (cached) {
      setStats(cached);
      setLoading(false);
      return;
    }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/temp-mail", {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`Failed to fetch temp mail stats (HTTP ${res.status})`);

      const data = await res.json();
      setStats(data);
      setSessionCache<TempMailStats>("adminTempMailCache", data);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load stats",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const executeCleanup = async () => {
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
      setToast({ message: data.message || "Cleanup completed", type: "success" });
      setConfirmCleanupOpen(false);
      await fetchStats();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Cleanup failed",
        type: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const executeDeleteMailbox = async (publicAddress: string) => {
    try {
      setDeletingAddress(publicAddress);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/temp-mail", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete-mailbox", publicAddress }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete mailbox");
      }

      const data = await res.json();
      setToast({ message: data.message || `Mailbox ${publicAddress} deleted`, type: "success" });
      setMailboxToDelete(null);

      // Optimistically update local active mailboxes list and counts
      setStats((prev) => {
        if (!prev) return prev;
        const filtered = (prev.activeMailboxes || []).filter(
          (m) => m.publicAddress.toLowerCase() !== publicAddress.toLowerCase()
        );
        return {
          ...prev,
          mailboxes: {
            ...prev.mailboxes,
            active: Math.max(0, prev.mailboxes.active - 1),
            deleted: prev.mailboxes.deleted + 1,
          },
          activeMailboxes: filtered,
        };
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to delete mailbox",
        type: "error",
      });
    } finally {
      setDeletingAddress(null);
    }
  };

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setToast({ message: `Copied ${address} to clipboard`, type: "success" });
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const scrollToActiveMailboxes = () => {
    if (activeMailboxTableRef.current) {
      activeMailboxTableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const filteredActiveMailboxes = useMemo(() => {
    const list = stats?.activeMailboxes || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (m) =>
        m.publicAddress.toLowerCase().includes(q) ||
        (m.ownerEmail && m.ownerEmail.toLowerCase().includes(q)) ||
        (m.ownerName && m.ownerName.toLowerCase().includes(q)) ||
        m.ownerId.toLowerCase().includes(q)
    );
  }, [stats?.activeMailboxes, searchQuery]);

  const workerMetrics = stats?.cloudflare?.resources?.filter((r) => r.category === "workers") || [];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Temp Mail</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">Service Analytics & Mailbox Management</span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Temporary Mail Control
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor disposable mailbox lifecycle, active email list, and Cloudflare Worker traffic
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => setConfirmCleanupOpen(true)}
            disabled={actionLoading || loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
          >
            <BroomIcon className="w-3.5 h-3.5" />
            {actionLoading ? "Processing..." : "Prune Expired Mailboxes"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-500 font-medium">Loading temp-mail metrics...</div>
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-xs">
          Failed to load temporary mail statistics. Please verify backend connection.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Mailboxes Overview Cards */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Mailbox Lifecycle</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Total Mailboxes</span>
                <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                  {formatNumber(stats.mailboxes.total)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">All created mailboxes</span>
              </div>

              {/* Clickable Active Mailboxes Card */}
              <div
                onClick={scrollToActiveMailboxes}
                className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs hover:border-emerald-300 hover:bg-emerald-50/70 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">Active Mailboxes</span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full group-hover:bg-emerald-200 transition">
                    View List <ChevronDownIcon className="w-3 h-3" />
                  </span>
                </div>
                <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                  {formatNumber(stats.mailboxes.active)}
                </span>
                <span className="text-[11px] text-emerald-600 mt-1 block">Currently accessible (Click to view)</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Expired Mailboxes</span>
                <span className="text-2xl font-extrabold text-amber-700 mt-1 block">
                  {formatNumber(stats.mailboxes.expired)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Past expiration time</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-600 block">Deleted Mailboxes</span>
                <span className="text-2xl font-extrabold text-slate-600 mt-1 block">
                  {formatNumber(stats.mailboxes.deleted)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Replaced by new generation</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-500 block">Created Today</span>
                <span className="text-2xl font-extrabold text-blue-700 mt-1 block">
                  {formatNumber(stats.mailboxes.createdToday)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Since 00:00 UTC</span>
              </div>
            </div>
          </section>

          {/* Section 2: Active Temporary Mailboxes List with Delete Action */}
          <section ref={activeMailboxTableRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">Active Temporary Mailboxes</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    {filteredActiveMailboxes.length} {filteredActiveMailboxes.length === 1 ? "Mailbox" : "Mailboxes"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live temporary email addresses currently active and receiving inbound emails
                </p>
              </div>

              {/* Search input */}
              <div className="w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Search address or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            </div>

            {filteredActiveMailboxes.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <MailIcon className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No active mailboxes found</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery ? "No active mailboxes match your search filter." : "There are currently no active temporary mailboxes."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-wider text-[10px] font-semibold bg-slate-50/60">
                      <th className="py-3 px-4 rounded-l-xl">Temporary Address</th>
                      <th className="py-3 px-4">Account / Owner</th>
                      <th className="py-3 px-4">Messages</th>
                      <th className="py-3 px-4">Created</th>
                      <th className="py-3 px-4">Storage Source</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right rounded-r-xl">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredActiveMailboxes.map((mb) => {
                      const isDeleting = deletingAddress === mb.publicAddress;
                      const isCopied = copiedAddress === mb.publicAddress;

                      return (
                        <tr key={mb.id || mb.publicAddress} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{mb.publicAddress}</span>
                              <button
                                onClick={() => handleCopy(mb.publicAddress)}
                                title="Copy email address"
                                className="text-slate-400 hover:text-blue-600 transition cursor-pointer p-1 rounded-md hover:bg-slate-100"
                              >
                                {isCopied ? (
                                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {mb.ownerEmail ? (
                              <Link
                                href={`/admin/users?search=${encodeURIComponent(mb.ownerEmail)}`}
                                className="text-blue-600 hover:text-blue-700 font-semibold hover:underline flex items-center gap-1.5"
                              >
                                <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
                                <span>{mb.ownerEmail}</span>
                              </Link>
                            ) : mb.ownerName ? (
                              <span className="font-semibold text-slate-800">{mb.ownerName}</span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px] truncate block max-w-[140px]" title={mb.ownerId}>
                                {mb.ownerId || "Anonymous / Unlinked"}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[11px]">
                              <MailIcon className="w-3 h-3 text-slate-400" />
                              {mb.messageCount} {mb.messageCount === 1 ? "msg" : "msgs"}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            {mb.createdAt ? new Date(mb.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }) : "—"}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              mb.source === "cloudflare_d1"
                                ? "bg-orange-50 text-orange-700 border-orange-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${mb.source === "cloudflare_d1" ? "bg-orange-500" : "bg-emerald-500"}`} />
                              {mb.source === "cloudflare_d1" ? "Cloudflare D1" : "MongoDB"}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => setMailboxToDelete(mb)}
                              disabled={isDeleting}
                              title={`Delete mailbox ${mb.publicAddress}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                            >
                              <TrashIcon className={`w-3.5 h-3.5 ${isDeleting ? "animate-spin" : ""}`} />
                              <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 3: Emails & Storage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3">Email Messages</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Total Messages Stored</span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                    {formatNumber(stats.emails.total)}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Messages Received Today</span>
                  <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                    {formatNumber(stats.emails.createdToday)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3">Storage Consumption</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Total Email Body Storage</span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                    {formatBytes(stats.storage.totalBytes)}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 block">Average Message Size</span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                    {formatBytes(stats.storage.averageEmailSize)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Cloudflare Worker Invocations */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Cloudflare Worker Analytics (Temp Mail Microservice)</h3>
                <p className="text-xs text-slate-500">GraphQL invocations & subrequest activity from Cloudflare</p>
              </div>
              <Link
                href="/admin/settings"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Settings <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>

            {workerMetrics.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                Cloudflare worker analytics unavailable. Ensure credentials are set in environment.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {workerMetrics.map((metric) => {
                  const hasLimit = metric.limit !== null && metric.limit > 0;
                  const isBytes = metric.unit === "bytes";
                  const currentFormatted = isBytes ? formatBytes(metric.current) : formatNumber(metric.current);
                  const limitFormatted = isBytes ? formatBytes(metric.limit) : formatNumber(metric.limit);
                  const remainingFormatted = isBytes ? formatBytes(metric.remaining) : formatNumber(metric.remaining);

                  return (
                    <div key={metric.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">{metric.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            metric.status === "critical"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : metric.status === "warning"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : metric.status === "healthy"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {metric.status.charAt(0).toUpperCase() + metric.status.slice(1)}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {currentFormatted}
                          </span>
                          {hasLimit && (
                            <span className="text-xs font-semibold text-slate-400">
                              / {limitFormatted} {metric.unit && !isBytes ? metric.unit : ""}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">Reset: {metric.resetPeriod}</span>
                      </div>

                      {metric.percentage !== null && hasLimit ? (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
                          <div className="h-2 w-full bg-slate-200/90 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                metric.status === "critical"
                                  ? "bg-red-500"
                                  : metric.status === "warning"
                                  ? "bg-amber-500"
                                  : "bg-blue-600"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(metric.current ? 0.8 : 0, metric.percentage))}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-500">
                            <span>
                              {metric.remaining !== null ? `${remainingFormatted} remaining` : `Reset: ${metric.resetPeriod}`}
                            </span>
                            <span className="font-bold text-slate-700">{metric.percentage.toFixed(2)}% used</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                          Quota: Standard Cloudflare Allowance
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Temp Mail Invariants Info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs text-xs text-slate-600 space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">Temp Mail Architecture Principles</h4>
            <ul className="space-y-1 text-slate-500">
              <li>• Mailboxes remain active indefinitely until the user explicitly requests a new mailbox.</li>
              <li>• Generating a new email address automatically deletes the previous mailbox and associated messages.</li>
              <li>• Inboxes retain the newest 6 messages; older items are automatically pruned.</li>
              <li>• Messages refresh only on manual user request (no background polling).</li>
            </ul>
          </div>
        </div>
      )}

      {/* Delete Mailbox Confirmation UI Dialog */}
      {mailboxToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!deletingAddress) setMailboxToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                <TrashIcon className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Delete Temporary Mailbox</h3>
                  <button
                    type="button"
                    onClick={() => setMailboxToDelete(null)}
                    disabled={Boolean(deletingAddress)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer text-xs"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Are you sure you want to permanently delete this temporary mailbox? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Temporary Address:</span>
                <span className="font-mono font-bold text-slate-900 truncate max-w-[220px]">
                  {mailboxToDelete.publicAddress}
                </span>
              </div>
              {mailboxToDelete.ownerEmail && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Owner Account:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[220px]">
                    {mailboxToDelete.ownerEmail}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Stored Messages:</span>
                <span className="font-semibold text-slate-800">
                  {mailboxToDelete.messageCount} {mailboxToDelete.messageCount === 1 ? "email" : "emails"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Storage Engine:</span>
                <span className="font-semibold text-slate-700">
                  {mailboxToDelete.source === "cloudflare_d1" ? "Cloudflare D1" : "MongoDB"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMailboxToDelete(null)}
                disabled={Boolean(deletingAddress)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDeleteMailbox(mailboxToDelete.publicAddress)}
                disabled={Boolean(deletingAddress)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <TrashIcon className={`w-3.5 h-3.5 ${deletingAddress ? "animate-spin" : ""}`} />
                <span>{deletingAddress ? "Deleting..." : "Permanently Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prune Expired Mailboxes Confirmation UI Dialog */}
      {confirmCleanupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!actionLoading) setConfirmCleanupOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <BroomIcon className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Prune Expired Mailboxes</h3>
                  <button
                    type="button"
                    onClick={() => setConfirmCleanupOpen(false)}
                    disabled={actionLoading}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer text-xs"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Scan and mark all expired temporary mailboxes as expired across Cloudflare D1 and MongoDB.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCleanupOpen(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeCleanup}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <BroomIcon className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
                <span>{actionLoading ? "Processing..." : "Prune Expired Now"}</span>
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
