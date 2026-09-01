import type {
  EmailReceiver,
  ProviderMailbox,
  WebhookVerificationResult,
  InboundEmail,
} from "../types";

export class MailPaceProvider implements EmailReceiver {
  private getApiKey(): string {
    return process.env.TEMP_MAIL_API_KEY || "";
  }

  private getWebhookSecret(): string {
    return process.env.TEMP_MAIL_WEBHOOK_SECRET || "";
  }

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  async createMailbox(address: string): Promise<ProviderMailbox> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("MailPace API key not configured");

    const domain = address.split("@")[1];

    const res = await fetch(`https://app.mailpace.com/api/domains/${domain}/aliases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MailPace-API-Token": apiKey,
      },
      body: JSON.stringify({
        alias: address.split("@")[0],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MailPace alias creation failed: ${res.status} ${text}`);
    }

    const data = await res.json() as { id?: string; alias?: string };

    return {
      providerMailboxId: data.id || address,
      publicAddress: address,
    };
  }

  async deleteMailbox(providerMailboxId: string): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) return;

    try {
      await fetch(`https://app.mailpace.com/api/domains/aliases/${providerMailboxId}`, {
        method: "DELETE",
        headers: {
          "MailPace-API-Token": apiKey,
        },
      });
    } catch {
      /* best effort */
    }
  }

  async verifyWebhookSignature(req: Request): Promise<WebhookVerificationResult> {
    const secret = this.getWebhookSecret();
    if (!secret) {
      return { valid: false, error: "Webhook secret not configured" };
    }

    const signature = req.headers.get("x-mailpace-signature") || req.headers.get("x-webhook-signature");
    if (!signature) {
      return { valid: false, error: "Missing webhook signature" };
    }

    const rawBody = await req.text();

    const crypto = await import("node:crypto");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { valid: false, error: "Invalid webhook signature" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { valid: false, error: "Invalid JSON body" };
    }

    const email = this.parseWebhookBody(parsed);
    return { valid: true, email };
  }

  parseWebhookBody(body: unknown): InboundEmail {
    const data = body as Record<string, unknown>;

    const from = typeof data.from === "string" ? data.from : "";
    const to = typeof data.to === "string" ? data.to : "";
    const subject = typeof data.subject === "string" ? data.subject : "";
    const textBody = typeof data.textBody === "string" ? data.textBody : typeof data.text === "string" ? data.text : "";
    const htmlBody = typeof data.htmlBody === "string" ? data.htmlBody : typeof data.html === "string" ? data.html : "";

    const rawAttachments = Array.isArray(data.attachments) ? data.attachments : [];
    const attachments = rawAttachments.map((a: unknown) => {
      const att = a as Record<string, unknown>;
      return {
        filename: typeof att.filename === "string" ? att.filename : "unknown",
        contentType: typeof att.contentType === "string" ? att.contentType : "application/octet-stream",
        size: typeof att.size === "number" ? att.size : 0,
        attachmentId: typeof att.id === "string" ? att.id : typeof att.attachmentId === "string" ? att.attachmentId : "",
      };
    });

    const receivedAt = data.date
      ? new Date(String(data.date))
      : data.receivedAt
        ? new Date(String(data.receivedAt))
        : new Date();

    return {
      messageId: typeof data.id === "string" ? data.id : typeof data.messageId === "string" ? data.messageId : `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      subject,
      textBody,
      htmlBody,
      attachments,
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    };
  }
}
