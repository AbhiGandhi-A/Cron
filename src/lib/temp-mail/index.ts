export type {
  InboundEmail,
  InboundEmailAttachment,
  ProviderMailbox,
  WebhookVerificationResult,
  EmailReceiver,
} from "./types";

export { getEmailReceiver } from "./provider";
export {
  createMailbox,
  getActiveMailbox,
  deleteMailbox,
  verifyMailboxOwnership,
  storeInboundEmail,
  listMessages,
  getMessage,
  markMessageRead,
  deleteMessage,
  isProviderConfigured,
} from "./service";

export {
  generateMailboxId,
  generateMailboxToken,
  hashMailboxToken,
  getExpirationMinutes,
  getTempMailDomain,
} from "./token";

export {
  sanitizeHtml,
  sanitizeFilename,
  isSafeAttachmentMimeType,
} from "./security";
