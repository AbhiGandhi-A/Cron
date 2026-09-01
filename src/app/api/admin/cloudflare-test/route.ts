import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";

const baseUrl = "https://api.cloudflare.com/client/v4";

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = normalizeString(body.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || "");
    const zoneId = normalizeString(body.zoneId || process.env.CLOUDFLARE_ZONE_ID || "");
    const apiToken = normalizeString(body.apiToken || process.env.CLOUDFLARE_API_TOKEN || "");
    const now = new Date().toISOString();

    if (!accountId || !apiToken) {
      return NextResponse.json({
        connected: false,
        accountAccessible: false,
        zoneAccessible: false,
        lastTested: now,
        message: "Cloudflare authentication failed. Check Account ID, Zone ID and API Token.",
      }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    };

    const accountRes = await fetch(`${baseUrl}/accounts/${encodeURIComponent(accountId)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!accountRes.ok) {
      return NextResponse.json({
        connected: false,
        accountAccessible: false,
        zoneAccessible: false,
        lastTested: now,
        message: "Cloudflare authentication failed. Check Account ID, Zone ID and API Token.",
      }, { status: 401 });
    }

    let zoneAccessible = true;
    if (zoneId) {
      const zoneRes = await fetch(`${baseUrl}/zones/${encodeURIComponent(zoneId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      zoneAccessible = zoneRes.ok;
    }

    return NextResponse.json({
      connected: true,
      accountAccessible: true,
      zoneAccessible,
      lastTested: now,
      message: zoneAccessible
        ? "Cloudflare authentication succeeded and the account is accessible."
        : "Cloudflare account connected, but Zone ID could not be verified.",
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      accountAccessible: false,
      zoneAccessible: false,
      lastTested: new Date().toISOString(),
      message: "Cloudflare authentication failed. Check Account ID, Zone ID and API Token.",
    }, { status: 500 });
  }
}
