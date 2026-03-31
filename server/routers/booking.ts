import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { checkAvailability, getQuoteWithDeadline } from "../services/guesty";
import {
  isBEApiConfigured,
  createBEQuote,
  createBEInstantReservation,
  getPaymentProvider,
} from "../services/guesty-booking";
import * as db from "../db";
import { sendBookingConfirmation } from "../services/transactional-email";

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
        policy: z.record(z.unknown()).optional(),
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
      try {
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

  /** Returns Stripe publishable key + connected account when BE+Stripe configured */
  getStripeConfig: publicProcedure.query(() => {
    const key = process.env.STRIPE_PUBLISHABLE_KEY;
    const beConfigured = isBEApiConfigured();
    console.info(`[Booking] getStripeConfig: BE=${beConfigured}, STRIPE_KEY=${key ? 'set(' + key.slice(0, 10) + '...)' : 'MISSING'}, ACCOUNT=${process.env.STRIPE_ACCOUNT_ID || 'not set'}`);
    if (!beConfigured || !key) return null;
    return {
      publishableKey: key,
      stripeAccountId: process.env.STRIPE_ACCOUNT_ID || null,
    };
  }),
});
