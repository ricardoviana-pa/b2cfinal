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
  isBECheckoutAvailable: publicProcedure.query(() => isBEApiConfigured()),

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
        const [first, ...rest] = (input.guestName || "Guest").split(" ");
        return await createBEQuote({
          ...input,
          guestFirstName: first,
          guestLastName: rest.join(" ") || first,
          guestEmail: input.guestEmail,
        });
      } catch (error: any) {
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
    if (!isBEApiConfigured() || !key) return null;
    return {
      publishableKey: key,
      stripeAccountId: process.env.STRIPE_ACCOUNT_ID || null,
    };
  }),
});
