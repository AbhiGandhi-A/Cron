"use client";

import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/components/Toast";

type BodyType = "none" | "json" | "form" | "text";
type Tab = "response" | "responseHeaders" | "request" | "requestHeaders";

interface TestResult {
  status: string;
  httpStatus: number | null;
  responseTime: number;
  errorMessage: string | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  responseSize: number;
  requestUrl: string;
  fullRequestUrl?: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  sentBody: unknown;
}

interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  httpStatus: number | null;
  responseTime: number;
  timestamp: string;
  result: TestResult;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const INPUT_CLS =
  "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";
const SMALL_INPUT_CLS =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-gray-50 focus:bg-white";
const SECTION_CLS =
  "bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5";
const SECTION_TITLE = "text-base font-bold text-gray-900";
const LABEL_CLS = "block text-sm font-semibold text-gray-700 mb-1.5";

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

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-100 text-emerald-700";
    case "POST":
      return "bg-blue-100 text-blue-700";
    case "PUT":
      return "bg-amber-100 text-amber-700";
    case "PATCH":
      return "bg-yellow-100 text-yellow-700";
    case "DELETE":
      return "bg-red-100 text-red-700";
    case "HEAD":
      return "bg-gray-100 text-gray-600";
    case "OPTIONS":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getStatusColor(httpStatus: number | null): string {
  if (!httpStatus) return "bg-gray-100 text-gray-700";
  if (httpStatus < 300) return "bg-emerald-50 text-emerald-700";
  if (httpStatus < 500) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function getStatusText(status: number | null): string {
  if (!status) return "";
  const texts: Record<number, string> = {
    100: "Continue",
    101: "Switching Protocols",
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    206: "Partial Content",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return texts[status] || "";
}

function buildPairs(pairs: { key: string; value: string }[]): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const p of pairs) {
    if (p.key.trim()) result[p.key.trim()] = p.value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function KeyValueTable({
  data,
  redactSensitive = false,
}: {
  data: Record<string, string>;
  redactSensitive?: boolean;
}) {
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
                {redactSensitive && REDACTED_HEADERS.has(key.toLowerCase()) ? (
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

function ResponseBodyView({ body, showToast }: { body: string; showToast: (msg: string, type: "success" | "error") => void }) {
  const [showAll, setShowAll] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const truncated = body.length > 50_000;
  const displayBody = truncated && !showAll ? body.substring(0, 50_000) : body;
  const json = !rawMode && isJson(body);

  function copyBody() {
    navigator.clipboard
      .writeText(displayBody)
      .then(() => showToast("Response copied", "success"))
      .catch(() => showToast("Failed to copy", "error"));
  }

  function copyJson() {
    if (!isJson(body)) return;
    const formatted = JSON.stringify(JSON.parse(body), null, 2);
    navigator.clipboard
      .writeText(formatted)
      .then(() => showToast("JSON copied", "success"))
      .catch(() => showToast("Failed to copy", "error"));
  }

  function downloadJson() {
    if (!isJson(body)) return;
    const formatted = JSON.stringify(JSON.parse(body), null, 2);
    const blob = new Blob([formatted], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `response-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {isJson(body) && (
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setRawMode(false)}
              className={
                "px-3 py-1 text-xs font-medium rounded-md transition-colors " +
                (!rawMode
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700")
              }
            >
              Pretty
            </button>
            <button
              onClick={() => setRawMode(true)}
              className={
                "px-3 py-1 text-xs font-medium rounded-md transition-colors " +
                (rawMode
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700")
              }
            >
              Raw
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={copyBody}
            className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Copy
          </button>
          {isJson(body) && (
            <>
              <button
                onClick={copyJson}
                className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Copy JSON
              </button>
              <button
                onClick={downloadJson}
                className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </>
          )}
        </div>
      </div>
      <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap break-all max-h-[500px] overflow-y-auto">
        {json
          ? JSON.stringify(JSON.parse(displayBody), null, 2)
          : displayBody}
      </pre>
      {truncated && !showAll && (
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => setShowAll(true)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            Show all ({formatBytes(body.length)})
          </button>
          <span className="text-xs text-amber-500">
            Response truncated because it exceeds the maximum allowed size.
          </span>
        </div>
      )}
    </div>
  );
}

export default function ApiTesterPage() {
  const { showToast } = useToast();
  const [method, setMethod] = useState<string>("GET");
  const [url, setUrl] = useState("https://");
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [queryParams, setQueryParams] = useState<{ key: string; value: string }[]>([]);
  const [bodyType, setBodyType] = useState<BodyType>("none");
  const [jsonBody, setJsonBody] = useState("");
  const [formBody, setFormBody] = useState<{ key: string; value: string }[]>([]);
  const [rawBody, setRawBody] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("response");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [showHeaders, setShowHeaders] = useState(false);
  const [showQueryParams, setShowQueryParams] = useState(false);

  const hasBody = ["POST", "PUT", "PATCH"].includes(method);
  const bodyTypes: { value: BodyType; label: string }[] = [
    { value: "none", label: "No Body" },
    { value: "json", label: "JSON" },
    { value: "form", label: "Form Data" },
    { value: "text", label: "Raw Text" },
  ];

  function addPair(type: "headers" | "queryParams" | "formBody") {
    if (type === "headers") setHeaders((p) => [...p, { key: "", value: "" }]);
    else if (type === "queryParams") setQueryParams((p) => [...p, { key: "", value: "" }]);
    else setFormBody((p) => [...p, { key: "", value: "" }]);
  }

  function removePair(type: "headers" | "queryParams" | "formBody", index: number) {
    if (type === "headers") setHeaders((p) => p.filter((_, i) => i !== index));
    else if (type === "queryParams") setQueryParams((p) => p.filter((_, i) => i !== index));
    else setFormBody((p) => p.filter((_, i) => i !== index));
  }

  function updatePair(
    type: "headers" | "queryParams" | "formBody",
    index: number,
    field: "key" | "value",
    value: string
  ) {
    const setter =
      type === "headers" ? setHeaders : type === "queryParams" ? setQueryParams : setFormBody;
    setter((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  const handleSend = useCallback(async () => {
    if (!url.trim() || url === "https://") {
      showToast("Please enter a URL", "error");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const requestHeaders = buildPairs(headers);
      const requestQueryParams = buildPairs(queryParams);

      let bodyContent: unknown = null;
      if (hasBody && bodyType !== "none") {
        if (bodyType === "json") {
          if (jsonBody.trim()) {
            try {
              JSON.parse(jsonBody);
            } catch {
              showToast("Invalid JSON body", "error");
              setLoading(false);
              return;
            }
            bodyContent = jsonBody;
          }
        } else if (bodyType === "form") {
          bodyContent = buildPairs(formBody);
        } else if (bodyType === "text") {
          bodyContent = rawBody;
        }
      }

      const res = await fetch("/api/api-tester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url,
          headers: requestHeaders,
          queryParams: requestQueryParams,
          bodyType: hasBody ? bodyType : "none",
          body: bodyContent,
        }),
      });

      const data: TestResult = await res.json();
      setResult(data);
      setActiveTab("response");

      setHistory((prev) => {
        const entry: HistoryEntry = {
          id: Date.now().toString(),
          method: data.requestMethod,
          url: url,
          httpStatus: data.httpStatus,
          responseTime: data.responseTime,
          timestamp: new Date().toISOString(),
          result: data,
        };
        return [entry, ...prev].slice(0, 20);
      });
    } catch {
      showToast("Failed to send request", "error");
    } finally {
      setLoading(false);
    }
  }, [url, method, headers, queryParams, hasBody, bodyType, jsonBody, formBody, rawBody, showToast]);

  function loadFromHistory(entry: HistoryEntry) {
    setMethod(entry.method);
    setUrl(entry.url);
    setResult(entry.result);
    setActiveTab("response");
    setShowHistory(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto" onKeyDown={handleKeyDown}>
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            API Tester
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Send HTTP requests and inspect responses
          </p>
        </div>

        <div className={SECTION_CLS}>
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-3">
            <div>
              <label className={LABEL_CLS}>Method</label>
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  if (!["POST", "PUT", "PATCH"].includes(e.target.value)) {
                    setBodyType("none");
                  }
                }}
                className={INPUT_CLS}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={INPUT_CLS + " font-mono"}
                placeholder="https://api.example.com/endpoint"
                autoFocus
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSend}
              disabled={loading || !url.trim() || url === "https://"}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </svg>
                  Send Request
                </>
              )}
            </button>
            <span className="text-xs text-gray-400">
              Ctrl+Enter to send
            </span>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="ml-auto text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1.5"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                History ({history.length})
              </button>
            )}
          </div>
        </div>

        {showHistory && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Recent Requests</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => loadFromHistory(entry)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <span
                    className={
                      "inline-flex items-center font-bold rounded-md px-2 py-0.5 text-[10px] shrink-0 " +
                      getMethodColor(entry.method)
                    }
                  >
                    {entry.method}
                  </span>
                  <span className="text-xs text-gray-600 font-mono truncate flex-1">
                    {entry.url}
                  </span>
                  {entry.httpStatus && (
                    <span
                      className={
                        "inline-flex items-center font-semibold rounded-full px-2 py-0.5 text-[11px] shrink-0 " +
                        getStatusColor(entry.httpStatus)
                      }
                    >
                      {entry.httpStatus}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {entry.responseTime}ms
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={SECTION_CLS}>
          <button
            type="button"
            onClick={() => setShowQueryParams(!showQueryParams)}
            className="flex items-center justify-between w-full"
          >
            <h2 className={SECTION_TITLE}>Query Parameters</h2>
            <svg
              className={
                "w-5 h-5 text-gray-400 transition-transform " +
                (showQueryParams ? "rotate-180" : "")
              }
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showQueryParams && (
            <div className="space-y-3">
              {queryParams.map((pair, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center"
                >
                  <input
                    type="text"
                    value={pair.key}
                    onChange={(e) =>
                      updatePair("queryParams", i, "key", e.target.value)
                    }
                    className={SMALL_INPUT_CLS}
                    placeholder="Key"
                  />
                  <input
                    type="text"
                    value={pair.value}
                    onChange={(e) =>
                      updatePair("queryParams", i, "value", e.target.value)
                    }
                    className={SMALL_INPUT_CLS}
                    placeholder="Value"
                  />
                  <button
                    type="button"
                    onClick={() => removePair("queryParams", i)}
                    className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addPair("queryParams")}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                + Add Parameter
              </button>
            </div>
          )}
        </div>

        <div className={SECTION_CLS}>
          <button
            type="button"
            onClick={() => setShowHeaders(!showHeaders)}
            className="flex items-center justify-between w-full"
          >
            <h2 className={SECTION_TITLE}>Headers</h2>
            <svg
              className={
                "w-5 h-5 text-gray-400 transition-transform " +
                (showHeaders ? "rotate-180" : "")
              }
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showHeaders && (
            <div className="space-y-3">
              {headers.map((pair, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center"
                >
                  <input
                    type="text"
                    value={pair.key}
                    onChange={(e) =>
                      updatePair("headers", i, "key", e.target.value)
                    }
                    className={SMALL_INPUT_CLS}
                    placeholder="Content-Type, Authorization, X-API-Key..."
                  />
                  <input
                    type="text"
                    value={pair.value}
                    onChange={(e) =>
                      updatePair("headers", i, "value", e.target.value)
                    }
                    className={SMALL_INPUT_CLS}
                    placeholder="Value"
                  />
                  <button
                    type="button"
                    onClick={() => removePair("headers", i)}
                    className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addPair("headers")}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                + Add Header
              </button>
            </div>
          )}
        </div>

        {hasBody && (
          <div className={SECTION_CLS}>
            <h2 className={SECTION_TITLE}>Request Body</h2>
            <div className="flex flex-wrap gap-2">
              {bodyTypes.map((bt) => (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => setBodyType(bt.value)}
                  className={
                    "px-4 py-2 border rounded-lg text-sm font-medium transition-all " +
                    (bodyType === bt.value
                      ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300")
                  }
                >
                  {bt.label}
                </button>
              ))}
            </div>
            {bodyType === "json" && (
              <div>
                <label className={LABEL_CLS}>JSON Body</label>
                <textarea
                  value={jsonBody}
                  onChange={(e) => setJsonBody(e.target.value)}
                  className={INPUT_CLS + " font-mono text-xs"}
                  rows={8}
                  placeholder={'{"key": "value"}'}
                />
              </div>
            )}
            {bodyType === "form" && (
              <div className="space-y-3">
                {formBody.map((pair, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) =>
                        updatePair("formBody", i, "key", e.target.value)
                      }
                      className={SMALL_INPUT_CLS}
                      placeholder="Field name"
                    />
                    <input
                      type="text"
                      value={pair.value}
                      onChange={(e) =>
                        updatePair("formBody", i, "value", e.target.value)
                      }
                      className={SMALL_INPUT_CLS}
                      placeholder="Value"
                    />
                    <button
                      type="button"
                      onClick={() => removePair("formBody", i)}
                      className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addPair("formBody")}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  + Add Field
                </button>
              </div>
            )}
            {bodyType === "text" && (
              <div>
                <label className={LABEL_CLS}>Raw Body</label>
                <textarea
                  value={rawBody}
                  onChange={(e) => setRawBody(e.target.value)}
                  className={INPUT_CLS + " font-mono text-xs"}
                  rows={8}
                  placeholder="Plain text body content"
                />
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Response</h2>
                <span
                  className={
                    "inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full " +
                    getStatusColor(result.httpStatus)
                  }
                >
                  {result.httpStatus || result.status}
                  {result.httpStatus && getStatusText(result.httpStatus) && (
                    <span className="ml-1 font-normal opacity-70">
                      {getStatusText(result.httpStatus)}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => {
                  if (result.responseBody) {
                    navigator.clipboard
                      .writeText(result.responseBody)
                      .then(() => showToast("Response body copied", "success"))
                      .catch(() => showToast("Failed to copy", "error"));
                  }
                }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1.5"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                  />
                </svg>
                Copy
              </button>
            </div>

            <div className="flex gap-6 px-6 pt-3 border-b border-gray-100">
              <div className="text-sm">
                <span className="text-gray-400">Status</span>{" "}
                <span className="font-medium text-gray-700">
                  {result.httpStatus ?? "N/A"}
                  {result.httpStatus && getStatusText(result.httpStatus) && (
                    <span className="text-gray-500"> — {getStatusText(result.httpStatus)}</span>
                  )}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-400">Time</span>{" "}
                <span className="font-medium text-gray-700">
                  {result.responseTime}ms
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-400">Size</span>{" "}
                <span className="font-medium text-gray-700">
                  {formatBytes(result.responseSize)}
                </span>
              </div>
              {result.errorMessage && (
                <div className="text-sm">
                  <span className="text-red-500 font-medium">
                    {result.errorMessage}
                  </span>
                </div>
              )}
            </div>

            <div className="flex border-b border-gray-100 px-6">
              {(
                [
                  { id: "response" as Tab, label: "Response" },
                  { id: "responseHeaders" as Tab, label: "Response Headers" },
                  { id: "request" as Tab, label: "Request" },
                  { id: "requestHeaders" as Tab, label: "Request Headers" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    "px-4 py-3 text-sm font-medium transition-colors relative " +
                    (activeTab === tab.id
                      ? "text-brand-600"
                      : "text-gray-500 hover:text-gray-700")
                  }
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === "response" && (
                <div>
                  {result.responseBody ? (
                    <ResponseBodyView body={result.responseBody} showToast={showToast} />
                  ) : (
                    <p className="text-sm text-gray-400 italic">No response body</p>
                  )}
                </div>
              )}

              {activeTab === "responseHeaders" && (
                <div>
                  {result.responseHeaders &&
                  Object.keys(result.responseHeaders).length > 0 ? (
                    <KeyValueTable data={result.responseHeaders} />
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      No response headers
                    </p>
                  )}
                </div>
              )}

              {activeTab === "request" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Method</p>
                      <p className="text-sm font-semibold text-gray-900 font-mono">
                        {result.requestMethod}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">URL</p>
                      <p className="text-sm font-medium text-gray-900 font-mono break-all">
                        {result.fullRequestUrl || result.requestUrl}
                      </p>
                    </div>
                  </div>
                  {result.requestUrl !== result.fullRequestUrl && result.fullRequestUrl && (
                    <p className="text-xs text-gray-400">
                      Sanitized URL: <span className="font-mono">{result.requestUrl}</span>
                    </p>
                  )}
                  {result.sentBody != null && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Request Body
                      </h3>
                      <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                        {typeof result.sentBody === "string"
                          ? isJson(result.sentBody)
                            ? JSON.stringify(JSON.parse(result.sentBody), null, 2)
                            : result.sentBody
                          : JSON.stringify(result.sentBody, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "requestHeaders" && (
                <div>
                  {result.requestHeaders &&
                  Object.keys(result.requestHeaders).length > 0 ? (
                    <KeyValueTable
                      data={result.requestHeaders}
                      redactSensitive
                    />
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      No request headers
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto text-gray-200 mb-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
            <p className="text-gray-400 text-sm">
              Enter a URL and click Send to test an API endpoint
            </p>
            <p className="text-gray-300 text-xs mt-2">
              Press Ctrl+Enter to send quickly
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
