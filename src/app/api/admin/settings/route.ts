import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { serializeCloudflareConfig, getCloudflareConfigFromEnv } from "@/lib/cloudflare-config";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const cfConfig = getCloudflareConfigFromEnv();
  const serialized = serializeCloudflareConfig(cfConfig);

  return NextResponse.json({
    settings: {
      tempMailEnabled: Boolean(process.env.TEMP_MAIL_DOMAIN || process.env.TEMP_MAIL_SERVICE_URL),
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
    },
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "0.1.0",
    cloudflare: serialized,
  });
}

