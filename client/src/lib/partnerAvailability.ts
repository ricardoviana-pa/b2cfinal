/**
 * What the partner (Tripwix) booking panel says when a stay has no price.
 *
 * Verificação de produção, 29 out 2026 (Tripwix P1/P2): nine partner homes
 * have a calendar that stops on 2027-03-04 and four have none at all. Their
 * dates were drawn as free; choosing them gave a null quote and the red "We
 * could not price these dates just now", which reads as a passing fault
 * rather than the truth: those dates are not open for booking yet. The panel
 * is request-to-book, so the honest answer is "on request — send the request
 * and the concierge confirms availability and the total".
 *
 * Pure, so the rules are tested from the server suite.
 */
import { buildRangeRules, stayNightStatus, UNKNOWN_STATUS, type DayRule } from "./dateRangeSelection";

/**
 * none      nothing to say (no dates, still pricing, or priced — the breakdown speaks)
 * pending   no price yet and the calendar that explains why is still loading
 * not-open  some nights are not published by the home yet: on request
 * taken     some nights are booked (and the rest could not be priced)
 * error     no price and nothing in the calendar explains it: a real fault
 */
export type PartnerQuoteNotice = "none" | "pending" | "not-open" | "taken" | "error";

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
}): PartnerQuoteNotice {
  const { checkIn, checkOut } = input;
  if (!checkIn || !checkOut || checkOut <= checkIn) return "none";
  if (input.quoteFetching) return "none";
  if (input.quote) return "none";
  if (input.quote === undefined && !input.quoteError) return "none";
  // No price: does the calendar say why?
  if (input.calendar === undefined) return input.calendarError ? "error" : "pending";
  const rules = buildRangeRules([...(input.calendar ?? [])], 1, "", { missing: UNKNOWN_STATUS });
  const stay = stayNightStatus(rules, checkIn, checkOut);
  if (!stay) return "error";
  if (stay.taken.length) return "taken";
  if (stay.unknown.length) return "not-open";
  return "error";
}

/** Status of the request the concierge receives: "unknown" when there was no price at all. */
export function partnerRequestQuoteStatus(quote: { available: boolean; feesKnown: boolean } | null | undefined): "complete" | "partial" | "unavailable" | "unknown" {
  if (!quote) return "unknown";
  if (!quote.available) return "unavailable";
  return quote.feesKnown ? "complete" : "partial";
}
