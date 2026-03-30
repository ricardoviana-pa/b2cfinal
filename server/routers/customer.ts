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

  /* ================================================================
     PROPERTY REFERRALS — Refer a property to PA's portfolio
     ================================================================ */

  getPropertyReferrals: protectedProcedure.query(async ({ ctx }) => {
    const refs = await db.listPropertyReferrals(ctx.user.id);
    const signed = refs.filter(r => r.status === "signed");
    const totalReward = signed.reduce((s, r) => s + (r.rewardAmount || 0), 0);
    const paidReward = signed.filter(r => r.rewardPaid).reduce((s, r) => s + (r.rewardAmount || 0), 0);
    return {
      referrals: refs,
      totalSubmitted: refs.length,
      totalSigned: signed.length,
      totalReward,
      paidReward,
      pendingReward: totalReward - paidReward,
    };
  }),

  submitPropertyReferral: protectedProcedure
    .input(z.object({
      ownerName: z.string().min(2),
      ownerEmail: z.string().email().optional().or(z.literal("")),
      ownerPhone: z.string().min(5).optional().or(z.literal("")),
      propertyAddress: z.string().optional().or(z.literal("")),
      propertyCity: z.string().optional().or(z.literal("")),
      propertyRegion: z.string().optional().or(z.literal("")),
      propertyBedrooms: z.number().int().min(0).max(50).optional(),
      propertyType: z.string().optional().or(z.literal("")),
      propertyDescription: z.string().optional().or(z.literal("")),
      notes: z.string().optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createPropertyReferral({
        referrerId: ctx.user.id,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail || null,
        ownerPhone: input.ownerPhone || null,
        propertyAddress: input.propertyAddress || null,
        propertyCity: input.propertyCity || null,
        propertyRegion: input.propertyRegion || null,
        propertyBedrooms: input.propertyBedrooms ?? null,
        propertyType: input.propertyType || null,
        propertyDescription: input.propertyDescription || null,
        notes: input.notes || null,
        status: "submitted",
        rewardAmount: 0,
      });
      return { success: true, id: result.id };
    }),

  /* ================================================================
     RETURNING GUEST PROGRAMME — Preferences
     ================================================================ */

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db.getCustomerProfile(ctx.user.id);
    if (!profile?.preferences) return {};
    try { return JSON.parse(profile.preferences as string); } catch { return {}; }
  }),

  updatePreferences: protectedProcedure
    .input(z.object({ preferences: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.updateCustomerProfile(ctx.user.id, { preferences: input.preferences } as any);
      return { success: true };
    }),

  /* ================================================================
     ADMIN
     ================================================================ */
  adminListCustomers: adminProcedure.query(() => db.listAllCustomers()),
  adminListReferrals: adminProcedure.query(() => db.listAllReferrals()),
  adminListTrips: adminProcedure.query(() => db.listAllTrips()),
  adminListPropertyReferrals: adminProcedure.query(() => db.listAllPropertyReferrals()),

  adminUpdatePropertyReferral: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["submitted", "contacted", "under_review", "signed", "rejected"]).optional(),
      tier: z.enum(["select", "luxury"]).optional(),
      rewardAmount: z.number().optional(),
      rewardPaid: z.boolean().optional(),
      adminNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const update: Record<string, unknown> = {};
      if (data.status) update.status = data.status;
      if (data.tier) update.tier = data.tier;
      if (data.rewardAmount !== undefined) update.rewardAmount = data.rewardAmount;
      if (data.rewardPaid !== undefined) update.rewardPaid = data.rewardPaid;
      if (data.adminNotes !== undefined) update.adminNotes = data.adminNotes;
      await db.updatePropertyReferral(id, update as any);
      return { success: true };
    }),
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
