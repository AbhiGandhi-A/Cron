"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";
import { formatDate, formatDuration, maskHeaders, getHttpStatusColor } from "@/lib/utils";

interface Job {
  _id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string> | null;
  body: unknown;
  schedule: string;
  isActive: boolean;
  timeout: number;
  retryCount: number;
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

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/" + params.id);
      if (!res.ok) {
        showToast("Job not found", "error");
        router.push("/jobs");
        return;
      }
      const data = await res.json();
      setJob(data.job);
    } catch {
      showToast("Failed to load job", "error");
    } finally {
      setLoading(false);
    }
  }, [params.id, showToast, router]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  async function handleTrigger() {
    setTriggering(true);
    try {
      const res = await fetch("/api/jobs/" + params.id + "/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast("Executed: " + (data.execution.httpStatus || data.execution.status), data.execution.status === "SUCCESS" ? "success" : "error");
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
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
              Edit
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Schedule</p>
            <p className="font-mono text-sm font-semibold text-gray-900 mb-3">{getScheduleLabel(job.schedule)}</p>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Last run: <span className="text-gray-600">{job.lastRunAt ? formatDate(job.lastRunAt) : "Never"}</span></p>
              <p className="text-xs text-gray-400">Next run: <span className="text-gray-600">{job.nextRunAt ? formatDate(job.nextRunAt) : "N/A"}</span></p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Config</p>
            <div className="space-y-1 text-xs">
              <p className="text-gray-400">Timeout: <span className="text-gray-600 font-mono">{job.timeout}ms</span></p>
              <p className="text-gray-400">Retries: <span className="text-gray-600 font-mono">{job.retryCount}</span></p>
              <p className="text-gray-400">Created: <span className="text-gray-600 font-mono">{formatDate(job.createdAt)}</span></p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
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
    </DashboardLayout>
  );
}
