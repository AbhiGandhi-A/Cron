import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  serializeCloudflareConfig,
  getCloudflareConfigFromEnv,
  setCloudflareRuntimeConfig,
} from "@/lib/cloudflare-config";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const envConfig = getCloudflareConfigFromEnv();

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
    accountId: envConfig.accountId,
    zoneId: envConfig.zoneId,
    apiTokenPresent: Boolean(envConfig.apiToken),
    status: envConfig.status,
    connectionMessage: envConfig.connectionMessage,
    lastTested: envConfig.lastTested,
  });
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId ?? "").trim();
    const zoneId = String(body.zoneId ?? "").trim();
    const apiToken = String(body.apiToken ?? "").trim();

    const nextConfig = setCloudflareRuntimeConfig({
      accountId,
      zoneId,
      apiToken,
      status: accountId && apiToken ? "configuration-required" : "not-configured",
      connectionMessage:
        accountId && apiToken
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
    return NextResponse.json(
      { error: "Failed to save Cloudflare configuration" },
      { status: 500 }
    );
  }
}
