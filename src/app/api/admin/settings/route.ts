import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  serializeCloudflareConfig,
  getCloudflareRuntimeConfig,
  setCloudflareRuntimeConfig,
} from "@/lib/cloudflare-config";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const config = await getCloudflareRuntimeConfig();

  return NextResponse.json({
    settings: {
      tempMailEnabled: process.env.TEMP_MAIL_DOMAIN ? true : false,
      usageProtectionEnabled: process.env.CLOUDFLARE_USAGE_PROTECTION_ENABLED === "true",
      safetyPercent: parseFloat(
        process.env.CLOUDFLARE_SAFETY_PERCENT || "90"
      ),
      warningPercent: parseFloat(
        process.env.CLOUDFLARE_WARNING_PERCENT || "90"
      ),
      blockPercent: parseFloat(
        process.env.CLOUDFLARE_BLOCK_PERCENT || "95"
      ),
      dashboardRefreshInterval: 30000,
    },
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
    accountId: config.accountId,
    zoneId: config.zoneId,
    d1DatabaseId: config.d1DatabaseId,
    workerName: config.workerName,
    apiTokenPresent: Boolean(config.apiToken),
    status: config.status,
    connectionMessage: config.connectionMessage,
    lastTested: config.lastTested,
  });
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId ?? "").trim();
    const zoneId = String(body.zoneId ?? "").trim();
    const d1DatabaseId = String(body.d1DatabaseId ?? "").trim();
    const workerName = String(body.workerName ?? "").trim();
    const apiToken = String(body.apiToken ?? "").trim();

    // If no new API token provided, preserve existing one
    let finalApiToken = apiToken;
    if (!apiToken) {
      const current = await getCloudflareRuntimeConfig();
      finalApiToken = current.apiToken;
    }

    const nextConfig = await setCloudflareRuntimeConfig({
      accountId,
      zoneId,
      d1DatabaseId,
      workerName,
      apiToken: finalApiToken,
      status: accountId && finalApiToken ? "configuration-required" : "not-configured",
      connectionMessage:
        accountId && finalApiToken
          ? "Cloudflare credentials configured. Test the connection to validate access."
          : "Cloudflare Configuration Required",
      lastTested: null,
    });

    return NextResponse.json({
      success: true,
      message: "Cloudflare configuration saved securely.",
      ...serializeCloudflareConfig(nextConfig),
    });
  } catch (error) {
    console.error("[Admin Settings] Save failed:", error);
    return NextResponse.json(
      { error: "Failed to save Cloudflare configuration" },
      { status: 500 }
    );
  }
}
