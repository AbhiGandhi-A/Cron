export type {
  InboundEmail,
  InboundEmailAttachment,
  ProviderMailbox,
  WebhookVerificationResult,
  EmailReceiver,
} from "./types";

export { getEmailReceiver } from "./provider";
// The temp-mail operations are bridged: when Cloudflare Workers is configured
// (*TEMP_MAIL_SERVICE_URL* + *TEMP_MAIL_SERVICE_SECRET*) requests go to the
// Cloudflare Worker/D1 backend; otherwise they use the Mongoose service below.
export {
  createMailbox,
  getActiveMailbox,
  deleteMailbox,
  listMessages,
  getMessage,
  markMessageRead,
  deleteMessage,
  isProviderConfigured,
  isUsingCloudflare,
  isValidMessageId,
} from "./bridge";

// Inbound / ownership primitives remain on the existing (Mongoose) service.
export {
  verifyMailboxOwnership,
  storeInboundEmail,
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