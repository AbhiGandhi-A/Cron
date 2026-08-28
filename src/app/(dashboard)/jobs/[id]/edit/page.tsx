"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import JobForm from "@/components/JobForm";

export default function EditJobPage() {
  const params = useParams();
  const jobId = typeof params.id === "string" ? params.id : "";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Edit Cron Job</h1>
          <p className="text-sm text-gray-500 mt-1">Update your scheduled API job</p>
        </div>
        <JobForm mode="edit" jobId={jobId} />
      </div>
    </DashboardLayout>
  );
}