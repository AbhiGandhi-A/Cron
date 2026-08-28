import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeNextRunAt,
  getUpcomingRuns,
  intervalToCron,
  parseIntervalSchedule,
  isValidTimeZone,
} from "../src/lib/cron";

test("getUpcomingRuns returns the requested number of strictly increasing runs", () => {
  const from = new Date("2026-08-28T10:00:00Z");
  const runs = getUpcomingRuns("*/5 * * * *", "UTC", 5, from);
  assert.equal(runs.length, 5);
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].getTime() > runs[i - 1].getTime());
  }
  assert.equal(runs[0].getTime(), computeNextRunAt("*/5 * * * *", "UTC", from).getTime());
});

test("getUpcomingRuns respects the timezone", () => {
  const from = new Date("2026-08-28T10:00:00Z");
  const runs = getUpcomingRuns("0 9 * * *", "America/New_York", 2, from);
  const runsUtc = getUpcomingRuns("0 9 * * *", "UTC", 2, from);
  // 9am in New York is not the same instant as 9am UTC.
  assert.notEqual(runs[0].getTime(), runsUtc[0].getTime());

  for (const run of runs) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(run);
    const hour = parts.find((p) => p.type === "hour")!.value;
    assert.equal(hour, "09");
  }
});

test("getUpcomingRuns clamps count to the allowed range", () => {
  assert.equal(getUpcomingRuns("* * * * *", "UTC", 0).length, 1);
  assert.equal(getUpcomingRuns("* * * * *", "UTC", -5).length, 1);
  assert.equal(getUpcomingRuns("* * * * *", "UTC", 999).length, 50);
  assert.equal(getUpcomingRuns("* * * * *", "UTC", 2).length, 2);
});

test("getUpcomingRuns throws on an invalid cron", () => {
  assert.throws(() => getUpcomingRuns("not a cron", "UTC", 2));
});

test("intervalToCron maps minute/hour/day intervals", () => {
  assert.equal(intervalToCron(1, "minute"), "* * * * *");
  assert.equal(intervalToCron(5, "minute"), "*/5 * * * *");
  assert.equal(intervalToCron(1, "hour"), "0 * * * *");
  assert.equal(intervalToCron(2, "hour"), "0 */2 * * *");
  assert.equal(intervalToCron(1, "day"), "0 0 * * *");
  assert.equal(intervalToCron(3, "day"), "0 0 */3 * *");
});

test("parseIntervalSchedule recognizes pure interval crons", () => {
  assert.deepEqual(parseIntervalSchedule("* * * * *"), { value: 1, unit: "minute" });
  assert.deepEqual(parseIntervalSchedule("*/15 * * * *"), { value: 15, unit: "minute" });
  assert.deepEqual(parseIntervalSchedule("0 * * * *"), { value: 1, unit: "hour" });
  assert.deepEqual(parseIntervalSchedule("0 */2 * * *"), { value: 2, unit: "hour" });
  assert.deepEqual(parseIntervalSchedule("0 0 * * *"), { value: 1, unit: "day" });
  assert.deepEqual(parseIntervalSchedule("0 0 */4 * *"), { value: 4, unit: "day" });
});

test("parseIntervalSchedule returns null for arbitrary crons", () => {
  assert.equal(parseIntervalSchedule("0 9 * * 1-5"), null);
  assert.equal(parseIntervalSchedule("*/15 9 * * *"), null);
  assert.equal(parseIntervalSchedule("garbage"), null);
  assert.equal(parseIntervalSchedule(""), null);
});

test("intervalToCron and parseIntervalSchedule round-trip", () => {
  const cases: [number, "minute" | "hour" | "day"][] = [
    [1, "minute"],
    [5, "minute"],
    [1, "hour"],
    [6, "hour"],
    [1, "day"],
    [7, "day"],
  ];
  for (const [value, unit] of cases) {
    assert.deepEqual(parseIntervalSchedule(intervalToCron(value, unit)), { value, unit });
  }
});

test("isValidTimeZone rejects garbage and accepts common zones", () => {
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
  assert.equal(isValidTimeZone(""), false);
});