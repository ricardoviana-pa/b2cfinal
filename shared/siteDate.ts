/**
 * Dates the visitor reads, formatted the same on the server and in every
 * browser.
 *
 * The server renders in UTC (Render) and the browser hydrates in the
 * visitor's own time zone. `new Date("2026-10-14").toLocaleDateString(lang)`
 * is UTC midnight, so a browser west of Greenwich printed "13 Oct" where the
 * server had printed "14 Oct": every article date on /en/blog was one day
 * early for visitors in the Americas (and in the Azores in winter), and React
 * threw hydration error #418 on the text (auditoria 29 out 2026,
 * Regression:P1). Review months moved the same way at the turn of a month.
 *
 * Two kinds of value, two fixed zones, never the browser's:
 *  - calendar dates ("2026-10-14", "2025-08"): publish dates, review months,
 *    check-in and check-out. They are days, not instants, and are printed
 *    exactly as written. A booking date never shifts.
 *  - instants (an ISO timestamp with a time): printed in Lisbon time, where
 *    every home is (the checkout and the emails already do this).
 */

export const SITE_TIME_ZONE = "Europe/Lisbon";

const CALENDAR_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** The moment to format and the zone to read it in, or null if unusable. */
function resolve(value: string): { date: Date; timeZone: string } | null {
  const m = CALENDAR_DATE.exec(value);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1];
    // Midday UTC, read in UTC: the calendar day as written, in any zone.
    const date = new Date(Date.UTC(y, mo - 1, d, 12));
    // Reject a day the calendar does not hold ("2026-02-31" would be March).
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return { date, timeZone: "UTC" };
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { date, timeZone: SITE_TIME_ZONE } : null;
}

/**
 * Format a stored date for display: same text on the server and in any
 * browser time zone. Returns "" for a missing or unparseable value (the
 * caller omits the date rather than printing "Invalid Date").
 */
export function formatSiteDate(
  value: string | null | undefined,
  locale: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!value) return "";
  const resolved = resolve(String(value).trim());
  if (!resolved) return "";
  const opts = { ...options, timeZone: resolved.timeZone };
  try {
    return new Intl.DateTimeFormat(locale || "en", opts).format(resolved.date);
  } catch {
    // An unknown language tag must not take the page down.
    return new Intl.DateTimeFormat("en", opts).format(resolved.date);
  }
}
