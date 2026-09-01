import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getCloudflareConfigFromEnv, maskCloudflareSecret } from "@/lib/cloudflare-config";

const baseUrl = "https://api.cloudflare.com/client/v4";

interface ResourceCheckResult {
  status: "CONNECTED" | "NOT CONFIGURED" | "UNAUTHORIZED" | "NOT FOUND" | "ERROR";
  message: string;
  name?: string | null;
  responseTimeMs?: number;
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const now = new Date().toISOString();
  const config = getCloudflareConfigFromEnv();

  const accountId = config.accountId;
  const zoneId = config.zoneId;
  const d1DatabaseId = config.d1DatabaseId;
  const workerName = config.workerName;
  const apiToken = config.apiToken;

  if (!accountId || !apiToken) {
    return NextResponse.json({
      connected: false,
      status: "NOT CONFIGURED",
      message: "Required Cloudflare environment variables are missing (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN).",
      lastTested: now,
      checks: {
        account: { status: "NOT CONFIGURED", message: "Account ID or API Token missing in environment." },
        zone: zoneId ? { status: "NOT CONFIGURED", message: "Cannot test zone without Account ID and API Token." } : undefined,
        worker: workerName ? { status: "NOT CONFIGURED", message: "Cannot test worker without Account ID and API Token." } : undefined,
        d1: d1DatabaseId ? { status: "NOT CONFIGURED", message: "Cannot test D1 without Account ID and API Token." } : undefined,
      },
    }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Test Account access
    const accountStart = Date.now();
    const accountRes = await fetch(`${baseUrl}/accounts/${encodeURIComponent(accountId)}`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const accountElapsed = Date.now() - accountStart;

    let accountCheck: ResourceCheckResult;
    if (accountRes.status === 401 || accountRes.status === 403) {
      accountCheck = {
        status: "UNAUTHORIZED",
        message: "Invalid API token or insufficient permissions.",
        responseTimeMs: accountElapsed,
      };
    } else if (accountRes.status === 404) {
      accountCheck = {
        status: "NOT FOUND",
        message: `Cloudflare Account ID (${maskCloudflareSecret(accountId)}) not found.`,
        responseTimeMs: accountElapsed,
      };
    } else if (!accountRes.ok) {
      accountCheck = {
        status: "ERROR",
        message: `Account check failed with HTTP status ${accountRes.status}.`,
        responseTimeMs: accountElapsed,
      };
    } else {
      const accountData = await accountRes.json().catch(() => null);
      accountCheck = {
        status: "CONNECTED",
        message: "Account verified successfully.",
        name: accountData?.result?.name || null,
        responseTimeMs: accountElapsed,
      };
    }

    if (accountCheck.status !== "CONNECTED") {
      return NextResponse.json({
        connected: false,
        status: accountCheck.status,
        message: accountCheck.message,
        lastTested: now,
        checks: {
          account: accountCheck,
        },
      });
    }

    // 2. Test Zone access (if configured)
    let zoneCheck: ResourceCheckResult | undefined;
    if (zoneId) {
      const zoneStart = Date.now();
      const zoneRes = await fetch(`${baseUrl}/zones/${encodeURIComponent(zoneId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const zoneElapsed = Date.now() - zoneStart;

      if (zoneRes.status === 401 || zoneRes.status === 403) {
        zoneCheck = { status: "UNAUTHORIZED", message: "Token lacks permission for Zone.", responseTimeMs: zoneElapsed };
      } else if (zoneRes.status === 404) {
        zoneCheck = { status: "NOT FOUND", message: `Zone ID (${maskCloudflareSecret(zoneId)}) not found.`, responseTimeMs: zoneElapsed };
      } else if (!zoneRes.ok) {
        zoneCheck = { status: "ERROR", message: `Zone check failed (HTTP ${zoneRes.status}).`, responseTimeMs: zoneElapsed };
      } else {
        const zoneData = await zoneRes.json().catch(() => null);
        zoneCheck = { status: "CONNECTED", message: "Zone verified successfully.", name: zoneData?.result?.name || null, responseTimeMs: zoneElapsed };
      }
    }

    // 3. Test D1 Database access (if configured)
    let d1Check: ResourceCheckResult | undefined;
    if (d1DatabaseId) {
      const d1Start = Date.now();
      const d1Res = await fetch(`${baseUrl}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(d1DatabaseId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const d1Elapsed = Date.now() - d1Start;

      if (d1Res.status === 401 || d1Res.status === 403) {
        d1Check = { status: "UNAUTHORIZED", message: "Token lacks permission for D1 Database.", responseTimeMs: d1Elapsed };
      } else if (d1Res.status === 404) {
        d1Check = { status: "NOT FOUND", message: `D1 Database ID (${maskCloudflareSecret(d1DatabaseId)}) not found.`, responseTimeMs: d1Elapsed };
      } else if (!d1Res.ok) {
        d1Check = { status: "ERROR", message: `D1 check failed (HTTP ${d1Res.status}).`, responseTimeMs: d1Elapsed };
      } else {
        const d1Data = await d1Res.json().catch(() => null);
        d1Check = { status: "CONNECTED", message: "D1 Database verified successfully.", name: d1Data?.result?.name || null, responseTimeMs: d1Elapsed };
      }
    }

    // 4. Test Worker Script access (if configured)
    let workerCheck: ResourceCheckResult | undefined;
    if (workerName) {
      const workerStart = Date.now();
      const workerRes = await fetch(`${baseUrl}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const workerElapsed = Date.now() - workerStart;

      if (workerRes.status === 401 || workerRes.status === 403) {
        workerCheck = { status: "UNAUTHORIZED", message: "Token lacks permission for Workers.", responseTimeMs: workerElapsed };
      } else if (workerRes.status === 404) {
        workerCheck = { status: "NOT FOUND", message: `Worker script '${workerName}' not found.`, responseTimeMs: workerElapsed };
      } else if (!workerRes.ok) {
        workerCheck = { status: "ERROR", message: `Worker check failed (HTTP ${workerRes.status}).`, responseTimeMs: workerElapsed };
      } else {
        workerCheck = { status: "CONNECTED", message: "Worker script verified successfully.", name: workerName, responseTimeMs: workerElapsed };
      }
    }

    const allConfiguredChecks = [
      accountCheck,
      zoneCheck,
      d1Check,
      workerCheck,
    ].filter((c): c is ResourceCheckResult => c !== undefined);

    const isAllConnected = allConfiguredChecks.every((c) => c.status === "CONNECTED");
    const anyUnauthorized = allConfiguredChecks.some((c) => c.status === "UNAUTHORIZED");
    const anyNotFound = allConfiguredChecks.some((c) => c.status === "NOT FOUND");

    const overallStatus = isAllConnected
      ? "CONNECTED"
      : anyUnauthorized
      ? "UNAUTHORIZED"
      : anyNotFound
      ? "NOT FOUND"
      : "ERROR";

    const overallMessage = isAllConnected
      ? "Cloudflare API authentication and resource access successful."
      : anyUnauthorized
      ? "Authentication succeeded for some resources, but token has unauthorized permissions for others."
      : anyNotFound
      ? "One or more configured Cloudflare resources were not found."
      : "One or more Cloudflare resource verification checks failed.";

    return NextResponse.json({
      connected: isAllConnected,
      status: overallStatus,
      message: overallMessage,
      lastTested: now,
      checks: {
        account: accountCheck,
        zone: zoneCheck,
        d1: d1Check,
        worker: workerCheck,
      },
    });
  } catch (error) {
    console.error("[Cloudflare Test] Execution error:", error);
    return NextResponse.json({
      connected: false,
      status: "ERROR",
      message: error instanceof Error ? error.message : "Cloudflare connection test request failed.",
      lastTested: now,
      checks: {
        account: { status: "ERROR", message: "Network error or timeout during API test." },
      },
    }, { status: 500 });
  }
}

