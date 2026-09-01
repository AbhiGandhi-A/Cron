"use client";

import { useEffect } from "react";

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
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className={`${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm`}
      >
        <span className="text-lg font-bold">{icons[type]}</span>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
