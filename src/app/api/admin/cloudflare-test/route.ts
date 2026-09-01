import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getCloudflareRuntimeConfig, setCloudflareRuntimeConfig } from "@/lib/cloudflare-config";

const baseUrl = "https://api.cloudflare.com/client/v4";

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const current = await getCloudflareRuntimeConfig();
    
    const accountId = normalizeString(body.accountId || current.accountId || "");
    const zoneId = normalizeString(body.zoneId || current.zoneId || "");
    const d1DatabaseId = normalizeString(body.d1DatabaseId || current.d1DatabaseId || "");
    const workerName = normalizeString(body.workerName || current.workerName || "");
    const apiToken = normalizeString(body.apiToken || current.apiToken || "");
    const now = new Date().toISOString();

    if (!accountId || !apiToken) {
      return NextResponse.json({
        connected: false,
        accountAccessible: false,
        zoneAccessible: false,
        d1Accessible: false,
        lastTested: now,
        message: "Cloudflare authentication failed. Check Account ID and API Token.",
      }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    };

    // Test account access
    const accountRes = await fetch(`${baseUrl}/accounts/${encodeURIComponent(accountId)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!accountRes.ok) {
      await setCloudflareRuntimeConfig({
        accountId,
        zoneId,
        d1DatabaseId,
        workerName,
        apiToken,
        status: "connection-failed",
        connectionMessage: "Cloudflare authentication failed. Check Account ID and API Token.",
        lastTested: now,
      });

      return NextResponse.json({
        connected: false,
        accountAccessible: false,
        zoneAccessible: false,
        d1Accessible: false,
        lastTested: now,
        message: "Cloudflare authentication failed. Check Account ID and API Token.",
      }, { status: 401 });
    }

    // Test zone access if provided
    let zoneAccessible = true;
    if (zoneId) {
      const zoneRes = await fetch(`${baseUrl}/zones/${encodeURIComponent(zoneId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      zoneAccessible = zoneRes.ok;
    }

    // Test D1 database access if provided
    let d1Accessible = true;
    if (d1DatabaseId) {
      const d1Res = await fetch(`${baseUrl}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(d1DatabaseId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      d1Accessible = d1Res.ok;
    }

    // Update connection status
    const isConnected = zoneAccessible && d1Accessible;
    const status = isConnected ? "connected" : zoneAccessible || d1Accessible ? "configuration-required" : "zone-error";
    
    await setCloudflareRuntimeConfig({
      accountId,
      zoneId,
      d1DatabaseId,
      workerName,
      apiToken,
      status,
      connectionMessage: isConnected
        ? "Cloudflare connection successful. All credentials verified."
        : `Cloudflare account connected${zoneAccessible ? ", Zone verified" : ", Zone verification failed"}${d1Accessible ? ", D1 verified" : ", D1 verification failed"}.`,
      lastTested: now,
    });

    return NextResponse.json({
      connected: isConnected,
      accountAccessible: true,
      zoneAccessible,
      d1Accessible,
      lastTested: now,
      message: isConnected
        ? "Cloudflare connection successful. All credentials verified."
        : `Cloudflare account connected${zoneAccessible ? ", Zone verified" : ", Zone verification failed"}${d1Accessible ? ", D1 verified" : ", D1 verification failed"}.`,
    });
  } catch (error) {
    console.error("[Cloudflare Test] Error:", error);
    return NextResponse.json({
      connected: false,
      accountAccessible: false,
      zoneAccessible: false,
      d1Accessible: false,
      lastTested: new Date().toISOString(),
      message: "Cloudflare connection test failed. Check your configuration.",
    }, { status: 500 });
  }
}
