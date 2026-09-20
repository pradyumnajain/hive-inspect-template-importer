/**
 * These pages render on the server, so a timestamp formatted in the server's
 * timezone reads as if it were the viewer's. Elapsed time avoids that, but
 * only if the thresholds are right, so they are pinned here.
 */

import { describe, expect, it } from "vitest";
import { absoluteUtc, relativeTime } from "@/lib/time";

const NOW = Date.parse("2026-09-20T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("collapses anything very recent to 'just now'", () => {
    expect(relativeTime(ago(0), NOW)).toBe("just now");
    expect(relativeTime(ago(44 * SECOND), NOW)).toBe("just now");
  });

  it("picks the largest unit that fits", () => {
    expect(relativeTime(ago(2 * MINUTE), NOW)).toBe("2 minutes ago");
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe("3 hours ago");
    expect(relativeTime(ago(2 * DAY), NOW)).toBe("2 days ago");
    expect(relativeTime(ago(21 * DAY), NOW)).toBe("3 weeks ago");
    expect(relativeTime(ago(200 * DAY), NOW)).toBe("7 months ago");
    expect(relativeTime(ago(800 * DAY), NOW)).toBe("2 years ago");
  });

  it("reads naturally at the boundaries, which is what numeric:auto buys", () => {
    expect(relativeTime(ago(DAY), NOW)).toBe("yesterday");
    expect(relativeTime(ago(7 * DAY), NOW)).toBe("last week");
    expect(relativeTime(ago(31 * DAY), NOW)).toBe("last month");
    expect(relativeTime(ago(370 * DAY), NOW)).toBe("last year");
  });

  it("handles a clock that is slightly ahead rather than printing nonsense", () => {
    expect(relativeTime(new Date(NOW + 3 * HOUR).toISOString(), NOW)).toBe("in 3 hours");
  });

  it("does not throw on a value that is not a date", () => {
    expect(relativeTime("not a date", NOW)).toBe("at an unknown time");
  });

  it("gives the same answer no matter where the reader is", () => {
    // The whole point: elapsed time is timezone independent.
    const iso = ago(3 * HOUR);
    expect(relativeTime(iso, NOW)).toBe(relativeTime(new Date(Date.parse(iso)).toISOString(), NOW));
  });
});

describe("absoluteUtc", () => {
  it("labels the zone instead of leaving it implied", () => {
    expect(absoluteUtc("2026-09-18T09:28:00Z")).toBe("2026-09-18 09:28 UTC");
  });

  it("formats the instant in UTC whatever offset it arrives in", () => {
    expect(absoluteUtc("2026-09-18T14:58:00+05:30")).toBe("2026-09-18 09:28 UTC");
  });

  it("passes through a value it cannot parse", () => {
    expect(absoluteUtc("nonsense")).toBe("nonsense");
  });
});
