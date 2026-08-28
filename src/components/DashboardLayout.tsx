"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import { OnboardingProvider } from "./onboarding/OnboardingTour";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen bg-gray-50/80">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">{children}</div>
        </main>
      </div>
    </OnboardingProvider>
  );
}
