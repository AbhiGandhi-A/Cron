import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "The Cron Job Free privacy policy explains what data the application collects, how it is used and stored, and the rights you have over it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="mt-8 space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Overview</h2>
          <p>
            {SITE_NAME} is a self-hosted cron job scheduling application. This
            policy explains the information the application collects and how it
            is handled. Because the application can be self-hosted, the way your
            data is stored and processed depends on the instance and the
            infrastructure you or your host operate.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Data we collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Account information</strong> — when you register, we store
              your name, email address and a hashed password to authenticate you.
            </li>
            <li>
              <strong>Job configuration</strong> — the cron jobs you create,
              including target URLs, HTTP methods, headers, bodies, schedules and
              validation rules.
            </li>
            <li>
              <strong>Execution history</strong> — records of each job run,
              including status, timing, request and response data.
            </li>
            <li>
              <strong>Test URLs and API tester activity</strong> — the endpoints
              you register and the requests and responses you capture.
            </li>
            <li>
              <strong>Session data</strong> — a session token and essential
              cookies are used to keep you signed in and protect your account.
            </li>
            <li>
              <strong>Error and analysis data</strong> — if you use the AI dev
              assistant, frontend errors and API failures may be captured and
              analyzed to provide root-cause and fix suggestions.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">How data is used</h2>
          <p>
            Your data is used to provide and operate the application: creating
            and running your cron jobs, storing and displaying execution history,
            keeping you authenticated, and powering the monitoring and AI
            assistant features. It is not sold or shared with third parties for
            advertising purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sensitive data in requests</h2>
          <p>
            Cron jobs and API tester calls may include headers such as
            Authorization, API keys or tokens. This data is stored to run your
            jobs and is displayed back to you for debugging. You should only
            store credentials you are comfortable keeping in the application,
            and you can delete jobs at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Data storage and security</h2>
          <p>
            Data is stored in a MongoDB database and protected by authentication,
            rate limiting and security headers. Because the application is
            self-hosted, storage location and retention largely depend on the
            hosting environment you choose.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Data retention</h2>
          <p>
            You can delete your cron jobs, test URLs and execution records from
            the application at any time. An authenticated user&apos;s data is
            generally removed when their account or data is deleted through the
            application&apos;s available controls.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Your rights</h2>
          <p>
            Depending on your jurisdiction (for example under the GDPR), you may
            have the right to access, correct, delete or export your personal
            data, or to object to certain processing. Because instances can be
            self-hosted, contact the operator of the instance you use to exercise
            these rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be
            reflected by updating the &quot;Last updated&quot; date at the top of
            this page.
          </p>
        </section>
      </div>
    </div>
  );
}
