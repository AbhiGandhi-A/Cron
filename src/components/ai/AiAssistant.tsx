"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  NormalizedErrorInput,
  AiAnalysis,
  AiPerformanceInfo,
  AiRetryableRequest,
} from "@/lib/ai/types";
import {
  initAiMonitoring,
  forceAnalyze,
  computeClientFingerprint,
} from "@/lib/monitoring/client";
import { formatRelativeTime, cn } from "@/lib/utils";

type SimpleSeverity = "low" | "medium" | "high" | "critical";

interface ApiConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface ApiIssue {
  id: string;
  kind: string;
  source: string;
  title: string;
  message: string;
  errorType: string | null;
  endpoint: string | null;
  method: string | null;
  status: number | null;
  stack: string | null;
  severity: SimpleSeverity;
  page: string | null;
  userAgent: string | null;
  response: string | null;
  context: Record<string, unknown> | null;
  perf: AiPerformanceInfo | null;
  retryable: (AiRetryableRequest & { result?: Record<string, unknown> | null }) | null;
  occurrences: number;
  firstSeenAt: string | Date;
  lastSeenAt: string | Date;
  resolved: boolean;
  resolvedAt: string | Date | null;
  analysis: AiAnalysis | null;
  conversation: ApiConversationMessage[];
  createdAt: string | Date;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const SEVERITY_STYLES: Record<SimpleSeverity, string> = {
  low: "bg-sky-100 text-sky-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

function issueToInput(issue: ApiIssue): NormalizedErrorInput {
  return {
    title: issue.title,
    message: issue.message,
    errorType: issue.errorType,
    endpoint: issue.endpoint,
    method: issue.method,
    status: issue.status,
    stack: issue.stack,
    kind: (issue.kind as NormalizedErrorInput["kind"]) ?? "frontend",
    severity: issue.severity,
    source: issue.source,
    page: issue.page,
    userAgent: issue.userAgent,
    response: issue.response,
    context: issue.context ?? undefined,
    perf: issue.perf ?? undefined,
    retryable: issue.retryable ?? undefined,
  };
}

function normalizeLocalIssue(input: NormalizedErrorInput, fingerprint: string): ApiIssue {
  return {
    id: `local-${fingerprint}`,
    kind: input.kind ?? "frontend",
    source: input.source ?? "unknown",
    title: input.title,
    message: input.message,
    errorType: input.errorType ?? null,
    endpoint: input.endpoint ?? null,
    method: input.method ?? null,
    status: input.status ?? null,
    stack: input.stack ?? null,
    severity: input.severity ?? "medium",
    page: input.page ?? null,
    userAgent: input.userAgent ?? null,
    response: input.response ?? null,
    context: input.context ?? null,
    perf: input.perf ?? null,
    retryable: input.retryable ?? null,
    occurrences: 1,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    resolved: false,
    resolvedAt: null,
    analysis: null,
    conversation: [],
    createdAt: new Date(),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as T;
  return data;
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"issues" | "assistant">("issues");
  const [issues, setIssues] = useState<ApiIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIssue = issues.find((issue) => issue.id === selectedId) ?? null;

  const loadIssues = useCallback(async (status: "open" | "resolved" | "all" = filter) => {
    setLoading(true);
    try {
      const data = await fetchJson<{ issues: ApiIssue[] }>(
        `/api/ai/issues?status=${status}&limit=50`
      );
      setIssues(data.issues ?? []);
      setSelectedId((current) => {
        if (current && data.issues?.some((issue) => issue.id === current)) return current;
        return data.issues?.[0]?.id ?? null;
      });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (open) void loadIssues(filter);
  }, [open, filter, loadIssues]);

  useEffect(() => {
    initAiMonitoring();

    function onIssue(event: Event) {
      const detail = (event as CustomEvent).detail as { issue: NormalizedErrorInput; fingerprint: string; duplicate: boolean };
      if (!detail?.issue) return;
      const fingerprint = detail.fingerprint || computeClientFingerprint(detail.issue);
      setIssues((current) => {
        const index = current.findIndex(
          (issue) =>
            (issue.id.startsWith("local-") && issue.id === `local-${fingerprint}`) ||
            issue.errorType === detail.issue.errorType && issue.title === detail.issue.title
        );
        if (index >= 0) {
          const copy = [...current];
          copy[index] = {
            ...copy[index],
            occurrences: copy[index].occurrences + 1,
            lastSeenAt: new Date(),
          };
          return copy;
        }
        return [normalizeLocalIssue(detail.issue, fingerprint), ...current];
      });
      if (detail.duplicate) setNotice("Duplicate error captured (already reported).");
      else setNotice(null);
    }

    function onAnalysis(event: Event) {
      const detail = (event as CustomEvent).detail as { issue?: ApiIssue; analysis?: AiAnalysis; error?: string };
      if (detail?.issue && detail.issue.id) {
        setIssues((current) => {
          const index = current.findIndex((issue) => issue.id === detail.issue!.id);
          if (index >= 0) {
            const copy = [...current];
            copy[index] = { ...copy[index], ...(detail.issue as ApiIssue) };
            return copy;
          }
          return [detail.issue as ApiIssue, ...current];
        });
        if (detail.error) setNotice(detail.error);
        else setNotice(null);
      } else if (detail?.error) {
        setNotice(detail.error);
      }
    }

    function onOpenPanel(event: Event) {
      const detail = (event as CustomEvent).detail as { issue?: NormalizedErrorInput } | undefined;
      setOpen(true);
      setTab("issues");
      if (detail?.issue) {
        const fingerprint = computeClientFingerprint(detail.issue);
        setIssues((current) => {
          const existing = current.find((issue) => issue.id === `local-${fingerprint}`);
          if (existing) {
            setSelectedId(existing.id);
            return current;
          }
          const local = normalizeLocalIssue(detail.issue!, fingerprint);
          setSelectedId(local.id);
          return [local, ...current];
        });
      }
    }

    window.addEventListener("cronjobio:ai:issue", onIssue);
    window.addEventListener("cronjobio:ai:analysis", onAnalysis);
    window.addEventListener("cronjobio:ai:open", onOpenPanel);

    return () => {
      window.removeEventListener("cronjobio:ai:issue", onIssue);
      window.removeEventListener("cronjobio:ai:analysis", onAnalysis);
      window.removeEventListener("cronjobio:ai:open", onOpenPanel);
    };
  }, []);

  const refreshIssue = useCallback(async (id: string) => {
    const data = await fetchJson<{ issue: ApiIssue }>(`/api/ai/issues/${id}`);
    if (data.issue) {
      setIssues((current) => current.map((issue) => (issue.id === id ? data.issue : issue)));
    }
  }, []);

  async function handleToggleResolved(issue: ApiIssue) {
    setBusyId(issue.id);
    try {
      await fetch(`/api/ai/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !issue.resolved }),
      });
      await refreshIssue(issue.id);
    } catch {
      /* ignore network errors */
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetry(issue: ApiIssue) {
    setBusyId(issue.id);
    try {
      const data = await fetchJson<{ result: Record<string, unknown> | null; issue?: ApiIssue }>(
        `/api/ai/issues/${issue.id}/retry`,
        { method: "POST" }
      );
      setIssues((current) =>
        current.map((item) =>
          item.id === issue.id
            ? {
                ...item,
                retryable: { ...item.retryable!, result: data.result ?? null },
              }
            : item
        )
      );
    } catch {
      /* ignore network errors */
    } finally {
      setBusyId(null);
    }
  }

  async function handleAnalyzeNow() {
    if (!selectedIssue) return;
    setBusyId(selectedIssue.id);
    try {
      forceAnalyze(issueToInput(selectedIssue));
    } finally {
      setBusyId(null);
    }
  }

  async function handleClearAll() {
    try {
      await fetch("/api/ai/issues", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: filter === "resolved" ? "resolved" : "all" }),
      });
      setIssues([]);
    } catch {
      /* ignore */
    }
  }

  async function handleFollowUp(issue: ApiIssue) {
    const message = followUpDraft[issue.id]?.trim();
    if (!message || chatSending) return;
    setChatSending(true);
    try {
      const data = await fetchJson<{ reply: string; conversation: ApiConversationMessage[]; aiAvailable?: boolean }>(
        "/api/ai/chat",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId: issue.id, message }) }
      );
      setIssues((current) =>
        current.map((item) =>
          item.id === issue.id ? { ...item, conversation: data.conversation ?? item.conversation } : item
        )
      );
    } catch {
      /* ignore network errors */
    } finally {
      setFollowUpDraft((drafts) => ({ ...drafts, [issue.id]: "" }));
      setChatSending(false);
    }
  }

  async function handleGlobalChat() {
    const message = chatInput.trim();
    if (!message || chatSending) return;
    setChatSending(true);
    setChatMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const data = await fetchJson<{ reply: string; aiAvailable?: boolean }>("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply ?? "No response", error: data.aiAvailable === false },
      ]);
    } catch {
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: "AI assistant is temporarily unavailable.", error: true },
      ]);
    } finally {
      setChatInput("");
      setChatSending(false);
    }
  }

  function copyFix(issue: ApiIssue) {
    if (!issue.analysis?.fix) return;
    navigator.clipboard?.writeText(issue.analysis.fix).catch(() => {});
  }

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gray-900 text-white shadow-lg shadow-gray-900/30 px-4 py-3 text-sm font-semibold hover:bg-gray-800 transition-colors"
        aria-label="Open AI Dev Assistant"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
        AI Assistant
        {issues.filter((issue) => !issue.resolved).length > 0 && (
          <span className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-500 text-[11px] font-bold">
            {issues.filter((issue) => !issue.resolved).length}
          </span>
        )}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 sm:bg-black/10 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
      />

      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] sm:max-w-[450px] bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="border-b border-gray-100 px-4 py-3 flex items-center justify-between bg-gray-50/80">
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
            aria-label="Close AI Assistant"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">AI Dev Assistant</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">Groq</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">Errors, fixes, and follow-up help</p>
          </div>
          <Link
            href="/generate-api"
            onClick={() => setOpen(false)}
            className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap mr-2"
          >
            Generate API &rarr;
          </Link>
        </header>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
          {(["issues", "assistant"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-full transition-colors",
                tab === item ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {item === "issues" ? "Issues" : "Ask AI"}
            </button>
          ))}
        </div>

        {notice && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            {notice}
          </div>
        )}

        <div className="flex-1 overflow-y-auto" ref={listRef}>
          {tab === "issues" ? (
            <IssuesTab
              issues={issues}
              selectedId={selectedId}
              filter={filter}
              loading={loading}
              busyId={busyId}
              onSelect={setSelectedId}
              onFilter={setFilter}
              onReload={() => void loadIssues(filter)}
              onClearAll={() => void handleClearAll()}
              onToggleResolved={(issue) => void handleToggleResolved(issue)}
              onRetry={(issue) => void handleRetry(issue)}
              onAnalyzeNow={() => void handleAnalyzeNow()}
              onCopyFix={copyFix}
              followUpDraft={followUpDraft}
              onFollowUpDraftChange={(id, value) => setFollowUpDraft((drafts) => ({ ...drafts, [id]: value }))}
              onFollowUp={(issue) => void handleFollowUp(issue)}
              chatSending={chatSending}
            />
          ) : (
            <AssistantChatTab
              messages={chatMessages}
              input={chatInput}
              sending={chatSending}
              onInput={setChatInput}
              onSend={() => void handleGlobalChat()}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function SeverityBadge({ severity }: { severity: SimpleSeverity }) {
  return (
    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium)}>
      {severity}
    </span>
  );
}

function IssuesTab(props: {
  issues: ApiIssue[];
  selectedId: string | null;
  filter: "open" | "resolved" | "all";
  loading: boolean;
  busyId: string | null;
  onSelect: (id: string) => void;
  onFilter: (filter: "open" | "resolved" | "all") => void;
  onReload: () => void;
  onClearAll: () => void;
  onToggleResolved: (issue: ApiIssue) => void;
  onRetry: (issue: ApiIssue) => void;
  onAnalyzeNow: () => void;
  onCopyFix: (issue: ApiIssue) => void;
  followUpDraft: Record<string, string>;
  onFollowUpDraftChange: (id: string, value: string) => void;
  onFollowUp: (issue: ApiIssue) => void;
  chatSending: boolean;
}) {
  const selected = props.issues.find((issue) => issue.id === props.selectedId) ?? null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
        {(["open", "resolved", "all"] as const).map((option) => (
          <button
            key={option}
            onClick={() => props.onFilter(option)}
            className={cn(
              "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
              props.filter === option ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </button>
        ))}
        <button
          onClick={props.onReload}
          className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </button>
        <button
          onClick={props.onClearAll}
          className="text-xs font-medium px-2.5 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {props.loading && !props.issues.length ? (
          <p className="text-center text-xs text-gray-400 py-10">Loading issues...</p>
        ) : !props.issues.length ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm font-semibold text-gray-700">No issues recorded</p>
            <p className="text-xs text-gray-400 mt-1">
              Frontend errors, failed API calls, and slow requests will appear here automatically.
            </p>
          </div>
        ) : selected ? (
          <IssueDetail
            issue={selected}
            busy={props.busyId === selected.id}
            onBack={() => props.onSelect("")}
            onToggleResolved={() => props.onToggleResolved(selected)}
            onRetry={() => props.onRetry(selected)}
            onAnalyzeNow={props.onAnalyzeNow}
            onCopyFix={() => props.onCopyFix(selected)}
            followUpDraft={props.followUpDraft[selected.id] ?? ""}
            onFollowUpDraftChange={(value) => props.onFollowUpDraftChange(selected.id, value)}
            onFollowUp={() => props.onFollowUp(selected)}
            chatSending={props.chatSending}
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {props.issues.map((issue) => (
              <li key={issue.id}>
                <button
                  onClick={() => props.onSelect(issue.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="text-[10px] font-medium text-gray-400">{issue.source}</span>
                    <span className="ml-auto text-[10px] text-gray-400">{formatRelativeTime(issue.lastSeenAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{issue.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{issue.message}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                    {issue.endpoint && <span className="font-mono truncate">{issue.endpoint}</span>}
                    {issue.occurrences > 1 && <span>&times;{issue.occurrences}</span>}
                    {issue.analysis?.available && (
                      <span className="text-emerald-600 font-semibold">Analyzed</span>
                    )}
                    {issue.resolved && <span className="text-gray-500 font-semibold">Resolved</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IssueDetail(props: {
  issue: ApiIssue;
  busy: boolean;
  onBack: () => void;
  onToggleResolved: () => void;
  onRetry: () => void;
  onAnalyzeNow: () => void;
  onCopyFix: () => void;
  followUpDraft: string;
  onFollowUpDraftChange: (value: string) => void;
  onFollowUp: () => void;
  chatSending: boolean;
}) {
  const issue = props.issue;
  const analysis = issue.analysis;

  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={props.onBack} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
        &larr; Back to list
      </button>

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={issue.severity} />
            {issue.resolved && <span className="text-[10px] font-bold uppercase text-gray-500">Resolved</span>}
          </div>
          <h3 className="text-sm font-bold text-gray-900 mt-1.5">{issue.title}</h3>
          <p className="text-xs text-gray-500 mt-1">{issue.message}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-gray-50 rounded-lg p-2">
          <dt className="text-gray-400 font-medium">Status</dt>
          <dd className="text-gray-800 font-mono mt-0.5">{issue.status ?? "-"}</dd>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <dt className="text-gray-400 font-medium">Method</dt>
          <dd className="text-gray-800 font-mono mt-0.5">{issue.method ?? "-"}</dd>
        </div>
        {issue.endpoint ? (
          <div className="col-span-2 bg-gray-50 rounded-lg p-2">
            <dt className="text-gray-400 font-medium">Endpoint</dt>
            <dd className="text-gray-800 font-mono mt-0.5 break-all">{issue.endpoint}</dd>
          </div>
        ) : null}
        {issue.perf ? (
          <div className="col-span-2 bg-gray-50 rounded-lg p-2">
            <dt className="text-gray-400 font-medium">Performance</dt>
            <dd className="text-gray-800 mt-0.5">
              {issue.perf.op} took {Math.round(issue.perf.durationMs)}ms ({issue.perf.threshold})
            </dd>
          </div>
        ) : null}
        <div className="bg-gray-50 rounded-lg p-2">
          <dt className="text-gray-400 font-medium">First seen</dt>
          <dd className="text-gray-800 mt-0.5">{formatRelativeTime(issue.firstSeenAt)}</dd>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <dt className="text-gray-400 font-medium">Occurrences</dt>
          <dd className="text-gray-800 mt-0.5">&times;{issue.occurrences}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={props.onToggleResolved}
          disabled={props.busy || issue.id.startsWith("local-")}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {issue.resolved ? "Reopen issue" : "Mark as resolved"}
        </button>
        {issue.retryable && (
          <button
            onClick={props.onRetry}
            disabled={props.busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Retry failed operation
          </button>
        )}
      </div>

      {issue.retryable?.result ? (
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Last retry</p>
          <p className="text-xs font-mono text-gray-800">
            {String(issue.retryable.result.status ?? "-")} · HTTP {String(issue.retryable.result.httpStatus ?? "-")} · {String(issue.retryable.result.responseTime ?? "-")}ms
          </p>
          {issue.retryable.result.errorMessage ? (
            <p className="text-xs text-red-600 mt-1">{String(issue.retryable.result.errorMessage)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">AI analysis</p>
          <div className="flex items-center gap-2">
            {analysis?.available && analysis?.reasoningModel ? (
              <span className="text-[10px] text-gray-400" title={`${analysis.researchUsed ? `Researched by web-research model${analysis.researchModel ? ` (${analysis.researchModel})` : ""}` : ""}`}>
                {analysis.researchUsed ? "Reasoned & researched" : `Reasoned with ${analysis.reasoningModel}`}
              </span>
            ) : null}
            {analysis?.available && analysis.fix && (
              <button onClick={props.onCopyFix} className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">
                Copy fix
              </button>
            )}
            <button onClick={props.onAnalyzeNow} disabled={props.busy || issue.id.startsWith("local-")} className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50">
              {analysis && !analysis.available ? "Retry analysis" : "Analyze now"}
            </button>
          </div>
        </div>
        <div className="p-3">
          {!analysis ? (
            <p className="text-xs text-gray-400">
              {issue.id.startsWith("local-")
                ? "Waiting for the AI to analyze this error... (opening the panel may still be processing)"
                : "This error has not been analyzed yet. Click &quot;Analyze now&quot;."}
            </p>
          ) : !analysis.available ? (
            <p className="text-xs text-red-600">{analysis.error ?? "AI analysis is temporarily unavailable."}</p>
          ) : (
            <div className="space-y-2.5 text-xs text-gray-700">
              {analysis.rootCause ? (
                <p><span className="font-semibold text-gray-900">Root cause:</span> {analysis.rootCause}</p>
              ) : null}
              {analysis.fix ? (
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Fix</p>
                  <p className="whitespace-pre-wrap bg-gray-50 rounded-lg p-2.5 border border-gray-100">{analysis.fix}</p>
                </div>
              ) : null}
              {analysis.impact ? (
                <p><span className="font-semibold text-gray-900">Impact:</span> {analysis.impact}</p>
              ) : null}
              {analysis.prevention ? (
                <p><span className="font-semibold text-gray-900">Prevention:</span> {analysis.prevention}</p>
              ) : null}
              {analysis.references?.length ? (
                <p className="text-brand-600">
                  <span className="font-semibold text-gray-900">References:</span> {analysis.references.join(" · ")}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-3 py-2 border-b border-gray-100">
          Follow-up chat
        </p>
        <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
          {(issue.conversation ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">
              Ask for more details, more context, or how to apply the fix. Your message is analyzed together with this issue.
            </p>
          ) : (
            (issue.conversation ?? []).map((message, index) => (
              <div key={index} className={cn("max-w-[85%] text-xs rounded-xl px-3 py-2", message.role === "user" ? "ml-auto bg-gray-900 text-white" : "mr-auto bg-gray-50 text-gray-800 border border-gray-100")}>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 p-2">
          <input
            value={props.followUpDraft}
            onChange={(event) => props.onFollowUpDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && props.followUpDraft.trim() && !props.chatSending) props.onFollowUp();
            }}
            placeholder={issue.id.startsWith("local-") ? "Ask about this issue..." : "Ask a follow-up..."}
            className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={props.onFollowUp}
            disabled={props.chatSending || !props.followUpDraft.trim()}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function AssistantChatTab(props: {
  messages: ChatMessage[];
  input: string;
  sending: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {props.messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-semibold text-gray-700">Ask the assistant anything</p>
            <p className="text-xs text-gray-400 mt-1">
              Ask about cron scheduling, API tester usage, generated APIs, or how to fix a failing job.
            </p>
            <div className="flex flex-col gap-2 mt-4 max-w-xs mx-auto">
              {["Why is my cron job failing with HTTP 500?", "What does my API Tester response HTTP mean?", "How do I secure a generated API?"].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    props.onInput(prompt);
                  }}
                  className="text-xs text-left bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-3 py-2 text-gray-700 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          props.messages.map((message, index) => (
            <div key={index} className={cn("max-w-[85%] text-sm rounded-xl px-3 py-2", message.role === "user" ? "ml-auto bg-gray-900 text-white" : "mr-auto bg-gray-50 text-gray-800 border border-gray-100")}>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.error ? <p className="text-[10px] text-gray-400 mt-1">unavailable</p> : null}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-gray-100 p-3 flex items-center gap-2">
        <input
          value={props.input}
          onChange={(event) => props.onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && props.input.trim() && !props.sending) props.onSend();
          }}
          placeholder="Ask the assistant..."
          className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={props.onSend}
          disabled={props.sending || !props.input.trim()}
          className="text-sm font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}