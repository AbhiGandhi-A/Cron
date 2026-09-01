import type { Env } from "./types";
import { emailHandler } from "./email-handler";
import { handleFetch } from "./api";

/**
 * cloudflare-worker entrypoint.
 *
 * - `email()`  : Cloudflare Email Routing -> this worker (inbound mail for
 *                *@temp.cronjobs.site). Requires dashboard Email Routing
 *                catch-all rule + the [[email_routing]] binding in wrangler.toml.
 * - `fetch()`  : HTTP API for the temp-mail service, consumed by the Next.js
 *                backend (via a shared service secret) and CORS-enabled for
 *                the existing frontend.
 */
export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    await emailHandler(message, env, ctx);
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env, ctx);
  },
};
