export interface Env {
  DB: D1Database;
  TEMP_MAIL_SERVICE_SECRET?: string;
  TEMP_MAIL_DOMAIN?: string;
  TEMP_MAIL_EXPIRATION_MINUTES?: string;
  TEMP_MAIL_PAGE_SIZE?: string;
  TEMP_MAIL_APP_NAME?: string;
}

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
}

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  receivedAt: string;
  attachments?: AttachmentMeta[];
}

export interface MailboxSummary {
  id: string;
  ownerId?: string;
  publicAddress: string;
  mailboxToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface EmailSummary {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  size: number;
  attachments: AttachmentMeta[];
}

export interface EmailDetail extends EmailSummary {
  bodyText: string | null;
  bodyHtml: string | null;
  messageId: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
