"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { formatRelativeTime } from "@/lib/utils";

interface DashboardData {
  totalJobs: number;
  activeJobs: number;
  failedJobs: number;
  successfulExecutions: number;
  totalExecutions: number;
  successRate: number;
  recentExecutions: Array<{
    id: string;
    status: string;
    httpStatus: number | null;
    responseTime: number | null;
    startedAt: string;
    job: { name: string; url: string; method: string };
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor your cron jobs and execution history
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <StatCard
                title="Total Jobs"
                value={data.totalJobs}
                icon={
                  <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="bg-brand-50"
              />
              <StatCard
                title="Active Jobs"
                value={data.activeJobs}
                icon={
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="bg-emerald-50"
              />
              <StatCard
                title="Success Rate"
                value={`${data.successRate}%`}
                subtitle={`${data.successfulExecutions} / ${data.totalExecutions} executions`}
                icon={
                  <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                }
                color="bg-violet-50"
              />
              <StatCard
                title="Failed Jobs"
                value={data.failedJobs}
                icon={
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                }
                color="bg-red-50"
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Recent Executions</h2>
                <Link
                  href="/jobs"
                  className="text-sm text-brand-600 hover:text-brand-700 font-semibold"
                >
                  View all jobs &rarr;
                </Link>
              </div>
              {(!data.recentExecutions || data.recentExecutions.length === 0) ? (
                <EmptyState
                  title="No executions yet"
                  description="Create a cron job and run it to see execution history here"
                  actionLabel="Create your first job"
                  actionHref="/jobs/new"
                  icon={
                    <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth="0.75" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/80">
                        <th className="px-6 py-3">Job</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 hidden sm:table-cell">HTTP</th>
                        <th className="px-6 py-3 hidden sm:table-cell">Duration</th>
                        <th className="px-6 py-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(data.recentExecutions || []).map((exec, index) => (
                        <tr key={exec.id || String(index)} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {exec.job.name}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                                {exec.job.method} {exec.job.url.length > 40 ? exec.job.url.substring(0, 40) + "..." : exec.job.url}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={exec.status} size="sm" />
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">
                            {exec.httpStatus || "-"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 font-mono hidden sm:table-cell">
                            {exec.responseTime ? `${exec.responseTime}ms` : "-"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-400">
                            {formatRelativeTime(exec.startedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-gray-400">
            Failed to load dashboard data
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
