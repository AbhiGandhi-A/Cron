import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cron-job-free.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date();
  const staticRoutes = ["/", "/auth/login", "/auth/register"];
  return staticRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: today,
    changeFrequency: route === "/" ? "daily" : "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}