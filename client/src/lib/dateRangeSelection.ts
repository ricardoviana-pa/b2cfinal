/**
 * What a click on a calendar day does to a check-in / check-out selection.
 *
 * Pure, so the booking calendar (widget, partner panel, checkout) and its
 * tests share one set of rules. Reported 10 Oct 2026 ("seleciono, tento mudar e
 * ele não ajuda"): changing a chosen stay used to close the calendar after the
 * first click, reset the arrival on the second, and silently ignore days past
 * the next booking. The model here:
 *
 *   - The phase says which date the next click sets. Picking an arrival always
 *     moves on to the departure, keeping the old departure if it still fits, so
 *     moving a stay is two clicks and extending it is one.
 *   - In the departure phase, a day that cannot end the chosen stay (before the
 *     arrival, or past the next booked night) starts a new stay there instead
 *     of doing nothing.
 *   - Only a departure click completes the selection (`done`) — that is the
 *     moment a picker may close itself.
 *
 * All dates are YYYY-MM-DD strings, compared lexically.
 *
 * Unknown days (verificação de 29 out 2026, Tripwix P1/P2): a partner home's
 * supplier may not publish a date at all — nine homes stop on 2027-03-04,
 * four have no calendar. Such a day is neither free nor booked: it is "on
 * request". It can be chosen (the partner panel is request-to-book; the
 * concierge confirms availability and price), it never ends a stay early,
 * and the calendar draws it apart from both. A date missing from `days` is
 * free by default (Guesty sends every day); the partner calendar passes
 * `missing: "unknown"`, so a date it does not have is unknown too — up to
 * `missingUntil` when it is given: a later date (past the 12-month window
 * the panel reads, on a home whose calendar runs to its end) is free again,
 * as Tripwix publishes it and the stay is priced on demand (revisão do PR
 * #180, R1/R2).
 */

export type SelectionPhase = "check-in" | "check-out";

/** Status of a day the supplier has not published: "on request", never free. */
export const UNKNOWN_STATUS = "unknown";

export interface DayRule {
  date: string;
  status: string;
  minNights?: number;
  /** Closed to arrival */
  cta?: boolean;
  /** Closed to departure */
  ctd?: boolean;
}

export interface RangeRules {
  today: string;
  dayMap: Map<string, DayRule>;
  /** Unavailable days, ascending (unknown days are not among them) */
  blocked: string[];
  /** Fallback minimum stay for days without one */
  minNights: number;
  /** Status of a date absent from dayMap: undefined = free (Guesty), "unknown" = on request (partner homes) */
  missing?: typeof UNKNOWN_STATUS;
  /** Last date `missing` applies to (inclusive); an absent date after it is free. Undefined: every absent date. */
  missingUntil?: string;
}

export interface RangeRuleOptions {
  missing?: typeof UNKNOWN_STATUS;
  missingUntil?: string;
}

export interface RangeSelection {
  checkIn: string;
  checkOut: string;
  phase: SelectionPhase;
}

/** disabled · sets the arrival · ends the stay · starts a new stay here */
export type DayRole = "disabled" | "check-in" | "check-out" | "restart";

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildRangeRules(
  days: DayRule[],
  minNights: number | undefined,
  today: string,
  opts: RangeRuleOptions = {},
): RangeRules {
  const dayMap = new Map<string, DayRule>();
  for (const day of days) dayMap.set(day.date, day);
  const blocked = days
    .filter((d) => d.status !== "available" && d.status !== UNKNOWN_STATUS)
    .map((d) => d.date)
    .sort();
  return {
    today, dayMap, blocked, minNights: minNights ?? 1,
    ...(opts.missing ? { missing: opts.missing } : {}),
    ...(opts.missing && opts.missingUntil ? { missingUntil: opts.missingUntil } : {}),
  };
}

/**
 * The day's status. A date the calendar does not have reads as
 * `rules.missing` (undefined = free), or as free after `rules.missingUntil`.
 */
export function statusOf(rules: RangeRules, date: string): string | undefined {
  const status = rules.dayMap.get(date)?.status;
  if (status !== undefined) return status;
  if (rules.missingUntil && date > rules.missingUntil) return undefined;
  return rules.missing;
}

export function isBlocked(rules: RangeRules, date: string): boolean {
  const status = statusOf(rules, date);
  return status !== undefined && status !== "available" && status !== UNKNOWN_STATUS;
}

/** Not published by the supplier: selectable, "on request", never free. */
export function isUnknown(rules: RangeRules, date: string): boolean {
  return statusOf(rules, date) === UNKNOWN_STATUS;
}

/**
 * The nights of a stay (the check-out day is not one) sorted by what the
 * calendar says: taken (any closed status) or unknown (not published). Null
 * for an impossible range. A night that is neither is open.
 */
export function stayNightStatus(
  rules: RangeRules,
  checkIn: string,
  checkOut: string,
): { nights: number; taken: string[]; unknown: string[] } | null {
  const nights = Math.round((Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z")) / 86_400_000);
  if (!Number.isFinite(nights) || nights < 1) return null;
  const taken: string[] = [];
  const unknown: string[] = [];
  // At most 400 nights are read: this runs per render, and the dates can come from the URL.
  let date = checkIn;
  for (let n = 0; n < Math.min(nights, 400); n++, date = addDays(date, 1)) {
    if (isUnknown(rules, date)) unknown.push(date);
    else if (isBlocked(rules, date)) taken.push(date);
  }
  return { nights, taken, unknown };
}

export function minNightsFor(rules: RangeRules, checkIn: string): number {
  return Math.max(1, rules.dayMap.get(checkIn)?.minNights ?? rules.minNights);
}

export function canArrive(rules: RangeRules, date: string): boolean {
  return date >= rules.today && !isBlocked(rules, date) && !rules.dayMap.get(date)?.cta;
}

export function earliestCheckout(rules: RangeRules, checkIn: string): string {
  return addDays(checkIn, minNightsFor(rules, checkIn));
}

/** First unavailable day after the arrival: the latest possible departure (the
 *  turnover morning — the guest leaves as the next booking arrives). */
export function firstBlockedAfter(rules: RangeRules, checkIn: string): string | null {
  return rules.blocked.find((d) => d > checkIn) ?? null;
}

export function isValidCheckout(rules: RangeRules, checkIn: string, checkOut: string): boolean {
  if (checkOut < earliestCheckout(rules, checkIn)) return false;
  if (rules.dayMap.get(checkOut)?.ctd) return false;
  const reach = firstBlockedAfter(rules, checkIn);
  return reach === null || checkOut <= reach;
}

/** The check-out phase needs a check-in to measure from. */
export function effectivePhase(sel: RangeSelection): SelectionPhase {
  return sel.phase === "check-out" && !sel.checkIn ? "check-in" : sel.phase;
}

export function dayRole(rules: RangeRules, sel: RangeSelection, date: string): DayRole {
  if (date < rules.today) return "disabled";
  if (effectivePhase(sel) === "check-in") return canArrive(rules, date) ? "check-in" : "disabled";

  const reach = firstBlockedAfter(rules, sel.checkIn);
  if (date <= sel.checkIn || (reach !== null && date > reach)) {
    return canArrive(rules, date) ? "restart" : "disabled";
  }
  return isValidCheckout(rules, sel.checkIn, date) ? "check-out" : "disabled";
}

export interface ClickResult {
  checkIn: string;
  checkOut: string;
  phase: SelectionPhase;
  /** The guest just picked the departure: the selection is complete. */
  done: boolean;
}

export function applyDayClick(rules: RangeRules, sel: RangeSelection, date: string): ClickResult | null {
  switch (dayRole(rules, sel, date)) {
    case "check-in": {
      const keep = !!sel.checkOut && isValidCheckout(rules, date, sel.checkOut);
      return { checkIn: date, checkOut: keep ? sel.checkOut : "", phase: "check-out", done: false };
    }
    case "restart":
      return { checkIn: date, checkOut: "", phase: "check-out", done: false };
    case "check-out":
      return { checkIn: sel.checkIn, checkOut: date, phase: "check-in", done: true };
    default:
      return null;
  }
}
