"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import DashboardLayout from "@/components/DashboardLayout";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [monthlyRemaining, setMonthlyRemaining] = useState<number | null>(null);
  const [maxExecutions, setMaxExecutions] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((data) => {
        setMonthlyRemaining(data.monthlyRemaining ?? null);
        setMaxExecutions(data.maxExecutions ?? null);
      })
      .catch(() => {})
      ;
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account and preferences</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-5">Account</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                <div className="w-12 h-12 bg-brand-600 rounded-full flex items-center justify-center text-lg font-bold text-white">
                  {session?.user?.name?.charAt(0)?.toUpperCase() || session?.user?.email?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{session?.user?.name || "User"}</p>
                  <p className="text-xs text-gray-500">{session?.user?.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Name</label>
                  <p className="text-sm font-medium text-gray-900">{session?.user?.name || "Not set"}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</label>
                  <p className="text-sm font-medium text-gray-900">{session?.user?.email}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-5">Plan & Usage</h2>
            <div className="space-y-1">
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Current Plan</p>
                  <p className="text-xs text-gray-400 mt-0.5">Free tier with basic features</p>
                </div>
                <span className="px-3 py-1 bg-brand-50 text-brand-700 text-xs font-bold rounded-full">Free</span>
              </div>
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Max Jobs</p>
                  <p className="text-xs text-gray-400 mt-0.5">Maximum number of cron jobs</p>
                </div>
                <span className="text-sm font-bold text-gray-900">10</span>
              </div>
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Monthly Executions</p>
                  <p className="text-xs text-gray-400 mt-0.5">Maximum executions per month</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{monthlyRemaining !== null && maxExecutions !== null ? `${monthlyRemaining.toLocaleString()} / ${maxExecutions.toLocaleString()} remaining` : (maxExecutions !== null ? `${maxExecutions.toLocaleString()}` : "—")}</span>
              </div>
            </div>
            <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700 font-medium">
                Payment integration coming soon. Upgrade your plan for more jobs and higher execution limits.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-5">Scheduler</h2>
            <p className="text-sm text-gray-500 mb-4">
              The scheduler runs as a separate Node.js process. It polls the MongoDB database for due jobs
              and executes them. Restart the scheduler at any time - it will recover automatically from
              the database state.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-2 h-2 bg-gray-300 rounded-full" />
              Run command:{" "}
              <code className="font-mono bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg text-xs font-medium">
                npm run scheduler
              </code>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
