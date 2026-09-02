import type { MetadataRoute } from "next";
import { PROD_URL } from "@/lib/site";

const SITE_URL = PROD_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/app/",
        "/jobs/",
        "/api-tester/",
        "/test-urls/",
        "/generate-api/",
        "/settings/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}