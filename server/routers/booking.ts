import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { checkAvailability, getQuoteWithDeadline, type QuoteResult } from "../services/guesty";
import {
  isBEApiConfigured,
  createBEQuote,
  createBEInstantReservation,
  getPaymentProvider,
} from "../services/guesty-booking";
import { guestyBEClient, type BEListingWithPrice } from "../lib/guesty";
import * as db from "../db";
import { sendBookingConfirmation, sendBookingFailureAlert } from "../services/transactional-email";

/**
 * Save a trip to the customer's account and award loyalty points.
 * Called after a successful reservation (inquiry or instant).
 * Silently skipped when user is not authenticated.
 */
async function recordTripForUser(ctx: any, params: {
  listingId: string;
  propertyName: string;
  propertyImage?: string;
  destination?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice?: number;
  currency?: string;
  confirmationCode: string;
  guestyReservationId: string;
  status: "upcoming" | "active" | "completed" | "cancelled";
}) {
  try {
    const user = ctx?.user;
    if (!user?.id) return;

    const nights = Math.max(
      1,
      Math.ceil(
        (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / 86400000
      )
    );

    // Insert trip
    await db.createCustomerTrip({
      userId: user.id,
      propertyName: params.propertyName || "Portugal Active Home",
      propertyImage: params.propertyImage || null,
      destination: params.destination || null,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      guests: params.guests,
      nights,
      totalPrice: params.totalPrice ? Math.round(params.totalPrice) : 0,
      currency: params.currency || "EUR",
      status: params.status,
      confirmationCode: params.confirmationCode,
      guestyReservationId: params.guestyReservationId,
      pointsEarned: nights * 100,
    });

    // Points system removed, replaced by Returning Guest Programme
    const pointsToAward = 0;

    // Update profile stay counters
    const profile = await db.getCustomerProfile(user.id);
    if (profile) {
      await db.updateCustomerProfile(user.id, {
        totalStays: (profile.totalStays || 0) + 1,
        totalNights: (profile.totalNights || 0) + nights,
      } as any);
    }

    console.info(`[Booking] Trip saved for user ${user.id}: ${params.propertyName}, +${pointsToAward} pts`);
  } catch (err: any) {
    // Never let trip recording break the booking flow
    console.warn(`[Booking] Failed to record trip for user: ${err.message}`);
  }
}

export const bookingRouter = router({
  /** Day-by-day calendar availability for the PDP date picker */
  getCalendar: publicProcedure
    .input(
      z.object({
        listingId: z.string().min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input }) => {
      try {
        const { guestyBEClient } = await import("../lib/guesty");
        // BE API: GET /api/listings/{id}/calendar?from=X&to=Y
        // Returns flat array: [{ date, status, minNights, isBaseMinNights, cta, ctd }]
        const rawDays = await guestyBEClient.getCalendar(
          input.listingId,
          input.from,
          input.to
        );
        console.info(`[Booking] getCalendar (BE API) for ${input.listingId}: ${rawDays.length} days`);
        if (rawDays.length > 0) {
          console.info(`[Booking] getCalendar sample:`, JSON.stringify(rawDays[0]).slice(0, 250));
        }

        const days = rawDays.map((d: any) => ({
          date: d.date,
          status: d.status || "unavailable",
          minNights: d.minNights ?? undefined,
          price: d.price ?? undefined,
          cta: d.cta ?? undefined,
          ctd: d.ctd ?? undefined,
        }));
        return { days };
      } catch (error: any) {
        console.error(`[Booking] getCalendar FAILED: ${error.message}`);
        return { days: [] };
      }
    }),

  checkAvailability: publicProcedure
    .input(
      z.object({
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input }) => {
      try {
        return await checkAvailability(input.listingId, input.checkIn, input.checkOut);
      } catch (error: any) {
        throw new Error(error.message || "Failed to check availability");
      }
    }),

  getQuote: publicProcedure
    .input(
      z.object({
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guests: z.number().int().min(1).max(30).default(2),
      })
    )
    .query(async ({ input }) => {
      try {
        return await getQuoteWithDeadline(input.listingId, input.checkIn, input.checkOut, input.guests, 20_000);
      } catch (error: any) {
        throw new Error(error.message || "Failed to get quote");
      }
    }),

  /**
   * PLP live pricing — single Guesty BE API call returns ALL available listings with totalPrice.
   *
   * Uses GET /api/listings?checkIn=...&checkOut=...&fields=totalPrice
   * (see https://booking-api-docs.guesty.com/docs/retrieve-accurate-stay-pricing)
   *
   * Key behaviors per Guesty docs:
   * - totalPrice includes base rate + cleaning + service fees + taxes + all mandatory charges
   * - Guesty internally creates reservation quotes per rate plan and returns the minimum
   * - Only AVAILABLE listings for the given dates are returned (unavailable = not in response)
   * - Prices guaranteed for 24h after the internal quote creation
   * - SINGLE API call vs 50+ individual quote calls — eliminates rate limit risk entirely
   * - Max 50 results per request (sufficient for our portfolio)
   * - Rate limits: 5/sec, 275/min, 16500/hr — one call is well within limits
   */
  getBatchQuotes: publicProcedure
    .input(
      z.object({
        listings: z.array(
          z.object({
            listingId: z.string().min(1),
            slug: z.string().min(1),
          })
        ).min(1).max(100),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guests: z.number().int().min(1).max(30).default(2),
      })
    )
    .query(async ({ input }) => {
      const { listings, checkIn, checkOut, guests } = input;
      const nights = Math.ceil(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
      );

      console.info(`[PLP] Fetching live pricing via GET /api/listings for ${listings.length} properties, ${checkIn}→${checkOut}, ${guests}g`);

      // Build guestyId → slug map for matching response back to our properties
      const idToSlug = new Map<string, string>();
      for (const { listingId, slug } of listings) {
        idToSlug.set(listingId, slug);
      }

      const results: Record<string, QuoteResult> = {};

      try {
        // SINGLE API CALL — Guesty returns all available listings with totalPrice
        const response = await guestyBEClient.getListingsWithPricing({
          checkIn,
          checkOut,
          minOccupancy: guests > 1 ? guests : undefined,
          limit: listings.length,
        });

        const availableIds = new Set<string>();

        for (const listing of response.results) {
          const slug = idToSlug.get(listing._id);
          if (!slug) continue; // Listing not in our catalogue

          availableIds.add(listing._id);

          const totalPrice = listing.totalPrice ?? 0;
          const basePrice = listing.prices?.basePrice ?? 0;
          const cleaningFee = listing.prices?.cleaningFee ?? 0;
          const nightlyRate = totalPrice > 0 && nights > 0
            ? (totalPrice - cleaningFee) / nights
            : basePrice;

          results[slug] = {
            available: true,
            listingId: listing._id,
            checkIn,
            checkOut,
            nights,
            currency: listing.prices?.currency || "EUR",
            pricing: {
              nightlyRate: Math.round(nightlyRate * 100) / 100,
              totalNights: Math.round((totalPrice - cleaningFee) * 100) / 100,
              cleaningFee,
              subtotal: totalPrice,
              total: totalPrice,
            },
            source: "live",
          };
        }

        // Mark properties NOT in Guesty response as unavailable
        for (const { listingId, slug } of listings) {
          if (!availableIds.has(listingId) && !results[slug]) {
            results[slug] = {
              available: false,
              listingId,
              checkIn,
              checkOut,
              nights,
              currency: "EUR",
              pricing: { nightlyRate: 0, totalNights: 0, cleaningFee: 0, subtotal: 0, total: 0 },
              source: "request",
              fallbackMessage: "Not available for selected dates",
            };
          }
        }

        const liveCount = Object.values(results).filter(r => r.source === "live").length;
        const unavailCount = Object.values(results).filter(r => !r.available).length;
        console.info(`[PLP] Done: ${liveCount} available with live pricing, ${unavailCount} unavailable`);

      } catch (err: any) {
        console.error(`[PLP] GET /api/listings pricing call failed: ${err?.message || err}`);
        // Return empty — client falls back to catalogue base prices
      }

      return results;
    }),

  /** Booking Engine API — for on-site checkout with payment */
  isBECheckoutAvailable: publicProcedure.query(() => {
    const configured = isBEApiConfigured();
    console.info(`[Booking] isBECheckoutAvailable: ${configured}`);
    return configured;
  }),

  createBEQuote: publicProcedure
    .input(
      z.object({
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guests: z.number().int().min(1).max(30).default(2),
        guestName: z.string().optional(),
        guestEmail: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (!isBEApiConfigured()) throw new Error("Booking Engine API not configured");
      try {
        console.info(`[Booking] Creating BE quote for listing=${input.listingId}, ${input.checkIn}→${input.checkOut}, guests=${input.guests}`);
        const [first, ...rest] = (input.guestName || "Guest").split(" ");
        const result = await createBEQuote({
          ...input,
          guestFirstName: first,
          guestLastName: rest.join(" ") || first,
          guestEmail: input.guestEmail,
        });
        console.info(`[Booking] BE quote OK: quoteId=${result.quoteId}, total=${result.total}, plans=${result.ratePlanOptions?.length ?? 0}`);
        return result;
      } catch (error: any) {
        console.error(`[Booking] BE quote FAILED: ${error.message}`);
        throw new Error(error.message || "Failed to get quote");
      }
    }),

  createBEInstantReservation: publicProcedure
    .input(
      z.object({
        quoteId: z.string().min(1),
        ratePlanId: z.string().min(1),
        ccToken: z.string().min(1),
        guestName: z.string().min(2),
        guestEmail: z.string().email(),
        guestPhone: z.string().min(5),
        policy: z.record(z.string(), z.unknown()).optional(),
        // Extra fields for trip recording
        listingId: z.string().optional(),
        propertyName: z.string().optional(),
        propertyImage: z.string().optional(),
        destination: z.string().optional(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        guests: z.number().optional(),
        totalPrice: z.number().optional(),
        currency: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isBEApiConfigured()) throw new Error("Booking Engine API not configured");

      // ── Server-side validation: protect against malformed or tampered requests ──
      // ccToken MUST be a Stripe payment method (pm_) — old tok_ tokens are not SCA compliant
      if (!input.ccToken.startsWith("pm_")) {
        throw new Error("Invalid payment method. Please use a card that supports secure authentication.");
      }
      // quoteId sanity check — Guesty IDs are 24-char hex ObjectIds
      if (!/^[a-f0-9]{24}$/i.test(input.quoteId)) {
        throw new Error("Invalid quote reference. Please refresh and try again.");
      }
      // Amount sanity: reject obviously wrong totals (< €10 or > €100,000)
      if (input.totalPrice !== undefined) {
        if (input.totalPrice < 10 || input.totalPrice > 100_000) {
          console.error(`[Booking] SUSPICIOUS amount: €${input.totalPrice} for quoteId=${input.quoteId}`);
          throw new Error("The booking amount appears incorrect. Please refresh the page and try again.");
        }
      }
      // Guest email domain check — reject clearly fake emails
      const emailDomain = input.guestEmail.split("@")[1]?.toLowerCase() || "";
      if (emailDomain === "example.com" || emailDomain === "test.com") {
        throw new Error("Please provide a valid email address for your booking confirmation.");
      }

      try {
        console.info(`[Booking] Creating instant reservation: quoteId=${input.quoteId}, amount=€${input.totalPrice || "?"}, guest=${input.guestEmail}`);
        const result = await createBEInstantReservation({
          ...input,
          policy: input.policy || {},
        });

        // Record to customer account (non-blocking)
        if (input.checkIn && input.checkOut) {
          await recordTripForUser(ctx, {
            listingId: input.listingId || "",
            propertyName: input.propertyName || "Portugal Active Home",
            propertyImage: input.propertyImage,
            destination: input.destination,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            guests: input.guests || 2,
            totalPrice: input.totalPrice,
            currency: input.currency,
            confirmationCode: result.confirmationCode,
            guestyReservationId: result.reservationId,
            status: "upcoming",
          });
        }

        // Send booking confirmation email (non-blocking, never breaks booking)
        try {
          await sendBookingConfirmation({
            guestName: input.guestName,
            guestEmail: input.guestEmail,
            propertyName: input.propertyName || "Portugal Active Home",
            destination: input.destination,
            checkIn: input.checkIn || "",
            checkOut: input.checkOut || "",
            guests: input.guests || 2,
            totalPrice: input.totalPrice,
            confirmationCode: result.confirmationCode,
          });
        } catch (emailErr: any) {
          console.warn(`[Booking] Confirmation email failed (non-blocking): ${emailErr.message}`);
        }

        return result;
      } catch (error: any) {
        // ── CRITICAL: Booking failed after Stripe PM was created ──
        // The guest may have been charged. Alert the reservations team immediately.
        sendBookingFailureAlert({
          quoteId: input.quoteId,
          ratePlanId: input.ratePlanId,
          ccTokenPrefix: input.ccToken.slice(0, 6),
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone,
          propertyName: input.propertyName,
          listingId: input.listingId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.guests,
          totalPrice: input.totalPrice,
          currency: input.currency,
          errorMessage: error.message || "Unknown error",
          timestamp: new Date().toISOString(),
        }).catch(() => {}); // Never let alert email failure mask the booking error

        throw new Error(error.message || "Failed to create reservation");
      }
    }),

  getPaymentProvider: publicProcedure
    .input(z.object({ listingId: z.string().min(1) }))
    .query(async ({ input }) => {
      if (!isBEApiConfigured()) return null;
      try {
        return await getPaymentProvider(input.listingId);
      } catch {
        return null;
      }
    }),

  /** Returns Stripe publishable key when BE+Stripe configured.
   *  Connected account is resolved per-listing via getPaymentProvider — never from env var.
   *  This eliminates the race condition where a stale/wrong STRIPE_ACCOUNT_ID env var
   *  caused the PaymentElement to load on the wrong Stripe account. */
  getStripeConfig: publicProcedure.query(() => {
    const key = process.env.STRIPE_PUBLISHABLE_KEY;
    const beConfigured = isBEApiConfigured();
    console.info(`[Booking] getStripeConfig: BE=${beConfigured}, STRIPE_KEY=${key ? 'set(' + key.slice(0, 10) + '...)' : 'MISSING'}`);
    if (!beConfigured || !key) return null;
    return {
      publishableKey: key,
      stripeAccountId: null, // Resolved per-listing via getPaymentProvider
    };
  }),
});
