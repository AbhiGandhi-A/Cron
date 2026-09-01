"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmailDetail from "./EmailDetail";

type Mailbox = {
  publicAddress: string;
  mailboxToken: string;
  expiresAt: string;
  isExpired: boolean;
};

type Attachment = {
  filename: string;
  contentType: string;
  size: number;
  attachmentId: string;
};

type Message = {
  _id: string;
  from: string;
  to: string;
  subject: string;
  preview?: string;
  textBody?: string;
  sanitizedHtmlBody?: string;
  receivedAt: string;
  isRead: boolean;
  attachments?: Attachment[];
  size?: number;
};

const POLL_INTERVAL_MS = 12000;

export default function TempMailClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usageProtection, setUsageProtection] = useState<{
    status: "healthy" | "warning" | "blocked";
    resource?: string;
    used?: number;
    safetyLimit?: number;
    actualLimit?: number;
    percentageOfSafetyLimit?: number;
    resetsAt?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [generateConfirm, setGenerateConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [now, setNow] = useState(Date.now());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const mailboxRef = useRef(mailbox);
  mailboxRef.current = mailbox;
  const activePollRef = useRef(true);
  const firstLoadDone = useRef(false);

  useEffect(() => {
    setMounted(true);
    void loadInitial();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      activePollRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/temp-mail", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) {
          setConfigured(false);
          setMailbox(null);
          return;
        }
        if (res.status === 429 && body.error === "TEMP_MAIL_USAGE_LIMIT") {
          setUsageProtection(body.usageProtection ?? null);
          setConfigured(true);
          setLoading(false);
          return;
        }
        throw new Error(body.error || "Failed to load mailbox");
      }
      const data = body;
      setConfigured(data.configured ?? true);
      setUsageProtection(data.usageProtection ?? null);

      setMailbox(data.mailbox ?? null);
      if (data.mailbox && !data.mailbox.isExpired) {
        await refreshMessages(data.mailbox);
      } else {
        setMessages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load inbox");
    } finally {
      setLoading(false);
      firstLoadDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshMessages = useCallback(
    async (mb: Mailbox) => {
      setMessagesLoading(true);
      try {
        const res = await fetch(
          `/api/temp-mail/messages?mailboxToken=${encodeURIComponent(
            mb.mailboxToken
          )}&publicAddress=${encodeURIComponent(mb.publicAddress)}`,
          { cache: "no-store" }
        );
        if (res.status === 404) {
          setMailbox(null);
          setMessages([]);
          return;
        }
        if (res.status === 429) return;
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages || []);
        setLastRefreshed(new Date());
      } catch {
        /* silent refresh failure */
      } finally {
        setMessagesLoading(false);
      }
    },
    []
  );

  const createMailbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/temp-mail", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        if (res.status === 503) {
          setConfigured(false);
          setMailbox(null);
          return;
        }
        if (res.status === 429) {
          setUsageProtection(body.usageProtection ?? null);
          setMailbox(null);
          return;
        }
        throw new Error(body.error || "Failed to create mailbox");
      }

      const created = body;
      setMailbox(created);
      setConfigured(true);
      await refreshMessages(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create mailbox");
    } finally {
      setLoading(false);
    }
  }, [refreshMessages]);

  useEffect(() => {
    if (!mailbox || mailbox.isExpired || usageProtection?.status === "blocked") return;
    const interval = setInterval(() => {
      if (!activePollRef.current) return;
      if (document.visibilityState === "hidden") return;
      void refreshMessages(mailboxRef.current!);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mailbox, mailbox?.isExpired, refreshMessages, usageProtection?.status]);

  const copyEmail = useCallback(async () => {
    if (!mailbox) return;
    try {
      await navigator.clipboard.writeText(mailbox.publicAddress);
      toast.showToast("Email address copied", "success");
    } catch {
      toast.showToast("Failed to copy", "error");
    }
  }, [mailbox, toast]);

  const handleRefresh = useCallback(async () => {
    if (!mailbox || usageProtection?.status === "blocked") return;
    setRefreshing(true);
    try {
      await refreshMessages(mailbox);
      toast.showToast("Inbox refreshed", "success");
    } finally {
      setRefreshing(false);
    }
  }, [mailbox, refreshMessages, toast, usageProtection?.status]);

  const handleGenerateNew = useCallback(async () => {
    setGenerateConfirm(false);
    if (mailbox) {
      await fetch("/api/temp-mail", { method: "DELETE" }).catch(() => {});
    }
    toast.showToast("Generating a new temporary email...", "info");
    await createMailbox();
  }, [mailbox, createMailbox, toast]);

  const handleDelete = useCallback(async () => {
    setDeleteConfirm(false);
    const res = await fetch("/api/temp-mail", { method: "DELETE" }).catch(
      () => null
    );
    if (!res || !res.ok) {
      toast.showToast("Failed to delete mailbox", "error");
      return;
    }
    setMailbox(null);
    setMessages([]);
    toast.showToast("Temporary email deleted", "success");
  }, [toast]);

  const openMessage = useCallback((msg: Message) => {
    setSelectedMessage(msg);
    const mb = mailboxRef.current;
    if (!msg.isRead) {
      setMessages((prev) =>
        prev.map((m) => (m._id === msg._id ? { ...m, isRead: true } : m))
      );
      void fetch(
        `/api/temp-mail/messages/${msg._id}/read?mailboxToken=${encodeURIComponent(
          mb?.mailboxToken || ""
        )}&publicAddress=${encodeURIComponent(
          mb?.publicAddress || ""
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mailboxToken: mb?.mailboxToken,
            publicAddress: mb?.publicAddress,
          }),
        }
      ).catch(() => {});
    }
    void fetch(
      `/api/temp-mail/messages/${msg._id}?mailboxToken=${encodeURIComponent(
        mb?.mailboxToken || ""
      )}&publicAddress=${encodeURIComponent(mb?.publicAddress || "")}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.message) setSelectedMessage(data.message);
      })
      .catch(() => {});
  }, []);

  const handleDeleteMessage = useCallback(async (id: string) => {
    await fetch(
      `/api/temp-mail/messages/${id}?mailboxToken=${encodeURIComponent(
        mailboxRef.current?.mailboxToken || ""
      )}&publicAddress=${encodeURIComponent(mailboxRef.current?.publicAddress || "")}`,
      { method: "DELETE" }
    ).catch(() => {});
    setMessages((prev) => prev.filter((m) => m._id !== id));
    setSelectedMessage(null);
  }, []);

  if (!mounted) return null;

  const isExpired = mailbox ? now >= new Date(mailbox.expiresAt).getTime() : false;
  const shownExpiry = mailbox ? new Date(mailbox.expiresAt).getTime() - now : 0;
  const mm = Math.floor(Math.max(0, shownExpiry) / 60000);
  const ss = Math.floor((Math.max(0, shownExpiry) % 60000) / 1000);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Temporary Email
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Receive emails instantly on a disposable, self-destructing address
          </p>
        </div>

        {error && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">Unable to load inbox</h3>
            <p className="text-sm text-gray-500 mb-6">{error}</p>
            <button
              onClick={() => void loadInitial()}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {!error && configured === false && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              Temporary email receiving is not configured.
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Configure an inbound email provider to start receiving messages.
            </p>
          </div>
        )}

        {!error && configured !== false && !loading && usageProtection?.status !== "blocked" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Your temporary email</h2>
              {mailbox && !mailbox.isExpired && isExpired === false && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                  Active
                </span>
              )}
            </div>

            {!mailbox && (
              <div className="text-center py-4">
                <button
                  onClick={() => void createMailbox()}
                  className="px-6 py-3 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 shadow-sm transition-colors"
                >
                  Create temporary email
                </button>
              </div>
            )}

            {mailbox && isExpired === false && (
              <>
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
                  <span className="flex-1 font-mono text-sm text-gray-800 break-all">
                    {mailbox.publicAddress}
                  </span>
                  <button
                    onClick={() => void copyEmail()}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                    Copy
                  </button>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <span className={`text-sm font-medium ${shownExpiry < 300000 ? "text-red-600" : "text-gray-600"}`}>
                    Expires in {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : ""}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleRefresh()}
                    disabled={refreshing || messagesLoading}
                    className="px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Refresh
                  </button>
                  <button
                    onClick={() => setGenerateConfirm(true)}
                    className="px-4 py-2 text-sm font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Generate New
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="px-4 py-2 text-sm font-semibold bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Delete
                  </button>
                </div>
              </>
            )}

            {mailbox && isExpired === true && (
              <div className="text-center py-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1.5">Temporary email expired</h3>
                <p className="text-sm text-gray-500 mb-6">This address can no longer receive emails.</p>
                <button
                  onClick={() => void handleGenerateNew()}
                  className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
                >
                  Generate New Email
                </button>
              </div>
            )}
          </div>
        )}

        {mailbox && !mailbox.isExpired && isExpired === false && usageProtection?.status !== "blocked" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Inbox</h2>
              <span className="text-xs text-gray-400">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
            </div>

            {messagesLoading && messages.length === 0 && (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 w-1/3 bg-gray-100 rounded mb-2" />
                    <div className="h-3 w-2/3 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            )}

            {!messagesLoading && messages.length === 0 && (
              <div className="py-12 px-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-50 text-brand-500 flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1.5">No emails yet</h3>
                <p className="text-sm text-gray-500">Emails sent to this address will appear here.</p>
                <p className="text-xs text-gray-400 mt-1">Waiting for incoming email...</p>
              </div>
            )}

            {messages.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {messages.map((msg) => (
                  <li key={msg._id}>
                    <button
                      onClick={() => openMessage(msg)}
                      className="w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors flex items-start gap-3"
                    >
                      <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${msg.isRead ? "bg-transparent border border-gray-300" : "bg-brand-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className={`text-sm font-semibold truncate ${msg.isRead ? "text-gray-500" : "text-gray-900"}`}>
                            {msg.from || "Unknown sender"}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">
                            {formatTime(msg.receivedAt)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${msg.isRead ? "text-gray-500" : "text-gray-700 font-medium"}`}>
                          {msg.subject || "(no subject)"}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {msg.textBody || "Click to view message"}
                        </p>
                      </div>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <span className="shrink-0 text-gray-400" title="Has attachments">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={generateConfirm}
        title="Generate new email?"
        message="Your current temporary email will be permanently deleted. A new address will be created."
        confirmLabel="Generate New"
        cancelLabel="Cancel"
        onConfirm={() => void handleGenerateNew()}
        onCancel={() => setGenerateConfirm(false)}
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete this temporary email?"
        message="The mailbox and all its messages will be permanently deleted. You will not be able to access it again."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirm(false)}
      />

      {selectedMessage && mailbox && (
        <EmailDetail
          message={selectedMessage}
          onBack={() => setSelectedMessage(null)}
          onDelete={() => void handleDeleteMessage(selectedMessage._id)}
        />
      )}
    </DashboardLayout>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString();
}
