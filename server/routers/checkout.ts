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
  curateExtras,
  FLEX_CONFIG,
  CHECKOUT_RECEPTION,
  CHECKOUT_INCLUDED_KEYS,
} from "../config/checkout-extras";
import {
  createBookingIntent,
  getBookingIntent,
  updateBookingIntent,
  createLead,
} from "../db";
import { getPropertiesForSite } from "../services/properties-store";
import {
  sendCheckoutOpsManifest,
  sendCheckoutGuestConfirmation,
} from "../services/transactional-email";
import { appendReservationNote } from "../services/guesty-openapi-paypal";

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
  couponCode: z.string().max(40).optional(),
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

/** One selected extra as persisted on the intent (Fase 2) */
const extraSelectionSchema = z.object({
  sku: z.string().max(64),
  qty: z.number().int().min(1).max(30).optional(),
  people: z.number().int().min(1).max(30).optional(),
  sessions: z.number().int().min(1).max(30).optional(),
  days: z.number().int().min(1).max(60).optional(),
  /** Whole EUR computed client-side for display; null for on_request. The
   *  charged amount is NEVER taken from here — pricing is re-derived
   *  server-side when the single-charge path lands (2b). */
  amount: z.number().nullable(),
  fulfillment: z.enum(["instant", "needs_confirmation", "on_request"]).optional(),
});

/** A casa aceita animais? Amenity "pets allowed" do listing (fail-soft: false). */
async function listingAllowsPets(listingId?: string): Promise<boolean> {
  if (!listingId) return false;
  // Demo de design: mostra o circuito pet completo para revisão
  if (listingId === "demo-listing") return true;
  try {
    const props = await getPropertiesForSite();
    const prop = props.find((p: any) => (p.guestyId || p.listingId) === listingId);
    if (!prop) return false;
    const am = prop.amenities;
    const flat = Array.isArray(am)
      ? am
      : am && typeof am === "object"
        ? Object.values(am).flat()
        : [];
    return flat.some((a: any) => String(a).toLowerCase().includes("pets allowed"));
  } catch {
    return false;
  }
}

export const checkoutRouter = router({
  /**
   * Feature flag. Enabled by env (CHECKOUT_V2=true) anywhere, and ALWAYS on
   * for the dev deployment (host dev.portugalactive.com) — so the dev site
   * runs checkout 2.0 for everyone while production stays on the legacy flow
   * even after dev merges to main.
   */
  isEnabled: publicProcedure.query(({ ctx }) => {
    if (process.env.CHECKOUT_V2 === "true") return { enabled: true };
    const host = String(
      ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host || "",
    ).toLowerCase();
    return { enabled: host.startsWith("dev.") || host.startsWith("localhost") };
  }),

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
          extras: z.array(extraSelectionSchema).max(20).optional(),
          reception: z
            .object({
              type: z.enum(["self", "hosted"]),
              late: z.boolean().optional(),
            })
            .nullable()
            .optional(),
          flex: z.boolean().optional(),
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
      // Transicao para paid: ficha de servicos ao CS + manifesto na nota Guesty
      // (todos os metodos, fire-and-forget)
      if (ok && patch.status === "paid") {
        const m = { ...current, ...patch } as any;
        void sendCheckoutOpsManifest({
          confirmationCode: m.confirmationCode, reservationId: m.reservationId,
          propertyName: m.propertyName, checkIn: m.checkIn, checkOut: m.checkOut,
          guests: m.guests, email: m.email,
          guestName: [m.guestFirstName, m.guestLastName].filter(Boolean).join(" "),
          guestPhone: m.guestPhone, reception: m.reception, extras: m.extras,
          flex: m.flex, intentId: input.intentId,
        });
        // Confirmação premium ao hóspede — o email do Guesty é genérico, este
        // é ao nível do site (fire-and-forget, nunca trava o funil)
        if (m.email) {
          void sendCheckoutGuestConfirmation({
            email: m.email,
            guestFirstName: m.guestFirstName,
            propertyName: m.propertyName,
            destination: m.destination,
            checkIn: m.checkIn,
            checkOut: m.checkOut,
            guests: m.guests,
            confirmationCode: m.confirmationCode,
            reception: m.reception,
            extras: m.extras,
            flex: m.flex,
            total: m.quote?.total ?? null,
            locale: m.locale,
            intentId: input.intentId,
          });
        }
        const hasPayload = m.reception || (Array.isArray(m.extras) && m.extras.length) || m.flex;
        if (m.reservationId && hasPayload) {
          const lines = (Array.isArray(m.extras) ? m.extras : []).map((e: any) =>
            "- " + e.sku + (e.qty ? " x" + e.qty : "") + (e.days ? " " + e.days + " dias" : "") + (e.people ? " " + e.people + "p" : "") + " " + (e.amount != null ? e.amount + " EUR" : "(sob orcamento)") + (e.fulfillment === "needs_confirmation" ? " [CONFIRMAR 24H]" : ""));
          const note = "SERVICOS DO CHECKOUT:\nRececao: " + (m.reception?.type === "hosted" ? "presencial" + (m.reception.late ? " apos 21h" : "") : "self check-in") + "\nFlex: " + (m.flex ? "SIM" : "nao") + "\n" + lines.join("\n");
          void appendReservationNote(String(m.reservationId), note);
        }
      }
      return { ok };
    }),

  /**
   * Catálogo curado para o passo Personalizar (spec §5). A curadoria é
   * determinista e avaliada no servidor a partir do contexto da reserva
   * (região, noites, hóspedes, mês) — devolve os extras já ordenados, mais a
   * receção (escolha obrigatória) e o bloco "Incluído na sua estadia".
   */
  getExtras: publicProcedure
    .input(
      z
        .object({
          listingId: z.string().max(64).optional(),
          destination: z.string().max(64).optional(),
          nights: z.number().int().min(1).max(400).optional(),
          guests: z.number().int().min(1).max(30).optional(),
          month: z.number().int().min(1).max(12).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => ({
      extras: curateExtras({
        destination: input?.destination,
        nights: input?.nights ?? 1,
        guests: input?.guests ?? 2,
        month: input?.month,
        petsAllowed: await listingAllowsPets(input?.listingId),
      }),
      reception: CHECKOUT_RECEPTION,
      included: CHECKOUT_INCLUDED_KEYS,
      flex: FLEX_CONFIG,
      // C6: o campo de promo só aparece com campanha ativa (CHECKOUT_PROMO=true
      // no Render; sempre visível no dev para testes)
      promoEnabled: process.env.CHECKOUT_PROMO !== "false",
    })),

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
