# Temp Mail Setup Guide

The Temp Mail feature gives authenticated CronJob.io users a disposable
receiving address on a dedicated email subdomain:

```
random-id@temp.cronjobs.site
```

This document explains the required DNS, provider, and deployment steps.
It is a manual configuration guide — the application code alone cannot enable
real email reception.

> **Do not** modify the existing MX/DNS records for `cronjobs.site`. The
> temporary mail system operates exclusively on the **temp.cronjobs.site**
> subdomain.

---

## 1. Architecture

- **Domain**: `cronjobs.site` (unchanged — no existing DNS touched)
- **Temp mail domain**: `temp.cronjobs.site`
- **Dashboard route**: `/temp-mail` (requires login)
- **Provider interface**: `src/lib/temp-mail/provider.ts` (`EmailReceiver`)
- **Provider implementations**: `src/lib/temp-mail/providers/`
- **Webhook**: `POST /api/temp-mail/webhook`

The application talks only to the `EmailReceiver` abstraction. Each inbound
provider has its own adapter and its own DNS requirements. The instructions
below use **MailPace** as an example; substitute per your chosen provider.

---

## 2. Create temp.cronjobs.site

In your DNS provider, create a host record for `temp.cronjobs.site` pointing
to the inbound email provider.

### A / CNAME (relevancy depends on provider)

MailPace typically uses an MX-only setup; record the exact values your
provider gives you. Do not hardcode values from this guide — always copy the
records from your provider's onboarding panel.

---

## 3. Configure the provider's MX records

Add the MX record(s) provided by your inbound email provider for
`temp.cronjobs.site`.

Example (MailPace-style — replace with your provider's actual values):

```
Name:  temp.cronjobs.site
Type:  MX
Priority: 10
Value: mx.mailpace.com
```

These MX records are what actually route inbound mail to your provider so it
can deliver to the `/api/temp-mail/webhook` endpoint.

---

## 4. Configure SPF (if required)

If your provider requires SPF for the temp domain, add a TXT record. Only add
this on `temp.cronjobs.site`; do not alter the `cronjobs.site` SPF record.

Example (replace per provider docs):

```
Name:  temp.cronjobs.site
Type:  TXT
Value: v=spf1 include:<provider-spf-include> ~all
```

---

## 5. Configure DKIM (if required)

If your provider requires DKIM, add the DKIM TXT records it provides for
`temp.cronjobs.site`.

Example shape:

```
Name:  tempmail._domainkey.temp.cronjobs.site
Type:  TXT
Value: k=rsa; p=<public-key-from-provider>
```

Use the exact selector/key your provider generates.

---

## 6. Configure webhook / inbound endpoint

In your inbound provider's dashboard, create a webhook that delivers received
mail to:

```
https://cronjobs.site/api/temp-mail/webhook
```

Set the webhook signing secret to the value of `TEMP_MAIL_WEBHOOK_SECRET`.
The webhook handler verifies the provider signature (via the provider adapter)
before storing any message — invalid signatures are rejected.

---

## 7. Add provider credentials to Vercel environment variables

Set these in the Vercel project (server-side only — never prefix with
`NEXT_PUBLIC_`):

```
TEMP_MAIL_PROVIDER=<provider-name>
TEMP_MAIL_DOMAIN=temp.cronjobs.site
TEMP_MAIL_API_KEY=<provider-api-key>
TEMP_MAIL_WEBHOOK_SECRET=<shared-webhook-secret>
TEMP_MAIL_EXPIRATION_MINUTES=30
```

See `.env.example` for the full list and descriptions.

---

## 8. Redeploy

Redeploy the Vercel deployment so the new environment variables and code are
live.

---

## 9. Send a real email to random@temp.cronjobs.site

From any email client, send a message to:

```
random@temp.cronjobs.site
```

Because `temp.cronjobs.site` is a disposable catch-all-style address (matching
how the alias is created), the provider should receive it and forward it to
your webhook.

If the *(random)* local-part does not match an existing alias, the message may
be rejected or forwarded depending on how your provider handles unconfigured
aliases. To test the intended per-user flow, first create a mailbox in the
dashboard and send to the exact address it shows.

---

## 10. Confirm it appears in the Temp Mail inbox

- Log in to the dashboard.
- Open **Temp Mail**.
- Send an email to the displayed address.
- Click **Refresh** (or wait for auto-refresh ~12s) and confirm the message
  appears.

---

## Verification stages

| Stage | Status |
|-------|--------|
| A. Application implementation | Done in code |
| B. Provider configuration | Manual — requires provider account/keys |
| C. DNS configuration | Manual — requires DNS provider changes |
| D. Real email delivery verification | Manual end-to-end test |

Without provider credentials and DNS records, the UI correctly shows
**"Temporary email receiving is not configured."** — no fake emails are shown.

---

# Cloudflare Workers option (recommended)

Instead of a third-party provider + HTTP webhook, you can run the temp-mail
backend on **Cloudflare Workers** using **D1** for storage and **Email
Routing** for inbound delivery. The existing dashboard UI and Next.js routes
work unchanged; they are forwarded to the worker when configured.

## How it fits together

```
email → Cloudflare Email Routing → worker email() handler → D1
                                                                   ↳ (parse + sanitize + store)
dashboard UI → /api/temp-mail/* (Next.js) ──TEMP_MAIL_SERVICE_URL──▶ worker fetch() API → D1
```

- Worker source: `cloudflare-worker/` (own `wrangler.toml`, `package.json`, tests).
- Next.js bridge: `src/lib/temp-mail/bridge.ts` picks the worker when
  `TEMP_MAIL_SERVICE_URL` + `TEMP_MAIL_SERVICE_SECRET` are set, otherwise falls
  back to the MailPace/MongoDB path above (unchanged).
- Read `cloudflare-worker/README.md` for the full manual Cloudflare setup
  (D1 creation, Email Routing catch-all, custom domain, secrets).

## Required environment variables (Next.js / Vercel)

```
TEMP_MAIL_SERVICE_URL=https://api.cronjobs.site
TEMP_MAIL_SERVICE_SECRET=<long-random-secret>
```

`TEMP_MAIL_SERVICE_SECRET` must match the worker secret set with
`npx wrangler secret put TEMP_MAIL_SERVICE_SECRET`. Never commit real values.

## DNS for the Cloudflare path

With Email Routing you still add records for `temp.cronjobs.site`, but they are
provided and managed by the **Cloudflare dashboard's Email Routing wizard**
for the `cronjobs.site` zone (MX + optional TXT SPF/DKIM). Do not copy the
MailPace values above when using Cloudflare Email Routing.
