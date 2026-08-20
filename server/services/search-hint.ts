/**
 * WHY a dated search came back empty — and the dates that would work.
 *
 * Two real cases taught this module its shape:
 *  1. A guest searched Thu 1 Jul → 8 Jul 2027; high season only opens arrivals
 *     on Saturdays, so everything showed unavailable though the houses were free.
 *  2. A guest wanted 61 CONTINUOUS nights (1 Jul → 31 Aug 2027). Houses were
 *     100% free for the whole span — a Sat-start 61-night stay quotes live at
 *     €119k — but the arrival day (Thursday) blocked every quote. An earlier
 *     version of this file capped "reasonable" stays at 30 nights and answered
 *     with weekly windows, silently telling a six-figure booking it wasn't
 *     possible. Never assume the stay length is the problem: FIRST try to keep
 *     the guest's full duration by shifting the arrival; only offer smaller
 *     windows when no house can take the whole stay.
 */
import { guestyBEClient } from "../lib/guesty";
import { getPropertiesForSite } from "./properties-store";

/** Beyond this we don't try to validate a continuous stay against calendars
 *  (horizon limits); the answer becomes "here are the windows + concierge". */
const VALIDATE_CAP_NIGHTS = 120;
/** How far past the requested check-in we'll shift an arrival to preserve the
 *  guest's full duration. */
const ARRIVAL_SCAN_DAYS = 21;
/** How many party-fitting listings we check for full-length availability. */
const MAX_CANDIDATE_LISTINGS = 5;

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
  /** The single nearest fix. For a shifted arrival it PRESERVES the guest's
   *  full requested duration. */
  suggestion?: DateWindow;
  /** Bookable windows INSIDE the requested range — only sent when the full
   *  duration is genuinely not available anywhere, i.e. the search reads as
   *  "sometime in this period" rather than one continuous stay. */
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

  // Listings that fit the party, roomiest first — the rules we read are the
  // ones this guest would actually be quoted.
  const props = await getPropertiesForSite();
  const candidates = props
    .filter((p: any) => p?.guestyId && (!guests || (p.maxGuests ?? 0) >= guests))
    .sort((a: any, b: any) => (b.maxGuests ?? 0) - (a.maxGuests ?? 0));
  if (!candidates.length) return { reason: null, nights };

  const horizon = Math.min(nights + ARRIVAL_SCAN_DAYS + 14, 240);
  const from = addDays(checkIn, -1);
  const to = addDays(checkIn, horizon);

  const loadMap = async (listingId: string) => {
    const days = await calendarFor(listingId, from, to);
    return { days, byDate: new Map<string, any>(days.map((d: any) => [d.date, d])) };
  };

  const canStay = (byDate: Map<string, any>, ci: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const day = byDate.get(addDays(ci, i));
      if (!day || day.status !== "available") return false;
    }
    return true;
  };

  /** Earliest arrival in [fromDate, fromDate+scan] that is open to arrival and
   *  has the FULL duration continuously available on this listing. */
  const fullLengthArrival = (byDate: Map<string, any>, fromDate: string): string | null => {
    for (let i = 0; i <= ARRIVAL_SCAN_DAYS; i++) {
      const ci = addDays(fromDate, i);
      const info = byDate.get(ci);
      if (!info || info.status !== "available" || info.cta) continue;
      if (canStay(byDate, ci, nights)) return ci;
    }
    return null;
  };

  // Primary calendar (roomiest fit) supplies the season-rule messaging.
  let primary: { days: any[]; byDate: Map<string, any> };
  try {
    primary = await loadMap(candidates[0].guestyId);
  } catch {
    return { reason: null, nights };
  }
  const start = primary.byDate.get(checkIn);
  if (!start) return { reason: null, nights };

  const minNights = Math.max(1, Number(start.minNights ?? 1));
  const checkInMonth = checkIn.slice(0, 7);
  const arrivalWeekdays = Array.from(
    new Set(
      primary.days
        .filter((d: any) => d.date.slice(0, 7) === checkInMonth && d.status === "available" && !d.cta)
        .map((d: any) => new Date(d.date + "T00:00:00Z").getUTCDay()),
    ),
  ).sort();

  const searchIsFine = !start.cta && nights >= minNights && canStay(primary.byDate, checkIn, nights);
  if (searchIsFine) {
    // The PLP's own quotes decide availability per house; nothing to explain.
    if (nights < minNights) {
      return { reason: "minStay", nights, minNights, suggestion: { checkIn, checkOut: addDays(checkIn, minNights) } };
    }
    return { reason: null, nights };
  }

  if (!start.cta && nights < minNights) {
    return { reason: "minStay", nights, minNights, suggestion: { checkIn, checkOut: addDays(checkIn, minNights) } };
  }

  // Something blocks this exact request. Before ANY smaller-window talk, try to
  // keep the guest's full duration by shifting the arrival — across up to
  // MAX_CANDIDATE_LISTINGS party-fitting houses (availability varies per house).
  if (nights <= VALIDATE_CAP_NIGHTS) {
    let bestArrival: string | null = fullLengthArrival(primary.byDate, checkIn);
    if (!bestArrival) {
      for (const cand of candidates.slice(1, MAX_CANDIDATE_LISTINGS)) {
        try {
          const { byDate } = await loadMap(cand.guestyId);
          const ci = fullLengthArrival(byDate, checkIn);
          if (ci && (!bestArrival || ci < bestArrival)) bestArrival = ci;
          if (bestArrival && bestArrival <= addDays(checkIn, 2)) break;
        } catch {
          /* one listing's calendar failing shouldn't kill the hint */
        }
      }
    }
    if (bestArrival) {
      return {
        reason: "arrivalRestricted",
        nights,
        minNights,
        arrivalWeekdays,
        // Duration preserved — this is the whole point.
        suggestion: { checkIn: bestArrival, checkOut: addDays(bestArrival, nights) },
      };
    }
  }

  // No house can take the full stay → treat the range as a period and offer
  // the bookable windows inside it.
  const windows: DateWindow[] = [];
  for (let i = 0; i < 200 && windows.length < 6; i++) {
    const ci = addDays(checkIn, i);
    if (ci > checkOut) break;
    const info = primary.byDate.get(ci);
    if (!info || info.status !== "available" || info.cta) continue;
    const need = Math.max(1, Number(info.minNights ?? 1));
    if (canStay(primary.byDate, ci, need)) {
      windows.push({ checkIn: ci, checkOut: addDays(ci, need) });
      i += need - 1;
    }
  }
  return {
    reason: "tooLong",
    nights,
    minNights,
    arrivalWeekdays,
    options: windows,
    suggestion: windows[0],
  };
}
