"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatRelativeTime } from "@/lib/utils";

interface TestUrl {
  _id: string;
  name: string;
  token: string;
  isActive: boolean;
  requestCount: number;
  createdAt: string;
}

interface CapturedRequest {
  _id: string;
  method: string;
  url: string;
  statusCode: number;
  contentLength: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
  queryParams: Record<string, string> | null;
  receivedAt: string;
}

export default function TestUrlsPage() {
  const { showToast } = useToast();
  const [testUrls, setTestUrls] = useState<TestUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<{ url: string; token: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [regenerateId, setRegenerateId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fetchTestUrls = useCallback(async () => {
    try {
      const res = await fetch("/api/test-urls");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTestUrls(data.testUrls || []);
    } catch {
      showToast("Failed to load test URLs", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchTestUrls();
  }, [fetchTestUrls]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/test-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        const fullUrl = window.location.origin + "/api/test/" + data.testUrl.token;
        setCreatedUrl({ url: fullUrl, token: data.testUrl.token });
        setNewName("");
        setShowForm(false);
        fetchTestUrls();
      } else {
        showToast(data.error || "Failed to create", "error");
      }
    } catch {
      showToast("Failed to create test URL", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch("/api/test-urls/" + id + "/toggle", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Toggled", "success");
        setTestUrls((prev) =>
          prev.map((t) => (t._id === id ? { ...t, isActive: !t.isActive } : t))
        );
      } else {
        showToast(data.error || "Failed to toggle", "error");
      }
    } catch {
      showToast("Failed to toggle test URL", "error");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/test-urls/" + deleteId, { method: "DELETE" });
      if (res.ok) {
        showToast("Test URL deleted", "success");
        setTestUrls((prev) => prev.filter((t) => t._id !== deleteId));
      } else {
        showToast("Failed to delete", "error");
      }
    } catch {
      showToast("Failed to delete test URL", "error");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  async function handleRegenerate() {
    if (!regenerateId) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/test-urls/" + regenerateId + "/regenerate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast("Token regenerated", "success");
        setTestUrls((prev) =>
          prev.map((t) => (t._id === regenerateId ? { ...t, token: data.testUrl.token } : t))
        );
      } else {
        showToast(data.error || "Failed to regenerate", "error");
      }
    } catch {
      showToast("Failed to regenerate token", "error");
    } finally {
      setRegenerating(false);
      setRegenerateId(null);
    }
  }

  async function handleViewRequests(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setExpandedRequestId(null);
    setLoadingRequests(true);
    try {
      const res = await fetch("/api/test-urls/" + id + "/requests");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      showToast("Failed to load requests", "error");
    } finally {
      setLoadingRequests(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard", "success");
    } catch {
      showToast("Failed to copy", "error");
    }
  }

  function getMethodColor(method: string): string {
    switch (method.toUpperCase()) {
      case "GET": return "bg-emerald-100 text-emerald-700";
      case "POST": return "bg-blue-100 text-blue-700";
      case "PUT": return "bg-amber-100 text-amber-700";
      case "PATCH": return "bg-yellow-100 text-yellow-700";
      case "DELETE": return "bg-red-100 text-red-700";
      case "HEAD": return "bg-gray-100 text-gray-600";
      case "OPTIONS": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-600";
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function truncateUrl(url: string): string {
    if (url.length <= 50) return url;
    return url.substring(0, 50) + "...";
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Test Webhook URLs</h1>
            <p className="text-sm text-gray-500 mt-1">Capture incoming HTTP requests for testing</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setCreatedUrl(null); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Test URL
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Create Test URL</h2>
            <form onSubmit={handleCreate} className="flex gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g. Stripe Webhook)"
                className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                autoFocus
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </form>
          </div>
        )}

        {createdUrl && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6">
            <p className="text-sm font-semibold text-emerald-800 mb-2">Test URL Created</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-emerald-700 bg-white px-4 py-2.5 rounded-xl border border-emerald-200 truncate">
                {createdUrl.url}
              </code>
              <button
                onClick={() => copyToClipboard(createdUrl.url)}
                className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : testUrls.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <EmptyState
              title="No test URLs yet"
              description="Create a test URL to start capturing HTTP requests"
              icon={
                <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth="0.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.864-4.542a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              }
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/80">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3 hidden md:table-cell">URL</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Requests</th>
                    <th className="px-6 py-3 hidden lg:table-cell">Created</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {testUrls.map((testUrl) => (
                    <tr key={testUrl._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900">{testUrl.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5 md:hidden truncate max-w-[200px]">
                          {window.location.origin}/api/test/{testUrl.token}
                        </p>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded-md truncate max-w-[280px]">
                            {truncateUrl(window.location.origin + "/api/test/" + testUrl.token)}
                          </code>
                          <button
                            onClick={() => copyToClipboard(window.location.origin + "/api/test/" + testUrl.token)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                            title="Copy URL"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center font-semibold rounded-full px-2 py-0.5 text-[11px] ${testUrl.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${testUrl.isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
                          {testUrl.isActive ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">{testUrl.requestCount}</td>
                      <td className="px-6 py-4 text-sm text-gray-400 hidden lg:table-cell">{formatRelativeTime(testUrl.createdAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggle(testUrl._id)}
                            className="p-2 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
                            title={testUrl.isActive ? "Deactivate" : "Activate"}
                          >
                            {testUrl.isActive ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleViewRequests(testUrl._id)}
                            className={`p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors ${expandedId === testUrl._id ? "text-blue-600 bg-blue-50" : ""}`}
                            title="View requests"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setRegenerateId(testUrl._id)}
                            className="p-2 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                            title="Regenerate token"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteId(testUrl._id)}
                            className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expandedId && (
              <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900">Captured Requests</h3>
                  <button
                    onClick={() => setExpandedId(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
                {loadingRequests ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                  </div>
                ) : requests.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No requests captured yet</p>
                ) : (
                  <div className="space-y-2">
                    {requests.map((req) => (
                      <div key={req._id} className="bg-white rounded-xl border border-gray-100">
                        <button
                          onClick={() => setExpandedRequestId(expandedRequestId === req._id ? null : req._id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/50 rounded-xl transition-colors"
                        >
                          <span className={`inline-flex items-center font-bold rounded-md px-2 py-0.5 text-[10px] ${getMethodColor(req.method)}`}>
                            {req.method}
                          </span>
                          <span className="text-sm text-gray-500 font-mono truncate flex-1">{req.url}</span>
                          <span className="inline-flex items-center font-semibold rounded-full px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700">
                            {req.statusCode}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">{formatRelativeTime(req.receivedAt)}</span>
                          <span className="text-xs text-gray-400 shrink-0">{formatSize(req.contentLength)}</span>
                          <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expandedRequestId === req._id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        {expandedRequestId === req._id && (
                          <div className="px-4 pb-4 border-t border-gray-50">
                            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Method</p>
                                <p className="font-mono text-gray-700">{req.method}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Content-Type</p>
                                <p className="font-mono text-gray-700 truncate">{req.contentType || "-"}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Size</p>
                                <p className="font-mono text-gray-700">{formatSize(req.contentLength)}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Received</p>
                                <p className="font-mono text-gray-700">{new Date(req.receivedAt).toLocaleString()}</p>
                              </div>
                            </div>
                            {req.queryParams && Object.keys(req.queryParams).length > 0 && (
                              <div className="mt-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Query Parameters</p>
                                <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
                                  {Object.entries(req.queryParams).map(([k, v]) => (
                                    <p key={k}><span className="text-brand-600">{k}</span>=<span className="text-gray-600">{v}</span></p>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-4">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Headers</p>
                              <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
                                {Object.entries(req.headers).map(([k, v]) => (
                                  <p key={k}><span className="text-brand-600">{k}</span>: <span className="text-gray-600">{v}</span></p>
                                ))}
                              </div>
                            </div>
                            {req.body && (
                              <div className="mt-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Body</p>
                                <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                                  {(() => {
                                    try {
                                      return JSON.stringify(JSON.parse(req.body), null, 2);
                                    } catch {
                                      return req.body;
                                    }
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={!!deleteId}
          title="Delete Test URL"
          message="This will permanently delete this test URL and all its captured requests. This action cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          loading={deleting}
        />

        <ConfirmDialog
          open={!!regenerateId}
          title="Regenerate Token"
          message="The current webhook URL will stop working. A new token and URL will be generated."
          confirmLabel="Regenerate"
          onConfirm={handleRegenerate}
          onCancel={() => setRegenerateId(null)}
          loading={regenerating}
        />
      </div>
    </DashboardLayout>
  );
}
