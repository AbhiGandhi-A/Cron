"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import { ZapIcon } from "@/components/admin/AdminIcons";

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) return;

      const res = await fetch("/api/admin/auth", {
        headers: { Authorization: token },
      });

      if (res.ok) {
        router.push("/admin");
      } else {
        localStorage.removeItem("adminAuthToken");
      }
    } catch {
      localStorage.removeItem("adminAuthToken");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Invalid username or password");
      }

      const data = await res.json();
      localStorage.setItem("adminAuthToken", data.authToken);
      setSuccess(true);

      setTimeout(() => {
        router.push("/admin");
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold shadow-xs">
              <ZapIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Admin Portal
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              CronJob.io Infrastructure Management
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">
                Admin Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="Enter administrator username"
                required
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">
                Admin Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="Enter administrator password"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-xs disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? "Verifying..." : "Sign In to Admin Panel"}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs">
          Restricted access. All login attempts and IP addresses are audited.
        </p>
      </div>

      {error && (
        <Toast
          message={error}
          type="error"
          onClose={() => setError("")}
        />
      )}
      {success && (
        <Toast
          message="Authentication successful. Redirecting..."
          type="success"
          onClose={() => setSuccess(false)}
        />
      )}
    </div>
  );
}
