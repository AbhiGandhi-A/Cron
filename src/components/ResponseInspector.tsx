"use client";

import { useEffect, useState } from "react";

interface ResponseInspectorProps {
  open: boolean;
  onClose: () => void;
  result: {
    status: string;
    httpStatus: number | null;
    responseTime: number | null;
    errorMessage: string | null;
    responseBody: string | null;
    responseHeaders?: Record<string, string> | null;
    responseSize?: number;
    requestUrl?: string;
    requestMethod?: string;
    requestHeaders?: Record<string, string> | null;
    queryParams?: Record<string, string> | null;
    requestBody?: unknown;
    startedAt?: string;
    completedAt?: string;
  } | null;
}

type Tab = "response" | "request" | "headers";

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
  "api-key",
  "x-auth-token",
  "x-csrf-token",
  "secret",
  "token",
  "x-access-token",
  "x-api-token",
  "www-authenticate",
]);

const BODY_TRUNCATE_BYTES = 50_000;

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function getStatusColor(httpStatus: number | null): string {
  if (!httpStatus) return "bg-gray-100 text-gray-700";
  if (httpStatus < 300) return "bg-emerald-50 text-emerald-700";
  if (httpStatus < 500) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function shouldRedact(key: string): boolean {
  return REDACTED_HEADERS.has(key.toLowerCase());
}

function KeyValueTable({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 italic">No entries</p>;
  }
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {entries.map(([key, value]) => (
            <tr key={key} className="hover:bg-gray-50/50">
              <td className="px-3 py-2 font-mono text-xs font-medium text-gray-600 bg-gray-50/80 whitespace-nowrap w-[200px]">
                {key}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-gray-800 break-all">
                {shouldRedact(key) ? (
                  <span className="text-amber-600">***</span>
                ) : (
                  value
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResponseBodyView({ body }: { body: string }) {
  const [showAll, setShowAll] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const truncated = body.length > BODY_TRUNCATE_BYTES;
  const displayBody = truncated && !showAll ? body.substring(0, BODY_TRUNCATE_BYTES) : body;
  const json = !rawMode && isJson(body);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {isJson(body) && (
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setRawMode(false)}
              className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (!rawMode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              Pretty
            </button>
            <button
              onClick={() => setRawMode(true)}
              className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (rawMode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              Raw
            </button>
          </div>
        )}
        <span className="text-xs text-gray-400">{formatBytes(body.length)}</span>
      </div>
      <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto">
        {json ? JSON.stringify(JSON.parse(displayBody), null, 2) : displayBody}
      </pre>
      {truncated && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          Show all ({formatBytes(body.length)})
        </button>
      )}
    </div>
  );
}

export default function ResponseInspector({ open, onClose, result }: ResponseInspectorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("response");

  useEffect(() => {
    setActiveTab("response");
  }, [result]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !result) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "response", label: "Response" },
    { id: "request", label: "Request" },
    { id: "headers", label: "Headers" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Execution Result</h2>
            <span className={"inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full " + getStatusColor(result.httpStatus)}>
              {result.httpStatus || result.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-6 px-6 pt-3 border-b border-gray-100">
          {result.responseTime !== null && (
            <div className="text-sm">
              <span className="text-gray-400">Time</span>{" "}
              <span className="font-medium text-gray-700">{result.responseTime}ms</span>
            </div>
          )}
          {result.responseSize !== undefined && result.responseSize !== null && (
            <div className="text-sm">
              <span className="text-gray-400">Size</span>{" "}
              <span className="font-medium text-gray-700">{formatBytes(result.responseSize)}</span>
            </div>
          )}
          {result.errorMessage && (
            <div className="text-sm">
              <span className="text-red-500 font-medium">{result.errorMessage}</span>
            </div>
          )}
        </div>

        <div className="flex border-b border-gray-100 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={"px-4 py-3 text-sm font-medium transition-colors relative " + (activeTab === tab.id ? "text-brand-600" : "text-gray-500 hover:text-gray-700")}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "response" && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Status</p>
                  <p className="text-sm font-semibold text-gray-900">{result.httpStatus ?? "N/A"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Time</p>
                  <p className="text-sm font-semibold text-gray-900">{result.responseTime !== null ? result.responseTime + "ms" : "N/A"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Size</p>
                  <p className="text-sm font-semibold text-gray-900">{result.responseSize != null ? formatBytes(result.responseSize) : "N/A"}</p>
                </div>
              </div>
              {result.responseBody ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Body</h3>
                  <ResponseBodyView body={result.responseBody} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No response body</p>
              )}
            </div>
          )}

          {activeTab === "request" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Method</p>
                  <p className="text-sm font-semibold text-gray-900 font-mono">{result.requestMethod ?? "N/A"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">URL</p>
                  <p className="text-sm font-medium text-gray-900 font-mono break-all">{result.requestUrl ?? "N/A"}</p>
                </div>
              </div>
              {result.queryParams && Object.keys(result.queryParams).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Query Parameters</h3>
                  <KeyValueTable data={result.queryParams} />
                </div>
              )}
              {result.requestHeaders && Object.keys(result.requestHeaders).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Request Headers</h3>
                  <KeyValueTable data={result.requestHeaders} />
                </div>
              )}
              {result.requestBody != null && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Request Body</h3>
                  <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                    {typeof result.requestBody === "string"
                      ? isJson(result.requestBody)
                        ? JSON.stringify(JSON.parse(result.requestBody), null, 2)
                        : result.requestBody
                      : JSON.stringify(result.requestBody, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === "headers" && (
            <div>
              {result.responseHeaders && Object.keys(result.responseHeaders).length > 0 ? (
                <KeyValueTable data={result.responseHeaders} />
              ) : (
                <p className="text-sm text-gray-400 italic">No response headers</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
