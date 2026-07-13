import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { checkAvailability, getQuoteWithDeadline, type QuoteResult } from "../services/guesty";
import {
  isBEApiConfigured,
  createBEQuote,
  createBEInstantReservation,
  getPaymentProvider,
  applyCouponToBEQuote,
} from "../services/guesty-booking";
import { guestyBEClient, type BEListingWithPrice } from "../lib/guesty";
import { getLowestNightly, getLowestNightlyBatch } from "../services/lowest-nightly";
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

  /**
   * "From €X per night" for the PDP — the LOWEST real bookable nightly rate in
   * the next 90 days (never the Guesty basePrice placeholder). Cached 8h.
   */
  lowestNightly: publicProcedure
    .input(z.object({ listingId: z.string().min(1), basePrice: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      ctx.res.setHeader("Cache-Control", "public, max-age=0, s-maxage=28800, stale-while-revalidate=3600");
      return getLowestNightly(input.listingId, input.basePrice);
    }),

  /** "From €X" for a page of PLP cards — cached/DB-backed, warms in background. */
  lowestNightlyBatch: publicProcedure
    .input(z.object({ listingIds: z.array(z.string().min(1)).max(120) }))
    .query(async ({ input, ctx }) => {
      ctx.res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
      return getLowestNightlyBatch(input.listingIds);
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

  /**
   * Aplica um código promocional à quote BE existente (Revenue Management do
   * Guesty). O quoteId mantém-se válido para a reserva instantânea; devolve os
   * rates atualizados no mesmo formato do getQuote. Código vazio = remover.
   */
  applyCoupon: publicProcedure
    .input(
      z.object({
        quoteId: z.string().regex(/^[0-9a-f]{24}$/i),
        listingId: z.string().min(1).max(64),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        coupon: z.string().regex(/^[A-Za-z0-9_-]{0,40}$/),
      }),
    )
    .mutation(async ({ input }) => {
      const coupons = input.coupon.trim() ? [input.coupon.trim().toUpperCase()] : [];
      try {
        const r = await applyCouponToBEQuote({
          quoteId: input.quoteId,
          coupons,
          listingId: input.listingId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
        });
        return {
          ok: true as const,
          quoteId: r.quoteId,
          nights: r.nights,
          ratePlanId: r.ratePlanId,
          pricing: r.pricing,
          total: r.total,
          ratePlanOptions: r.ratePlanOptions,
          coupons: r.coupons,
        };
      } catch (error: any) {
        if (error?.message === "INVALID_COUPON") return { ok: false as const, reason: "invalid" as const };
        throw new Error(error?.message || "Failed to apply promo code");
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

        // ── Post-charge verification (fire-and-forget, never blocks the booking) ──
        // Guesty does NOT charge the card at /instant time: the charge is executed by
        // the listing's Auto-Payment policy. If no policy fires, the reservation
        // silently stays "Not paid" with "Next payment: Unscheduled". Check after a
        // grace period (Guesty folio settles within ~60s) and alert operations.
        if (result.reservationId) {
          setTimeout(async () => {
            try {
              const { fetchReservationPaymentState } = await import("../services/guesty-openapi-paypal");
              const state = await fetchReservationPaymentState(result.reservationId);
              if (!state) return; // could not read — don't alarm on API noise
              const hasMoneyMovement =
                (state.totalPaid ?? 0) > 0 || state.payments.length > 0;
              if (!hasMoneyMovement) {
                console.error(
                  `[BE Booking] UNPAID: reservation ${result.reservationId} (${result.confirmationCode}) has no payment collected or scheduled — check the listing's Guesty Auto-Payment policy. balanceDue=${state.balanceDue}`
                );
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
                  errorMessage: `Reservation ${result.confirmationCode} was CREATED but no payment was collected or scheduled (Guesty shows "Not paid"). Likely missing Auto-Payment policy on the listing. Collect the payment manually in Guesty.`,
                  timestamp: new Date().toISOString(),
                }).catch(() => {});
              }
            } catch (verifyErr: any) {
              console.warn(`[BE Booking] Payment verification failed (non-blocking): ${verifyErr?.message || verifyErr}`);
            }
          }, 120_000);
        }

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

  // ── PayPal payment flow ────────────────────────────────────────────────────
  // Parallel path to the card flow. Uses platform Stripe account (not per-listing
  // connected account) + Guesty Open API (not Booking Engine API).

  createPayPalPaymentIntent: publicProcedure
    .input(
      z.object({
        amount: z.number().int().min(1000).max(10_000_000),
        currency: z.string().length(3),
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guestEmail: z.string().email(),
        guestName: z.string().min(2),
        numberOfAdults: z.number().int().min(1).max(30),
        numberOfChildren: z.number().int().min(0).max(20).default(0),
        numberOfInfants: z.number().int().min(0).max(10).default(0),
        ratePlanId: z.string().optional(),
        returnUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const { createPayPalPaymentIntent } = await import("../services/stripe-paypal");
      const pi = await createPayPalPaymentIntent({
        amount: input.amount,
        currency: input.currency,
        metadata: {
          source: "website-paypal",
          listingId: input.listingId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guestEmail: input.guestEmail,
          guestName: input.guestName,
          numberOfAdults: String(input.numberOfAdults),
          numberOfChildren: String(input.numberOfChildren),
          numberOfInfants: String(input.numberOfInfants),
          // The webhook creates the Guesty reservation from this metadata alone;
          // without ratePlanId it lands on the listing's default rate plan, gets
          // re-priced, and the payment record is rejected ("Not paid").
          ...(input.ratePlanId ? { ratePlanId: input.ratePlanId } : {}),
        },
      });
      return {
        clientSecret: pi.client_secret!,
        paymentIntentId: pi.id,
      };
    }),

  confirmPayPalBooking: publicProcedure
    .input(
      z.object({
        paymentIntentId: z.string().min(1),
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guestFirstName: z.string().min(1),
        guestLastName: z.string().min(1),
        guestEmail: z.string().email(),
        guestPhone: z.string().optional(),
        numberOfAdults: z.number().int().min(1).max(30),
        numberOfChildren: z.number().int().min(0).max(20).default(0),
        numberOfInfants: z.number().int().min(0).max(10).default(0),
        totalAmount: z.number().min(10).max(100_000),
        currency: z.string().length(3),
        ratePlanId: z.string().optional(),
        propertyName: z.string().optional(),
        propertyImage: z.string().optional(),
        destination: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { getPaymentIntent, updatePaymentIntentMetadata } = await import("../services/stripe-paypal");
      const { createReservationViaOpenApi, recordExternalPayment } = await import("../services/guesty-openapi-paypal");
      const { getOrCreateReservation } = await import("../lib/paypal-idempotency");

      const pi = await getPaymentIntent(input.paymentIntentId);
      if (pi.status !== "succeeded") {
        throw new Error(`Payment not completed. Status: ${pi.status}`);
      }

      const expectedCents = Math.round(input.totalAmount * 100);
      if (Math.abs(pi.amount - expectedCents) > 100) {
        console.error(`[PayPal] Amount mismatch: PI=${pi.amount}c expected=${expectedCents}c`);
        throw new Error("Amount mismatch. Please contact support.");
      }

      const stripePort = {
        getMetadata: async (id: string) => (await getPaymentIntent(id)).metadata ?? {},
        setMetadata: (id: string, partial: Record<string, string>) => updatePaymentIntentMetadata(id, partial),
      };

      let reservation: { reservationId: string; confirmationCode: string; status: string };
      try {
        reservation = await getOrCreateReservation(input.paymentIntentId, stripePort, {
          createReservation: () =>
            createReservationViaOpenApi({
              listingId: input.listingId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              guestFirstName: input.guestFirstName,
              guestLastName: input.guestLastName,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone,
              numberOfAdults: input.numberOfAdults,
              numberOfChildren: input.numberOfChildren,
              numberOfInfants: input.numberOfInfants,
              stripePaymentIntentId: input.paymentIntentId,
              ratePlanId: input.ratePlanId,
            }),
          recordPayment: (reservationId: string) =>
            recordExternalPayment(reservationId, input.totalAmount, input.currency, input.paymentIntentId),
          onRecordPaymentFailure: (reservationId, error) => {
            sendBookingFailureAlert({
              quoteId: `PayPal PI ${input.paymentIntentId}`,
              ratePlanId: input.ratePlanId || "N/A",
              ccTokenPrefix: "paypal",
              guestName: `${input.guestFirstName} ${input.guestLastName}`,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone || "",
              propertyName: input.propertyName,
              listingId: input.listingId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              guests: input.numberOfAdults + input.numberOfChildren,
              totalPrice: input.totalAmount,
              currency: input.currency,
              errorMessage: `Guest PAID but the payment could not be recorded on Guesty reservation ${reservationId} — it shows as NOT PAID. Record the payment manually. Error: ${(error as any)?.message || error}`,
              timestamp: new Date().toISOString(),
            }).catch(() => {});
          },
        });
      } catch (guestyError: any) {
        console.error("[PayPal] CRITICAL: Payment succeeded but Guesty reservation failed", {
          paymentIntentId: input.paymentIntentId,
          error: guestyError.message,
        });
        sendBookingFailureAlert({
          quoteId: "N/A (PayPal)",
          ratePlanId: "N/A",
          ccTokenPrefix: "paypal",
          guestName: `${input.guestFirstName} ${input.guestLastName}`,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone || "",
          propertyName: input.propertyName,
          listingId: input.listingId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.numberOfAdults + input.numberOfChildren,
          totalPrice: input.totalAmount,
          currency: input.currency,
          errorMessage: guestyError.message,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
        throw new Error(
          "Your payment was received but we couldn't create the reservation automatically. " +
          `Our team has been notified. Reference: ${input.paymentIntentId}`
        );
      }

      recordTripForUser(ctx, {
        listingId: input.listingId,
        propertyName: input.propertyName || "Portugal Active Home",
        propertyImage: input.propertyImage,
        destination: input.destination,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.numberOfAdults + input.numberOfChildren,
        totalPrice: input.totalAmount,
        currency: input.currency,
        confirmationCode: reservation.confirmationCode,
        guestyReservationId: reservation.reservationId,
        status: "upcoming",
      });

      sendBookingConfirmation({
        guestName: `${input.guestFirstName} ${input.guestLastName}`,
        guestEmail: input.guestEmail,
        propertyName: input.propertyName || "Portugal Active Home",
        destination: input.destination,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.numberOfAdults + input.numberOfChildren,
        totalPrice: input.totalAmount,
        confirmationCode: reservation.confirmationCode,
      }).catch((err: any) => {
        console.warn(`[PayPal] Confirmation email failed (non-blocking): ${err.message}`);
      });

      return {
        reservationId: reservation.reservationId,
        confirmationCode: reservation.confirmationCode,
        status: reservation.status,
      };
    }),

  createKlarnaPaymentIntent: publicProcedure
    .input(
      z.object({
        amount: z.number().int().min(1000).max(10_000_000),
        currency: z.string().length(3),
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guestEmail: z.string().email(),
        guestName: z.string().min(2),
        numberOfAdults: z.number().int().min(1).max(30),
        numberOfChildren: z.number().int().min(0).max(20).default(0),
        numberOfInfants: z.number().int().min(0).max(10).default(0),
        ratePlanId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { createKlarnaPaymentIntent } = await import("../services/stripe-klarna");
      const pi = await createKlarnaPaymentIntent({
        amount: input.amount,
        currency: input.currency,
        metadata: {
          source: "website-klarna",
          listingId: input.listingId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guestEmail: input.guestEmail,
          guestName: input.guestName,
          numberOfAdults: String(input.numberOfAdults),
          numberOfChildren: String(input.numberOfChildren),
          numberOfInfants: String(input.numberOfInfants),
          // The webhook creates the Guesty reservation from this metadata alone;
          // without ratePlanId it lands on the listing's default rate plan, gets
          // re-priced, and the payment record is rejected ("Not paid").
          ...(input.ratePlanId ? { ratePlanId: input.ratePlanId } : {}),
        },
      });
      return {
        clientSecret: pi.client_secret!,
        paymentIntentId: pi.id,
      };
    }),

  confirmKlarnaBooking: publicProcedure
    .input(
      z.object({
        paymentIntentId: z.string().min(1),
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guestFirstName: z.string().min(1),
        guestLastName: z.string().min(1),
        guestEmail: z.string().email(),
        guestPhone: z.string().optional(),
        numberOfAdults: z.number().int().min(1).max(30),
        numberOfChildren: z.number().int().min(0).max(20).default(0),
        numberOfInfants: z.number().int().min(0).max(10).default(0),
        totalAmount: z.number().min(10).max(100_000),
        currency: z.string().length(3),
        ratePlanId: z.string().optional(),
        propertyName: z.string().optional(),
        propertyImage: z.string().optional(),
        destination: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { getPaymentIntent, updatePaymentIntentMetadata } = await import("../services/stripe-klarna");
      const { createReservationViaOpenApi, recordExternalPayment } = await import("../services/guesty-openapi-paypal");
      const { getOrCreateReservation } = await import("../lib/paypal-idempotency");

      const pi = await getPaymentIntent(input.paymentIntentId);
      if (pi.status !== "succeeded") {
        throw new Error(`Payment not completed. Status: ${pi.status}`);
      }

      const expectedCents = Math.round(input.totalAmount * 100);
      if (Math.abs(pi.amount - expectedCents) > 100) {
        console.error(`[Klarna] Amount mismatch: PI=${pi.amount}c expected=${expectedCents}c`);
        throw new Error("Amount mismatch. Please contact support.");
      }

      const stripePort = {
        getMetadata: async (id: string) => (await getPaymentIntent(id)).metadata ?? {},
        setMetadata: (id: string, partial: Record<string, string>) => updatePaymentIntentMetadata(id, partial),
      };

      let reservation: { reservationId: string; confirmationCode: string; status: string };
      try {
        reservation = await getOrCreateReservation(input.paymentIntentId, stripePort, {
          createReservation: () =>
            createReservationViaOpenApi({
              listingId: input.listingId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              guestFirstName: input.guestFirstName,
              guestLastName: input.guestLastName,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone,
              numberOfAdults: input.numberOfAdults,
              numberOfChildren: input.numberOfChildren,
              numberOfInfants: input.numberOfInfants,
              stripePaymentIntentId: input.paymentIntentId,
              ratePlanId: input.ratePlanId,
            }),
          recordPayment: (reservationId: string) =>
            recordExternalPayment(reservationId, input.totalAmount, input.currency, input.paymentIntentId),
          onRecordPaymentFailure: (reservationId, error) => {
            sendBookingFailureAlert({
              quoteId: `Klarna PI ${input.paymentIntentId}`,
              ratePlanId: input.ratePlanId || "N/A",
              ccTokenPrefix: "klarna",
              guestName: `${input.guestFirstName} ${input.guestLastName}`,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone || "",
              propertyName: input.propertyName,
              listingId: input.listingId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              guests: input.numberOfAdults + input.numberOfChildren,
              totalPrice: input.totalAmount,
              currency: input.currency,
              errorMessage: `Guest PAID but the payment could not be recorded on Guesty reservation ${reservationId} — it shows as NOT PAID. Record the payment manually. Error: ${(error as any)?.message || error}`,
              timestamp: new Date().toISOString(),
            }).catch(() => {});
          },
        });
      } catch (guestyError: any) {
        console.error("[Klarna] CRITICAL: Payment succeeded but Guesty reservation failed", {
          paymentIntentId: input.paymentIntentId,
          error: guestyError.message,
        });
        sendBookingFailureAlert({
          quoteId: "N/A (Klarna)",
          ratePlanId: "N/A",
          ccTokenPrefix: "klarna",
          guestName: `${input.guestFirstName} ${input.guestLastName}`,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone || "",
          propertyName: input.propertyName,
          listingId: input.listingId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.numberOfAdults + input.numberOfChildren,
          totalPrice: input.totalAmount,
          currency: input.currency,
          errorMessage: guestyError.message,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
        throw new Error(
          "Your payment was received but we couldn't create the reservation automatically. " +
          `Our team has been notified. Reference: ${input.paymentIntentId}`
        );
      }

      recordTripForUser(ctx, {
        listingId: input.listingId,
        propertyName: input.propertyName || "Portugal Active Home",
        propertyImage: input.propertyImage,
        destination: input.destination,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.numberOfAdults + input.numberOfChildren,
        totalPrice: input.totalAmount,
        currency: input.currency,
        confirmationCode: reservation.confirmationCode,
        guestyReservationId: reservation.reservationId,
        status: "upcoming",
      });

      sendBookingConfirmation({
        guestName: `${input.guestFirstName} ${input.guestLastName}`,
        guestEmail: input.guestEmail,
        propertyName: input.propertyName || "Portugal Active Home",
        destination: input.destination,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.numberOfAdults + input.numberOfChildren,
        totalPrice: input.totalAmount,
        confirmationCode: reservation.confirmationCode,
      }).catch((err: any) => {
        console.warn(`[Klarna] Confirmation email failed (non-blocking): ${err.message}`);
      });

      return {
        reservationId: reservation.reservationId,
        confirmationCode: reservation.confirmationCode,
        status: reservation.status,
      };
    }),
});
