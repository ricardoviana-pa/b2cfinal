/**
 * WHY a search came back empty — and which dates would work.
 *
 * A guest searching 1 Jul → 31 Aug 2027 for 13 people saw "no homes available"
 * and left; the houses were in fact free, but high season runs Saturday to
 * Saturday with a 7-night minimum, and the request was a 61-night stay starting
 * on a Thursday. "No availability" was true but useless. This turns that dead
 * end into the rule plus the nearest dates that satisfy it.
 *
 * Deliberately cheap: it reads ONE representative listing's calendar (the
 * season rules are set per season, not per house) and caches per listing+month.
 */
import { guestyBEClient } from "../lib/guesty";
import { getPropertiesForSite } from "./properties-store";

const MAX_NIGHTS = 30;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { days: any[]; at: number }>();

export interface DateWindow {
  checkIn: string;
  checkOut: string;
}

export interface SearchHint {
  reason: "tooLong" | "arrivalRestricted" | "minStay" | null;
  nights: number;
  minNights?: number;
  /** 0 = Sunday … 6 = Saturday */
  arrivalWeekdays?: number[];
  /** The single nearest fix (kept for the simple cases). */
  suggestion?: DateWindow;
  /** Bookable windows INSIDE the requested range — the answer when someone
   *  uses the date fields to express "sometime this summer" rather than an
   *  exact stay. Empty when the range is short enough that `suggestion` says
   *  it all. */
  options?: DateWindow[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) =>
  ymd(new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000));

async function calendarFor(listingId: string, from: string, to: string): Promise<any[]> {
  const key = `${listingId}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.days;
  const days = await guestyBEClient.getCalendar(listingId, from, to);
  cache.set(key, { days, at: Date.now() });
  return days;
}

export async function getSearchHint(
  checkIn: string,
  checkOut: string,
  guests: number,
): Promise<SearchHint> {
  const nights = Math.max(
    0,
    Math.round(
      (new Date(checkOut + "T00:00:00Z").getTime() - new Date(checkIn + "T00:00:00Z").getTime()) /
        86400000,
    ),
  );
  if (nights <= 0) return { reason: null, nights };

  // Representative listing: the roomiest one that fits the party, so the rules
  // we read are the ones this guest would actually be quoted.
  const props = await getPropertiesForSite();
  const candidates = props
    .filter((p: any) => p?.guestyId && (!guests || (p.maxGuests ?? 0) >= guests))
    .sort((a: any, b: any) => (b.maxGuests ?? 0) - (a.maxGuests ?? 0));
  const listingId = candidates[0]?.guestyId;
  if (!listingId) return { reason: null, nights };

  // Cover the whole requested range for long searches (that IS the search),
  // capped so one wide query can't turn into a giant calendar pull.
  const horizon = Math.min(Math.max(nights + 14, 60), 200);
  let days: any[];
  try {
    days = await calendarFor(listingId, addDays(checkIn, -1), addDays(checkIn, horizon));
  } catch {
    return { reason: null, nights };
  }
  const byDate = new Map<string, any>(days.map((d: any) => [d.date, d]));
  const start = byDate.get(checkIn);
  if (!start) return { reason: null, nights };

  const minNights = Math.max(1, Number(start.minNights ?? 1));
  // Only the check-in's own month: the fetched window spills into neighbouring
  // months whose season rules differ (late June is open every day), and mixing
  // them in would advertise arrival days that this stay cannot actually use.
  const checkInMonth = checkIn.slice(0, 7);
  const arrivalWeekdays = Array.from(
    new Set(
      days
        .filter((d: any) => d.date.slice(0, 7) === checkInMonth && d.status === "available" && !d.cta)
        .map((d: any) => new Date(d.date + "T00:00:00Z").getUTCDay()),
    ),
  ).sort();

  /** First date on/after `from` that opens to arrival and has minNights free. */
  const nextValidArrival = (from: string): { checkIn: string; checkOut: string } | undefined => {
    for (let i = 0; i < 60; i++) {
      const ci = addDays(from, i);
      const info = byDate.get(ci);
      if (!info || info.status !== "available" || info.cta) continue;
      const need = Math.max(1, Number(info.minNights ?? 1));
      let ok = true;
      for (let n = 0; n < need; n++) {
        const day = byDate.get(addDays(ci, n));
        if (!day || day.status !== "available") { ok = false; break; }
      }
      if (ok) return { checkIn: ci, checkOut: addDays(ci, need) };
    }
    return undefined;
  };

  /** Every bookable window whose check-in falls inside [from, to]. */
  const windowsWithin = (from: string, to: string, max: number): DateWindow[] => {
    const out: DateWindow[] = [];
    for (let i = 0; i < 200 && out.length < max; i++) {
      const ci = addDays(from, i);
      if (ci > to) break;
      const info = byDate.get(ci);
      if (!info || info.status !== "available" || info.cta) continue;
      const need = Math.max(1, Number(info.minNights ?? 1));
      let ok = true;
      for (let n = 0; n < need; n++) {
        const day = byDate.get(addDays(ci, n));
        if (!day || day.status !== "available") { ok = false; break; }
      }
      if (ok) {
        out.push({ checkIn: ci, checkOut: addDays(ci, need) });
        i += need - 1; // don't offer overlapping weeks — they read as noise
      }
    }
    return out;
  };

  // A range this long isn't a stay, it's "sometime this summer". Answer with
  // the actual bookable weeks inside it instead of refusing the search.
  if (nights > MAX_NIGHTS) {
    const options = windowsWithin(checkIn, checkOut, 6);
    return {
      reason: "tooLong",
      nights,
      minNights,
      arrivalWeekdays,
      options,
      suggestion: options[0],
    };
  }

  if (start.cta) {
    return {
      reason: "arrivalRestricted",
      nights,
      minNights,
      arrivalWeekdays,
      suggestion: nextValidArrival(checkIn),
      options: windowsWithin(checkIn, addDays(checkIn, 45), 4),
    };
  }
  if (nights < minNights) {
    return {
      reason: "minStay",
      nights,
      minNights,
      suggestion: { checkIn, checkOut: addDays(checkIn, minNights) },
    };
  }
  return { reason: null, nights };
}
