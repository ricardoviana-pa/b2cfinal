/**
 * What the partner (Tripwix) booking panel draws, and what it says, when it
 * has no calendar for a date or a stay has no price.
 *
 * Verificação de produção, 29 out 2026 (Tripwix P1/P2): nine partner homes
 * have a calendar that stops on 2027-03-04 and four have none at all. Their
 * dates were drawn as free; choosing them gave a null quote and the red "We
 * could not price these dates just now", which reads as a passing fault. The
 * panel is request-to-book, so those dates are now "on request": the guest
 * sends the request and the concierge confirms availability and the total.
 *
 * Revisão do PR #180 (29 out 2026):
 * - R1/R2 (copy): the panel cannot tell a home with no calendar at Tripwix
 *   from one whose calendar the server has not loaded (a restart with the DB
 *   down, a last good read older than 48 h) or from a request that failed.
 *   The notes no longer state a fact about the home ("has not opened its
 *   calendar", "not open for booking yet"): they say what the page can and
 *   cannot show. A failed request says so, with "Try again".
 * - R1/R2 (far dates): the panel reads a 12-month window. A date after it is
 *   on request only when the home's calendar does not run to the end of that
 *   window (it is short, or there is none). On the homes whose calendar does,
 *   Tripwix publishes those dates and the stay is priced on demand, so they
 *   stay free, as before the PR, and a missing price there is the red error.
 *
 * Pure, so the rules are tested from the server suite.
 */
import { buildRangeRules, stayNightStatus, UNKNOWN_STATUS, type DayRule } from "./dateRangeSelection";

/**
 * A calendar whose last published day is at most this many days before the
 * end of the window asked for runs to the end of it (the job's
 * SHORT_CALENDAR_DAYS, server/services/tripwix-calendar.ts: nine homes stop
 * on 2027-03-04, 239 days short; the rest reach the window's last day).
 */
export const PARTNER_SHORT_CALENDAR_DAYS = 30;

export type PartnerCalendarNoteKey =
  | "bookingWidget.onRequestNote"
  | "bookingWidget.onRequestAll"
  | "bookingWidget.calendarLoadError";

/** The props the panel gives AvailabilityCalendar, and the line under its grid. */
export interface PartnerCalendarView {
  days: DayRule[];
  /** A date the calendar does not have is "on request", never free… */
  missing: typeof UNKNOWN_STATUS;
  /** …up to this date: after it, it is free (the calendar runs to the window's end). Undefined: every such date. */
  missingUntil?: string;
  /** The line under the grid, drawn when the months in view have dates on request. */
  noteKey: PartnerCalendarNoteKey;
  /** The calendar request failed: offer "Try again". */
  retry: boolean;
}

const NO_DAYS: DayRule[] = [];
const DAY_MS = 86_400_000;
const isoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z"));

/**
 * The partner calendar as the panel draws it.
 *
 * calendar: booking.partnerCalendar's answer — undefined (loading, or the
 * request failed), null (the server holds no calendar for this home: none at
 * Tripwix, not read yet, or older than 48 h), or the days of the window.
 * windowEnd: the last day of the window the panel asked for.
 */
export function partnerCalendarView(input: {
  calendar: readonly DayRule[] | null | undefined;
  calendarError: boolean;
  windowEnd: string;
}): PartnerCalendarView {
  const { calendar } = input;
  if (!calendar) {
    const failed = calendar === undefined && input.calendarError;
    return {
      days: NO_DAYS,
      missing: UNKNOWN_STATUS,
      noteKey: failed ? "bookingWidget.calendarLoadError" : "bookingWidget.onRequestAll",
      retry: failed,
    };
  }
  let lastKnown = "";
  for (const d of calendar) if (d.status !== UNKNOWN_STATUS && d.date > lastKnown) lastKnown = d.date;
  const runsToEnd = !!lastKnown && isoDay(lastKnown) && isoDay(input.windowEnd)
    && (Date.parse(input.windowEnd + "T00:00:00Z") - Date.parse(lastKnown + "T00:00:00Z")) / DAY_MS <= PARTNER_SHORT_CALENDAR_DAYS;
  return {
    days: calendar as DayRule[],
    missing: UNKNOWN_STATUS,
    ...(runsToEnd ? { missingUntil: lastKnown > input.windowEnd ? lastKnown : input.windowEnd } : {}),
    // Nothing known at all in the window: the same line as with no calendar.
    noteKey: lastKnown ? "bookingWidget.onRequestNote" : "bookingWidget.onRequestAll",
    retry: false,
  };
}

/**
 * none        nothing to say (no dates, still pricing, or priced — the breakdown speaks)
 * pending     no price yet and the calendar that explains why is still loading
 * on-request  some nights have no availability on the page (not published, or no calendar): on request
 * taken       some nights are booked (and the rest could not be priced)
 * error       no price and nothing in the calendar explains it: a real fault
 */
export type PartnerQuoteNotice = "none" | "pending" | "on-request" | "taken" | "error";

export function partnerQuoteNotice(input: {
  checkIn: string;
  checkOut: string;
  /** partnerQuote: undefined = not asked yet, null = no price, object = priced */
  quote: unknown;
  quoteFetching: boolean;
  quoteError: boolean;
  /** partnerCalendar: undefined = not loaded, null = no calendar for this home */
  calendar: readonly DayRule[] | null | undefined;
  calendarError: boolean;
  /** Last day of the window the panel asked partnerCalendar for. */
  windowEnd: string;
}): PartnerQuoteNotice {
  const { checkIn, checkOut } = input;
  if (!checkIn || !checkOut || checkOut <= checkIn) return "none";
  if (input.quoteFetching) return "none";
  if (input.quote) return "none";
  if (input.quote === undefined && !input.quoteError) return "none";
  // No price: does the calendar say why?
  if (input.calendar === undefined) return input.calendarError ? "error" : "pending";
  const view = partnerCalendarView({ calendar: input.calendar, calendarError: input.calendarError, windowEnd: input.windowEnd });
  const rules = buildRangeRules(view.days, 1, "", { missing: view.missing, missingUntil: view.missingUntil });
  const stay = stayNightStatus(rules, checkIn, checkOut);
  if (!stay) return "error";
  if (stay.taken.length) return "taken";
  if (stay.unknown.length) return "on-request";
  return "error";
}

/** Status of the request the concierge receives: "unknown" when there was no price at all. */
export function partnerRequestQuoteStatus(quote: { available: boolean; feesKnown: boolean } | null | undefined): "complete" | "partial" | "unavailable" | "unknown" {
  if (!quote) return "unknown";
  if (!quote.available) return "unavailable";
  return quote.feesKnown ? "complete" : "partial";
}
