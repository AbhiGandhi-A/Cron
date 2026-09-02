"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import ResponseInspector from "@/components/ResponseInspector";
import { useToast } from "@/components/Toast";
import { formatDate, formatDuration, maskHeaders, getHttpStatusColor, formatRelativeTime } from "@/lib/utils";

interface Job {
  _id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string> | null;
  body: unknown;
  schedule: string;
  timezone?: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
  expectedStatus?: number | null;
  expectedResponseRegex?: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  createdAt: string;
  executions: Array<{
    id: string;
    status: string;
    httpStatus: number | null;
    responseTime: number | null;
    startedAt: string;
    completedAt: string | null;
    errorMessage: string | null;
    retryNumber: number;
  }>;
}

interface JobStats {
  totalExecutions: number;
  totalFinished: number;
  success: number;
  failed: number;
  timeouts: number;
  retries: number;
  successRate: number | null;
  avgResponseTime: number | null;
  lastExecutionAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
}

interface InspectorResult {
  status: string;
  httpStatus: number | null;
  responseTime: number | null;
  errorMessage: string | null;
  responseBody: string | null;
  responseHeaders?: Record<string, string> | null;
  responseSize?: number;
  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string> | null;
  queryParams?: Record<string, string> | null;
  requestBody?: unknown;
  startedAt?: string;
  completedAt?: string;
}

function getScheduleLabel(schedule: string): string {
  const map: Record<string, string> = {
    "* * * * *": "Every 1 min",
    "*/5 * * * *": "Every 5 min",
    "*/15 * * * *": "Every 15 min",
    "*/30 * * * *": "Every 30 min",
    "0 * * * *": "Every hour",
    "0 0 * * *": "Daily",
  };
  return map[schedule] || schedule;
}

function formatInTimezone(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return formatDate(iso);
  }
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [upcoming, setUpcoming] = useState<string[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectorResult, setInspectorResult] = useState<InspectorResult | null>(null);

  const fetchJob = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const res = await fetch("/api/jobs/" + params.id);
      if (!res.ok) {
        if (!opts?.silent) {
          showToast("Job not found", "error");
          router.push("/jobs");
        }
        return;
      }
      const data = await res.json();
      const job: Job = data.job;
      setJob(job);

      try {
        const statsRes = await fetch("/api/jobs/" + params.id + "/stats");
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats);
        }
      } catch {
        // stats are best effort
      }

      const timezone = job.timezone || "UTC";
      try {
        const previewParams = new URLSearchParams({
          schedule: job.schedule,
          timezone,
          count: "5",
        });
        const previewRes = await fetch("/api/jobs/preview?" + previewParams.toString());
        if (previewRes.ok) {
          const previewData = await previewRes.json();
          setUpcoming((previewData.upcoming || []).slice(0, 5));
        }
      } catch {
        // preview is best effort
      }
    } catch {
      if (!opts?.silent) {
        showToast("Failed to load job", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [params.id, showToast, router]);

  useEffect(() => {
    fetchJob();
    const interval = setInterval(() => fetchJob({ silent: true }), 10000);
    return () => clearInterval(interval);
  }, [fetchJob]);

  async function handleTrigger() {
    setTriggering(true);
    try {
      const res = await fetch("/api/jobs/" + params.id + "/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast("Executed: " + (data.execution.httpStatus || data.execution.status), data.execution.status === "SUCCESS" ? "success" : "error");
        setInspectorResult(data.execution);
        setShowInspector(true);
        fetchJob();
      } else {
        showToast(data.error || "Trigger failed", "error");
      }
    } catch {
      showToast("Trigger failed", "error");
    } finally {
      setTriggering(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) return null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{job.name}</h1>
              <StatusBadge status={job.isActive ? "ACTIVE" : "INACTIVE"} />
              {job.isRunning && <StatusBadge status="RUNNING" />}
            </div>
            <p className="text-sm text-gray-400 font-mono mt-0.5">
              {job.method} {job.url}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleTrigger} disabled={triggering || job.isRunning}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors">
              {triggering ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              )}
              Run Now
            </button>
            <Link href={"/jobs/" + job._id + "/edit"}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Edit
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total Runs</p>
            <p className="text-2xl font-bold text-gray-900">{stats ? stats.totalExecutions : "-"}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Success</p>
            <p className="text-2xl font-bold text-emerald-600">{stats ? stats.success : "-"}</p>
            <p className="text-xs text-gray-400 mt-1">
              {stats && stats.successRate != null ? stats.successRate + "% rate" : "no finished runs"}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Failed</p>
            <p className="text-2xl font-bold text-red-600">{stats ? stats.failed : "-"}</p>
            <p className="text-xs text-gray-400 mt-1">
              {stats && stats.timeouts ? stats.timeouts + " timeouts" : ""}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Avg Response</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats && stats.avgResponseTime != null ? formatDuration(stats.avgResponseTime) : "-"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {stats && stats.consecutiveFailures > 0 ? "consecutive failures: " + stats.consecutiveFailures : "last success " + (stats?.lastSuccessAt ? formatRelativeTime(stats.lastSuccessAt) : "never")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Schedule</p>
            <p className="font-mono text-sm font-semibold text-gray-900 mb-2">{getScheduleLabel(job.schedule)}</p>
            <p className="font-mono text-xs text-gray-400 mb-3">{job.schedule}</p>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Timezone: <span className="text-gray-600">{job.timezone || "UTC"}</span></p>
              <p className="text-xs text-gray-400">Last run: <span className="text-gray-600">{job.lastRunAt ? formatDate(job.lastRunAt) : "Never"}</span></p>
              <p className="text-xs text-gray-400">Next run: <span className="text-gray-600">{job.nextRunAt ? formatDate(job.nextRunAt) : "N/A"}</span></p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Upcoming Runs</p>
            {job.isActive ? (
              upcoming.length > 0 ? (
                <ol className="space-y-1.5">
                  {upcoming.map((run, i) => (
                    <li key={run + i} className="flex items-center gap-2 text-sm">
                      <span className={"inline-block h-1.5 w-1.5 rounded-full " + (i === 0 ? "bg-brand-600" : "bg-gray-300")} />
                      <span className={"font-mono font-medium " + (i === 0 ? "text-gray-900" : "text-gray-500")}>
                        {formatInTimezone(run, job.timezone || "UTC")}
                      </span>
                      {i === 0 && <span className="text-[10px] font-semibold text-brand-600 uppercase tracking-wider">Next</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-gray-400">Schedule preview unavailable.</p>
              )
            ) : (
              <p className="text-xs text-gray-400">Job is inactive — no upcoming runs.</p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Config</p>
            <div className="space-y-1 text-xs">
              <p className="text-gray-400">Timeout: <span className="text-gray-600 font-mono">{job.timeout}ms</span></p>
              <p className="text-gray-400">Retries: <span className="text-gray-600 font-mono">{job.retryCount}</span></p>
              <p className="text-gray-400">Created: <span className="text-gray-600 font-mono">{formatDate(job.createdAt)}</span></p>
              <p className="text-gray-400">
                Validation:{" "}
                <span className="text-gray-600">
                  {(job.expectedStatus != null || job.expectedResponseRegex) ? "Custom checks enabled" : "HTTP default"}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Headers</p>
          {job.headers ? (
            <div className="font-mono text-xs text-gray-600 space-y-0.5">
              {Object.entries(maskHeaders(job.headers)).map(([k, v]) => (
                <p key={k}><span className="text-gray-400">{k}:</span> {v}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-300">No headers configured</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Recent Executions</h2>
            <Link href={"/jobs/" + job._id + "/logs"} className="text-sm text-brand-600 hover:text-brand-700 font-semibold">
              View all logs &rarr;
            </Link>
          </div>
          {job.executions.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No executions yet. Click Run Now to trigger one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/80">
                    <th className="px-6 py-3">Started</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Duration</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 hidden sm:table-cell">HTTP</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Retries</th>
                    <th className="px-6 py-3 hidden lg:table-cell">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {job.executions.map((exec) => (
                    <tr key={exec.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(exec.startedAt)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">{exec.responseTime ? formatDuration(exec.responseTime) : "-"}</td>
                      <td className="px-6 py-4"><StatusBadge status={exec.status} size="sm" /></td>
                      <td className={"px-6 py-4 text-sm font-mono " + getHttpStatusColor(exec.httpStatus) + " hidden sm:table-cell"}>{exec.httpStatus || "-"}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">{exec.retryNumber}</td>
                      <td className="px-6 py-4 text-sm text-red-500 max-w-xs truncate hidden lg:table-cell">{exec.errorMessage || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ResponseInspector
        open={showInspector}
        onClose={() => setShowInspector(false)}
        result={inspectorResult}
      />
    </DashboardLayout>
  );
}
