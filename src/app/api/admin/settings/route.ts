import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  // Return current admin settings (mostly configuration info)
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
      dashboardRefreshInterval: 30000, // 30 seconds in ms
    },
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  });
}

// Settings are read-only in admin dashboard
// Modifications would require backend configuration changes via environment variables
