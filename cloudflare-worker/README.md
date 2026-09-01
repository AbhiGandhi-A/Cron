# cronjobs-worker — Temporary Email backend (Cloudflare Workers)

Standalone Cloudflare Worker that provides the backend for the temporary email
feature. It receives email via **Cloudflare Email Routing**, stores it in
**D1**, and exposes an HTTP API consumed by the existing Next.js app (on Vercel).

This lives in its own directory (`cloudflare-worker/`) and does **not** replace
any existing Next.js functionality. The Next.js app calls this worker behind a
shared-service-secret gate (see `src/lib/temp-mail/bridge.ts` in the parent
project) OR directly from the browser with CORS enabled.

---

## Architecture

```
email → Cloudflare Email Routing → worker email() handler → D1 (emails table)
                                                    ↘ (parse + sanitize + store)

Next.js app → fetch worker HTTP API (x-temp-mail-service header) → D1
```

- `src/index.ts` — entrypoint, exports both `email()` and `fetch()` handlers.
- `src/email-handler.ts` — Cloudflare Email Routing inbound handler.
- `src/email-parse.ts` — lightweight MIME parser + HTML sanitization.
- `src/api.ts` — HTTP API + CORS + service-secret auth.
- `src/store.ts` — D1 data access (mailboxes, emails, ownership, expiration).
- `src/security.ts` — sanitization (HTML, filenames, MIME) using Web Crypto.
- `src/util.ts` — CSPRNG ids/tokens, SHA-256 hashing, env helpers.
- `src/types.ts` — shared types.
- `migrations/0001_init.sql` — D1 schema.

---

## Manual Cloudflare setup (ONLY once)

These are things you must create in the Cloudflare dashboard — **no values are
invented in this repo**, so deployment will fail until you do them.

1. **D1 database**
   - Dashboard → Workers & Pages → D1 → **Create database**.
   - Name it `cronjobs_temp_mail_db`.
   - Copy the **Database ID** into `wrangler.toml` → `[[d1_databases]] database_id`.
   - Apply the schema:
     ```
     npx wrangler d1 migrations apply cronjobs_temp_mail_db
     ```
     (or `--remote` if you're already logged in / want the real DB).

2. **Email Routing for `temp.cronjobs.site`**
   - Dashboard → Email → Email Routing → enable for the `cronjobs.site` zone
     (must have the MX records + TXT SPF/DKIM records added, as shown in the
     dashboard setup wizard).
   - Add a **Catch-all** rule → **Send to Worker** → select this worker
     (`cronjobs-worker`). This routes `*@temp.cronjobs.site` to the `email()`
     handler. (The routing rule is configured in the dashboard — no wrangler
     `[[email_routing]]` binding is required to receive email.)

3. **Custom domain `api.cronjobs.site`**
   - You said this already exists. The worker route
     `routes = [{ pattern = "api.cronjobs.site/*", ... }]` maps HTTP requests on
     that domain to the worker's `fetch()` handler. If it is not yet attached,
     add it: Dashboard → Workers → your worker → Settings → Domains & Routes →
     **Add custom domain** `api.cronjobs.site`.

4. **Account ID**
   - Set `account_id` at the top of `wrangler.toml` to your Cloudflare account id
     (found in the dashboard URL / Workers overview).

5. **Secrets (never committed)**
   - `TEMP_MAIL_SERVICE_SECRET`: a long random string shared with the Next.js
     app. Stored here as a Worker secret:
     ```
     npx wrangler secret put TEMP_MAIL_SERVICE_SECRET
     ```
   - Other non-secret env vars (domain, expiry, page size) can be set in the
     dashboard (Settings → Variables) or as constants in `wrangler.toml`
     `[vars]` if desired.
   - For local development copy `.dev.vars.example` → `.dev.vars`.

---

## Local development

```bash
npm install
npm run dev          # wrangler dev (http://localhost:8787)
```

## Tests

```bash
npm run typecheck    # tsc --noEmit
npm test             # unit + Miniflare D1 integration tests
```

## Deploy

```bash
npx wrangler login
npx wrangler d1 migrations apply cronjobs_temp_mail_db   # apply schema to prod
npm run deploy       # wrangler deploy
```

With the GitHub integration already configured (repo `AbhiGandhi-A/Cron`,
production branch `main`), Cloudflare can auto-deploy this worker from the
`cloudflare-worker/` directory on push. Note: deployment of a directory-backed
worker is configured in the Cloudflare dashboard (Workers → your worker →
Settings → Triggers → **Build from Git**), pointing at this directory.

---

## Security notes

- The HTML body is sanitized on ingress (scripts, event handlers, `javascript:`
  / `data:text/html` URLs, forbidden tags removed) before storage.
- Attachments are stored as **metadata only**; filenames are sanitized and
  executable MIME types are dropped.
- Mailbox tokens are generated with CSPRNG; only their SHA-256 hash is stored.
  Tokens are verified in constant time.
- The HTTP API is gated by a shared service secret (`TEMP_MAIL_SERVICE_SECRET`)
  and, where relevant, mailbox ownership.
- CORS is enabled so the existing Next.js frontend can talk to it directly.
- Authentication (NextAuth sessions) remains owned by the Next.js app; this
  worker trusts the Next.js backend when the service secret is correct.
