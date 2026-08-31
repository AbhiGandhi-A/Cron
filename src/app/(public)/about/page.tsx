import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn what Cron Job Free is, the problem it solves, and the self-hosted project behind it — a cron scheduler, API tester, webhook test URLs and AI dev assistant.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
        About {SITE_NAME}
      </h1>

      <section className="mt-8 space-y-6 text-gray-700 leading-relaxed">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">What it is</h2>
          <p>
            {SITE_NAME} is a self-hosted cron job scheduling platform. It lets
            you create HTTP-based cron jobs that run on a schedule, verify every
            response, and monitor execution history from a single dashboard.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">The problem it solves</h2>
          <p>
            Keeping scheduled tasks reliable is hard. Real-world endpoints go
            down, timeouts happen, and unexpected responses slip through unless
            someone is watching. {SITE_NAME} brings scheduling, response
            verification, logging and monitoring together so you can tell
            quickly whether a scheduled task actually worked — and debug it when
            it did not.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Main capabilities</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Cron job scheduling</strong> — create HTTP jobs with
              built-in intervals or custom cron expressions and timezone support.
            </li>
            <li>
              <strong>Response verification</strong> — mark a run successful only
              when it matches an expected status code and body pattern.
            </li>
            <li>
              <strong>API tester</strong> — make requests with headers, query
              parameters and bodies, and inspect the full response.
            </li>
            <li>
              <strong>Webhook test URLs</strong> — capture and inspect inbound
              requests to confirm endpoint behavior.
            </li>
            <li>
              <strong>Monitoring and logs</strong> — per-execution history with
              request and response details, plus live success and failure stats.
            </li>
            <li>
              <strong>AI dev assistant</strong> — capture errors and API failures
              and get root-cause and fix suggestions, or generate API scaffolding.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Project information</h2>
          <p>
            {SITE_NAME} is an open, self-hosted developer tool built with
            Next.js, TypeScript and Tailwind CSS, backed by MongoDB, with
            authentication via NextAuth and a standalone Node.js scheduler. It
            is designed to be deployed and operated by its own users, so they
            retain control of their data and infrastructure.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Get in touch</h2>
          <p>
            Have a question or feedback? Visit the{" "}
            <Link href="/contact" className="text-brand-600 hover:text-brand-700 font-semibold">
              Contact page
            </Link>{" "}
            to learn how to reach the project.
          </p>
        </div>
      </section>
    </div>
  );
}
