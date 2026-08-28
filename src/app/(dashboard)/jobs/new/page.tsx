"use client";

import DashboardLayout from "@/components/DashboardLayout";
import JobForm from "@/components/JobForm";

export default function NewJobPage() {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Create Cron Job</h1>
          <p className="text-sm text-gray-500 mt-1">Set up a new scheduled API job</p>
        </div>
        <JobForm mode="create" />
      </div>
    </DashboardLayout>
  );
}