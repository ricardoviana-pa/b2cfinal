import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { bokunClient, isBokunConfigured, BokunClientError } from "../lib/bokun";

export const bokunRouter = router({
  /** Available time slots + capacity for a single date */
  getAvailability: publicProcedure
    .input(
      z.object({
        activityId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input }) => {
      if (!isBokunConfigured()) {
        console.warn("[Bokun] getAvailability called but Bókun is not configured");
        return { slots: [], configured: false };
      }
      try {
        const data = await bokunClient.getAvailability(input.activityId, input.date);
        const slots = Array.isArray(data) ? data : data?.items ?? data?.availabilities ?? [];
        return { slots, configured: true };
      } catch (err: any) {
        console.error(`[Bokun] getAvailability failed: ${err.message}`);
        throw new Error(err.message || "Failed to fetch availability");
      }
    }),

  /** Date range availability */
  getAvailabilities: publicProcedure
    .input(
      z.object({
        activityId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input }) => {
      if (!isBokunConfigured()) {
        console.warn("[Bokun] getAvailabilities called but Bókun is not configured");
        return { availabilities: [], configured: false };
      }
      try {
        const data = await bokunClient.getAvailabilities(input.activityId, input.startDate, input.endDate);
        const availabilities = Array.isArray(data) ? data : data?.items ?? data?.availabilities ?? [];
        return { availabilities, configured: true };
      } catch (err: any) {
        console.error(`[Bokun] getAvailabilities failed: ${err.message}`);
        throw new Error(err.message || "Failed to fetch availabilities");
      }
    }),

  /** Price total + breakdown for a given date and participant counts */
  getPricing: publicProcedure
    .input(
      z.object({
        activityId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        adults: z.number().int().min(1).max(50),
        children: z.number().int().min(0).max(50).optional(),
      })
    )
    .query(async ({ input }) => {
      if (!isBokunConfigured()) {
        console.warn("[Bokun] getPricing called but Bókun is not configured");
        return null;
      }
      try {
        const data = await bokunClient.getPricing(input.activityId, input.date, {
          adults: input.adults,
          children: input.children,
        });
        return data;
      } catch (err: any) {
        console.error(`[Bokun] getPricing failed: ${err.message}`);
        throw new Error(err.message || "Failed to fetch pricing");
      }
    }),

  /** Create a booking and return confirmation */
  createBooking: publicProcedure
    .input(
      z.object({
        activityId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeSlot: z.string().min(1),
        participants: z.object({
          adults: z.number().int().min(1).max(50),
          children: z.number().int().min(0).max(50).optional(),
        }),
        customer: z.object({
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          email: z.string().email(),
          phone: z.string().min(5),
        }),
      })
    )
    .mutation(async ({ input }) => {
      if (!isBokunConfigured()) {
        throw new Error("Bókun booking is not configured.");
      }
      try {
        console.info(`[Bokun] createBooking: activityId=${input.activityId}, date=${input.date}, timeSlot=${input.timeSlot}, adults=${input.participants.adults}, email=${input.customer.email}`);
        const result = await bokunClient.createBooking(input);
        console.info(`[Bokun] createBooking OK: bookingId=${result?.id ?? result?.bookingId ?? "unknown"}`);
        return result;
      } catch (err: any) {
        console.error(`[Bokun] createBooking FAILED: ${err.message}`);
        throw new Error(err.message || "Failed to create booking");
      }
    }),
});
