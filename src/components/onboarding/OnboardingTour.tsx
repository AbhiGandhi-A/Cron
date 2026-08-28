"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ONBOARDING_STEPS } from "./steps";

const STORAGE_KEY = "cronjobio.onboarding.seen";

interface OnboardingContextValue {
  openTour: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  openTour: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

function readSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = ONBOARDING_STEPS.length;
  const isLast = step === total - 1;
  const current = ONBOARDING_STEPS[Math.min(step, total - 1)];

  useEffect(() => {
    if (status !== "authenticated") return;
    if (readSeen()) return;

    let cancelled = false;

    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const jobs = Array.isArray(data.jobs) ? (data.jobs as unknown[]) : [];
        if (jobs.length === 0) {
          timerRef.current = setTimeout(() => {
            if (!cancelled) {
              setStep(0);
              setOpen(true);
            }
          }, 500);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status]);

  const openTour = useCallback(() => {
    setStep(0);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    writeSeen();
  }, []);

  const handleFinish = useCallback(() => {
    setOpen(false);
    writeSeen();
    router.push("/jobs/new");
  }, [router]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, close]);

  return (
    <OnboardingContext.Provider value={{ openTour }}>
      {children}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-7 animate-fade-in border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-600/30 shrink-0">
                {current.icon}
              </div>
              <button
                onClick={close}
                className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              >
                Skip
              </button>
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Step {step + 1} of {total}
            </p>
            <div className="flex gap-1 mb-5">
              {ONBOARDING_STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={
                    "h-1 rounded-full flex-1 transition-colors " +
                    (i <= step ? "bg-brand-600" : "bg-gray-200")
                  }
                />
              ))}
            </div>

            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-2">
              {current.title}
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {current.description}
            </p>
            {current.href && (
              <Link
                href={current.href}
                className="inline-block mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                {current.hrefLabel || "Open"} &rarr;
              </Link>
            )}

            <div className="flex items-center justify-between mt-7 pt-5 border-t border-gray-100">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                Back
              </button>

              {isLast ? (
                <button
                  onClick={handleFinish}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 shadow-sm transition-colors"
                >
                  Start Creating Your First Job
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
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 shadow-sm transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </OnboardingContext.Provider>
  );
}