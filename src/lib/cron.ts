import cronParser from "cron-parser";

/**
 * Compute the next run time for a cron expression in a given IANA timezone.
 * Used by BOTH the Vercel API (on create/edit) and the Render scheduler
 * (after every execution), so the source of truth is consistent.
 */
export function computeNextRunAt(
  schedule: string,
  timezone: string = "UTC",
  from: Date = new Date()
): Date {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const interval = cronParser.parseExpression(schedule, {
    tz,
    currentDate: from,
  });
  return interval.next().toDate();
}

export function isValidTimeZone(timezone: string): boolean {
  if (typeof timezone !== "string" || timezone.length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}