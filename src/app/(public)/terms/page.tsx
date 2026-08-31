import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The Cron Job Free terms of service describe the conditions of using the self-hosted cron job scheduler and developer tools.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="mt-8 space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">1. Acceptance of terms</h2>
          <p>
            By accessing or using {SITE_NAME}, you agree to be bound by these
            Terms of Service. If you do not agree with any part of these terms,
            please do not use the application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">2. Description of the service</h2>
          <p>
            {SITE_NAME} is a self-hosted cron job scheduling application that
            allows users to create and run scheduled HTTP requests, test APIs,
            capture webhook requests, monitor execution history and use an AI dev
            assistant.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">3. Accounts</h2>
          <p>
            To use the application you may be required to create an account. You
            are responsible for safeguarding your credentials and for all
            activity that occurs under your account. You agree to provide
            accurate information when registering.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">4. Acceptable use</h2>
          <p>
            You agree not to use the application in any way that is unlawful,
            harmful, or that violates the rights of others. You are responsible
            for the endpoints and requests you configure, and you must not use
            the service to send malicious, abusive or unauthorized traffic.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">5. Self-hosted nature</h2>
          <p>
            The application is self-hosted software. Depending on where you run
            it, the operator of that instance (which may be you) is responsible
            for its operation, data handling and compliance with applicable law.
            These terms govern your use of the software and any hosted instance
            provided to you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">6. No warranty</h2>
          <p>
            The application is provided &quot;as is&quot; and &quot;as
            available&quot; without warranties of any kind, express or implied,
            including fitness for a particular purpose. We do not guarantee that
            scheduled jobs will always run, that the service will be
            uninterrupted, or that data will never be lost. You are responsible
            for ensuring your critical tasks are backed up and monitored.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">7. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, the project and its
            maintainers shall not be liable for any indirect, incidental,
            special, consequential or punitive damages, or any loss of profits,
            revenue, data or goodwill arising out of or related to your use of
            the application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">8. Termination</h2>
          <p>
            We may suspend or terminate your access to a hosted account for
            violations of these terms or for behavior that threatens the
            security or reliability of the service, without prejudice to any
            other rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">9. Changes to these terms</h2>
          <p>
            We may revise these terms from time to time. Continued use of the
            application after changes take effect constitutes acceptance of the
            updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">10. Contact</h2>
          <p>
            For questions about these terms, please see the{" "}
            <a href="/contact" className="text-brand-600 hover:text-brand-700 font-semibold">
              Contact page
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
