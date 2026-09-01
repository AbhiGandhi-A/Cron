"use client";

import { useEffect } from "react";
import { CheckCircleIcon, CloseIcon, AlertTriangleIcon } from "./AdminIcons";

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const colors = {
    success: "bg-emerald-600 text-white shadow-emerald-950/20",
    error: "bg-red-600 text-white shadow-red-950/20",
    info: "bg-blue-600 text-white shadow-blue-950/20",
  };

  const icons = {
    success: CheckCircleIcon,
    error: CloseIcon,
    info: AlertTriangleIcon,
  };

  const Icon = icons[type];

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className={`${colors[type]} px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-sm border border-white/10`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <p className="text-xs font-semibold leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
