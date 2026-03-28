import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";

export const customerRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user;
    const profile = await db.getCustomerProfile(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      loginMethod: user.loginMethod,
      avatar: profile?.avatar || null,
      phone: profile?.phone || null,
      nationality: profile?.nationality || null,
      referralCode: profile?.referralCode || null,
      loyaltyPoints: profile?.loyaltyPoints || 0,
      loyaltyTier: profile?.loyaltyTier || "bronze",
      totalStays: profile?.totalStays || 0,
      totalNights: profile?.totalNights || 0,
      memberSince: user.createdAt,
    };
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      nationality: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.name) {
        await db.upsertUser({ openId: ctx.user.openId, name: input.name });
      }
      const profileData: Record<string, unknown> = {};
      if (input.phone !== undefined) profileData.phone = input.phone;
      if (input.nationality !== undefined) profileData.nationality = input.nationality;
      if (Object.keys(profileData).length > 0) {
        await db.updateCustomerProfile(ctx.user.id, profileData as any);
      }
      return { success: true };
    }),

  getTrips: protectedProcedure.query(async ({ ctx }) => {
    const trips = await db.listCustomerTrips(ctx.user.id);
    const now = new Date().toISOString().split("T")[0];
    return trips.map(t => ({
      ...t,
      isUpcoming: t.checkIn > now,
      isPast: t.checkOut <= now,
    }));
  }),

  getPointsLog: protectedProcedure.query(async ({ ctx }) => {
    return db.getPointsLog(ctx.user.id);
  }),

  getPointsSummary: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db.getCustomerProfile(ctx.user.id);
    const log = await db.getPointsLog(ctx.user.id);
    const totalEarned = log.filter(l => l.points > 0).reduce((s, l) => s + l.points, 0);
    const totalRedeemed = log.filter(l => l.points < 0).reduce((s, l) => s + Math.abs(l.points), 0);
    return {
      balance: profile?.loyaltyPoints || 0,
      tier: profile?.loyaltyTier || "bronze",
      totalEarned,
      totalRedeemed,
      nextTier: getNextTier(profile?.loyaltyTier || "bronze"),
      pointsToNextTier: getPointsToNextTier(profile?.loyaltyTier || "bronze", profile?.loyaltyPoints || 0),
    };
  }),

  getReferrals: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db.getCustomerProfile(ctx.user.id);
    const refs = await db.listReferrals(ctx.user.id);
    return {
      referralCode: profile?.referralCode || null,
      referrals: refs,
      totalReferred: refs.length,
      totalBooked: refs.filter(r => r.status === "booked" || r.status === "completed").length,
    };
  }),

  sendReferral: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await db.createReferral({
        referrerId: ctx.user.id,
        referredEmail: input.email,
        status: "pending",
      });
      return { success: true };
    }),

  adminListCustomers: adminProcedure.query(() => db.listAllCustomers()),
  adminListReferrals: adminProcedure.query(() => db.listAllReferrals()),
  adminListTrips: adminProcedure.query(() => db.listAllTrips()),
});

function getNextTier(current: string): string | null {
  const tiers = ["bronze", "silver", "gold", "platinum"];
  const idx = tiers.indexOf(current);
  return idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

function getPointsToNextTier(current: string, points: number): number {
  const thresholds: Record<string, number> = { bronze: 500, silver: 2000, gold: 5000 };
  const threshold = thresholds[current];
  if (!threshold) return 0;
  return Math.max(0, threshold - points);
}
