"use client";

import { useState, useEffect } from "react";

interface ServiceHealth {
  name: string;
  status: "ok" | "warning" | "error" | "not_configured";
  responseTimeMs?: number;
  message?: string;
  error?: string | null;
  lastChecked: string;
}

interface HealthData {
  timestamp: string;
  healthy: boolean;
  services: Record<string, ServiceHealth>;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/health", {
        headers: { Authorization: token },
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch system health");

      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const serviceIcons: Record<string, string> = {
    mongodb: "🗄️",
    cloudflare: "☁️",
    cloudflareWorker: "⚡",
    cloudflareD1: "💾",
    nextjsApi: "🚀",
  };

  const statusMeta: Record<string, { label: string; badge: string; border: string }> = {
    ok: { label: "Operational", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", border: "border-slate-200" },
    warning: { label: "Degraded", badge: "bg-amber-50 text-amber-700 border-amber-200", border: "border-amber-200" },
    error: { label: "Outage / Error", badge: "bg-red-50 text-red-700 border-red-200", border: "border-red-200" },
    not_configured: { label: "Not Configured", badge: "bg-slate-100 text-slate-600 border-slate-200", border: "border-slate-200" },
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Diagnostics</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">Live Services</span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            System Health Monitoring
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time latency and connectivity checks across core infrastructure
          </p>
        </div>

        <button
          onClick={fetchHealth}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-60 cursor-pointer"
        >
          <span className={refreshing ? "animate-spin" : ""}>🔄</span>
          {refreshing ? "Checking Services..." : "Refresh Health"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-500 font-medium">Running system diagnostics...</div>
        </div>
      ) : !health ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-xs">
          Failed to load health status. Please try again.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overall Health Banner */}
          <div
            className={`rounded-2xl border p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              health.healthy
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                : "bg-red-50/70 border-red-200 text-red-900"
            }`}
          >
            <div className="flex items-center gap-3.5">
              <span className="text-3xl">{health.healthy ? "✅" : "⚠️"}</span>
              <div>
                <h2 className="text-lg font-bold">
                  {health.healthy ? "All Active Systems Operational" : "System Degraded or Issues Detected"}
                </h2>
                <p className="text-xs opacity-80 mt-0.5">
                  Automated probe executed across database, Cloudflare APIs, and microservices
                </p>
              </div>
            </div>

            <div className="text-xs font-medium opacity-75">
              Checked at: {new Date(health.timestamp).toLocaleTimeString()}
            </div>
          </div>

          {/* Service Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(health.services).map(([key, service]) => {
              const meta = statusMeta[service.status] || statusMeta.ok;
              const icon = serviceIcons[key] || "🔧";

              return (
                <div
                  key={key}
                  className={`rounded-2xl border bg-white p-5 shadow-xs flex flex-col justify-between space-y-4 ${meta.border}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-xl shrink-0">
                        {icon}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{service.name || key}</h3>
                        <p className="text-[11px] text-slate-400 capitalize">{key}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                    <p className="font-medium text-slate-800">{service.message || "Status OK"}</p>
                    {service.error && (
                      <p className="text-red-600 font-mono text-[11px] break-all">{service.error}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span>
                      Latency:{" "}
                      <strong className="text-slate-700 font-semibold">
                        {service.responseTimeMs !== undefined ? `${service.responseTimeMs}ms` : "N/A"}
                      </strong>
                    </span>
                    <span>
                      {service.lastChecked ? new Date(service.lastChecked).toLocaleTimeString() : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Diagnostic Info Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs text-xs text-slate-600 space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">Diagnostic Criteria</h4>
            <ul className="space-y-1 text-slate-500">
              <li>• <strong>MongoDB:</strong> Validates persistent DB connection and executes a live admin ping command.</li>
              <li>• <strong>Cloudflare API:</strong> Executes a scoped GET account probe via HTTPS to verify authorization and response latency.</li>
              <li>• <strong>Cloudflare Worker:</strong> Checks the worker script metadata or calls the temp-mail service endpoint.</li>
              <li>• <strong>Cloudflare D1:</strong> Queries database metadata for the configured D1 database ID.</li>
              <li>• <strong>Next.js API:</strong> Validates internal server router runtime execution health.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

