/**
 * GUESTY API SERVICE
 * Uses centralized server/lib/guesty client.
 * When Open API OAuth is rate-limited, falls through to Booking Engine API
 * (which uses separate credentials and is typically not rate-limited).
 */

import { guestyClient, isGuestyOAuthCoolingDown, resetGuestyRateLimitCooldowns } from "../lib/guesty";
import { isBEApiConfigured, createBEQuote } from "./guesty-booking";
import { getPropertiesForSite } from "./properties-store";

type QuoteSource = "live" | "cached" | "base" | "request";

const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min for live quotes
const QUOTE_CACHE_FALLBACK_TTL_MS = 3 * 60 * 1000; // 3 min for base-price fallbacks (retry sooner)
const quoteCache = new Map<string, { expiresAt: number; value: QuoteResult }>();

function getQuoteCacheKey(listingId: string, checkIn: string, checkOut: string, guests: number): string {
  return `${listingId}:${checkIn}:${checkOut}:${guests}`;
}

function getCachedQuote(key: string): QuoteResult | null {
  const item = quoteCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    quoteCache.delete(key);
    return null;
  }
  return item.value;
}

function setCachedQuote(key: string, value: QuoteResult): void {
  // Never cache "price on request" (failed) results — allow immediate retry
  if (value.source === "request") return;
  // Base-price fallbacks get a shorter TTL so we retry live quotes sooner
  const ttl = value.source === "base" ? QUOTE_CACHE_FALLBACK_TTL_MS : QUOTE_CACHE_TTL_MS;
  quoteCache.set(key, { expiresAt: Date.now() + ttl, value });
}

export interface AvailabilityResult {
  available: boolean;
  listingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
}

export interface QuoteResult {
  available: boolean;
  listingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  pricing: {
    nightlyRate: number;
    totalNights: number;
    cleaningFee: number;
    subtotal: number;
    total: number;
  };
  source?: QuoteSource;
  fallbackMessage?: string;
}

export interface ReservationResult {
  confirmationCode: string;
  reservationId: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
}

export async function checkAvailability(
  listingId: string,
  checkIn: string,
  checkOut: string
): Promise<AvailabilityResult> {
  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );

  try {
    // Check calendar availability
    const calendar = await guestyClient.getListingCalendar(listingId, checkIn, checkOut);

    // Check if all dates are available
    const days = calendar?.data?.days || calendar?.days || (Array.isArray(calendar) ? calendar : []);
    const allAvailable = days.length > 0 && days.every((d: any) => d.status === 'available' || d.available === true);

    return { available: allAvailable, listingId, checkIn, checkOut, nights };
  } catch (error) {
    // Fallback: try reservations check
    try {
      const reservations = await guestyClient.request<any>("GET", "/v1/reservations", {
        query: {
          listingId,
          checkIn,
          checkOut,
          status: "confirmed,checked_in",
          limit: 1,
        },
      });
      const hasConflict = (reservations.results?.length || 0) > 0;
      return { available: !hasConflict, listingId, checkIn, checkOut, nights };
    } catch {
      throw new Error("Unable to verify availability right now.");
    }
  }
}

export async function getQuote(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests: number = 2
): Promise<QuoteResult> {
  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );
  const cacheKey = getQuoteCacheKey(listingId, checkIn, checkOut, guests);

  // If Guesty OAuth is rate-limited, skip the live API call — try BE API first (separate credentials)
  const openApiCoolingDown = isGuestyOAuthCoolingDown();

  // ── TIER 1: Open API live quote (fastest, most accurate) ──
  if (!openApiCoolingDown) {
    try {
      const quote = await guestyClient.createQuote(listingId, checkIn, checkOut, guests);
      const pricing = quote.pricingCents;
      const fareAccommodation = pricing.baseRentCents / 100;
      const fareCleaning = pricing.cleaningFeeCents / 100;
      const hostPayout = pricing.totalAfterTaxCents / 100;

      const result: QuoteResult = {
        available: true,
        listingId,
        checkIn,
        checkOut,
        nights,
        currency: pricing.currency || "EUR",
        pricing: {
          nightlyRate: nights > 0 ? Math.round(fareAccommodation / nights) : 0,
          totalNights: fareAccommodation,
          cleaningFee: fareCleaning,
          subtotal: fareAccommodation + fareCleaning,
          total: hostPayout,
        },
        source: "live",
      };
      setCachedQuote(cacheKey, result);
      console.info(`[getQuote] ✓ LIVE quote for ${listingId}: €${hostPayout} (${nights}n)`);
      return result;
    } catch (err: any) {
      console.warn(`[getQuote] Open API FAILED for ${listingId} ${checkIn}→${checkOut}: ${err?.message || err}`);
    }
  } else {
    console.info(`[getQuote] Open API in cooldown — skipping for ${listingId}, trying BE API`);
  }

  // ── Check server-side cache before making more API calls ──
  const cached = getCachedQuote(cacheKey);
  if (cached && cached.source === "live") {
    console.info(`[getQuote] ✓ CACHED live quote for ${listingId}: €${cached.pricing.total}`);
    return {
      ...cached,
      source: "cached" as QuoteSource,
      fallbackMessage: "Live pricing is temporarily unavailable. Showing the most recent cached price.",
    };
  }

  // ── TIER 2: Booking Engine API (separate OAuth credentials, typically not rate-limited) ──
  if (isBEApiConfigured()) {
    try {
      const beQuote = await Promise.race([
        createBEQuote({ listingId, checkIn, checkOut, guests }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("be_quote_timeout")), 12_000)),
      ]);
      if (beQuote && beQuote.total > 0) {
        const result: QuoteResult = {
          available: true,
          listingId,
          checkIn,
          checkOut,
          nights,
          currency: beQuote.currency || "EUR",
          pricing: {
            nightlyRate: beQuote.pricing.nightlyRate,
            totalNights: beQuote.pricing.totalNights,
            cleaningFee: beQuote.pricing.cleaningFee,
            subtotal: beQuote.pricing.totalNights + beQuote.pricing.cleaningFee,
            total: beQuote.total,
          },
          source: "live",
        };
        setCachedQuote(cacheKey, result);
        console.info(`[getQuote] ✓ BE API quote for ${listingId}: €${beQuote.total} (${nights}n)`);
        return result;
      }
    } catch (beErr: any) {
      console.warn(`[getQuote] BE API FAILED for ${listingId}: ${beErr?.message || beErr}`);
    }
  }

  // ── Return cached base quote if we have one ──
  if (cached) {
    console.info(`[getQuote] ✓ CACHED base quote for ${listingId}: €${cached.pricing.total}`);
    return {
      ...cached,
      source: (cached.source === "live" || cached.source === "cached" ? "cached" : "base") as QuoteSource,
      fallbackMessage: "Estimated price based on property's base rate.",
    };
  }

  // ── TIER 3: Calendar check for definitive unavailability ──
  let calendarHasBookedDays = false;
  try {
    const calendar = await Promise.race([
      guestyClient.getListingCalendar(listingId, checkIn, checkOut),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("calendar_timeout")), 5_000)),
    ]);
    const days = calendar?.data?.days || calendar?.days || (Array.isArray(calendar) ? calendar : []);
    if (days.length > 0) {
      calendarHasBookedDays = days.some((d: any) =>
        d.status === "booked" || d.status === "blocked" || d.status === "maintenance"
      );
    }
  } catch {
    calendarHasBookedDays = false;
  }
  if (calendarHasBookedDays) {
    return buildPriceOnRequestResult(listingId, checkIn, checkOut, guests);
  }

  // ── TIER 4: Listing base price from Open API ──
  try {
    const listing = await Promise.race([
      guestyClient.getListing(listingId, "prices"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("listing_fetch_timeout")), 6_000)),
    ]);
    const basePrice = Number(listing?.prices?.basePrice || 0);
    const cleaningFee = Number(listing?.prices?.cleaningFee || 0);
    if (basePrice > 0 && nights > 0) {
      const baseResult: QuoteResult = {
        available: true, listingId, checkIn, checkOut, nights,
        currency: listing?.prices?.currency || "EUR",
        pricing: {
          nightlyRate: basePrice,
          totalNights: basePrice * nights,
          cleaningFee,
          subtotal: basePrice * nights + cleaningFee,
          total: basePrice * nights + cleaningFee,
        },
        source: "base",
        fallbackMessage: "Live pricing is temporarily unavailable. Showing an estimated base rate.",
      };
      setCachedQuote(cacheKey, baseResult);
      console.info(`[getQuote] ✓ BASE price for ${listingId}: €${baseResult.pricing.total}/night`);
      return baseResult;
    }
  } catch { /* ignore */ }

  // ── TIER 5: Synced property catalogue data ──
  try {
    const allProps = await getPropertiesForSite();
    const prop = allProps.find((p: any) => p.guestyId === listingId);
    const syncedPrice = Number(prop?.pricePerNight || prop?.priceFrom || 0);
    const syncedCleaning = Number(prop?.cleaningFee || 0);
    if (syncedPrice > 0 && nights > 0) {
      const syncResult: QuoteResult = {
        available: true, listingId, checkIn, checkOut, nights,
        currency: prop?.currency || "EUR",
        pricing: {
          nightlyRate: syncedPrice,
          totalNights: syncedPrice * nights,
          cleaningFee: syncedCleaning,
          subtotal: syncedPrice * nights + syncedCleaning,
          total: syncedPrice * nights + syncedCleaning,
        },
        source: "base",
        fallbackMessage: "Estimated price based on property's base rate.",
      };
      setCachedQuote(cacheKey, syncResult);
      return syncResult;
    }
  } catch { /* ignore */ }

  return buildPriceOnRequestResult(listingId, checkIn, checkOut, guests);
}

/** Used when live quote + fallbacks cannot complete in time (PLP batch safety). */
export function buildPriceOnRequestResult(
  listingId: string,
  checkIn: string,
  checkOut: string,
  _guests: number
): QuoteResult {
  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );
  return {
    available: false,
    listingId,
    checkIn,
    checkOut,
    nights,
    currency: "EUR",
    pricing: {
      nightlyRate: 0,
      totalNights: 0,
      cleaningFee: 0,
      subtotal: 0,
      total: 0,
    },
    source: "request",
    fallbackMessage: "Price on request",
  };
}

/**
 * Hard cap so PLP batch quotes never hang if Guesty or fallbacks stall.
 * First resolution wins (live quote or deadline fallback).
 */
export async function getQuoteWithDeadline(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests: number = 2,
  deadlineMs = 12_000
): Promise<QuoteResult> {
  return Promise.race([
    getQuote(listingId, checkIn, checkOut, guests),
    new Promise<QuoteResult>((resolve) => {
      setTimeout(
        () => resolve(buildPriceOnRequestResult(listingId, checkIn, checkOut, guests)),
        deadlineMs
      );
    }),
  ]);
}

// DEPRECATED: createReservation (inquiry) removed.
// All bookings must go through Booking Engine with Stripe payment.
// Guests without live pricing should contact concierge via WhatsApp/email.
// See createBEInstantReservation in guesty-booking.ts for the active booking flow.
