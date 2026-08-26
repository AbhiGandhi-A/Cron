"use client";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  SUCCESS: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  ACTIVE: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  FAILED: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  RUNNING: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500 animate-pulse" },
  PENDING: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  TIMEOUT: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  RETRY: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  INACTIVE: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

const defaultStyle = { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const style = statusStyles[status] || defaultStyle;
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${sizeClasses} ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${style.dot}`} />
      {status}
    </span>
  );
}
