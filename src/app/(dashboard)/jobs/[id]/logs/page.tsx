"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatDate, formatDuration, getHttpStatusColor } from "@/lib/utils";

interface Execution {
  id: string;
  _id: string;
  jobId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  httpStatus: number | null;
  responseTime: number | null;
  errorMessage: string | null;
  retryNumber: number;
  requestUrl: string;
  requestBody: unknown;
  responseBody: string | null;
}

export default function LogsPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobName, setJobName] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/" + params.id + "/history?page=" + page + "&limit=20");
      if (!res.ok) { showToast("Failed to load logs", "error"); router.push("/jobs"); return; }
      const data = await res.json();
      setExecutions(data.executions || []);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);

      const jobRes = await fetch("/api/jobs/" + params.id);
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJobName(jobData.job.name);
      }
    } catch {
      showToast("Failed to load logs", "error");
    } finally {
      setLoading(false);
    }
  }, [params.id, page, showToast, router]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
            <Link href="/jobs" className="hover:text-brand-600 transition-colors">Jobs</Link>
            <span>/</span>
            <Link href={"/jobs/" + params.id} className="hover:text-brand-600 transition-colors">{jobName}</Link>
            <span>/</span>
            <span className="text-gray-600">Logs</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Execution Logs</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total executions</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : executions.length === 0 ? (
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
                    <th className="px-6 py-3">Started</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Duration</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 hidden sm:table-cell">HTTP</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Retries</th>
                    <th className="px-6 py-3 hidden lg:table-cell">URL</th>
                    <th className="px-6 py-3 hidden lg:table-cell">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {executions.map((exec, index) => (
                    <tr key={exec.id || String(index)} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(exec.startedAt)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">{exec.responseTime ? formatDuration(exec.responseTime) : "-"}</td>
                      <td className="px-6 py-4"><StatusBadge status={exec.status} size="sm" /></td>
                      <td className={"px-6 py-4 text-sm font-mono " + getHttpStatusColor(exec.httpStatus) + " hidden sm:table-cell"}>{exec.httpStatus || "-"}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">{exec.retryNumber}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate hidden lg:table-cell">{exec.requestUrl}</td>
                      <td className="px-6 py-4 text-sm text-red-500 max-w-[200px] truncate hidden lg:table-cell">{exec.errorMessage || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <p className="text-sm text-gray-400">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    Previous
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
