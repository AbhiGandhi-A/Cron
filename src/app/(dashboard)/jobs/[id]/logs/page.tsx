"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatDate, formatDuration, formatRelativeTime, maskHeaders } from "@/lib/utils";

interface Execution {
  id: string;
  _id: string;
  jobId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  httpMethod: string;
  httpStatus: number | null;
  responseTime: number | null;
  responseSize: number | null;
  errorMessage: string | null;
  errorType: string | null;
  retryNumber: number;
  requestUrl: string;
  timeoutDuration: number | null;
}

interface ExecutionDetail {
  _id: string;
  jobId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  httpMethod: string;
  httpUrl: string;
  httpStatus: number | null;
  responseTime: number | null;
  responseSize: number | null;
  requestBody: string | null;
  responseBody: string | null;
  requestHeaders: Record<string, string> | null;
  responseHeaders: Record<string, string> | null;
  queryParams: Record<string, string> | null;
  errorMessage: string | null;
  errorType: string | null;
  retryNumber: number;
  timeoutDuration: number | null;
}

interface Job {
  _id: string;
  name: string;
  method: string;
  url: string;
}

const FILTERS = ["All", "Successful", "Failed", "4xx", "5xx", "Timeout"] as const;
type Filter = typeof FILTERS[number];

export default function LogsPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "request" | "response" | "error">("overview");

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/" + params.id + "/history?page=" + page + "&limit=50");
      if (!res.ok) {
        showToast("Failed to load logs", "error");
        router.push("/jobs");
        return;
      }
      const data = await res.json();
      setExecutions(data.executions || []);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);

      const jobRes = await fetch("/api/jobs/" + params.id);
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJob(jobData.job);
      }
    } catch {
      showToast("Failed to load logs", "error");
    } finally {
      setLoading(false);
    }
  }, [params.id, page, showToast, router]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  async function handleExpand(executionId: string) {
    if (expandedId === executionId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(executionId);
    setActiveTab("overview");
    setLoadingDetail(true);
    try {
      const res = await fetch("/api/jobs/" + params.id + "/history/" + executionId);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDetail(data.execution);
    } catch {
      showToast("Failed to load execution details", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  function getFilteredExecutions(): Execution[] {
    if (activeFilter === "All") return executions;
    return executions.filter((e) => {
      switch (activeFilter) {
        case "Successful": return e.status === "SUCCESS";
        case "Failed": return e.status === "FAILED";
        case "4xx": return e.httpStatus !== null && e.httpStatus >= 400 && e.httpStatus < 500;
        case "5xx": return e.httpStatus !== null && e.httpStatus >= 500;
        case "Timeout": return e.status === "TIMEOUT";
        default: return true;
      }
    });
  }

  function getStatusIcon(status: string): React.ReactNode {
    if (status === "SUCCESS") {
      return (
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    if (status === "FAILED") {
      return (
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }

  function getMethodColor(method: string): string {
    switch (method?.toUpperCase()) {
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

  function getHttpStatusBadgeColor(code: number | null): string {
    if (!code) return "bg-gray-100 text-gray-600";
    if (code >= 200 && code < 300) return "bg-emerald-100 text-emerald-700";
    if (code >= 300 && code < 400) return "bg-blue-100 text-blue-700";
    if (code >= 400 && code < 500) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  }

  function formatSize(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function prettyPrintJson(str: string | null): string {
    if (!str) return "-";
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }

  const filteredExecutions = getFilteredExecutions();

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
            <Link href="/jobs" className="hover:text-brand-600 transition-colors">Jobs</Link>
            <span>/</span>
            <Link href={"/jobs/" + params.id} className="hover:text-brand-600 transition-colors">{job?.name || "..."}</Link>
            <span>/</span>
            <span className="text-gray-600">Logs</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Execution Logs</h1>
              {job && (
                <p className="text-sm text-gray-400 font-mono mt-1">{job.method} {job.url}</p>
              )}
            </div>
            <Link
              href={"/jobs/" + params.id}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back
            </Link>
          </div>
        </div>

        {!loading && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {FILTERS.map((filter) => {
              const count = filter === "All" ? total : executions.filter((e) => {
                switch (filter) {
                  case "Successful": return e.status === "SUCCESS";
                  case "Failed": return e.status === "FAILED";
                  case "4xx": return e.httpStatus !== null && e.httpStatus >= 400 && e.httpStatus < 500;
                  case "5xx": return e.httpStatus !== null && e.httpStatus >= 500;
                  case "Timeout": return e.status === "TIMEOUT";
                  default: return false;
                }
              }).length;
              return (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setExpandedId(null); setDetail(null); }}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                    activeFilter === filter
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {filter}
                  <span className={`ml-1.5 text-xs ${activeFilter === filter ? "text-white/70" : "text-gray-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : filteredExecutions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <EmptyState
              title="No executions yet"
              description="Run the job manually to see execution logs here"
              actionLabel="Go to job"
              actionHref={"/jobs/" + params.id}
              icon={
                <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth="0.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
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
                    <th className="px-6 py-3 w-10"></th>
                    <th className="px-6 py-3">Method</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Duration</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Size</th>
                    <th className="px-6 py-3 hidden md:table-cell">Retries</th>
                    <th className="px-6 py-3">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredExecutions.map((exec) => (
                    <tr key={exec.id || exec._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleExpand(exec.id || exec._id)}
                          className="p-1 rounded transition-colors hover:bg-gray-100"
                          title="View details"
                        >
                          {getStatusIcon(exec.status)}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center font-bold rounded-md px-2 py-0.5 text-[10px] ${getMethodColor(exec.httpMethod)}`}>
                          {exec.httpMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center font-bold rounded-full px-2 py-0.5 text-[11px] ${getHttpStatusBadgeColor(exec.httpStatus)}`}>
                          {exec.httpStatus || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">
                        {exec.responseTime ? formatDuration(exec.responseTime) : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 hidden sm:table-cell">
                        {formatSize(exec.responseSize)}
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        {exec.retryNumber > 0 ? (
                          <span className="inline-flex items-center text-[11px] font-semibold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5">
                            Retry #{exec.retryNumber}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 whitespace-nowrap">
                        {formatRelativeTime(exec.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <p className="text-sm text-gray-400">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {expandedId && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                {loadingDetail ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                  </div>
                ) : detail ? (
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-bold text-gray-900">Execution Details</h3>
                      <button
                        onClick={() => { setExpandedId(null); setDetail(null); }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Close
                      </button>
                    </div>

                    <div className="flex gap-1 mb-5 border-b border-gray-200">
                      {(["overview", "request", "response", "error"] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                            activeTab === tab
                              ? "border-brand-600 text-brand-600"
                              : "border-transparent text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {activeTab === "overview" && (
                      <div className="bg-white rounded-xl border border-gray-100 p-5">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Execution ID</p>
                            <p className="text-sm font-mono text-gray-700 truncate">{detail._id}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</p>
                            <StatusBadge status={detail.status} size="sm" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Duration</p>
                            <p className="text-sm font-mono text-gray-700">{detail.responseTime ? formatDuration(detail.responseTime) : "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">HTTP Status</p>
                            <span className={`inline-flex items-center font-bold rounded-full px-2 py-0.5 text-[11px] ${getHttpStatusBadgeColor(detail.httpStatus)}`}>
                              {detail.httpStatus || "-"}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Response Size</p>
                            <p className="text-sm font-mono text-gray-700">{formatSize(detail.responseSize)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Method</p>
                            <span className={`inline-flex items-center font-bold rounded-md px-2 py-0.5 text-[10px] ${getMethodColor(detail.httpMethod)}`}>
                              {detail.httpMethod}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Started</p>
                            <p className="text-sm text-gray-700">{formatDate(detail.startedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Completed</p>
                            <p className="text-sm text-gray-700">{detail.completedAt ? formatDate(detail.completedAt) : "-"}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === "request" && (
                      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Method</p>
                            <span className={`inline-flex items-center font-bold rounded-md px-2 py-0.5 text-[10px] ${getMethodColor(detail.httpMethod)}`}>
                              {detail.httpMethod}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">URL</p>
                            <p className="text-sm font-mono text-gray-700 break-all">{detail.httpUrl}</p>
                          </div>
                        </div>

                        {detail.queryParams && Object.keys(detail.queryParams).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Query Parameters</p>
                            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
                              {Object.entries(detail.queryParams).map(([k, v]) => (
                                <p key={k}><span className="text-brand-600">{k}</span>=<span className="text-gray-600">{v}</span></p>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Request Headers</p>
                          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
                            {detail.requestHeaders ? (
                              Object.entries(maskHeaders(detail.requestHeaders)).map(([k, v]) => (
                                <p key={k}><span className="text-brand-600">{k}</span>: <span className="text-gray-600">{v}</span></p>
                              ))
                            ) : (
                              <p className="text-gray-400">No headers</p>
                            )}
                          </div>
                        </div>

                        {detail.requestBody && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Request Body</p>
                            <pre className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                              {prettyPrintJson(detail.requestBody)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "response" && (
                      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Status Code</p>
                            <span className={`inline-flex items-center font-bold rounded-full px-2 py-0.5 text-[11px] ${getHttpStatusBadgeColor(detail.httpStatus)}`}>
                              {detail.httpStatus || "-"}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Response Size</p>
                            <p className="text-sm font-mono text-gray-700">{formatSize(detail.responseSize)}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Response Headers</p>
                          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
                            {detail.responseHeaders ? (
                              Object.entries(maskHeaders(detail.responseHeaders)).map(([k, v]) => (
                                <p key={k}><span className="text-brand-600">{k}</span>: <span className="text-gray-600">{v}</span></p>
                              ))
                            ) : (
                              <p className="text-gray-400">No headers</p>
                            )}
                          </div>
                        </div>

                        {detail.responseBody && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Response Body</p>
                            <pre className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600 whitespace-pre-wrap break-all max-h-[500px] overflow-y-auto">
                              {prettyPrintJson(detail.responseBody.length > 51200 ? detail.responseBody.substring(0, 51200) + "\n... (truncated)" : detail.responseBody)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "error" && (
                      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
                        {detail.errorMessage || detail.errorType ? (
                          <>
                            {detail.errorMessage && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Error Message</p>
                                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-700 font-mono">
                                  {detail.errorMessage}
                                </div>
                              </div>
                            )}
                            {detail.errorType && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Error Type</p>
                                <p className="text-sm font-mono text-gray-700">{detail.errorType}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Retry Count</p>
                              <p className="text-sm font-mono text-gray-700">{detail.retryNumber}</p>
                            </div>
                            {detail.timeoutDuration && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Timeout Duration</p>
                                <p className="text-sm font-mono text-gray-700">{formatDuration(detail.timeoutDuration)}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 text-center py-8">No error information available</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
