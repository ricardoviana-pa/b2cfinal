/**
 * Turn the human-written `dates` on a destination event into ISO 8601, or
 * nothing at all.
 *
 * The field is authored for readers, so it holds both real dates
 * ("15–23 August 2026") and things no calendar can represent
 * ("Last weekend of May", "February (movable)"). schema.org startDate takes
 * ISO 8601 and Google rejects anything else, so the prose was being sent as an
 * invalid date. Returning null for the unparseable ones lets the caller skip
 * the Event entirely — no schema beats bad schema.
 */

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export interface EventDateRange {
  /** ISO 8601 date, YYYY-MM-DD. */
  startDate: string;
  /** Present only when the source described a range. */
  endDate?: string;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Reject a day number the month cannot hold — "31 February 2026" is not a date. */
function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseEventDates(input: string | undefined | null): EventDateRange | null {
  if (!input) return null;
  // Normalise the en/em dashes the copy uses for ranges.
  const text = input.replace(/[–—]/g, '-').trim();

  // "15-23 August 2026" — a day range inside one month.
  const range = text.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (range) {
    const [, d1, d2, monthName, year] = range;
    const m = MONTHS[monthName.toLowerCase()];
    const y = Number(year);
    if (m && valid(y, m, Number(d1)) && valid(y, m, Number(d2))) {
      return { startDate: iso(y, m, Number(d1)), endDate: iso(y, m, Number(d2)) };
    }
    return null;
  }

  // "23 August 2026" — a single day.
  const single = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (single) {
    const [, d, monthName, year] = single;
    const m = MONTHS[monthName.toLowerCase()];
    const y = Number(year);
    if (m && valid(y, m, Number(d))) return { startDate: iso(y, m, Number(d)) };
    return null;
  }

  // Anything else is prose: "Last weekend of May", "February (movable)",
  // "September into early October". Those have no date to give.
  return null;
}
