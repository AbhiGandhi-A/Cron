"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  DEFAULT_AI_SETTINGS,
  getAiSettings,
  saveAiSettings,
  type AiMonitoringSettings,
} from "@/lib/monitoring/settings";

interface AiStatus {
  configured: boolean;
  model: string | null;
  reasoningModel?: string | null;
  researchModel?: string | null;
  analysisEnabled: boolean;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [monthlyRemaining, setMonthlyRemaining] = useState<number | null>(null);
  const [maxExecutions, setMaxExecutions] = useState<number | null>(null);
  const [maxJobs, setMaxJobs] = useState<number | null>(null);
  const [aiSettings, setAiSettings] = useState<AiMonitoringSettings>({ ...DEFAULT_AI_SETTINGS });
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((data) => {
        setMonthlyRemaining(data.monthlyRemaining ?? null);
        setMaxExecutions(data.maxExecutions ?? null);
        setMaxJobs(data.maxJobs ?? null);
      })
      .catch(() => {})
      ;
    setAiSettings(getAiSettings());
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then(setAiStatus)
      .catch(() => setAiStatus(null));
  }, []);

  const updateAiSetting = (patch: Partial<AiMonitoringSettings>) => {
    const next = { ...aiSettings, ...patch };
    setAiSettings(next);
    saveAiSettings(next);
  };

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
                <span className="text-sm font-bold text-gray-900">
                  {maxJobs !== null ? maxJobs.toLocaleString() : "—"}
                </span>
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
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">AI Dev Assistant</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Reasoning: {aiStatus?.reasoningModel ?? aiStatus?.model ?? (aiStatus === null ? "checking..." : "not configured")}
                  {" · "}Research: {aiStatus?.researchModel ?? (aiStatus === null ? "checking..." : "not configured")}{" "}
                  {aiStatus?.configured ? (
                    <span className="text-emerald-600 font-semibold">· Configured</span>
                  ) : aiStatus ? (
                    <span className="text-amber-600 font-semibold">· Add GROQ_API_KEY to enable</span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <ToggleRow
                title="Enabled"
                description="Capture frontend errors and API failures for the assistant"
                checked={aiSettings.enabled}
                onChange={(value) => updateAiSetting({ enabled: value })}
              />
              <ToggleRow
                title="Auto-analyze errors"
                description="Send captured errors to Groq for root-cause and fix suggestions"
                checked={aiSettings.autoAnalyze}
                onChange={(value) => updateAiSetting({ autoAnalyze: value })}
              />
              <ToggleRow
                title="Auto-open on critical errors"
                description="Open the assistant automatically when a critical error is captured"
                checked={aiSettings.autoOpenCritical}
                onChange={(value) => updateAiSetting({ autoOpenCritical: value })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-gray-100">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Normal threshold (ms)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    value={aiSettings.normalMs}
                    onChange={(event) => updateAiSetting({ normalMs: Number(event.target.value) || DEFAULT_AI_SETTINGS.normalMs })}
                    className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Requests slower than this are flagged as slow when enabled.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Warning threshold (ms)
                  </label>
                  <input
                    type="number"
                    min={500}
                    max={120000}
                    value={aiSettings.warningMs}
                    onChange={(event) => updateAiSetting({ warningMs: Number(event.target.value) || DEFAULT_AI_SETTINGS.warningMs })}
                    className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Requests slower than this are flagged as warnings.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ToggleRow(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100">
      <div>
        <p className="text-sm font-semibold text-gray-900">{props.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{props.description}</p>
      </div>
      <button
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 flex items-center ${
          props.checked ? "bg-brand-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            props.checked ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
