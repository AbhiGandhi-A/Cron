import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const SITE_NAME = process.env.NEXT_PUBLIC_APP_NAME || "CronJob.io";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cron-job-free.vercel.app";
const ADSENSE_CLIENT = "ca-pub-6250622484538760";
const BRAND_COLOR = "#2563eb";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Self-Hosted Cron Job Scheduler`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Create, schedule, monitor and debug cron jobs with CronJob.io. Self-hosted cron job SaaS with an API tester, webhook test URLs and an AI dev assistant.",
  applicationName: SITE_NAME,
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  keywords: [
    "cron job",
    "cron scheduler",
    "cron job scheduler",
    "scheduled tasks",
    "webhook tester",
    "api tester",
    "cron monitoring",
    "job scheduler",
    "cron job SaaS",
    "self-hosted cron",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Developer Tools",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - Self-Hosted Cron Job Scheduler`,
    description:
      "Create, schedule, monitor and debug cron jobs with CronJob.io. Self-hosted cron job SaaS with an API tester, webhook test URLs and an AI dev assistant.",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} - Self-Hosted Cron Job Scheduler`,
    description:
      "Create, schedule, monitor and debug cron jobs with CronJob.io. Self-hosted cron job SaaS with an API tester, webhook test URLs and an AI dev assistant.",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
  other: {
    "google-adsense-account": ADSENSE_CLIENT,
    "theme-color": BRAND_COLOR,
    "msapplication-TileColor": BRAND_COLOR,
    "msapplication-tooltip": SITE_NAME,
    "apple-mobile-web-app-title": SITE_NAME,
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}