import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { propertiesRouter } from "./routers/properties";
import { blogRouter } from "./routers/blog";
import { bookingRouter } from "./routers/booking";
import {
  destinationsRouter,
  servicesRouter,
  experiencesRouter,
  eventsRouter,
  reviewsRouter,
  leadsRouter,
  faqsRouter,
  settingsRouter,
} from "./routers/cms";
import { uploadRouter } from "./routers/upload";
import { customerRouter } from "./routers/customer";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    /** When OAuth not configured, use password login (ADMIN_PASSWORD) */
    getLoginMode: publicProcedure.query(() => {
      const hasOAuth = !!process.env.OAUTH_SERVER_URL;
      const hasDevPassword = !!process.env.ADMIN_PASSWORD;
      return {
        mode: hasOAuth ? "oauth" as const : hasDevPassword ? "password" as const : "none" as const,
      };
    }),
  }),

  // CMS Routers
  properties: propertiesRouter,
  destinations: destinationsRouter,
  services: servicesRouter,
  booking: bookingRouter,
  experiences: experiencesRouter,
  events: eventsRouter,
  blog: blogRouter,
  reviews: reviewsRouter,
  leads: leadsRouter,
  faqs: faqsRouter,
  settings: settingsRouter,
  upload: uploadRouter,
  customer: customerRouter,
});

export type AppRouter = typeof appRouter;
