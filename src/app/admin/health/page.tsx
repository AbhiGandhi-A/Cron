"use client";

import { useState, useEffect } from "react";

interface ServiceHealth {
  status: "ok" | "error";
  responseTime?: number;
  statusCode?: number;
  error?: string;
}

interface HealthData {
  timestamp: string;
  services: Record<string, ServiceHealth>;
  healthy: boolean;
}

function ServiceStatus({ name, health }: { name: string; health: ServiceHealth }) {
  const isHealthy = health.status === "ok";
  const icons: Record<string, string> = {
    mongodb: "🗄️",
    cloudflareWorker: "☁️",
    nextjsApi: "⚡",
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-white font-medium capitalize">{name}</p>
          <div className="mt-2 text-sm">
            {isHealthy ? (
              <>
                <p className="text-green-400">✓ Healthy</p>
                {health.responseTime && (
                  <p className="text-slate-400 text-xs mt-1">
                    Response: {health.responseTime}ms
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-red-400">✗ Unhealthy</p>
                {health.error && (
                  <p className="text-slate-400 text-xs mt-1">{health.error}</p>
                )}
              </>
            )}
          </div>
        </div>
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
            isHealthy ? "bg-green-900" : "bg-red-900"
          }`}
        >
          {icons[name as keyof typeof icons] || "❓"}
        </div>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/health", {
        headers: { Authorization: token },
      });

      if (!res.ok) throw new Error("Failed to fetch health");

      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Health</h1>
          <p className="text-slate-400">Monitor system status and services</p>
        </div>
        <button
          onClick={fetchHealth}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-8">Loading health status...</div>
      ) : !health ? (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">
          Failed to load health status
        </div>
      ) : (
        <>
          {/* Overall Status */}
          <div
            className={`rounded-lg p-6 text-white border-2 ${
              health.healthy
                ? "bg-green-900 border-green-700"
                : "bg-red-900 border-red-700"
            }`}
          >
            <h2 className="text-2xl font-bold mb-2">
              {health.healthy ? "✓ All Systems Operational" : "✗ Issues Detected"}
            </h2>
            <p className="text-sm opacity-90">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          </div>

          {/* Services Status */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Service Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(health.services).map(([name, serviceHealth]) => (
                <ServiceStatus
                  key={name}
                  name={name}
                  health={serviceHealth}
                />
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-slate-300 text-sm">
            <p className="font-medium text-white mb-2">ℹ️ Health Check Information</p>
            <ul className="space-y-1 text-xs">
              <li>• MongoDB: Database connectivity and responsiveness</li>
              <li>• Cloudflare Worker: Temporary mail API worker status</li>
              <li>• Next.js API: Main application API health</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
