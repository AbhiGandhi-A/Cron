import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  getAuthenticatedIdentifier,
  getUserIdFromSession,
  logError,
  validatePaginationParams,
} from "@/lib/security";
import { listMessages } from "@/lib/temp-mail";

export async function GET(req: Request) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`temp-mail:messages:list:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const mailboxToken = (searchParams.get("mailboxToken") || "").trim();
    const publicAddress = (searchParams.get("publicAddress") || "").trim();
    const { page, limit } = validatePaginationParams(searchParams);

    if (!mailboxToken || !publicAddress) {
      return NextResponse.json({ error: "Missing mailbox credentials" }, { status: 400 });
    }

    const parsedPage = Math.max(1, page);
    const parsedLimit = Math.max(1, Math.min(100, limit));

    const result = await listMessages(userId, mailboxToken, publicAddress, parsedPage, parsedLimit);
    if (!result) {
      return NextResponse.json({ error: "Mailbox not found or expired" }, { status: 404 });
    }

    return NextResponse.json({ ...result });
  } catch (error) {
    logError("temp-mail-messages-list", "Failed to list messages", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
