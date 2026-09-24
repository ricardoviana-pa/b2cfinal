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
import { trustedStayQuote, assertQuotedTotal } from "../services/trusted-checkout-quote";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";
import { cardChargeIdempotencyKey, withCheckoutChargeLock } from "../lib/checkout-charge-attempt";
import { randomUUID } from "crypto";
import { sanitizePropertyName } from "@shared/displayName";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import {
  curateExtras,
  destinationIsSouth,
  FLEX_CONFIG,
  flexPriceFor,
  CHECKOUT_RECEPTION,
  CHECKOUT_INCLUDED_KEYS,
} from "../config/checkout-extras";
import {
  createBookingIntent,
  getBookingIntent,
  updateBookingIntent,
  createLead,
  promoteCheckoutLeadToNewsletter,
  demoteCheckoutLeadFromNewsletter,
} from "../db";
import { getPropertiesForSite } from "../services/properties-store";
import { resolveCleaningRates } from "../config/cleaning-rates";
import { PETS_ONLY_SKUS } from "../config/checkout-extras";
import {
  sendCheckoutOpsManifest,
  sendCheckoutGuestConfirmation,
} from "../services/transactional-email";
import { appendReservationNote } from "../services/guesty-openapi-paypal";
import { couponNoteLine } from "../services/coupon-note";

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

/** Dados do listing usados pelo catálogo (fail-soft). */
export async function listingFacts(listingId?: string): Promise<{ pets: boolean; bedrooms: number | null }> {
  if (!listingId) return { pets: false, bedrooms: null };
  if (listingId === "demo-listing") return { pets: true, bedrooms: 4 };
  try {
    const props = await getPropertiesForSite();
    const prop = props.find((p: any) => (p.guestyId || p.listingId) === listingId);
    if (!prop) return { pets: false, bedrooms: null };
    const am = prop.amenities;
    const flat = Array.isArray(am) ? am : am && typeof am === "object" ? Object.values(am).flat() : [];
    return {
      pets: flat.some((a: any) => String(a).toLowerCase().includes("pets allowed")),
      bedrooms: prop.bedrooms != null ? Number(prop.bedrooms) : null,
    };
  } catch {
    return { pets: false, bedrooms: null };
  }
}

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


/** Espelho de client/src/lib/images.ts optimizeGuestyImage, com crop 3:2 para
 *  o hero do email (600px de largura no cartão). */
function heroImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.includes("assets.guesty.com/image/upload/")) return raw;
  if (/\/image\/upload\/[a-z]{1,3}_/.test(raw)) return raw;
  return raw.replace("/image/upload/", "/image/upload/w_1200,ar_3:2,c_fill,q_auto,f_auto/");
}

/** Primeira foto da casa do intent, por slug ou id Guesty. Fail-soft. */
async function resolveIntentPhoto(intent: {
  propertySlug?: string | null;
  listingId?: string | null;
}): Promise<string | undefined> {
  try {
    const props = await getPropertiesForSite();
    const prop = (props as any[]).find(
      (p) =>
        (intent.propertySlug && p.slug === intent.propertySlug) ||
        (p.guestyId || p.listingId) === intent.listingId,
    );
    return heroImageUrl(prop?.images?.[0]);
  } catch {
    return undefined;
  }
}

/**
 * Emails + nota Guesty da transição para paid (manifesto CS + confirmação
 * premium do hóspede). Partilhado: o updateIntent chama-o no caminho normal
 * (cliente fecha a reserva) e o webhook chama-o quando é ele a fechar (o
 * cliente morreu depois do pagamento). Fire-and-forget, nunca lança.
 */
export async function fireCheckoutPaidEmails(m: any, intentId: string): Promise<void> {
  try {
    const { breakdownFromIntent } = await import("../services/checkout-card-charge");
    const canonical = (() => {
      try { const b = breakdownFromIntent(m); return { lines: b.lines, receptionCents: b.receptionCents, flexCents: b.flexCents, totalCents: b.totalCents }; }
      catch { return null; }
    })();
    // M13 (spec §13): CAPI server-side do Purchase — este é o ponto único por
    // onde TODAS as transições para paid passam (cartão, wallets, PayPal,
    // Klarna, webhook, sweep). event_id = confirmationCode deduplica com o
    // Pixel do GTM. Fire-and-forget, nunca trava emails nem pagamentos.
    if (m.confirmationCode) {
      const purchaseValue = canonical
        ? canonical.totalCents / 100
        : Number(m.quote?.total ?? 0);
      void import("../services/meta-capi")
        .then(({ sendMetaPurchase }) =>
          sendMetaPurchase({
            eventId: String(m.confirmationCode),
            value: purchaseValue,
            currency: String(m.quote?.currency ?? "EUR"),
            email: m.email,
            phone: m.guestPhone,
            contentName: m.propertyName,
            sourceUrl: `https://www.portugalactive.com/${m.locale || "en"}/checkout/${intentId}`,
          }),
        )
        .catch(() => {/* marketing nunca parte o funil */});
    }
    const photoPromise = resolveIntentPhoto(m).catch(() => undefined);
    void photoPromise.then((imageUrl) => sendCheckoutOpsManifest({
      canonical,
      imageUrl,
      confirmationCode: m.confirmationCode, reservationId: m.reservationId,
      propertyName: m.propertyName, checkIn: m.checkIn, checkOut: m.checkOut,
      guests: m.guests, email: m.email,
      guestName: [m.guestFirstName, m.guestLastName].filter(Boolean).join(" "),
      guestPhone: m.guestPhone, reception: m.reception, extras: m.extras,
      flex: m.flex, intentId,
    }));
    // Confirmação premium ao hóspede — o email do Guesty é genérico, este
    // replica o checkout do site: foto da casa, cartão de resumo com o
    // breakdown e total, estadia à medida (fire-and-forget, nunca trava o funil)
    if (m.email) {
      const receptionAmount =
        m.reception?.type === "hosted"
          ? m.reception.late
            ? CHECKOUT_RECEPTION.hostedLatePrice
            : CHECKOUT_RECEPTION.hostedPrice
          : 0;
      void photoPromise
        .then((imageUrl) =>
          sendCheckoutGuestConfirmation({
            canonical,
            email: m.email,
            guestFirstName: m.guestFirstName,
            propertyName: sanitizePropertyName(m.propertyName || ""),
            destination: m.destination,
            checkIn: m.checkIn,
            checkOut: m.checkOut,
            guests: m.guests,
            confirmationCode: m.confirmationCode,
            reception: m.reception,
            receptionAmount,
            extras: m.extras,
            flex: m.flex,
            flexPrice: flexPriceFor((m.quote as any)?.totalNights),
            quote: m.quote ?? null,
            imageUrl,
            // Direto à página da reserva (foto, valores, código) — o link de
            // retoma do checkout mostrava um interstício seco "verifique o seu
            // email" a quem vinha DO email (16 ago).
            viewUrl: m.reservationId
              ? `${CHECKOUT_EMAIL_ORIGIN}/${m.locale || "en"}/booking/thank-you/${m.reservationId}?method=card`
              : `${CHECKOUT_EMAIL_ORIGIN}/${m.locale || "en"}/checkout/${intentId}`,
            locale: m.locale,
            intentId,
          }),
        )
        .catch((err: any) =>
          console.error(`[GuestConfirmation] falhou (intent ${intentId}):`, err?.message),
        );
    }
    const hasPayload = m.reception || (Array.isArray(m.extras) && m.extras.length) || m.flex;
    // O código promocional vai na MESMA nota (duas escritas em paralelo à nota
    // da reserva perdem uma: o append é ler, juntar, gravar).
    const couponLine = couponNoteLine(m.quote);
    if (m.reservationId && !hasPayload && couponLine) {
      void appendReservationNote(String(m.reservationId), couponLine);
    }
    if (m.reservationId && hasPayload) {
      const lines = (Array.isArray(m.extras) ? m.extras : []).map((e: any) =>
        "- " + e.sku + (e.qty ? " x" + e.qty : "") + (e.days ? " " + e.days + " dias" : "") + (e.people ? " " + e.people + "p" : "") + " " + (e.amount != null ? e.amount + " EUR" : "(sob orcamento)") + (e.fulfillment === "needs_confirmation" ? " [CONFIRMAR 24H]" : ""));
      const note = (couponLine ? couponLine + "\n" : "") + "SERVICOS DO CHECKOUT:\nRececao: " + (m.reception?.type === "hosted" ? "presencial" + (m.reception.late ? " apos 21h" : "") : "self check-in") + "\nFlex: " + (m.flex ? "SIM" : "nao") + "\n" + lines.join("\n");
      void appendReservationNote(String(m.reservationId), note);
    }
  } catch (err: any) {
    console.error(`[Card2b] fireCheckoutPaidEmails falhou (intent ${intentId}):`, err?.message);
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
      const trusted = await trustedStayQuote(input);
      assertQuotedTotal(input.quote, trusted.quote);
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
        ratePlanId: trusted.ratePlanId,
        quote: trusted.quote,
        status: "draft",
        locale: input.locale,
        expiresAt: trusted.expiresAt,
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
          extras: z.array(extraSelectionSchema).max(40).optional(),
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
    .mutation(async ({ input }) => withCheckoutChargeLock(input.intentId, async () => {
      const current = await getBookingIntent(input.intentId);
      if (!current) return { ok: false };
      // A paid intent is immutable — a resumed capability link (or any UUID
      // holder) must never rewrite a completed booking's record.
      if (current.status === "paid") return { ok: false };
      const patch = { ...input.patch };
      if (patch.status === "paid" || patch.reservationId || patch.confirmationCode) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Payment confirmation is managed by the server." });
      }
      // Gate Guesty sempre ligado: extras pet nunca persistem numa casa que
      // não aceita animais (defesa contra adulteração/dados desatualizados)
      if (patch.extras?.some((e) => PETS_ONLY_SKUS.includes(e.sku))) {
        const facts = await listingFacts((current as any).listingId);
        if (!facts.pets) {
          console.warn(`[Checkout] intent ${input.intentId}: extras pet removidos — listing não aceita animais`);
          patch.extras = patch.extras.filter((e) => !PETS_ONLY_SKUS.includes(e.sku));
        }
      }
      // Requote com quote nova renova a validade do link de retoma (AUDIT)
      const dbPatch: Record<string, unknown> = { ...patch };
      if (patch.quote || patch.guestyQuoteId || patch.ratePlanId || patch.checkIn || patch.checkOut || patch.guests) {
        const trusted = await trustedStayQuote({ ...current, ...patch } as any);
        Object.assign(dbPatch, { quote: trusted.quote, ratePlanId: trusted.ratePlanId, expiresAt: trusted.expiresAt });
      }
      const ok = await updateBookingIntent(input.intentId, dbPatch as any);
      return { ok };
    })),

  /**
   * Catálogo curado para o passo Personalizar (spec §5). A curadoria é
   * determinista e avaliada no servidor a partir do contexto da reserva
   * (região, noites, hóspedes, mês) — devolve os extras já ordenados, mais a
   * receção (escolha obrigatória) e o bloco "Incluído na sua estadia".
   */
  /** 2b: cria o PI de plataforma com o total canonico (nunca valores do cliente).
   *  wallet=true (fila express): PI automatic_payment_methods — a sessao ECE e
   *  automatic. Sem wallet (card form): PI types:[card] — a sessao e types.
   *  Formatos trocados sao recusados pelo Stripe no confirm (vistos 16 e 21 ago). */
  createCardCharge: publicProcedure
    .input(z.object({ intentId: z.string().uuid(), wallet: z.boolean().optional() }))
    .mutation(async ({ input }) => withCheckoutChargeLock(input.intentId, async () => {
      const m = await getBookingIntent(input.intentId);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      if ((m as any).status === "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "already paid" });
      const { breakdownFromIntent } = await import("../services/checkout-card-charge");
      const { createCardPaymentIntent } = await import("../services/stripe-klarna");
      const factsForCharge = await listingFacts((m as any).listingId);
      const mSafe = factsForCharge.pets
        ? m
        : { ...m, extras: ((m as any).extras ?? []).filter((e: any) => !PETS_ONLY_SKUS.includes(e.sku)) };
      let b = breakdownFromIntent(mSafe, factsForCharge.bedrooms);
      if (!Number.isSafeInteger(b.totalCents) || b.totalCents < 100) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "invalid total" });
      }
      // RETRY SEGURO (finding 15 ago): se já existe um PI para este intent,
      // retoma-o — nunca criar um segundo e arriscar dupla cobrança
      const priorPi = (m as any).paymentIntentId as string | null;
      if (priorPi) {
        const { getPaymentIntent } = await import("../services/stripe-klarna");
        // An unknown outcome is not permission to start a second payment.
        const prev = await getPaymentIntent(priorPi);
        if (prev.metadata?.flow !== "card_v2" || prev.metadata?.intentId !== input.intentId || prev.currency !== "eur") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "payment does not belong to this checkout" });
        }
        if (prev.status === "succeeded") {
          return { clientSecret: null, paymentIntentId: prev.id, totalCents: prev.amount, alreadyPaid: true };
        }
        if (["processing", "requires_capture"].includes(prev.status)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "payment is still processing; do not pay again" });
        }
      }
      const expiresAt = m.expiresAt ? new Date(m.expiresAt).getTime() : NaN;
      if (m.status === "expired" || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "quote expired; refresh the price before paying" });
      }
      if (String((m.quote as any)?.currency ?? "EUR").toUpperCase() !== "EUR") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "unsupported quote currency" });
      }
      const trusted = await trustedStayQuote(m as any);
      assertQuotedTotal(m.quote, trusted.quote);
      b = breakdownFromIntent({ ...mSafe, quote: trusted.quote }, factsForCharge.bedrooms);
      // Recheck de disponibilidade à entrada do pagamento (spec §14): uma data
      // entretanto ocupada tem de falhar ANTES do dinheiro sair, não depois.
      // Fail-open: se o calendário não responder, o settle continua a ser a
      // última linha de defesa (a reserva Guesty falha e o alerta dispara).
      try {
        const { checkAvailability } = await import("../services/guesty");
        const avail = await checkAvailability((m as any).listingId, (m as any).checkIn, (m as any).checkOut);
        if (avail && avail.available === false) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "dates no longer available" });
        }
      } catch (availErr: any) {
        if (availErr instanceof TRPCError) throw availErr;
        console.warn(`[Card2b] recheck de disponibilidade falhou (fail-open): ${availErr?.message}`);
      }
      if (priorPi) {
        const { getPaymentIntent, cancelPaymentIntent } = await import("../services/stripe-klarna");
        const prev = await getPaymentIntent(priorPi);
        // Recheck after the validity checks in case a callback completed it.
        if (prev.status === "succeeded") {
          return { clientSecret: null, paymentIntentId: prev.id, totalCents: prev.amount, alreadyPaid: true };
        }
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(prev.status)) {
          const sameFormat = !!prev.automatic_payment_methods?.enabled === !!input.wallet;
          if (prev.amount === b.totalCents && sameFormat) {
            return { clientSecret: prev.client_secret!, paymentIntentId: prev.id, totalCents: b.totalCents, alreadyPaid: false };
          }
          // Retire the stale amount/method before exposing a replacement.
          // A cancel failure is surfaced; it must never be swallowed.
          await cancelPaymentIntent(prev.id);
        } else if (prev.status !== "canceled") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "payment is still processing; do not pay again" });
        }
      }
      if (b.divergent.length) console.warn(`[Card2b] client amounts diverged intent=${input.intentId}: ${b.divergent.join(",")}`);
      const paymentParams = {
        amount: b.totalCents,
        currency: "eur",
        wallet: !!input.wallet,
        metadata: (() => {
          const metadata: Record<string, string> = {
            flow: "card_v2",
            intentId: input.intentId,
            listingId: (m as any).listingId,
            stayCents: String(b.stayCents),
            extrasCents: String(b.extrasCents + b.receptionCents + b.flexCents),
            receptionCents: String(b.receptionCents),
            flexCents: String(b.flexCents),
          };
          // Bloco 4: linhas por sku para reembolso parcial (limite Stripe:
          // 500 chars por valor — se não couber, o refund recalcula do intent)
          const lines = b.lines.map((l) => `${l.sku}:${l.cents}`).join("|");
          if (lines && lines.length <= 480) metadata.lines = lines;
          return metadata;
        })(),
      };
      const pi = await createCardPaymentIntent({ ...paymentParams,
        idempotencyKey: cardChargeIdempotencyKey(paymentParams, priorPi || null),
      });
      const saved = await updateBookingIntent(input.intentId, { paymentIntentId: pi.id } as any);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "payment could not be saved; retry the same checkout" });
      return { clientSecret: pi.client_secret!, paymentIntentId: pi.id, totalCents: b.totalCents, alreadyPaid: false };
    })),

  /** 2b: finaliza apos confirmPayment — cria a reserva Guesty (so estadia). */
  finalizeCardCharge: publicProcedure
    .input(z.object({ intentId: z.string().uuid(), paymentIntentId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { settleCardCharge } = await import("../services/checkout-card-charge");
      try {
        return await settleCardCharge(input.intentId, input.paymentIntentId);
      } catch (err: any) {
        // Spec §14: "nunca dinheiro cobrado sem reserva criada" SEM ninguém
        // saber. Um settle falhado depois de o PI ter sucedido é exatamente
        // esse caso — alerta imediato; o sweep e o webhook continuam a tentar.
        const msg = String(err?.message ?? err);
        const benign = /not succeeded|does not belong|intent not found/i.test(msg);
        if (!benign) {
          const { alertFailedSettle } = await import("../services/checkout-card-charge");
          void alertFailedSettle(input.intentId, input.paymentIntentId, msg, "finalize");
        }
        throw err;
      }
    }),

  /**
   * Barra de campanha no topo do site (announcement bar, padrão ecommerce).
   * Configurável por env no Render sem deploy:
   *   PROMO_BANNER='{"code":"OUTONO10","until":"2026-10-31","en":"Autumn escape — code {code} for 10% off","pt":"Fuga de outono — código {code} com 10% de desconto"}'
   * Forma curta: PROMO_BANNER='OUTONO10|10% off with code OUTONO10'
   * Vazio, inválido ou depois de `until` → sem barra.
   */
  promoBanner: publicProcedure.query(() => {
    const off = { code: null as string | null, texts: {} as Record<string, string> };
    const raw = (process.env.PROMO_BANNER || "").trim();
    if (!raw) return off;
    try {
      if (raw.startsWith("{")) {
        const j = JSON.parse(raw) as Record<string, unknown>;
        const code = String(j.code ?? "").trim();
        if (!code) return off;
        if (j.until && Date.now() > new Date(`${String(j.until)}T23:59:59`).getTime()) return off;
        const texts: Record<string, string> = {};
        for (const [k, v] of Object.entries(j)) {
          if (/^[a-z]{2}$/.test(k) && typeof v === "string") texts[k] = v;
        }
        return { code, texts };
      }
      const [code, ...rest] = raw.split("|");
      if (!code.trim()) return off;
      return { code: code.trim(), texts: rest.length ? { en: rest.join("|").trim() } : {} };
    } catch {
      return off;
    }
  }),

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
    .query(async ({ input, ctx }) => {
      const facts = await listingFacts(input?.listingId);
      const cleaning = resolveCleaningRates(input?.listingId, facts.bedrooms);
      const curated = curateExtras({
        destination: input?.destination,
        nights: input?.nights ?? 1,
        guests: input?.guests ?? 2,
        month: input?.month,
        petsAllowed: facts.pets,
      }).map((e) =>
        e.sku === "daily-cleaning"
          ? { ...e, unitPrice: cleaning.daily }
          : e.sku === "deep-cleaning"
            ? { ...e, unitPrice: cleaning.deep }
            : e,
      );
      return {
      extras: curated,
      // B2: aeroporto proposto por defeito (o par Porto/Lisboa vai completo;
      // o cliente mostra um seletor no card)
      defaultAirport: destinationIsSouth(input?.destination) ? ("lisbon" as const) : ("porto" as const),
      reception: CHECKOUT_RECEPTION,
      included: CHECKOUT_INCLUDED_KEYS,
      flex: FLEX_CONFIG,
      // Campo de promo visível por defeito — há campanhas de marketing ativas
      // com códigos (set 2026). Kill switch: CHECKOUT_PROMO=false no Render.
      // (A auditoria de setembro tinha-o tornado opt-in e escondeu o campo em
      // produção a meio de uma campanha.)
      promoEnabled: process.env.CHECKOUT_PROMO !== "false",
      };
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

      try {
        if (!alreadyCaptured) {
          await createLead({
            email: input.email,
            // O consentimento decide o SEGMENTO, não só um campo solto: o
            // backoffice filtra leads por prefixo do source, portanto quem
            // aceita entra em "newsletter-" (mailing list, remarketing) e
            // quem não aceita fica em "checkout" — email usável apenas na
            // recuperação transacional do próprio carrinho, nunca em
            // campanhas (RGPD: sem opt-in não há base para marketing).
            source: input.consent ? "newsletter-checkout" : "checkout",
            metadata: {
              intentId: input.intentId,
              listingId: intent.listingId,
              checkIn: intent.checkIn,
              checkOut: intent.checkOut,
              consent: String(input.consent),
              locale: input.locale ?? "",
            },
          });
        } else if (input.consent) {
          // Voltou atrás e aceitou depois de o lead já existir: promove o
          // registo em vez de criar um duplicado.
          await promoteCheckoutLeadToNewsletter(input.email);
        } else {
          // ...e desmarcar retira. Sem este ramo o consentimento era
          // write-once: quem aceitava, voltava atrás e desmarcava ficava na
          // mailing list na mesma. Vence sempre o último estado da caixa.
          await demoteCheckoutLeadFromNewsletter(input.email);
        }
      } catch (error) {
        // Lead persistence must never block the funnel
        console.error("[Checkout] createLead failed:", error);
      }
      return { ok: true };
    }),
});
