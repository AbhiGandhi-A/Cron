"use client";

import { useState, useEffect } from "react";

interface Settings {
  settings: {
    tempMailEnabled: boolean;
    usageProtectionEnabled: boolean;
    safetyPercent: number;
    warningPercent: number;
    blockPercent: number;
    dashboardRefreshInterval: number;
  };
  environment: string;
  version: string;
}

interface SettingItemProps {
  label: string;
  value: string | number | boolean;
  description?: string;
  icon?: string;
}

function SettingItem({ label, value, description, icon }: SettingItemProps) {
  let displayValue = "";
  let displayClass = "text-slate-300";

  if (typeof value === "boolean") {
    displayValue = value ? "✓ Enabled" : "✗ Disabled";
    displayClass = value ? "text-green-400" : "text-red-400";
  } else if (typeof value === "number") {
    if (label.includes("Interval")) {
      displayValue = `${(value / 1000).toFixed(0)}s`;
    } else if (label.includes("Percent")) {
      displayValue = `${value}%`;
    } else {
      displayValue = value.toString();
    }
  } else {
    displayValue = value;
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-white font-medium">{label}</p>
          {description && (
            <p className="text-slate-400 text-sm mt-1">{description}</p>
          )}
          <p className={`text-lg font-semibold mt-2 ${displayClass}`}>
            {displayValue}
          </p>
        </div>
        {icon && <span className="text-3xl ml-4">{icon}</span>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: token },
      });

      if (!res.ok) throw new Error("Failed to fetch settings");

      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-slate-400">System configuration and preferences</p>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-8">Loading settings...</div>
      ) : !settings ? (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">
          Failed to load settings
        </div>
      ) : (
        <>
          {/* Feature Flags */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Feature Flags</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SettingItem
                label="Temporary Email"
                value={settings.settings.tempMailEnabled}
                description="Enable/disable temporary email feature"
                icon="📧"
              />
              <SettingItem
                label="Usage Protection"
                value={settings.settings.usageProtectionEnabled}
                description="Protect from resource overuse"
                icon="🛡️"
              />
            </div>
          </div>

          {/* Resource Limits */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Resource Limits</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SettingItem
                label="Safety Threshold"
                value={settings.settings.safetyPercent}
                description="Resource usage safety limit"
                icon="🟢"
              />
              <SettingItem
                label="Warning Threshold"
                value={settings.settings.warningPercent}
                description="Alert admin when exceeded"
                icon="🟡"
              />
              <SettingItem
                label="Block Threshold"
                value={settings.settings.blockPercent}
                description="Block service when exceeded"
                icon="🔴"
              />
            </div>
          </div>

          {/* System Information */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">System Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SettingItem
                label="Environment"
                value={settings.environment}
                description="Deployment environment"
                icon="🌍"
              />
              <SettingItem
                label="Version"
                value={settings.version}
                description="Application version"
                icon="📦"
              />
              <SettingItem
                label="Refresh Interval"
                value={settings.settings.dashboardRefreshInterval}
                description="Dashboard auto-refresh timing"
                icon="🔄"
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-slate-300 text-sm">
            <p className="font-medium text-white mb-2">ℹ️ Configuration Notes</p>
            <ul className="space-y-1 text-xs">
              <li>
                • Settings are read-only in the admin dashboard and controlled by
                environment variables
              </li>
              <li>
                • To modify thresholds, update your .env configuration and redeploy
              </li>
              <li>
                • Safety/Warning/Block values should increase: Safety {'<'} Warning
                {'<'} Block
              </li>
              <li>
                • For Vercel deployments, update settings via project environment
                variables
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
