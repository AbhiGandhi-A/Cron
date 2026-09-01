import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  getAuthenticatedIdentifier,
  getUserIdFromSession,
  logError,
} from "@/lib/security";
import { getActiveMailbox, isProviderConfigured } from "@/lib/temp-mail";

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`temp-mail:refresh:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (limited) return limited;

    if (!(await isProviderConfigured())) {
      return NextResponse.json(
        { error: "Email receiving is not configured" },
        { status: 503 }
      );
    }

    const rawBody = await req.text();
    let parsed: unknown;
    try {
      parsed = rawBody && rawBody.trim() ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const result = z
      .object({
        mailboxToken: z.string().min(1).max(255),
        publicAddress: z.string().min(1).max(255),
      })
      .safeParse(parsed);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const mailbox = await getActiveMailbox(userId);
    if (!mailbox || mailbox.isExpired) {
      return NextResponse.json({ error: "Mailbox not found or expired" }, { status: 404 });
    }

    if (
      mailbox.publicAddress !== result.data.publicAddress.toLowerCase().trim()
    ) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    return NextResponse.json({ refreshedAt: new Date().toISOString() });
  } catch (error) {
    logError("temp-mail-refresh", "Failed to refresh mailbox", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
