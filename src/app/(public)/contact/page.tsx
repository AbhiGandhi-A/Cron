import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to contact the Cron Job Free project with questions, feedback or support about the self-hosted cron scheduler and developer tools.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
        Contact
      </h1>
      <p className="mt-4 text-lg text-gray-600">
        We&apos;re glad you want to get in touch with the {SITE_NAME} project.
      </p>

      <section className="mt-8 space-y-6 text-gray-700 leading-relaxed">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            How to reach us
          </h2>
          <p>
            {SITE_NAME} is a self-hosted project published and developed
            openly. The best way to reach the maintainers is through the
            project&apos;s public source repository on GitHub, where you can
            report issues, ask questions and submit feedback.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">Channels</h2>
          <ul className="space-y-3 text-sm">
            <li>
              <span className="font-semibold text-gray-900">Source code &amp; issues:</span>{" "}
              <span className="text-gray-600">
                Find the project repository in the original GitHub organization
                of this codebase to open issues or discussions.
              </span>
            </li>
            <li>
              <span className="font-semibold text-gray-900">Documentation:</span>{" "}
              <span className="text-gray-600">
                Begin with the project&apos;s README, which covers installation,
                configuration and deployment of the self-hosted application.
              </span>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Before you contact us
          </h2>
          <p>
            For account, plan and usage questions, the{" "}
            <Link href="/about" className="text-brand-600 hover:text-brand-700 font-semibold">
              About page
            </Link>{" "}
            and the{" "}
            <Link href="/" className="text-brand-600 hover:text-brand-700 font-semibold">
              homepage
            </Link>{" "}
            describe the product&apos;s capabilities. For privacy and data
            questions, review the{" "}
            <Link href="/privacy" className="text-brand-600 hover:text-brand-700 font-semibold">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
