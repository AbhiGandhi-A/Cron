"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cronjobfree_cookie_consent";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "accepted") {
        setVisible(false);
        return;
      }
    } catch {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      /* ignore storage errors */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md"
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 animate-fade-in">
        <p className="text-sm text-gray-700 leading-relaxed">
          We use essential cookies and a session token to keep the Cron Job Free
          application working, for example to keep you signed in. We do not use
          advertising or tracking cookies. For more information, see our{" "}
          <Link href="/cookie-policy" className="text-brand-600 hover:text-brand-700 font-semibold">
            Cookie Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-brand-600 hover:text-brand-700 font-semibold">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="mt-4 flex items-center gap-3 justify-end">
          <Link
            href="/cookie-policy"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Learn more
          </Link>
          <button
            onClick={accept}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 shadow-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
