import { NextResponse } from "next/server";
import { getEmailReceiver } from "@/lib/temp-mail";
import { storeInboundEmail } from "@/lib/temp-mail/service";
import { logError } from "@/lib/security";

export async function POST(req: Request) {
  try {
    const provider = getEmailReceiver();
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: "Email receiving is not configured" },
        { status: 404 }
      );
    }

    const sizeLimit = 2 * 1024 * 1024;
    if ((req.headers.get("content-length") && Number(req.headers.get("content-length")) > sizeLimit)) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const verification = await provider.verifyWebhookSignature(req);
    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || "Invalid signature" },
        { status: 401 }
      );
    }

    if (!verification.email) {
      return NextResponse.json({ error: "Invalid webhook body" }, { status: 400 });
    }

    const stored = await storeInboundEmail(verification.email);

    if (!stored) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("temp-mail-webhook", "Failed to process webhook", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
