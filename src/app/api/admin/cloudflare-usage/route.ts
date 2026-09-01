import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getCloudflareUsageData } from "@/lib/cloudflare-usage";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const usage = await getCloudflareUsageData();
  return NextResponse.json(usage);
}
