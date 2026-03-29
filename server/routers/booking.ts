import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { checkAvailability, getQuoteWithDeadline, createReservation } from "../services/guesty";
import {
  isBEApiConfigured,
  createBEQuote,
  createBEInstantReservation,
  getPaymentProvider,
} from "../services/guesty-booking";

export const bookingRouter = router({
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

  createReservation: publicProcedure
    .input(
      z.object({
        listingId: z.string().min(1),
        checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guests: z.number().int().min(1).max(30),
        guestName: z.string().min(2),
        guestEmail: z.string().email(),
        guestPhone: z.string().min(5),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await createReservation(input);
      } catch (error: any) {
        throw new Error(error.message || "Failed to create reservation");
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
      })
    )
    .mutation(async ({ input }) => {
      if (!isBEApiConfigured()) throw new Error("Booking Engine API not configured");
      try {
        return await createBEInstantReservation(input);
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
