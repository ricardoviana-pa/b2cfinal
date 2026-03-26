import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";

/* ================================================================
   DESTINATIONS
   ================================================================ */
const destinationInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  description: z.string().optional(),
  whyDescription: z.string().optional(),
  whyOverline: z.string().optional(),
  coverImage: z.string().optional(),
  gallery: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  howToGetHere: z.string().optional(),
  bestTimeToVisit: z.string().optional(),
  whatToExpect: z.string().optional(),
  insiderRecommendations: z.array(z.object({
    name: z.string(),
    category: z.string(),
    description: z.string(),
  })).default([]),
  propertyCount: z.number().int().default(0),
  comingSoon: z.boolean().default(false),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  status: z.string().default('active'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const destinationsRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => db.listDestinations(input ?? undefined)),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getDestinationById(input.id)),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => db.getDestinationBySlug(input.slug)),

  create: adminProcedure
    .input(destinationInput)
    .mutation(({ input }) => db.createDestination(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(destinationInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateDestination(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteDestination(input.id)),
});

/* ================================================================
   SERVICES
   ================================================================ */
const serviceInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  icon: z.string().optional(),
  images: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const servicesRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => db.listServices(input ?? undefined)),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getServiceById(input.id)),

  create: adminProcedure
    .input(serviceInput)
    .mutation(({ input }) => db.createService(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(serviceInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateService(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteService(input.id)),
});

/* ================================================================
   EXPERIENCES
   ================================================================ */
const experienceInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  category: z.string().optional(),
  destination: z.string().optional(),
  duration: z.string().optional(),
  priceFrom: z.number().int().default(0),
  images: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const experiencesRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => db.listExperiences(input ?? undefined)),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getExperienceById(input.id)),

  create: adminProcedure
    .input(experienceInput)
    .mutation(({ input }) => db.createExperience(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(experienceInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateExperience(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteExperience(input.id)),
});

/* ================================================================
   EVENTS
   ================================================================ */
const eventInput = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  eventType: z.string().optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).default([]),
  capacity: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const eventsRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => db.listEvents(input ?? undefined)),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getEventById(input.id)),

  create: adminProcedure
    .input(eventInput)
    .mutation(({ input }) => db.createEvent(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(eventInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateEvent(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteEvent(input.id)),
});

/* ================================================================
   REVIEWS
   ================================================================ */
const reviewInput = z.object({
  guestName: z.string().min(1),
  guestLocation: z.string().optional(),
  propertyName: z.string().optional(),
  quote: z.string().min(1),
  rating: z.number().int().min(1).max(5).default(5),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const reviewsRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => db.listReviews(input ?? undefined)),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getReviewById(input.id)),

  create: adminProcedure
    .input(reviewInput)
    .mutation(({ input }) => db.createReview(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(reviewInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateReview(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteReview(input.id)),
});

/* ================================================================
   LEADS
   ================================================================ */
const leadInput = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().optional(),
  source: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const leadsRouter = router({
  list: adminProcedure
    .input(z.object({
      source: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(({ input }) => db.listLeads(input ?? undefined)),

  stats: adminProcedure.query(() => db.getLeadStats()),

  create: publicProcedure
    .input(leadInput)
    .mutation(({ input }) => db.createLead(input)),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["new", "contacted", "converted", "archived"]).optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateLead(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteLead(input.id)),
});

/* ================================================================
   FAQS
   ================================================================ */
const faqInput = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const faqsRouter = router({
  list: publicProcedure
    .input(z.object({
      activeOnly: z.boolean().optional(),
      category: z.string().optional(),
    }).optional())
    .query(({ input }) => db.listFaqs(input ?? undefined)),

  create: adminProcedure
    .input(faqInput)
    .mutation(({ input }) => db.createFaq(input)),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(faqInput.partial()))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateFaq(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteFaq(input.id)),
});

/* ================================================================
   SITE SETTINGS
   ================================================================ */
export const settingsRouter = router({
  list: adminProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(({ input }) => db.listSettings(input?.category ?? undefined)),

  get: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(({ input }) => db.getSetting(input.key)),

  upsert: adminProcedure
    .input(z.object({
      key: z.string().min(1),
      value: z.string(),
      category: z.string().optional(),
    }))
    .mutation(({ input }) => db.upsertSetting(input.key, input.value, input.category)),
});
