import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { getPropertiesForSite, getSiteLocalities, getPropertiesForDestination } from "../services/properties-store";

const propertyInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  description: z.string().optional(),
  destination: z.string().min(1),
  region: z.string().optional(),
  locality: z.string().optional(),
  bedrooms: z.number().int().min(0).default(0),
  bathrooms: z.number().int().min(0).default(0),
  maxGuests: z.number().int().min(0).default(0),
  priceFrom: z.number().int().min(0).default(0),
  currency: z.string().default("EUR"),
  style: z.string().optional(),
  tier: z.enum(["standard", "signature", "ultra"]).default("standard"),
  tags: z.array(z.string()).default([]),
  occasions: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  amenities: z.record(z.string(), z.array(z.string())).default({}),
  stayIncludes: z.array(z.string()).default([]),
  guestyUrl: z.string().optional(),
  guestyId: z.string().optional(),
  bookingUrl: z.string().optional(),
  whatsappMessage: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
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

  /** Destination options for the search dropdowns — ~15 entries (<1 KB), so it
   *  can be SSR-prefetched and the picker works on first paint instead of
   *  waiting for the full ~1.3 MB property list. */
  localities: publicProcedure.query(async ({ ctx }) => {
    ctx.res.setHeader("Cache-Control", "public, max-age=0, s-maxage=14400, stale-while-revalidate=3600");
    return getSiteLocalities();
  }),

  /** Homes a destination page lists (slim cards). Small enough to be
   *  SSR-prefetched, so the count and the cards are in the served HTML. */
  forDestination: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(80) }))
    .query(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "public, max-age=0, s-maxage=14400, stale-while-revalidate=3600");
      return getPropertiesForDestination(input.slug);
    }),

  /** Homes to show under a blog article. A few slim records (~2 KB), so unlike
   *  listForSite this CAN be SSR-prefetched — which is the point: the links
   *  must exist in the article's HTML, not appear after hydration. */
  relatedHomes: publicProcedure
    .input(z.object({ destinationTag: z.string().nullable().optional(), limit: z.number().int().min(1).max(12).optional() }))
    .query(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "public, max-age=0, s-maxage=14400, stale-while-revalidate=3600");
      const { getRelatedHomes } = await import("../services/related-homes");
      return getRelatedHomes(input.destinationTag ?? null, input.limit ?? 4);
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
