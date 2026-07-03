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
const MAX_SAMPLES = 6; // quotes per listing on a cache miss
const STORE_CAT = "lowest_nightly";

type Result = { from: number | null; source: "calendar" | "fallback" | "none"; currency: string };
const CACHE = new Map<string, { value: number | null; source: Result["source"]; at: number }>();

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Lowest real nightly rate bookable in the next 90 days, cached. */
export async function getLowestNightly(listingId: string, basePriceHint?: number): Promise<Result> {
  const cached = CACHE.get(listingId);
  if (cached && Date.now() - cached.at < TTL_MS) {
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

    // Pick up to MAX_SAMPLES check-ins spread across the horizon, each with
    // min-nights of consecutive availability so the quote actually succeeds.
    const samples: Array<{ ci: string; co: string }> = [];
    const step = Math.max(1, Math.floor(availDates.length / MAX_SAMPLES));
    for (let i = 0; i < availDates.length && samples.length < MAX_SAMPLES; i += step) {
      const ci = availDates[i];
      const mn = Math.max(1, byDate.get(ci)?.minNights ?? 2);
      const start = new Date(ci + "T00:00:00Z");
      let ok = true;
      for (let n = 0; n < mn; n++) {
        const day = byDate.get(ymd(new Date(start.getTime() + n * 86400000)));
        if (!day || day.status !== "available") { ok = false; break; }
      }
      if (!ok) continue;
      samples.push({ ci, co: ymd(new Date(start.getTime() + mn * 86400000)) });
    }

    const quotes = await Promise.allSettled(
      samples.map((s) => getQuoteWithDeadline(listingId, s.ci, s.co, 2, 20_000)),
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
    CACHE.set(listingId, { value: lowest, source: "calendar", at: Date.now() });
    upsertSetting(`${STORE_CAT}_${listingId}`, String(lowest), STORE_CAT).catch(() => {});
    return { from: lowest, source: "calendar", currency: "EUR" };
  }

  // Fallback: min(basePrice, last-known-good). Never higher than the real lowest we've seen.
  let lastKnown: number | null = null;
  try {
    const raw = await getSetting(`${STORE_CAT}_${listingId}`);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) lastKnown = n;
  } catch { /* db unavailable */ }
  const candidates = [basePriceHint, lastKnown].filter((x): x is number => typeof x === "number" && x > 0);
  const fb = candidates.length ? Math.min(...candidates) : null;
  CACHE.set(listingId, { value: fb, source: fb !== null ? "fallback" : "none", at: Date.now() });
  return { from: fb, source: fb !== null ? "fallback" : "none", currency: "EUR" };
}
