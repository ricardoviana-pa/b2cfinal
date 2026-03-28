import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { getPropertiesForSite } from "../services/properties-store";

const propertyInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  description: z.string().optional(),
  destination: z.string().min(1),
  region: z.string().optional(),
  bedrooms: z.number().int().min(0).default(0),
  maxGuests: z.number().int().min(0).default(0),
  priceFrom: z.number().int().min(0).default(0),
  tier: z.enum(["standard", "signature", "ultra"]).default("standard"),
  images: z.array(z.string()).default([]),
  amenities: z.record(z.string(), z.array(z.string())).default({}),
  guestyUrl: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export const propertiesRouter = router({
  /** For public site: sync file (Guesty) or static JSON fallback. No DB needed. */
  listForSite: publicProcedure.query(async ({ ctx }) => {
    // 4-hour Cloudflare edge cache — aligns with twice-daily Guesty cron sync
    ctx.res.setHeader("Cache-Control", "public, max-age=0, s-maxage=14400, stale-while-revalidate=3600");
    return getPropertiesForSite();
  }),

  getBySlugForSite: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const list = await getPropertiesForSite();
      return list.find((p: any) => p.slug === input.slug) ?? null;
    }),

  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => db.listProperties(input ?? undefined)),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getPropertyById(input.id)),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => db.getPropertyBySlug(input.slug)),

  create: adminProcedure
    .input(propertyInput)
    .mutation(({ input }) => db.createProperty(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(propertyInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateProperty(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteProperty(input.id)),

  reorder: adminProcedure
    .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
    .mutation(({ input }) => db.reorderProperties(input)),
});
