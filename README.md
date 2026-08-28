# CronJob.io - Self-Hosted Cron Job SaaS

A self-hosted cron job scheduling platform built with Next.js and a standalone Node.js scheduler. Create, manage, and monitor HTTP-based cron jobs with a clean SaaS-style dashboard.

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS v4
- **Backend**: Next.js API Routes (App Router)
- **Database**: MongoDB via Mongoose ODM
- **Authentication**: NextAuth.js (Credentials provider)
- **Scheduler**: Standalone Node.js process (no Vercel Cron, no Cloudflare)

## Prerequisites

- Node.js 18+
- MongoDB (local or MongoDB Atlas)
- npm

## 1. Installation

```bash
git clone <your-repo-url>
cd cron-job-saas
npm install
```

## 2. Database Configuration

### Option A: Local MongoDB

1. Install MongoDB Community Edition
2. The default connection string is `mongodb://localhost:27017/cron_saas`

### Option B: MongoDB Atlas (cloud)

1. Create a free account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a free M0 cluster
3. Create a database user
4. Whitelist your IP address
5. Copy the connection string from "Connect > Drivers"

## 3. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# MongoDB connection string
MONGODB_URI="mongodb://localhost:27017/cron_saas"

# NextAuth secret (generate a strong random string)
NEXTAUTH_SECRET="your-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Scheduler settings
SCHEDULER_POLL_INTERVAL_MS=10000
SCHEDULER_HEARTBEAT_INTERVAL_MS=30000
```

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Seed Sample Data (optional)

```bash
npm run db:seed
```

This creates:
- Test user: `admin@example.com` / `password123`
- 2 sample cron jobs pointing to httpbin.org

MongoDB collections are created automatically on first write - no migrations needed.

## 5. Run the Next.js Application

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 6. Run the Scheduler

In a **separate terminal**:

```bash
npm run scheduler
```

The scheduler starts polling the database for due jobs and executing them. Keep this terminal running.

## How the Scheduler Works

The scheduler is a **standalone Node.js process** that runs on a Render free-tier **Web Service** and is woken/kept alive by an **external EasyCron** request roughly every 10 minutes. It does **not** run on Vercel (Vercel serverless functions have no persistent process, so a polling scheduler there would sleep/throttle) and does **not** require browser activity:

1. **Polls the database** every 10 seconds (configurable) for active jobs where `next_run_at <= now` **or** `next_run_at` is null (legacy/first-run jobs)
2. **Claims the job atomically** via `lockedAt`/`lockedBy` (single `findOneAndUpdate`) — a second worker, the dashboard, and the manual "Run Now" button can never double-execute the same occurrence
3. **Executes the HTTP request** (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) with full support for JSON/form/text bodies and query parameters
4. **Records the result** (`jobexecutions`) with status, HTTP code, response time, request/response details
5. **Validates outbound URLs** (SSRF protection) before every scheduler request AND notification request
6. **Retries** on failure with exponential backoff up to `retryCount`, while **timeouts are recorded as `TIMEOUT`** (not silently retried forever)
7. **Computes `nextRunAt` per-job with its `timezone`** (cron-parser with `tz`), then releases the lock — `nextRunAt` is the source of truth
8. **Isolates failures** — one failing job never stops the loop; unexpected errors just skip that job
9. **Recovers after crashes** — stale locks (older than `SCHEDULER_LOCK_EXPIRY_MS`) are reclaimed, stuck `RUNNING`/`RETRY` executions are marked `FAILED`, and missed jobs are caught up
10. **Writes a heartbeat** every 30 seconds so the dashboard can show ONLINE/OFFLINE, and exits with code 1 on uncaught errors so the host restarts it

### Architecture

```
scheduler/
├── index.ts             # Entry point: signals, crash-isolation exit, health/wake server
├── health.ts            # 0.0.0.0:$PORT HTTP server: GET /health, GET /wake (never executes jobs)
├── scheduler.ts         # Main loop, atomic claims, heartbeat, catch-up recovery
├── worker.ts            # Per-job processing, lock release, nextRunAt advance
├── executor.ts          # Re-exports the shared execution engine
├── retry.ts             # Retry loop with exponential backoff (shared core)
├── database.ts          # MongoDB connection
├── models.ts            # CronJob model (matches src/lib/models/CronJob.ts)
├── jobExecutionModel.ts # Execution history model
├── heartbeatModel.ts    # Scheduler heartbeat model
├── logger.ts            # Structured, redacted logging
└── tsconfig.json
```

The database is the **source of truth** for scheduling. `next_run_at` determines when jobs run. The scheduler does not rely on `setInterval` for job timing — it polls the database state. Execution logic lives in **`src/lib/execution-core.ts`** and is shared between the scheduler and the dashboard's "Run Now", so both behave identically.

## 7. Testing a Cron Job Locally

### Quick test with httpbin.org

1. Register/login to the dashboard
2. Click "New Job"
3. Create a job with:
   - URL: `https://httpbin.org/get`
   - Method: GET
   - Schedule: Every 1 minute
4. Click "Create Job"
5. Click the "Run Now" button (play icon)
6. Check execution results

### Test with your own API

1. Create a job pointing to your local/production API
2. Use appropriate method, headers, and body
3. Set a schedule and enable the job
4. The scheduler will execute it at the configured interval

### Verify scheduler is running

Check the terminal where you ran `npm run scheduler` - you'll see log output like:

```
[INFO] [scheduler] Connecting to MongoDB...
[INFO] [scheduler] MongoDB connected
[INFO] [scheduler] Worker started (id=..., host=..., pid=...)
[INFO] [scheduler] Scheduler loop started
[INFO] [worker] Claimed job <id>: Example Health Check
[INFO] [worker] Executing job <id> -> GET https://httpbin.org/get
[INFO] [worker] Job <id> completed: SUCCESS (HTTP 200 in 1500ms)
[INFO] [worker] Next run for <id>: <iso timestamp>
```

## 8. Restart Recovery

If the scheduler stops (laptop shutdown, crash, restart), **no jobs are lost**:

1. All schedule state is in the database (`next_run_at`)
2. When the scheduler starts, it detects missed jobs (`next_run_at < now`) and stale locks/executions
3. **Default behavior**: Run each missed job **once**, capped at `SCHEDULER_MAX_CATCHUP_JOBS` (default 50) to avoid an execution flood after a long outage; any further overdue jobs are rescheduled without running
4. After running, the next `next_run_at` is calculated normally in the job's timezone

### Missed Job Policy

Configured in `scheduler/scheduler.ts`:

- **Run once after recovery** (default): Execute each missed job one time
- **Skip missed**: Update `next_run_at` to the next valid time without executing
- **Run all missed**: Execute all missed intervals sequentially

## 9. Deploying the Scheduler to Render as a Web Service (production)

Host the Next.js app on Vercel, and the scheduler on Render as a **free-tier Web Service** that is woken/kept alive by an external uptime cron (**cron-job.org**) calling Render's `/health`. This is intentional (not a paid Background Worker) — Render free Web Services sleep after ~15 min of no inbound traffic, and cron-job.org keeps the scheduler woken:

```
USER CREATES JOB → VERCEL (saves to MongoDB) → MONGODB ATLAS →
cron-job.org (GET https://<YOUR-RENDER-URL>/health) → RENDER SCHEDULER →
MONGODB POLL → JOB EXECUTES → EXECUTION SAVED → nextRunAt ADVANCES → NEXT EXECUTION
```

cron-job.org and Vercel only generate/gate inbound traffic — **they never execute jobs.** The Render scheduler decides what is due from MongoDB. A token-protected Vercel wake relay (`GET /api/wake-render`) also exists as a fallback, but the direct path is primary.

> **Why a 30-minute cron-job.org schedule works.** A free Render Web Service sleeps after ~15 minutes of no inbound traffic, and Render answers the first request after a sleep with a verbose **HTML 502 cold-start page**. cron-job.org buffers the entire page and, because its output limit is small (~4 kB, see cron-job.org's "output too large" docs), marks the execution as **Failed (output too large)** — exactly what you saw at every 30-minute ping. The scheduler therefore **self-pings its own `RENDER_EXTERNAL_URL/health` every 2 minutes** (`SCHEDULER_KEEPALIVE_INTERVAL_MS`, default `120000`) from `scheduler/health.ts`. That inbound traffic resets the idle timer, so the instance never sleeps and every cron-job.org ping is answered by our tiny `/health` response instead of a cold-start error page. A self-ping can never wake an *already* sleeping instance, so keep the first deploy honest: any request to `/`, `/health`, or `/wake` after a genuine cold boot returns the small response as soon as boot completes.

1. Create a `render.yaml`-based Blueprint (included in this repo) or a manual **Web Service**:
   - **Type**: Web Service (free tier) — NOT a paid Background Worker
   - **Build command**: `npm install` (must keep dev dependencies so `tsx` is available)
   - **Start command**: `npm run scheduler` — the same long-running process (a) runs the Mongo scheduler loop and (b) binds `0.0.0.0:$PORT` serving `GET /health`, `GET /wake`, and `GET /` (tiny `OK`), plus (c) self-pings `/health` every 2 minutes to prevent free-tier idle sleep
   - **Runtime**: Node
2. Set the same env vars on both Vercel and Render (Render: `MONGODB_URI`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_SECRET`, `RATELIMIT_SECRET`, `CSRF_SECRET`, `HEADER_ENCRYPTION_KEY`, `SCHEDULER_API_TOKEN`). Keys used to encrypt job headers must match across hosts (`MONGODB_URI` and `HEADER_ENCRYPTION_KEY` must MATCH between Vercel and Render). Render also injects `RENDER_EXTERNAL_URL` (used by the self keep-alive) and `PORT`.
3. Deploy. The Render Web Service connects to the **same MongoDB** as Vercel — no network link between them is needed.
4. Configure **cron-job.org** to call **`https://<YOUR-RENDER-DOMAIN>/health`** on your chosen schedule (e.g. every 30 minutes). Expected result every run: **HTTP 200**, `Content-Type: application/json`, body `{"status":"ok","scheduler":"running","uptime":…}` (≈60 bytes, far below cron-job.org's output cap). The self keep-alive keeps the instance warm between pings, and `/health` never executes jobs or starts a second scheduler — it only generates inbound traffic. If your cron-job.org job uses the bare domain, it now also gets `HTTP 200 text/plain "OK"`.
5. Expected logs on Render: `[INFO] [scheduler] Connecting to MongoDB...`, `Worker started (id=..., host=..., pid=...)`, `Health/wake server listening on 0.0.0.0:<port>`, `Self keep-alive enabled: pinging https://…/health every 120000ms`, `Scheduler loop started`, then per-cycle `Found N due job(s)` and `Job <id> completed: SUCCESS (HTTP 200 ...)`.
6. Verify liveness on the dashboard ("Scheduler" status must show ONLINE) or via `GET /api/scheduler`.

> Accurate terminology: a Render **free** Web Service is **kept awake by the scheduler's own 2-minute self-ping**, with cron-job.org acting as an external watchdog/wake. It is not "always-on" in the paid sense. If the instance ever genuinely sleeps (e.g. after a deploy or a >15-min self-ping outage), scheduled execution cannot be guaranteed during that sleeping window; on wake, the scheduler detects overdue `nextRunAt` jobs and applies the catch-up policy (item 8), so it never floods duplicates. An always-awake free service consumes ~744 of the ~750 monthly free instance hours — budget accordingly.

### Process management with PM2 (VPS alternative)

```bash
npm install -g pm2
pm2 start npm --name "cron-scheduler" -- run scheduler
pm2 save
pm2 startup
```

## 10. Future Payment/Billing Integration

The database schema includes placeholders for future payment support:

- `users.plan` - "free" by default
- `users.maxJobs` - Job limit (default: 10)
- `users.maxExecutions` - Monthly execution limit (default: 1000)

### Where to add billing

1. **Database**: Add `subscriptions` and `billing` collections
2. **API middleware**: Check execution limits before running jobs
3. **Dashboard**: Add plan upgrade UI in Settings page
4. **Scheduler**: Add monthly usage tracking to heartbeat

No payment code exists in this MVP. Do NOT add fake pricing pages.

## 11. AI Dev Assistant (optional)

A passive monitoring + analysis layer powered by Groq (OpenAI-compatible API, AI key from [console.groq.com](https://console.groq.com/keys)) that never changes how jobs, the scheduler, or the API Tester behave, and degrades gracefully if no key is configured.

### Enabling it

Add to `.env` (server-side only, never sent to the browser):

```env
GROK_API_KEY="gsk_your-groq-key"
GROK_MODEL="llama-3.3-70b-versatile"
AI_ANALYSIS_ENABLED="true"
```

Without a key, everything still runs: issues are captured and stored, and every AI action returns a friendly "AI is not configured" message instead of crashing.

### What it does

- **Frontend + API monitoring** - a small client library (`src/lib/monitoring/client.ts`) wraps `fetch`/XHR, captures uncaught errors, failed requests and slow requests, fingerprints + redacts them (passwords, tokens, API keys, URLs wiped), and stores them as `AiIssue` documents. Deduplication, auto-open on critical errors, analyze-on-error, and slow-request thresholds are toggles in **Settings &rarr; AI Dev Assistant** (stored per browser in localStorage).
- **AI Assistant panel** - the floating button opens a drawer with the issue list, per-issue Groq analysis (root cause / fix / impact / prevention), "Copy fix", "Retry failed operation" (replays the stored request and records the result), resolve/reopen, clear, and a follow-up chat scoped to the issue plus a standalone chat.
- **Generate API** (`/generate-api` page) - describe an endpoint in plain English; Groq proposes a config that is **strictly validated** (zod) and only **allowlisted** sources/collections/fields/methods can be exposed. The result is a live endpoint at `/api/public/<agentId>` with chooseable auth (`public`, `api-key`, `bearer`, `private` - the last is locked to the signed-in session), CORS rules, per-API rate limiting, and per-day request analytics. Secrets are stored hashed (`sha256`) and only shown once at creation.

### Calling a generated API

```
# public
GET https://<app>/api/public/<agentId>

# api-key
curl https://<app>/api/public/<agentId> -H "x-api-key: <secret>"

# bearer
curl https://<app>/api/public/<agentId> -H "Authorization: Bearer <secret>"

# private (same logged-in session/browser cookie)
```

### AI endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/status` | AI configuration status (configured, model, enabled) |
| POST | `/api/ai/analyze` | Analyze an error now (rate limited; failure still records the issue) |
| GET/DELETE | `/api/ai/issues` | List / clear issues (`?status=open|resolved|all`) |
| GET/PATCH | `/api/ai/issues/[id]` | Issue detail / resolve, reopen, severity changes |
| POST | `/api/ai/issues/[id]/retry` | Re-run the stored failed request |
| POST | `/api/ai/chat` | Follow-up chat (issue-scoped or standalone) |
| GET | `/api/ai/monitoring` | Dashboard widget summary (open/critical/pending) |
| POST | `/api/ai/create-api` | AI-generate a new API from a description |
| GET/POST | `/api/generated-apis` | List / create generated APIs |
| GET/PATCH/DELETE | `/api/generated-apis/[id]` | View / update / delete |
| POST | `/api/generated-apis/[id]/regenerate` | Rotate the API secret |
| GET/POST/PUT/PATCH/DELETE | `/api/public/[token]` | Live generated-API endpoints (public, bypasses the dashboard auth middleware) |

### Tests

AI-specific tests run with the rest of the suite (`npm test`): `tests/ai-redaction.test.ts`, `tests/ai-grok.test.ts` (injected fake transport, no network), `tests/ai-validate.test.ts`, and `tests/ai-models.test.ts` (in-memory MongoDB for issues, generated-API auth/execution, analytics, CORS).

## Project Structure

```
cron-job-saas/
├── scheduler/              # Standalone scheduler process
│   ├── index.ts
│   ├── scheduler.ts
│   ├── worker.ts
│   ├── executor.ts
│   ├── retry.ts
│   ├── database.ts
│   ├── models.ts
│   ├── jobExecutionModel.ts
│   ├── heartbeatModel.ts
│   ├── logger.ts
│   └── tsconfig.json
├── src/
│   ├── app/
│   │   ├── (dashboard)/    # Dashboard pages (protected)
│   │   │   ├── page.tsx
│   │   │   ├── jobs/
│   │   │   └── settings/
│   │   ├── api/            # API routes
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── jobs/
│   │   │   └── scheduler/
│   │   ├── auth/           # Auth pages
│   │   ├── layout.tsx
│   │   └── providers.tsx
│   ├── components/         # Reusable UI components
│   └── lib/
│       ├── auth.ts
│       ├── mongodb.ts      # MongoDB connection
│       ├── execution-core.ts # Shared HTTP execution engine (Vercel + scheduler)
│       ├── cron.ts         # Timezone-aware computeNextRunAt / isValidTimeZone
│       ├── models/         # Mongoose models
│       │   ├── User.ts
│       │   ├── CronJob.ts
│       │   ├── JobExecution.ts
│       │   ├── SchedulerHeartbeat.ts
│       │   └── index.ts
│       ├── utils.ts
│       └── validation.ts
├── seed.ts                 # Sample data seeder
├── .env.example
├── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| GET/POST | `/api/auth/[...nextauth]` | Login/session |
| GET | `/api/dashboard` | Dashboard stats |
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs` | Create new job |
| GET | `/api/jobs/[id]` | Get job details |
| PUT | `/api/jobs/[id]` | Update job |
| DELETE | `/api/jobs/[id]` | Delete job |
| POST | `/api/jobs/[id]/toggle` | Enable/disable job |
| POST | `/api/jobs/[id]/trigger` | Manually run job |
| GET | `/api/jobs/[id]/history` | Get execution history |
| GET | `/api/scheduler` | Scheduler health status |
| GET | `/api/wake-render` | Vercel→Render wake relay (token-protected, fixed URL) |
| GET | `/api/ai/status` | AI configuration status |
| POST | `/api/ai/analyze` | Analyze an error with Groq |
| GET/PATCH | `/api/ai/issues/[id]` | Issue detail / resolve / severity |
| POST | `/api/ai/issues/[id]/retry` | Re-run a stored failed request |
| POST | `/api/ai/chat` | AI follow-up chat |
| POST | `/api/ai/create-api` | Generate an API from a description |
| GET/POST | `/api/generated-apis` | List / create generated APIs |
| DELETE | `/api/generated-apis/[id]` | Delete a generated API |
| GET/POST/PUT/PATCH/DELETE | `/api/public/[token]` | Live generated-API endpoints (no dashboard auth) |

## License

MIT
