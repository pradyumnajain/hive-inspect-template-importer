/**
 * Timestamps that mean the same thing to everyone reading them.
 *
 * These pages render on the server, so `toLocaleString()` formatted in the
 * server's timezone and then presented it as if it were the reader's. On
 * Vercel that meant an edit made at 2:58 PM appeared as 9:28 AM, with nothing
 * to signal that it was UTC.
 *
 * Elapsed time sidesteps the problem entirely: the gap between two instants is
 * the same number of hours wherever you are standing. The exact instant is
 * still carried on the element, machine-readable and explicitly UTC, for
 * anyone who needs it.
 */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

// Pinned to en so the server and any future client render agree.
const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "2 days ago", "in 3 hours". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "at an unknown time";

  const elapsed = now - then;
  if (Math.abs(elapsed) < 45_000) return "just now";

  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      // Negative is the past, which is what RelativeTimeFormat expects.
      return RELATIVE.format(-Math.round(elapsed / ms), unit);
    }
  }
  return "just now";
}

/** "2026-09-18 09:28 UTC". Unambiguous, for the title and for screen readers. */
export function absoluteUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}
