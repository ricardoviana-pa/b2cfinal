/**
 * When the listing may say "Free cancellation on refundable rates paid
 * online, until the date shown before you pay" (revisão do PR #175, R3).
 * Each claim on the listing has to be true for the homes it sits above
 * (ux-home-plp-02):
 *
 * - Partner (Tripwix) homes are requests: no rate, no payment on the site,
 *   the supplier's terms (PartnerBookingPanel). The line is about rates paid
 *   online, and it only shows when at least one listed home is booked and
 *   paid here — never above a list of partner homes only (Algarve, Douro).
 * - A refundable rate is free to cancel until 7, 14, 30 or 60 days before
 *   arrival (shared/cancellationPolicy.ts). Inside that period there is no
 *   free cancellation and checkout says so. With an arrival date in the
 *   search, the line only shows when every refundable period is still open.
 *   Which policy each home's rate has is not known on the listing, so the
 *   longest period (60 days) decides.
 */
import { FREE_CANCELLATION_DAYS, lisbonToday } from '@shared/cancellationPolicy';
import type { Property } from './types';

/** The longest free-cancellation period of any refundable rate, in days. */
export const LONGEST_FREE_CANCELLATION_DAYS = Math.max(...Object.values(FREE_CANCELLATION_DAYS));

/** Booked and paid on this site — the home page's own test for the booking
 *  widget: a Guesty home that is not portfolio-only and not a partner home. */
export function isBookableOnline(home: Pick<Property, 'guestyId' | 'isPortfolio' | 'source'>): boolean {
  return !!home.guestyId && !home.isPortfolio && home.source !== 'tripwix';
}

function ymdTime(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const time = Date.parse(`${ymd}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === ymd ? time : null;
}

/** Whole days from `today` to `checkin` (both YYYY-MM-DD), or null when `checkin` is not a date. */
export function daysUntilArrival(checkin: string | null | undefined, today: string): number | null {
  const arrival = ymdTime(String(checkin ?? '').slice(0, 10));
  const now = ymdTime(today);
  if (arrival == null || now == null) return null;
  return Math.round((arrival - now) / 86_400_000);
}

export function canPromiseFreeCancellation({ homes, checkin, today = lisbonToday() }: {
  /** The homes the listing shows for the current search and filters. */
  homes: ReadonlyArray<Pick<Property, 'guestyId' | 'isPortfolio' | 'source'>>;
  /** The arrival date in the URL, if any. */
  checkin?: string | null;
  /** Today in Lisbon (YYYY-MM-DD); a parameter for the tests. */
  today?: string;
}): boolean {
  if (!homes.some(isBookableOnline)) return false;
  if (!checkin) return true;
  const days = daysUntilArrival(checkin, today);
  // A malformed date is not a search the listing runs: same as no date.
  if (days == null) return true;
  return days >= LONGEST_FREE_CANCELLATION_DAYS;
}
