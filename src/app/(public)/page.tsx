import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, PROD_URL } from "@/lib/site";

const SITE_URL = PROD_URL;

export const metadata: Metadata = {
  title: "Free Online Cron Job Scheduler, API Tester and Webhook Monitor",
  description:
    "CronJobs — schedule free online cron jobs with CronJob.site. Create, run and monitor HTTP cron jobs, webhook test URLs, API tests and uptime checks with our cron job scheduler.",
  alternates: { canonical: "/" },
  keywords: [
    "cron",
    "cron jobs",
    "cronjobs",
    "cron job free",
    "cronjobfree",
    "cron job scheduler",
    "free cron job",
  ],
  openGraph: {
    title: `${SITE_NAME} - Free Cron Job Scheduler, API Tester and Webhook Monitoring`,
    description:
      "Schedule free online cron jobs with CronJob.site. Cron job scheduler, API tester, webhook monitoring and uptime checks in one dashboard.",
    url: SITE_URL,
    type: "website",
  },
};

function Feature({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="w-11 h-11 bg-brand-50 rounded-xl flex items-center justify-center mb-4 text-brand-600">
        {icon}
      </div>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-2 leading-relaxed">{desc}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 via-white to-brand-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold">
              Free &amp; self-hosted
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900">
              Schedule, test and monitor your{" "}
              <span className="text-brand-600">cron jobs</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed">
              Cron Job Free lets you create HTTP cron jobs that run on a fixed
              schedule, verify every response, and catch failures the moment
              they happen. Debug your endpoints with an API tester and webhook
              test URLs, and let an AI dev assistant help you trace issues.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/auth/register"
                className="px-6 py-3 bg-brand-600 text-white text-base font-semibold rounded-xl hover:bg-brand-700 shadow-lg shadow-brand-600/30 text-center"
              >
                Get started free
              </Link>
              <Link
                href="/auth/login"
                className="px-6 py-3 bg-white text-gray-800 text-base font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 text-center"
              >
                Log in to your account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
              Everything you need to run reliable scheduled tasks
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Built for developers who want a cron scheduler, an API testing
              workbench and monitoring in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Feature
              title="Cron job scheduling"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              desc="Create HTTP cron jobs that hit your endpoints on a schedule. Choose built-in intervals or write your own cron expression, and set the timezone to match your clocks."
            />
            <Feature
              title="Response verification"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              desc="Set an expected status code and/or a pattern to find in the response body. A run only counts as successful when it matches your checks."
            />
            <Feature
              title="API tester"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              }
              desc="Experiment fast. Pick a method, add headers, query parameters and a body, then inspect the full response including status, timing, size and headers."
            />
            <Feature
              title="Webhook test URLs"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.813a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              }
              desc="Register the endpoints you care about and watch them get checked. Capture responses for each URL to confirm behavior before wiring them into a job."
            />
            <Feature
              title="Monitoring &amp; logs"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              desc="Every run is recorded with its full request and response. Filter by successful, failed, 4xx, 5xx or timeout, and expand any entry to inspect bodies and headers."
            />
            <Feature
              title="AI dev assistant"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              }
              desc="Capture frontend errors and API failures and get root-cause and fix suggestions. Analyze issues and ask the assistant for help, all from the dashboard."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
              How it works
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Go from idea to running cron job in a few minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                n: "1",
                t: "Create a job",
                d: "Give your cron job a name, the URL, HTTP method, headers and any query parameters or request body it needs.",
              },
              {
                n: "2",
                t: "Choose a schedule",
                d: "Run every 1, 5, 15 or 30 minutes, hourly or daily, or write your own cron expression for full control.",
              },
              {
                n: "3",
                t: "Verify responses",
                d: "Set the expected status code and body pattern so a run only succeeds when it matches your checks.",
              },
              {
                n: "4",
                t: "Monitor &amp; debug",
                d: "Watch live stats and logs. The AI dev assistant can analyze errors so you find and fix problems faster.",
              },
            ].map((s) => (
              <div key={s.n} className="relative">
                <div className="w-10 h-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center shadow-lg shadow-brand-600/30">
                  {s.n}
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{s.t}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <Link
              href="/auth/register"
              className="inline-block px-6 py-3 bg-brand-600 text-white text-base font-semibold rounded-xl hover:bg-brand-700 shadow-lg shadow-brand-600/30"
            >
              Create your first cron job
            </Link>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-brand-700 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Start scheduling for free
          </h2>
          <p className="mt-4 text-lg text-brand-100">
            No payment required. Sign up, create a job and see your first
            scheduled run within minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/auth/register"
              className="px-6 py-3 bg-white text-brand-700 text-base font-semibold rounded-xl hover:bg-brand-50"
            >
              Sign up free
            </Link>
            <Link
              href="/auth/login"
              className="px-6 py-3 text-white text-base font-semibold rounded-xl border border-brand-500 hover:bg-brand-600"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 text-center">
            Frequently asked questions
          </h2>
          <div className="mt-10 space-y-6">
            {[
              {
                q: "What is a cron job?",
                a: "A cron job is a scheduled task that runs on a fixed interval. In Cron Job Free, a cron job is an HTTP request to a URL that runs on your chosen schedule, such as every 5 minutes or every hour.",
              },
              {
                q: "Do I need a server to run the scheduler?",
                a: "Cron Job Free is a self-hosted application. The scheduler runs as a standalone process that you deploy, polling the database for jobs that are due and executing them. You host and manage your own instance.",
              },
              {
                q: "How does response verification work?",
                a: "For each job you can set an expected HTTP status code and an optional pattern to find in the response body. A run counts as successful only when it matches your checks; otherwise it is recorded as failed.",
              },
              {
                q: "What is the AI dev assistant?",
                a: "The AI dev assistant captures frontend errors and API failures and can analyze them for root causes and fixes. You can also chat with it and ask it to generate API scaffolding, all from the dashboard.",
              },
              {
                q: "Is there a cost?",
                a: "The app is free to use with a free-tier plan that includes a limited number of jobs and monthly executions. There is no payment required to get started.",
              },
            ].map((f) => (
              <div
                key={f.q}
                className="bg-gray-50 rounded-2xl border border-gray-100 p-6"
              >
                <h3 className="text-base font-bold text-gray-900">{f.q}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
