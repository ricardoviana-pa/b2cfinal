/**
 * LOWEST BOOKABLE NIGHTLY ("From €X per night")
 * =========================================================================
 * The Guesty `basePrice` is a placeholder that is wrong in both directions
 * (e.g. €450 on rooms that actually sell at ~€110 and on a whole-house buyout
 * that sells at €1000+). Showing it as the PDP "From €X per night" kills
 * conversion. This computes the LOWEST price a guest could ACTUALLY book in the
 * next 90 days:
 *
 *   1. Read the availability calendar (next 90 days).
 *   2. Sample a spread of genuinely-available windows (min-nights consecutive
 *      available nights).
 *   3. Quote each window and take the minimum real nightly rate.
 *
 * Cached in-memory per listing (8h). The last good value is also persisted in
 * the DB so that, if the calendar/quotes fail, the fallback is
 * min(basePrice, lastKnown) — never a "from" higher than the real lowest we've
 * seen. If we have nothing at all, returns null and the caller keeps its own
 * behaviour.
 * ========================================================================= */
import { guestyBEClient } from "../lib/guesty";
import { getQuoteWithDeadline } from "./guesty";
import { getSetting, upsertSetting } from "../db";

const TTL_MS = 8 * 60 * 60 * 1000; // 8h in-memory cache
const HORIZON_DAYS = 90;
const MAX_SAMPLES = 14; // quotes per listing on a cache miss
const SAMPLE_CADENCE_DAYS = 7; // probe ~every week so no seasonal low (a whole cheap month) is missed
const MAX_CONCURRENT_QUOTES = 4; // GLOBAL cap on in-flight Guesty quotes (across all warming listings)
const STORE_CAT = "lowest_nightly";
const WARM_PER_REQUEST = 10; // how many never-computed listings to warm per PLP batch call

const NULL_TTL_MS = 30 * 60 * 1000; // retry no-value results (rate-limited / no availability) after 30 min, not 8h

type Result = { from: number | null; source: "calendar" | "fallback" | "none"; currency: string };
const CACHE = new Map<string, { value: number | null; source: Result["source"]; at: number }>();

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Global semaphore so a burst of concurrent listing warms can't exceed Guesty's
 *  quote rate limit. Slots are acquired only when the quote actually runs, so the
 *  20s per-quote deadline never starts ticking while a call is still queued. */
let activeQuotes = 0;
const quoteWaiters: Array<() => void> = [];
async function withQuoteSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeQuotes >= MAX_CONCURRENT_QUOTES) {
    await new Promise<void>((resolve) => quoteWaiters.push(resolve));
  }
  activeQuotes++;
  try {
    return await fn();
  } finally {
    activeQuotes--;
    quoteWaiters.shift()?.();
  }
}

/** Persisted values carry a timestamp ("706@<epochMs>") so the PLP batch can tell
 *  a stale price from a fresh one and refresh it in the background. Legacy plain
 *  numbers parse with at=0 → always treated as stale (refreshed once). */
function parseStored(raw: string | undefined | null): { price: number | null; at: number } {
  if (!raw) return { price: null, at: 0 };
  const [pStr, tStr] = String(raw).split("@");
  const p = Number(pStr);
  const t = Number(tStr);
  return { price: Number.isFinite(p) && p > 0 ? p : null, at: Number.isFinite(t) ? t : 0 };
}
const encodeStored = (price: number, at: number) => `${price}@${at}`;
/** A cached entry is fresh for 8h only when we have a CONFIDENT value — a real
 *  price computed from the calendar. A null (no availability / rate-limited) or a
 *  `fallback` (quotes failed, we reused a last-known/base price) is retried after
 *  30 min instead, so a transient quote failure never locks in a wrong "from" for
 *  8h. */
const isFresh = (c: { value: number | null; source: Result["source"]; at: number }) =>
  Date.now() - c.at < (c.value !== null && c.source === "calendar" ? TTL_MS : NULL_TTL_MS);

/** Lowest real nightly rate bookable in the next 90 days, cached. */
export async function getLowestNightly(listingId: string, basePriceHint?: number): Promise<Result> {
  const cached = CACHE.get(listingId);
  if (cached && isFresh(cached)) {
    return { from: cached.value, source: cached.source, currency: "EUR" };
  }

  const today = new Date();
  const from = ymd(today);
  const to = ymd(new Date(today.getTime() + HORIZON_DAYS * 86400000));

  let lowest: number | null = null;
  try {
    const days = await guestyBEClient.getCalendar(listingId, from, to);
    const byDate = new Map<string, any>(days.map((d: any) => [d.date, d]));
    const availDates = days
      .filter((d: any) => d.status === "available")
      .map((d: any) => d.date)
      .sort();

    // Probe the horizon at a WEEKLY cadence, not a sparse even-index spread.
    // PriceLabs seasonality moves week-to-week, so the true "from" often lives in
    // a shoulder-season pocket (e.g. October). Sampling ~6 evenly-spread windows
    // used to skip whole cheap months and overshoot the real floor by ~40-60%
    // (Carcavelos showed "from €1243" while October genuinely booked at ~€700).
    // For each weekly target we snap to the first available date on/after it that
    // has min-nights of consecutive availability so the quote actually succeeds.
    const availSet = new Set<string>(availDates);
    const samples: Array<{ ci: string; co: string }> = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < HORIZON_DAYS && samples.length < MAX_SAMPLES; offset += SAMPLE_CADENCE_DAYS) {
      const target = new Date(today.getTime() + offset * 86400000);
      let ci: string | null = null;
      for (let k = 0; k < SAMPLE_CADENCE_DAYS; k++) {
        const cand = ymd(new Date(target.getTime() + k * 86400000));
        if (availSet.has(cand)) { ci = cand; break; }
      }
      if (!ci || seen.has(ci)) continue;
      const mn = Math.max(1, byDate.get(ci)?.minNights ?? 2);
      const start = new Date(ci + "T00:00:00Z");
      let ok = true;
      for (let n = 0; n < mn; n++) {
        const day = byDate.get(ymd(new Date(start.getTime() + n * 86400000)));
        if (!day || day.status !== "available") { ok = false; break; }
      }
      if (!ok) continue;
      seen.add(ci);
      samples.push({ ci, co: ymd(new Date(start.getTime() + mn * 86400000)) });
    }

    // Quote every sampled window, but through a GLOBAL concurrency gate so that
    // no matter how many listings warm at once, we never exceed Guesty's rate
    // limit. Bursting past it makes quotes fail and degrades the "from" to a
    // fallback (wrong) price — exactly what we're trying to fix.
    const quotes = await Promise.allSettled(
      samples.map((s) => withQuoteSlot(() => getQuoteWithDeadline(listingId, s.ci, s.co, 2, 20_000))),
    );
    for (const r of quotes) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const q: any = r.value;
      // Only trust real live/cached prices — ignore "price on request" fallbacks.
      if (q.source !== "live" && q.source !== "cached") continue;
      const candidates: number[] = [];
      for (const p of q.ratePlanOptions || []) if (typeof p.nightlyRate === "number" && p.nightlyRate > 0) candidates.push(p.nightlyRate);
      if (typeof q.pricing?.nightlyRate === "number" && q.pricing.nightlyRate > 0) candidates.push(q.pricing.nightlyRate);
      if (candidates.length) {
        const m = Math.min(...candidates);
        if (lowest === null || m < lowest) lowest = m;
      }
    }
  } catch (err: any) {
    console.warn(`[lowestNightly] calendar/quote failed for ${listingId}: ${err?.message || err}`);
  }

  if (lowest !== null && lowest > 0) {
    const at = Date.now();
    CACHE.set(listingId, { value: lowest, source: "calendar", at });
    upsertSetting(`${STORE_CAT}_${listingId}`, encodeStored(lowest, at), STORE_CAT).catch(() => {});
    return { from: lowest, source: "calendar", currency: "EUR" };
  }

  // Fallback: min(basePrice, last-known-good). Never higher than the real lowest we've seen.
  let lastKnown: number | null = null;
  try {
    lastKnown = parseStored(await getSetting(`${STORE_CAT}_${listingId}`)).price;
  } catch { /* db unavailable */ }
  const candidates = [basePriceHint, lastKnown].filter((x): x is number => typeof x === "number" && x > 0);
  const fb = candidates.length ? Math.min(...candidates) : null;
  CACHE.set(listingId, { value: fb, source: fb !== null ? "fallback" : "none", at: Date.now() });
  return { from: fb, source: fb !== null ? "fallback" : "none", currency: "EUR" };
}

/**
 * "From €X" for a page of PLP cards. FAST: reads only the in-memory cache and
 * the DB-persisted last-known values (no quotes on the request path). Listings
 * that have never been computed are warmed in the background (capped, paced),
 * so their price appears on a later load rather than blocking this one.
 */
export async function getLowestNightlyBatch(listingIds: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const dbReads: string[] = [];
  for (const id of listingIds) {
    const c = CACHE.get(id);
    if (c && isFresh(c) && c.value !== null) out[id] = c.value;
    else dbReads.push(id);
  }

  const noValue: string[] = []; // never computed → warm to get a first value
  const stale: string[] = [];   // has a persisted value but it's old → refresh in background
  await Promise.all(dbReads.map(async (id) => {
    try {
      const { price, at } = parseStored(await getSetting(`${STORE_CAT}_${id}`));
      out[id] = price;
      if (price === null) noValue.push(id);
      else if (Date.now() - at >= TTL_MS) stale.push(id);
    } catch {
      out[id] = null;
      noValue.push(id);
    }
  }));

  // Background-warm (fire-and-forget, capped). Listings with no value first, then
  // stale ones — so the whole portfolio self-heals onto the current (accurate)
  // sampling without ever blanking the price already on the page.
  const toWarm = [...noValue, ...stale].slice(0, WARM_PER_REQUEST);
  for (const id of toWarm) void getLowestNightly(id).catch(() => {});
  return out;
}
