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

The scheduler is a **standalone Node.js process** that:

1. **Polls the database** every 10 seconds (configurable) for active jobs where `next_run_at <= now`
2. **Executes the HTTP request** (GET, POST, PUT, PATCH, DELETE) to the configured URL
3. **Records the result** (status, HTTP code, response time, errors) in `jobexecutions`
4. **Retries** on failure with exponential backoff (configurable retry count)
5. **Calculates the next run time** using the cron expression
6. **Prevents duplicate execution** via the `is_running` flag
7. **Continues running** even if one job fails - errors are isolated per job
8. **Updates a heartbeat** in the database every 30 seconds

### Architecture

```
scheduler/
├── index.ts             # Entry point, handles signals and startup
├── scheduler.ts         # Main loop, heartbeat, missed job recovery
├── worker.ts            # Processes individual jobs
├── executor.ts          # Makes the actual HTTP requests
├── retry.ts             # Handles retry logic with exponential backoff
├── database.ts          # MongoDB connection
├── models.ts            # CronJob model
├── jobExecutionModel.ts # Execution history model
├── heartbeatModel.ts    # Scheduler heartbeat model
├── logger.ts            # Structured logging
└── tsconfig.json
```

The database is the **source of truth** for scheduling. `next_run_at` determines when jobs run. The scheduler does not rely on `setInterval` for job timing - it polls the database state.

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
[2026-08-26T12:00:00.000Z] [INFO] [scheduler] Processing 1 due job(s)
[2026-08-26T12:00:00.001Z] [INFO] [executor] Executing GET https://httpbin.org/get
[2026-08-26T12:00:01.500Z] [INFO] [executor] Completed: HTTP 200 in 1500ms
```

## 8. Restart Recovery

If the scheduler stops (laptop shutdown, crash, restart), **no jobs are lost**:

1. All schedule state is in the database (`next_run_at`)
2. When the scheduler starts, it detects missed jobs (`next_run_at < now`)
3. **Default behavior**: Run each missed job **once** (configurable)
4. After running, the next `next_run_at` is calculated normally

### Missed Job Policy

Configured in `scheduler/scheduler.ts`:

- **Run once after recovery** (default): Execute each missed job one time
- **Skip missed**: Update `next_run_at` to the next valid time without executing
- **Run all missed**: Execute all missed intervals sequentially

## 9. Moving the Scheduler to a VPS

The scheduler is already designed for this. To move it:

1. Clone the repo on your VPS
2. Copy your `.env` file (same `MONGODB_URI`)
3. Run `npm install`
4. Run `npm run scheduler`

The scheduler connects to the **same MongoDB database**, so it picks up all jobs immediately. The Next.js app and scheduler communicate through the database, not directly.

### Recommended setup

```
VPS (always on):
├── Next.js app (port 3000, behind nginx)
└── Scheduler process (npm run scheduler)
```

### Process management with PM2

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

## License

MIT
