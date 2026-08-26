"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatRelativeTime } from "@/lib/utils";

interface Job {
  _id: string;
  name: string;
  url: string;
  method: string;
  schedule: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  executions: Array<{
    status: string;
    httpStatus: number | null;
    startedAt: string;
  }>;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      showToast("Failed to load jobs", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/jobs/" + deleteId, { method: "DELETE" });
      if (res.ok) {
        showToast("Job deleted successfully", "success");
        setJobs((prev) => prev.filter((j) => j._id !== deleteId));
      } else {
        showToast("Failed to delete job", "error");
      }
    } catch {
      showToast("Failed to delete job", "error");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  async function handleToggle(id: string) {
    setTogglingId(id);
    try {
      const res = await fetch("/api/jobs/" + id + "/toggle", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, "success");
        setJobs((prev) =>
          prev.map((j) => (j._id === id ? { ...j, isActive: !j.isActive } : j))
        );
      } else {
        showToast(data.error || "Failed to toggle", "error");
      }
    } catch {
      showToast("Failed to toggle job", "error");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTrigger(id: string) {
    setTriggeringId(id);
    try {
      const res = await fetch("/api/jobs/" + id + "/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          "Executed: " + (data.execution.httpStatus || data.execution.status),
          data.execution.status === "SUCCESS" ? "success" : "error"
        );
        fetchJobs();
      } else {
        showToast(data.error || "Trigger failed", "error");
      }
    } catch {
      showToast("Trigger failed", "error");
    } finally {
      setTriggeringId(null);
    }
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

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Cron Jobs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage and monitor your scheduled jobs
            </p>
          </div>
          <Link
            href="/jobs/new"
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Job
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <EmptyState
              title="No cron jobs yet"
              description="Create your first cron job to start monitoring APIs and endpoints"
              actionLabel="Create your first job"
              actionHref="/jobs/new"
              icon={
                <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth="0.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <th className="px-6 py-3">Job</th>
                    <th className="px-6 py-3 hidden md:table-cell">Schedule</th>
                    <th className="px-6 py-3">Enabled</th>
                    <th className="px-6 py-3 hidden lg:table-cell">Last Run</th>
                    <th className="px-6 py-3 hidden lg:table-cell">Next Run</th>
                    <th className="px-6 py-3 hidden sm:table-cell">Result</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {jobs.map((job) => (
                    <tr key={job._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link href={"/jobs/" + job._id} className="block">
                          <p className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors">
                            {job.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[280px]">
                            {job.method} {job.url}
                          </p>
                        </Link>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded-md">
                          {getScheduleLabel(job.schedule)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggle(job._id)}
                          disabled={togglingId === job._id}
                          className={"relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 " + (job.isActive ? "bg-brand-600" : "bg-gray-300")}
                          title={job.isActive ? "Click to disable" : "Click to enable"}
                          role="switch"
                          aria-checked={job.isActive}
                        >
                          <span
                            className={"pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out " + (job.isActive ? "translate-x-5" : "translate-x-0")}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 hidden lg:table-cell">
                        {job.lastRunAt ? formatRelativeTime(job.lastRunAt) : "Never"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 hidden lg:table-cell">
                        {job.nextRunAt ? formatRelativeTime(job.nextRunAt) : "-"}
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        {job.executions && job.executions.length > 0 ? (
                          <StatusBadge status={job.executions[0].status} size="sm" />
                        ) : (
                          <span className="text-xs text-gray-300">No runs</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleTrigger(job._id)}
                            disabled={triggeringId === job._id || job.isRunning}
                            className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-30 transition-colors"
                            title="Run now"
                          >
                            {triggeringId === job._id ? (
                              <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                              </svg>
                            )}
                          </button>
                          <Link
                            href={"/jobs/" + job._id + "/logs"}
                            className="p-2 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
                            title="View logs"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </Link>
                          <Link
                            href={"/jobs/" + job._id + "/edit"}
                            className="p-2 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </Link>
                          <button
                            onClick={() => setDeleteId(job._id)}
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
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Cron Job"
        message="This will permanently delete this job and all its execution history. This action cannot be undone."
        confirmLabel="Delete Job"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </DashboardLayout>
  );
}
