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
 */

export type SelectionPhase = "check-in" | "check-out";

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
  /** Unavailable days, ascending */
  blocked: string[];
  /** Fallback minimum stay for days without one */
  minNights: number;
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

export function buildRangeRules(days: DayRule[], minNights: number | undefined, today: string): RangeRules {
  const dayMap = new Map<string, DayRule>();
  for (const day of days) dayMap.set(day.date, day);
  const blocked = days
    .filter((d) => d.status !== "available")
    .map((d) => d.date)
    .sort();
  return { today, dayMap, blocked, minNights: minNights ?? 1 };
}

export function isBlocked(rules: RangeRules, date: string): boolean {
  const status = rules.dayMap.get(date)?.status;
  return status !== undefined && status !== "available";
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
