export const SITE_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Cron Job Free";

export const PROD_URL = "https://cronjobs.site";

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || PROD_URL;
}
