import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  getAuthenticatedIdentifier,
  getUserIdFromSession,
  logError,
  validateObjectId,
} from "@/lib/security";
import { getMessage, markMessageRead, deleteMessage } from "@/lib/temp-mail";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`temp-mail:messages:get:${getAuthenticatedIdentifier(userId)}`, 40, 60_000);
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const mailboxToken = (searchParams.get("mailboxToken") || "").trim();
    const publicAddress = (searchParams.get("publicAddress") || "").trim();

    if (!mailboxToken || !publicAddress) {
      return NextResponse.json({ error: "Missing mailbox credentials" }, { status: 400 });
    }

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const message = await getMessage(userId, mailboxToken, publicAddress, id);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ message });
  } catch (error) {
    logError("temp-mail-messages-get", "Failed to get message", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`temp-mail:messages:delete:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const mailboxToken = (searchParams.get("mailboxToken") || "").trim();
    const publicAddress = (searchParams.get("publicAddress") || "").trim();

    if (!mailboxToken || !publicAddress) {
      return NextResponse.json({ error: "Missing mailbox credentials" }, { status: 400 });
    }

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const deleted = await deleteMessage(userId, mailboxToken, publicAddress, id);
    if (!deleted) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    logError("temp-mail-messages-delete", "Failed to delete message", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
