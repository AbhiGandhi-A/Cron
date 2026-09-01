"use client";

import DashboardLayout from "@/components/DashboardLayout";

import dynamic from "next/dynamic";

const TempMailClient = dynamic(
  () => import("./TempMailClient"),
  { ssr: false, loading: () => <TempMailLoading /> }
);

function TempMailLoading() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-gray-100 rounded mt-2 animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 animate-pulse">
          <div className="h-6 w-40 bg-gray-200 rounded-lg mb-4" />
          <div className="h-10 w-full bg-gray-100 rounded-lg mb-4" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-pulse">
              <div className="h-4 w-1/3 bg-gray-100 rounded mb-2" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function TempMailPage() {
  return <TempMailClient />;
}
