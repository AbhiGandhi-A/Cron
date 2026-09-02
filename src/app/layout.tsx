import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_NAME, PROD_URL } from "@/lib/site";

const BRAND_COLOR = "#2563eb";
const SITE_URL = PROD_URL;

const TITLE = `${SITE_NAME} - Free Online Cron Job Scheduler, API Tester and Webhook Monitor`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Cron jobs, cronjobs, cronjob free — schedule HTTP cron jobs online free with CronJob.site. Create, run and monitor cron jobs, webhook test URLs, API tests and uptime checks from one dashboard.",
  applicationName: SITE_NAME,
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  keywords: [
    "cron",
    "cron jobs",
    "cronjobs",
    "cronjob",
    "cron job",
    "cron job free",
    "cronjobfree",
    "cron job scheduler",
    "cron scheduler",
    "free cron job",
    "online cron job",
    "free cron scheduler",
    "scheduled tasks",
    "webhook tester",
    "webhook monitor",
    "api tester",
    "cron monitoring",
    "job scheduler",
    "cron job saas",
    "self-hosted cron",
    "abhi gandhi",
    "abhi gandhi developer",
    "built by abhi gandhi",
  ],
  authors: [{ name: "Abhi Gandhi", url: SITE_URL }],
  creator: "Abhi Gandhi",
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
    title: TITLE,
    description:
      "Schedule free online cron jobs with CronJob.site. Cron job scheduler, API tester, webhook monitoring and uptime checks in one dashboard.",
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
    title: TITLE,
    description:
      "Free online cron job scheduler and monitoring. Schedule cron jobs, test APIs and monitor webhooks with CronJob.site.",
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
    "mobile-web-app-capable": "yes",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: [SITE_URL],
    },
    {
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: "cronjobs.site",
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/auth/register`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description:
        "Free online cron job scheduler, API tester and webhook monitor. Schedule HTTP cron jobs, verify responses and monitor uptime.",
      author: { "@type": "Person", name: "Abhi Gandhi", url: SITE_URL },
      creator: { "@type": "Person", name: "Abhi Gandhi", url: SITE_URL },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "Person",
      name: "Abhi Gandhi",
      url: SITE_URL,
      description:
        "Developer and creator of CronJob.site (cronjobs.site), a free online cron job scheduler.",
    },
  ],
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
        <meta name="author" content="Abhi Gandhi" />
        <meta name="google" content="nositelinkssearchbox" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}