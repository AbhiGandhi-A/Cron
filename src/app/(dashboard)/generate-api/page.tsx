"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { formatRelativeTime } from "@/lib/utils";

interface GeneratedApiView {
  id: string;
  name: string;
  description: string;
  agentId: string;
  publicUrl: string;
  source: {
    type: string;
    collection?: string | null;
    fields?: string[];
    url?: string | null;
    method?: string | null;
    timeout?: number;
  };
  methods: string[];
  auth: { mode: string; secretPrefix: string | null };
  cors: { enabled: boolean; origins: string[] };
  rateLimit: { limit: number; windowMs: number };
  response: { statusCode: number; maxSizeBytes: number; contentType: string };
  isActive: boolean;
  analytics: { totalRequests: number; totalBytes: number; blockedRequests: number };
  createdAt: string;
  updatedAt: string;
}

function authLabel(mode: string): string {
  switch (mode) {
    case "api-key":
      return "x-api-key header";
    case "bearer":
      return "Bearer token";
    case "private":
      return "Session-cookie (private to you)";
    default:
      return "Public open";
  }
}

export default function GenerateApiPage() {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GeneratedApiView | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [apis, setApis] = useState<GeneratedApiView[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadApis = () => {
    fetch("/api/generated-apis")
      .then((res) => res.json())
      .then((data) => setApis(data.apis ?? []))
      .catch(() => setApis([]));
  };

  useEffect(loadApis, []);

  async function handleGenerate() {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setCreated(null);
    setCreatedSecret(null);
    try {
      const res = await fetch("/api/ai/create-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate API. Please try again.");
        return;
      }
      setCreated(data.api);
      setCreatedSecret(data.createdSecret ?? null);
      setDescription("");
      loadApis();
    } catch {
      setError("Failed to reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(api: GeneratedApiView) {
    await fetch(`/api/generated-apis/${api.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !api.isActive }),
    });
    loadApis();
  }

  async function handleRegenerate(api: GeneratedApiView) {
    const res = await fetch(`/api/generated-apis/${api.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: true }),
    });
    const data = await res.json();
    if (data.createdSecret) setCreatedSecret(data.createdSecret);
    loadApis();
  }

  async function handleDelete(api: GeneratedApiView) {
    if (!window.confirm(`Delete API "${api.name}"? This cannot be undone.`)) return;
    await fetch(`/api/generated-apis/${api.id}`, { method: "DELETE" });
    setApis((current) => current.filter((item) => item.id !== api.id));
  }

  function copyText(text: string, id: string | null = null) {
    navigator.clipboard?.writeText(text).catch(() => {});
    if (id) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Generate API</h1>
          <p className="text-sm text-gray-500 mt-1">
            Describe what you want in plain English and the AI will create a live endpoint for you
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Describe your API
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder='e.g. "An endpoint that returns the latest flights for job #123 from our flights collection, with rate limiting to 60 requests per minute."'
            rows={4}
            className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-gray-400">The AI chooses the source, methods, auth, CORS and rate limits automatically.</p>
            <button
              onClick={() => void handleGenerate()}
              disabled={submitting || !description.trim()}
              className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Generating..." : "Generate API"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>

        {created && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-bold text-gray-900">API created &mdash; {created.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{created.description}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyText(created.publicUrl, created.id)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100">
                  {copiedId === created.id ? "Copied" : "Copy URL"}
                </button>
              </div>
            </div>
            <p className="text-sm font-mono text-gray-800 mt-3 break-all">{created.publicUrl}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
              <div>
                <p className="text-gray-400 font-medium">Methods</p>
                <p className="text-gray-800 font-mono mt-0.5">{created.methods.join(", ")}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Auth</p>
                <p className="text-gray-800 mt-0.5">{authLabel(created.auth.mode)}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Rate limit</p>
                <p className="text-gray-800 mt-0.5">
                  {created.rateLimit.limit} / {Math.round(created.rateLimit.windowMs / 1000)}s
                </p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Status</p>
                <p className="text-gray-800 mt-0.5">{created.isActive ? "Active" : "Paused"}</p>
              </div>
            </div>
            {createdSecret ? (
              <div className="mt-4 bg-white border border-emerald-200 rounded-xl p-4">
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Your API secret &mdash; copy it now</p>
                <p className="text-xs text-gray-500 mt-1 mb-2">It will not be shown again. Anyone with it can call this API.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-gray-50 rounded-lg px-3 py-2 break-all">{createdSecret}</code>
                  <button onClick={() => copyText(createdSecret, `${created.id}-secret`)} className="text-[11px] font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800">
                    {copiedId === `${created.id}-secret` ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Your Generated APIs</h2>
            <button onClick={loadApis} className="text-sm text-brand-600 hover:text-brand-700 font-semibold">
              Refresh
            </button>
          </div>
          {apis.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-semibold text-gray-700">No generated APIs yet</p>
              <p className="text-xs text-gray-400 mt-1">Describe an API above and it will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {apis.map((api) => (
                <li key={api.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{api.name}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${api.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {api.isActive ? "Active" : "Paused"}
                        </span>
                        {api.auth.mode !== "public" && (
                          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                            {authLabel(api.auth.mode)}
                          </span>
                        )}
                      </div>
                      {api.description ? <p className="text-xs text-gray-500 mt-1">{api.description}</p> : null}
                      <p className="text-xs font-mono text-gray-400 mt-2 break-all">{api.publicUrl}</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Source: {api.source.type} · Methods: {api.methods.join(", ")} · Rate limit: {api.rateLimit.limit} / {Math.round(api.rateLimit.windowMs / 1000)}s · {api.analytics?.totalRequests ?? 0} requests · Updated {formatRelativeTime(api.updatedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => copyText(api.publicUrl, api.id)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-left">
                        {copiedId === api.id ? "Copied URL" : "Copy URL"}
                      </button>
                      <button onClick={() => void handleToggle(api)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-left">
                        {api.isActive ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => void handleRegenerate(api)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-left">
                        Regenerate secret
                      </button>
                      <button onClick={() => void handleDelete(api)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-left">
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}