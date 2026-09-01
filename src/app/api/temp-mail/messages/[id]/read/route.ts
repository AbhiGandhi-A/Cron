import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getUserIdFromSession,
  logError,
  validateObjectId,
} from "@/lib/security";
import { markMessageRead } from "@/lib/temp-mail";

const bodySchema = z
  .object({
    mailboxToken: z.string().min(1).max(255),
    publicAddress: z.string().min(1).max(255),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const rawBody = await req.text();
    let parsed: unknown;
    try {
      parsed = rawBody && rawBody.trim() ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const result = bodySchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const marked = await markMessageRead(
      userId,
      result.data.mailboxToken,
      result.data.publicAddress,
      id
    );

    if (!marked) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ read: true });
  } catch (error) {
    logError("temp-mail-messages-read", "Failed to mark message read", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
