import type { Env } from "./types";
import { TempMailStore } from "./store";
import { parseEmailMessage, prepareForStorage } from "./email-parse";

/**
 * Cloudflare Email Routing -> Worker handler.
 *
 * Cloudflare delivers email addressed to `*@temp.cronjobs.site` here once the
 * dashboard's Email Routing "Catch-all" rule for that zone is pointed at this
 * worker. Every inbound message is parsed, the HTML body sanitized, and
 * metadata + sanitized bodies stored in D1.
 *
 * Notes:
 * - `setReject()` must be called synchronously (before this handler returns),
 *   so it is only used for the fast-path domain check below.
 * - If no active mailbox matches the recipient, the email is silently dropped
 *   in the background task (there is nothing meaningful to reject by then).
 */
export async function emailHandler(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
  const domain = (env.TEMP_MAIL_DOMAIN || "temp.cronjobs.site").toLowerCase().trim();
  const toAddress = typeof message.to === "string" ? message.to.trim().toLowerCase() : "";
  if (toAddress && !toAddress.endsWith(`@${domain}`)) {
    message.setReject("Address not on this domain");
    return;
  }

  const store = new TempMailStore(env);

  // Defer the (CPU-heavy) parse + write to the execution context.
  ctx.waitUntil(
    parseEmailMessage(message)
      .then(prepareForStorage)
      .then(async (email) => {
        // If the target mailbox doesn't exist or is expired, it is dropped.
        await store.storeInboundEmail(email);
      })
      .catch((err) => {
        console.error("temp-mail: failed to process inbound email", err);
      }),
  );
}