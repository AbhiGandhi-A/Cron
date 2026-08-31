import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_NAME, getSiteUrl } from "@/lib/site";

const BRAND_COLOR = "#2563eb";
const SITE_URL = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Cron Job Scheduler, API Tester and Webhook Monitoring`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Cron Job Free is a self-hosted cron job scheduler with an API tester, webhook test URLs, AI dev assistant and job monitoring. Create, schedule, verify and debug HTTP cron jobs from one dashboard.",
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
    title: `${SITE_NAME} - Cron Job Scheduler, API Tester and Webhook Monitoring`,
    description:
      "Cron Job Free is a self-hosted cron job scheduler with an API tester, webhook test URLs, AI dev assistant and job monitoring. Create, schedule, verify and debug HTTP cron jobs from one dashboard.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - Cron Job Scheduler, API Tester and Webhook Monitoring`,
    description:
      "Cron Job Free is a self-hosted cron job scheduler with an API tester, webhook test URLs, AI dev assistant and job monitoring. Create, schedule, verify and debug HTTP cron jobs from one dashboard.",
    images: ["/opengraph-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
  other: {
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
        <meta
          name="google-site-verification"
          content="DBhmTd_4mP-WuudhZQY3IdCmE8cioysxJUbsBPxxkSM"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}