import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "The Cron Job Free cookie policy explains the cookies and local storage used by the application, including the essential cookies required for authentication.",
  alternates: { canonical: "/cookie-policy" },
};

export default function CookiePolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
        Cookie Policy
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="mt-8 space-y-6 text-gray-700 leading-relaxed text-[15px]">
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">How {SITE_NAME} uses cookies</h2>
          <p>
            {SITE_NAME} uses a small number of essential cookies and local
            storage entries to make the application work. We do not use
            advertising cookies, tracking cookies, or third-party analytics
            cookies that follow you across sites.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Essential cookies</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Session cookie</strong> — set by the authentication system
              to keep you signed in and to protect your session. It is required
              for the application to function and is not used for advertising.
            </li>
            <li>
              <strong>CSRF protection</strong> — a security token used to help
              protect against cross-site request forgery.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Local storage</h2>
          <p>
            The application may store small preferences in your browser&apos;s
            local storage, such as interface settings or the acknowledgement of
            this cookie notice. This information stays in your browser and is
            not used for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Managing cookies</h2>
          <p>
            Because the cookies above are essential to the function of the
            application, you cannot decline them without the application failing
            to work (for example, you would not be able to stay signed in). You
            can clear cookies and site data from your browser settings at any
            time, which will sign you out of the application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-2">More information</h2>
          <p>
            For details on the data the application handles, please review the{" "}
            <Link href="/privacy" className="text-brand-600 hover:text-brand-700 font-semibold">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
