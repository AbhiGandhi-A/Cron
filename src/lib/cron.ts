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

export function getUpcomingRuns(
  schedule: string,
  timezone: string = "UTC",
  count: number = 5,
  from: Date = new Date()
): Date[] {
  const safeCount = Math.min(Math.max(1, Math.floor(count)), 50);
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const interval = cronParser.parseExpression(schedule, {
    tz,
    currentDate: from,
  });
  const runs: Date[] = [];
  for (let i = 0; i < safeCount; i++) {
    runs.push(interval.next().toDate());
  }
  return runs;
}

export type IntervalUnit = "minute" | "hour" | "day";

export interface IntervalSchedule {
  value: number;
  unit: IntervalUnit;
}

export function intervalToCron(value: number, unit: IntervalUnit): string {
  const safeValue = Math.min(Math.max(1, Math.floor(value)), 999);
  switch (unit) {
    case "minute":
      return safeValue === 1 ? "* * * * *" : `*/${safeValue} * * * *`;
    case "hour":
      return safeValue === 1 ? "0 * * * *" : `0 */${safeValue} * * *`;
    case "day":
      return safeValue === 1 ? "0 0 * * *" : `0 0 */${safeValue} * *`;
  }
}

export function parseIntervalSchedule(schedule: string): IntervalSchedule | null {
  const trimmed = (schedule || "").trim();
  const minuteMatch = /^\*\/(\d+) \* \* \* \*$/.exec(trimmed);
  if (minuteMatch) {
    return { value: parseInt(minuteMatch[1], 10), unit: "minute" };
  }
  if (trimmed === "* * * * *") {
    return { value: 1, unit: "minute" };
  }
  const hourMatch = /^0 \*\/(\d+) \* \* \*$/.exec(trimmed);
  if (hourMatch) {
    return { value: parseInt(hourMatch[1], 10), unit: "hour" };
  }
  if (trimmed === "0 * * * *") {
    return { value: 1, unit: "hour" };
  }
  const dayMatch = /^0 0 \*\/(\d+) \* \*$/.exec(trimmed);
  if (dayMatch) {
    return { value: parseInt(dayMatch[1], 10), unit: "day" };
  }
  if (trimmed === "0 0 * * *") {
    return { value: 1, unit: "day" };
  }
  return null;
}