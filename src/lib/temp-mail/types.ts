export interface InboundEmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: string;
  attachmentId: string;
}

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: InboundEmailAttachment[];
  receivedAt: Date;
}

export interface ProviderMailbox {
  providerMailboxId: string;
  publicAddress: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  email?: InboundEmail;
  error?: string;
}

export interface EmailReceiver {
  isConfigured(): boolean;
  createMailbox(address: string): Promise<ProviderMailbox>;
  deleteMailbox(providerMailboxId: string): Promise<void>;
  verifyWebhookSignature(req: Request): Promise<WebhookVerificationResult>;
  parseWebhookBody(body: unknown): InboundEmail;
}
