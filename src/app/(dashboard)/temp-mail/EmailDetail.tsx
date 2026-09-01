"use client";

import { useState } from "react";

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
  textBody?: string;
  sanitizedHtmlBody?: string;
  receivedAt: string;
  isRead: boolean;
  attachments?: Attachment[];
  size?: number;
};

export default function EmailDetail({
  message,
  onBack,
  onDelete,
}: {
  message: Message;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"text" | "html">(message.sanitizedHtmlBody ? "html" : "text");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onBack} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col animate-fade-in border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Inbox
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>

        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-3 break-words">{message.subject || "(no subject)"}</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="text-gray-400 w-20 shrink-0">From</dt>
              <dd className="text-gray-800 break-words">{message.from || "Unknown"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-400 w-20 shrink-0">To</dt>
              <dd className="text-gray-800 break-words">{message.to || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-400 w-20 shrink-0">Received</dt>
              <dd className="text-gray-800">{new Date(message.receivedAt).toLocaleString()}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-400 w-20 shrink-0">Status</dt>
              <dd className="text-gray-800 capitalize">{message.isRead ? "Read" : "Unread"}</dd>
            </div>
          </dl>
        </div>

        <div className="px-6 pt-4 flex gap-1">
          {message.sanitizedHtmlBody ? (
            <>
              <TabButton active={tab === "html"} onClick={() => setTab("html")} label="HTML" />
              <TabButton active={tab === "text"} onClick={() => setTab("text")} label="Text" />
            </>
          ) : (
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">Text</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === "text" && (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
              {message.textBody || "(no plain text content)"}
            </pre>
          )}
          {tab === "html" && message.sanitizedHtmlBody && (
            <div
              className="email-viewer text-gray-800 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: message.sanitizedHtmlBody }}
            />
          )}
          {tab === "html" && !message.sanitizedHtmlBody && (
            <p className="text-sm text-gray-500">No HTML content available.</p>
          )}

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Attachments</h4>
              <ul className="space-y-2">
                {message.attachments.map((att) => (
                  <li
                    key={att.attachmentId || att.filename}
                    className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{att.filename}</p>
                      <p className="text-xs text-gray-400">{formatSize(att.size)} · {att.contentType}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-gray-400 mt-2">
                Attachments are shown as metadata only and are not executed or opened automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
        active
          ? "text-brand-700 border-brand-600 bg-brand-50"
          : "text-gray-500 border-transparent hover:text-gray-800"
      }`}
    >
      {label}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
