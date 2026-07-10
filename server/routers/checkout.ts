/**
 * Checkout 2.0 (Fase 1) — server-side BookingIntent + lead capture.
 *
 * The intent is the source of truth once the guest enters /checkout/:intentId
 * (docs/checkout_spec.md §3). The widget's localStorage remains a cache of the
 * pre-checkout phase only. All procedures fail SOFT when the database is
 * unavailable: createIntent returns { intentId: null } and the client keeps
 * the legacy in-widget flow.
 *
 * Security: the intent id is a capability (it goes into resume links and the
 * record carries guest PII), so it is a UUID — never enumerable.
 */
import { randomUUID } from "crypto";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createBookingIntent,
  getBookingIntent,
  updateBookingIntent,
  createLead,
} from "../db";

/** Intent (and its resume link) lives as long as the Guesty quote: ~23h. */
const INTENT_TTL_MS = 23 * 60 * 60 * 1000;

const quoteSnapshotSchema = z.object({
  nightlyRate: z.number(),
  totalNights: z.number(),
  cleaningFee: z.number(),
  taxesAndFees: z.number(),
  total: z.number().positive(),
  nights: z.number().int().positive(),
  currency: z.string().default("EUR"),
  quoteCreatedAt: z.number().nullable(),
  ratePlanOptions: z
    .array(
      z.object({
        ratePlanId: z.string(),
        name: z.string(),
        total: z.number(),
        nightlyRate: z.number(),
        cleaningFee: z.number(),
        taxesAndFees: z.number().optional(),
        cancellationPolicy: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const checkoutRouter = router({
  /** Feature flag — checkout_v2 rollout is controlled by env on the server. */
  isEnabled: publicProcedure.query(() => ({
    enabled: process.env.CHECKOUT_V2 === "true",
  })),

  createIntent: publicProcedure
    .input(
      z.object({
        listingId: z.string().min(1).max(64),
        propertyName: z.string().max(255).optional(),
        propertySlug: z.string().max(255).optional(),
        destination: z.string().max(255).optional(),
        guestyQuoteId: z.string().max(64).optional(),
        checkIn: z.string().regex(DATE_RE),
        checkOut: z.string().regex(DATE_RE),
        guests: z.number().int().min(1).max(30),
        ratePlanId: z.string().max(64).optional(),
        quote: quoteSnapshotSchema,
        locale: z.string().max(5).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = randomUUID();
      const created = await createBookingIntent({
        id,
        listingId: input.listingId,
        propertyName: input.propertyName,
        propertySlug: input.propertySlug,
        destination: input.destination,
        guestyQuoteId: input.guestyQuoteId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        ratePlanId: input.ratePlanId,
        quote: input.quote,
        status: "draft",
        locale: input.locale,
        expiresAt: new Date(Date.now() + INTENT_TTL_MS),
      });
      // null → DB unavailable; the client falls back to the legacy flow
      return { intentId: created };
    }),

  getIntent: publicProcedure
    .input(z.object({ intentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const intent = await getBookingIntent(input.intentId);
      if (!intent) return { intent: null, expired: false };
      const expired =
        intent.status === "expired" ||
        (intent.expiresAt != null && intent.expiresAt.getTime() < Date.now());
      return { intent, expired };
    }),

  updateIntent: publicProcedure
    .input(
      z.object({
        intentId: z.string().uuid(),
        patch: z.object({
          email: z.string().email().max(320).optional(),
          guestFirstName: z.string().max(100).optional(),
          guestLastName: z.string().max(100).optional(),
          guestPhone: z.string().max(50).optional(),
          nif: z.string().max(20).optional(),
          ratePlanId: z.string().max(64).optional(),
          checkIn: z.string().regex(DATE_RE).optional(),
          checkOut: z.string().regex(DATE_RE).optional(),
          guests: z.number().int().min(1).max(30).optional(),
          guestyQuoteId: z.string().max(64).optional(),
          quote: quoteSnapshotSchema.optional(),
          status: z
            .enum(["draft", "contact_captured", "payment_pending", "paid"])
            .optional(),
          reservationId: z.string().max(64).optional(),
          confirmationCode: z.string().max(64).optional(),
          locale: z.string().max(5).optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const current = await getBookingIntent(input.intentId);
      if (!current) return { ok: false };
      // A paid intent is immutable — a resumed capability link (or any UUID
      // holder) must never rewrite a completed booking's record.
      if (current.status === "paid") return { ok: false };
      const patch = { ...input.patch };
      // "paid" may only be recorded together with a confirmation code
      // (the legitimate writers — card success + return pages — always send it).
      if (patch.status === "paid" && !patch.confirmationCode && !current.confirmationCode) {
        delete patch.status;
      }
      const ok = await updateBookingIntent(input.intentId, patch);
      return { ok };
    }),

  /**
   * Email capture at the end of passo 1 (spec §4): stores the email on the
   * intent, flips status to contact_captured, and records a lead for the
   * Fase 4 recovery automation. Idempotent per intent (source+metadata).
   */
  captureLead: publicProcedure
    .input(
      z.object({
        intentId: z.string().uuid(),
        email: z.string().email().max(320),
        consent: z.boolean().default(false),
        locale: z.string().max(5).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const intent = await getBookingIntent(input.intentId);
      if (!intent) return { ok: false };

      const alreadyCaptured = intent.status !== "draft" && intent.email === input.email;
      await updateBookingIntent(input.intentId, {
        email: input.email,
        locale: input.locale ?? intent.locale ?? undefined,
        ...(intent.status === "draft" ? { status: "contact_captured" as const } : {}),
      });

      if (!alreadyCaptured) {
        try {
          await createLead({
            email: input.email,
            source: "checkout",
            metadata: {
              intentId: input.intentId,
              listingId: intent.listingId,
              checkIn: intent.checkIn,
              checkOut: intent.checkOut,
              consent: String(input.consent),
              locale: input.locale ?? "",
            },
          });
        } catch (error) {
          // Lead persistence must never block the funnel
          console.error("[Checkout] createLead failed:", error);
        }
      }
      return { ok: true };
    }),
});
