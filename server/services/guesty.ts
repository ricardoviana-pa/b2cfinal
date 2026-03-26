/**
 * GUESTY API SERVICE
 * Uses centralized server/lib/guesty client.
 */

import { guestyClient } from "../lib/guesty";

type QuoteSource = "live" | "cached" | "base" | "request";

const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000;
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
  quoteCache.set(key, { expiresAt: Date.now() + QUOTE_CACHE_TTL_MS, value });
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
    const days = calendar.data?.days || [];
    const allAvailable = days.length > 0 && days.every((d: any) => d.status === 'available');

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
    return result;
  } catch {
    const cached = getCachedQuote(cacheKey);
    if (cached) {
      return {
        ...cached,
        source: "cached",
        fallbackMessage: "Live pricing is temporarily unavailable. Showing the most recent cached price.",
      };
    }

    try {
      const listing = await Promise.race([
        guestyClient.getListing(listingId, "prices"),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("listing_fetch_timeout")), 6_000);
        }),
      ]);
      const basePrice = Number(listing?.prices?.basePrice || 0);
      const cleaningFee = Number(listing?.prices?.cleaningFee || 0);
      if (basePrice > 0 && nights > 0) {
        return {
          available: true,
          listingId,
          checkIn,
          checkOut,
          nights,
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
      }
    } catch {
      /* ignore */
    }

    return buildPriceOnRequestResult(listingId, checkIn, checkOut, guests);
  }
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

export async function createReservation(input: {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes?: string;
}): Promise<ReservationResult> {
  const [firstName, ...lastParts] = input.guestName.split(' ');
  const lastName = lastParts.join(' ') || firstName;

  // Single quote call: avoid doubling Guesty traffic (widget/PLP already requested quotes).
  // Guesty validates inquiry payload against live calendar/terms on the server.
  const reservation = await guestyClient.createReservation({
    listingId: input.listingId,
    checkInDateLocalized: input.checkIn,
    checkOutDateLocalized: input.checkOut,
    status: "inquiry",
    guest: {
      firstName,
      lastName,
      email: input.guestEmail,
      phone: input.guestPhone,
    },
    guestsCount: input.guests,
    source: "Website Direct",
  });

  return {
    confirmationCode: reservation.confirmationCode || reservation._id?.slice(-8) || 'PA-' + Date.now(),
    reservationId: reservation._id || '',
    status: reservation.status || 'inquiry',
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestName: input.guestName,
  };
}
