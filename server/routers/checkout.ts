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
import { planPolicyCode } from "@shared/cancellationPolicy";
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
import { invoiceNifNoteLine } from "../services/invoice-nif";
import { mergeVisitOrigins, originNoteEnabled, originNoteLine, parseVisitOriginPayload } from "../services/visit-origin";
import { getIntentOrigin, saveIntentOrigin } from "../services/visit-origin-store";
import { deleteAdSignals, getAdSignals, requestClientIp, saveAdSignals } from "../services/ad-signals-store";
import { computePaymentPlan } from "../services/checkout-pricing";
import { readTwoPartsConfig, splitTwoParts } from "../services/payment-plan";
import {
  effectiveFlexChoice,
  fullPaymentGiftPatchFor,
  grantFullPaymentGiftPatch,
  intentPaymentPlan,
  isFullPaymentGift,
  offerForIntent,
  publicIntent,
  revokeFullPaymentGiftPatch,
  withoutExpiredFullPaymentGift,
} from "../services/checkout-plan";
import { FLEX_IMMEDIATE_CONSENT_VERSION, renderTwoPartsMandate } from "../services/two-parts-mandate";

/** Cookies _fbp/_fbc do pixel (client/src/lib/adSignals.ts). Formato validado na gravação. */
const adSignalsSchema = z.object({
  fbp: z.string().max(255).optional(),
  fbc: z.string().max(512).optional(),
});

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

/** Purchase na CAPI da Meta, só para intents com sinais (consentimento). */
async function sendCapiPurchase(m: any, intentId: string, value: number): Promise<void> {
  const { isMetaCapiConfigured, sendMetaEvent } = await import("../services/meta-capi");
  if (!isMetaCapiConfigured()) return;
  const { getAdSignals } = await import("../services/ad-signals-store");
  const signals = await getAdSignals(intentId);
  if (!signals) return;
  await sendMetaEvent({
    eventName: "Purchase",
    eventId: String(m.confirmationCode),
    value,
    currency: String(m.quote?.currency ?? "EUR"),
    contentId: m.listingId,
    contentName: m.propertyName,
    orderId: String(m.confirmationCode),
    numItems: 1,
    email: m.email,
    phone: m.guestPhone,
    sourceUrl: `https://www.portugalactive.com/${m.locale || "en"}/checkout/${intentId}`,
    signals,
  });
}

/**
 * Emails + nota Guesty da transição para paid (manifesto CS + confirmação
 * premium do hóspede). Partilhado: o updateIntent chama-o no caminho normal
 * (cliente fecha a reserva) e o webhook chama-o quando é ele a fechar (o
 * cliente morreu depois do pagamento). Fire-and-forget, nunca lança.
 */
export async function fireCheckoutPaidEmails(m: any, intentId: string, pricing?: { flexGift?: boolean; at?: number }): Promise<void> {
  try {
    // Os valores dos emails e do manifesto são os que o cartão cobrou: limpeza
    // pelos quartos da casa, sem extras de animais numa casa que não os aceita,
    // e o Flex como foi cobrado (a oferta pode ter expirado desde o pagamento).
    const { listingBreakdownFromIntent } = await import("../services/checkout-card-charge");
    const canonical = await listingBreakdownFromIntent(m, pricing ?? {})
      .then((b) => ({ lines: b.lines, stayCents: b.stayCents, receptionCents: b.receptionCents, flexCents: b.flexCents, totalCents: b.totalCents }))
      .catch(() => null);
    // M13 (spec §13): CAPI server-side do Purchase — este é o ponto único por
    // onde TODAS as transições para paid passam (cartão, wallets, PayPal,
    // Klarna, webhook, sweep). event_id = confirmationCode deduplica com o
    // Pixel do GTM. Valor = só a estadia (decisão 10/10/2026), igual ao
    // purchase do browser. Só com sinais gravados (= "Aceitar tudo").
    // Fire-and-forget, nunca trava emails nem pagamentos.
    if (m.confirmationCode) {
      const purchaseValue = canonical
        ? canonical.stayCents / 100
        : Number(m.quote?.total ?? 0);
      void sendCapiPurchase(m, intentId, purchaseValue).catch(() => {/* marketing nunca parte o funil */});
    }
    const photoPromise = resolveIntentPhoto(m).catch(() => undefined);
    // Pagamento em duas partes: os emails dizem o que foi pago hoje e o que
    // fica para a data marcada, a partir da linha da 2.ª parte (congelada no
    // settle). Sem linha, ou no plano integral, os emails ficam como sempre.
    const planPromise: Promise<import("../services/transactional-email").CheckoutPlanSummary | null> =
      m.paymentPlan === "two_parts"
        ? (async () => {
            const { getScheduledPaymentByIntent } = await import("../db");
            const row: any = await getScheduledPaymentByIntent(intentId);
            if (!row) return null;
            let manageUrl: string | null = null;
            try {
              const { balanceLinkUrl, balanceLinkExpiresAt } = await import("../services/balance-link");
              manageUrl = balanceLinkUrl(intentId, m.locale, balanceLinkExpiresAt(row));
            } catch {
              manageUrl = null; // sem segredo do link: sem botão, nunca um link falso
            }
            return {
              amountTodayCents: Number(row.depositCents),
              amountLaterCents: Number(row.balanceCents),
              chargeAt: new Date(row.chargeAt),
              freeCancelDeadlineAt: new Date(row.freeCancelDeadline),
              cardLast4: row.cardLast4 ?? null,
              manageUrl,
            };
          })().catch((err: any) => {
            console.error(`[TwoParts] plano para os emails indisponivel (intent ${intentId}): ${err?.message}`);
            return null;
          })
        : Promise.resolve(null);
    // Origem da visita (UTM, clique, referrer): nota da reserva e email
    // [Venda direta]. Nunca vai para a CAPI, a Stripe nem o dataLayer.
    const originPromise = getIntentOrigin(intentId).catch(() => null);
    // NIF para a fatura (spec 5.13): 1.ª ação do email ao CS e topo da nota
    // da reserva, para TODOS os métodos, porque todos passam por aqui. Antes
    // só o settle do cartão o punha, no fim da nota (a parte que cai num
    // corte); PayPal e Klarna perdiam-no. Nenhum outro campo do Guesty até
    // se confirmar qual é o que a Hostkit lê.
    const nifLine = invoiceNifNoteLine(m.nif);
    void Promise.all([photoPromise, originPromise, planPromise]).then(([imageUrl, origin, plan]) => sendCheckoutOpsManifest({
      plan,
      canonical,
      imageUrl,
      origin,
      nif: m.nif ?? null,
      couponCode: (m.quote as any)?.couponCode ?? null,
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
      // Política da tarifa paga, com a mesma classificação de todo o site
      // (planPolicyCode): código Guesty da quote do intent (ou o nome
      // "Não-Reembolsável"); sem código, o rate plan da casa no Guesty, com
      // limite de tempo. Nunca adivinhada, nunca o nome interno da tarifa.
      const paidPlan = (Array.isArray((m.quote as any)?.ratePlanOptions) ? (m.quote as any).ratePlanOptions : [])
        .find((o: any) => o?.ratePlanId && o.ratePlanId === m.ratePlanId);
      const quotedCode = planPolicyCode(paidPlan);
      const cancellationPromise: Promise<{ policy: unknown } | null> =
        quotedCode
          ? Promise.resolve({ policy: quotedCode })
          : m.listingId && m.ratePlanId
            ? import("../services/rate-plan-policy")
                .then(({ ratePlanPolicyFor, withTimeout }) =>
                  withTimeout(
                    ratePlanPolicyFor(String(m.listingId), String(m.ratePlanId)).then((p) => ({
                      policy: planPolicyCode({ ...p, name: p.name ?? paidPlan?.name }),
                    })),
                    10_000,
                    { policy: null },
                  ),
                )
                .catch(() => ({ policy: null }))
            : Promise.resolve(null);
      void Promise.all([photoPromise, cancellationPromise, planPromise])
        .then(([imageUrl, cancellation, plan]) =>
          sendCheckoutGuestConfirmation({
            plan,
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
            cancellation,
            intentId,
          }),
        )
        .catch((err: any) =>
          console.error(`[GuestConfirmation] falhou (intent ${intentId}):`, err?.message),
        );
    }
    const hasPayload = m.reception || (Array.isArray(m.extras) && m.extras.length) || m.flex;
    // O código promocional e a origem da visita vão na MESMA nota (duas
    // escritas em paralelo à nota da reserva perdem uma: o append é ler,
    // juntar, gravar). A linha "Origem:" só com VISIT_ORIGIN_NOTE=1, depois de
    // o pa-marketing a separar da procura dos códigos (originNoteEnabled).
    const couponLine = couponNoteLine(m.quote);
    const originLine = originNoteEnabled() ? originNoteLine(await originPromise) : "";
    const headLines = [couponLine, originLine].filter(Boolean).join("\n");
    let note = headLines;
    if (hasPayload) {
      const lines = (Array.isArray(m.extras) ? m.extras : []).map((e: any) =>
        "- " + e.sku + (e.qty ? " x" + e.qty : "") + (e.days ? " " + e.days + " dias" : "") + (e.people ? " " + e.people + "p" : "") + " " + (e.amount != null ? e.amount + " EUR" : "(sob orcamento)") + (e.fulfillment === "needs_confirmation" ? " [CONFIRMAR 24H]" : ""));
      note = (headLines ? headLines + "\n" : "") + "SERVICOS DO CHECKOUT:\nRececao: " + (m.reception?.type === "hosted" ? "presencial" + (m.reception.late ? " apos 21h" : "") : "self check-in") + "\nFlex: " + (m.flex ? "SIM" : "nao") + "\n" + lines.join("\n");
    }
    // Uma só escrita: o NIF no topo do campo e o resto no fim. Duas escritas
    // em paralelo perdiam uma (ler, juntar, gravar).
    if (m.reservationId && (note || nifLine)) {
      void (nifLine
        ? appendReservationNote(String(m.reservationId), note, { prepend: nifLine })
        : appendReservationNote(String(m.reservationId), note));
    }
  } catch (err: any) {
    console.error(`[Card2b] fireCheckoutPaidEmails falhou (intent ${intentId}):`, err?.message);
  }
}

/**
 * Oferta de duas partes para o ecrã do checkout, com os valores que o
 * createCardCharge vai cobrar: o depósito mede-se sem o Flex oferecido pelo
 * pagamento integral (que se retira em duas partes) e o "tudo agora" com ele.
 */
async function clientPaymentPlanFor(intent: any) {
  if (intent.status === "paid") return { available: false as const, reason: null };
  const config = readTwoPartsConfig();
  if (!config.enabled) return { available: false as const, reason: "disabled" as const };
  const { breakdownFromIntent } = await import("../services/checkout-card-charge");
  const facts = await listingFacts(intent.listingId);
  const petSafe = (x: any) => facts.pets
    ? x
    : { ...x, extras: ((x as any).extras ?? []).filter((e: any) => !PETS_ONLY_SKUS.includes(e.sku)) };
  const asTwoParts = { ...intent, ...(revokeFullPaymentGiftPatch(intent) ?? {}) };
  const bTwo = breakdownFromIntent(petSafe(asTwoParts), facts.bedrooms);
  const offer = offerForIntent(intent, bTwo, { config });
  if (!offer.available) return { available: false as const, reason: offer.reason };
  const asFull = { ...intent, ...(offer.incentive === "flex" ? grantFullPaymentGiftPatch(intent) ?? {} : {}) };
  const bFull = breakdownFromIntent(petSafe(asFull), facts.bedrooms);
  const full = computePaymentPlan({ breakdown: bFull, offer, requested: "full", wallet: false });
  const split = splitTwoParts(bTwo);
  const mandate = renderTwoPartsMandate(intent.locale, {
    amountLaterCents: split.balanceCents,
    chargeAt: offer.instants.chargeAt,
    retryAt: offer.instants.retryAt,
    freeCancelDeadlineAt: offer.instants.freeCancelDeadlineAt,
  });
  return {
    available: true as const,
    reason: null,
    policyCode: offer.schedule.policyCode,
    incentive: offer.incentive,
    fullTodayCents: full.amountDueTodayCents,
    depositCents: split.depositCents,
    depositStayCents: split.depositStayCents,
    balanceCents: split.balanceCents,
    chargeAt: offer.instants.chargeAt.toISOString(),
    retryAt: offer.instants.retryAt.map((d) => d.toISOString()),
    freeCancelDeadlineAt: offer.instants.freeCancelDeadlineAt.toISOString(),
    hardStopAt: offer.instants.hardStopAt.toISOString(),
    mandate: { lang: mandate.lang, checkbox: mandate.checkbox, text: mandate.text, version: mandate.version },
  };
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
        /** Origem da visita (shared/visit-origin.ts). Validada à parte: um
         *  valor inválido nunca impede o checkout, só fica sem origem. */
        origin: z.unknown().optional(),
        /** Sinais da Meta (client/src/lib/adSignals.ts): só vêm com
         *  "Aceitar tudo" no site live. Validados na gravação. */
        adSignals: adSignalsSchema.optional(),
        /** event_id do begin_checkout/InitiateCheckout do pixel */
        initiateCheckoutEventId: z.string().regex(/^ic-[A-Za-z0-9-]{8,64}$/).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
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
      if (created && input.origin !== undefined) {
        const origin = parseVisitOriginPayload(input.origin);
        if (origin) await saveIntentOrigin(created, origin).catch(() => false);
        else console.warn(`[VisitOrigin] origem recusada (intent ${created}): formato inválido`);
      }
      if (created && input.adSignals) {
        const headers = ctx.req.headers as Record<string, unknown>;
        void saveAdSignals(created, input.adSignals, headers)
          .then(async (saved) => {
            if (!saved || !input.initiateCheckoutEventId) return;
            const { sendMetaEvent } = await import("../services/meta-capi");
            const signals = await getAdSignals(created);
            if (!signals) return;
            await sendMetaEvent({
              eventName: "InitiateCheckout",
              eventId: input.initiateCheckoutEventId,
              value: Number(trusted.quote.total ?? 0),
              currency: String(trusted.quote.currency ?? "EUR"),
              contentId: input.listingId,
              contentName: input.propertyName,
              numItems: 1,
              sourceUrl: `https://www.portugalactive.com/${input.locale || "en"}/homes/${input.propertySlug || ""}`,
              signals,
            });
          })
          .catch(() => {/* marketing nunca parte o funil */});
      }
      // null → DB unavailable; the client falls back to the legacy flow
      return { intentId: created };
    }),

  /**
   * Atualiza a origem da visita de um intent já criado, a partir da página de
   * checkout, sempre que lá houver uma escolha explícita no banner
   * (client/src/lib/visitOrigin.ts, watchCheckoutOrigin): "Aceitar tudo" junta
   * a origem deste aparelho (por exemplo um link de recuperação com UTM);
   * "Apenas essenciais" apaga a origem do intent, também quando foi retirada
   * noutra página. Sem escolha o navegador não manda nada. Só mexe na tabela
   * das origens; nunca depois de pago.
   */
  setOrigin: publicProcedure
    .input(z.object({ intentId: z.string().uuid(), origin: z.unknown(), adSignals: adSignalsSchema.optional() }))
    .mutation(async ({ input, ctx }) => {
      const incoming = parseVisitOriginPayload(input.origin);
      if (!incoming) return { ok: false };
      const current = await getBookingIntent(input.intentId);
      if (!current || current.status === "paid") return { ok: false };
      // Sinais da CAPI da Meta seguem a mesma escolha: "Aceitar tudo" grava,
      // "Apenas essenciais" apaga (nada sai para a Meta neste intent).
      if (!incoming.consent) await deleteAdSignals(input.intentId);
      else if (input.adSignals) await saveAdSignals(input.intentId, input.adSignals, ctx.req.headers as Record<string, unknown>);
      const existing = await getIntentOrigin(input.intentId).catch(() => null);
      // Retirada repetida (cada abertura do checkout com "Apenas essenciais"): nada a gravar.
      if (!incoming.consent && existing && !existing.consent) return { ok: true };
      const ok = await saveIntentOrigin(input.intentId, mergeVisitOrigins(existing, incoming)).catch(() => false);
      return { ok };
    }),

  /** Projeção explícita (spec 5.1, Fase 1): o browser recebe só os campos que
   *  o checkout lê, nunca o PI, o Customer da Stripe ou o estado interno dos
   *  funis. `paymentPlan` diz se a opção de duas partes existe e com que valores,
   *  calculados no servidor; com a flag desligada é só { available: false }. */
  getIntent: publicProcedure
    .input(z.object({ intentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const intent = await getBookingIntent(input.intentId);
      if (!intent) return { intent: null, expired: false, paymentPlan: null };
      const expired =
        intent.status === "expired" ||
        (intent.expiresAt != null && intent.expiresAt.getTime() < Date.now());
      // Uma oferta de Flex por pagamento integral que expirou não se mostra: o
      // ecrã tem de dizer o que a próxima cobrança vai cobrar.
      const view = withoutExpiredFullPaymentGift(intent);
      const paymentPlan = await clientPaymentPlanFor(view).catch((err: any) => {
        console.warn(`[TwoParts] oferta nao calculada intent=${input.intentId}: ${err?.message}`);
        return { available: false as const, reason: null };
      });
      return { intent: publicIntent(view), expired, paymentPlan };
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
      // Com um Flex oferecido por pagamento integral no intent, um clique do
      // hóspede no Flex é a escolha DELE: é essa que se repõe se a oferta
      // deixar de valer (duas partes, expirou, deixou de ser elegível).
      // Só um clique conta: o checkout reenvia o Flex que o próprio intent já
      // tinha (o flex=true da oferta) antes de cada pagamento, e esse eco não
      // pode passar a "escolha do hóspede".
      // Compara com o Flex que o hóspede VÊ (oferta expirada = a escolha dele),
      // não com o flex=true que a oferta forçou na BD.
      if (patch.flex !== undefined && isFullPaymentGift(current) && patch.flex !== effectiveFlexChoice(current)) {
        dbPatch.flexGiftPrevFlex = patch.flex;
      }
      // Nova tarifa, datas ou hóspedes podem tirar a elegibilidade (tarifa NR,
      // antecedência): o Flex oferecido sai e volta só se a próxima cobrança
      // integral ainda o merecer. Senão um Klarna ou PayPal, que não passam
      // pelo createCardCharge, levavam-no numa reserva já sem direito a ele.
      // Só uma mudança verdadeira: o checkout reenvia a tarifa e as datas que
      // já estavam no intent, e esse eco não pode tirar a oferta.
      const c = current as any;
      const stayChanged =
        (patch.ratePlanId !== undefined && patch.ratePlanId !== c.ratePlanId) ||
        (patch.checkIn !== undefined && patch.checkIn !== c.checkIn) ||
        (patch.checkOut !== undefined && patch.checkOut !== c.checkOut) ||
        (patch.guests !== undefined && patch.guests !== c.guests) ||
        (patch.guestyQuoteId !== undefined && patch.guestyQuoteId !== c.guestyQuoteId) ||
        (patch.quote !== undefined && Math.round(Number(patch.quote.total) * 100) !== Math.round(Number(c.quote?.total) * 100));
      if (isFullPaymentGift(current) && stayChanged) {
        const revoke = revokeFullPaymentGiftPatch({ ...current, ...(patch.flex !== undefined ? { flexGiftPrevFlex: patch.flex } : {}) });
        if (revoke) Object.assign(dbPatch, revoke);
      }
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
   *  Formatos trocados sao recusados pelo Stripe no confirm (vistos 16 e 21 ago).
   *
   *  Pagamento em duas partes (docs/pagamento_duas_partes.md, Fase 1): o browser
   *  diz só o plano que o hóspede escolheu; o servidor decide se é possível e
   *  quanto se cobra hoje. Sem a flag, `plan` omisso ou "full" faz exatamente o
   *  que fazia antes; "two_parts" é recusado em vez de cair para 100% calado. */
  createCardCharge: publicProcedure
    .input(z.object({
      intentId: z.string().uuid(),
      wallet: z.boolean().optional(),
      plan: z.enum(["full", "two_parts"]).optional(),
      /** Caixa do mandato marcada (spec 6.2). Obrigatória em duas partes. */
      mandateAccepted: z.boolean().optional(),
      /** Declaração de execução imediata do Flex (spec 6.4), quando o Flex vai na reserva. */
      flexImmediateConsent: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => withCheckoutChargeLock(input.intentId, async () => {
      let m = await getBookingIntent(input.intentId);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      if ((m as any).status === "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "already paid" });
      const { breakdownFromIntent } = await import("../services/checkout-card-charge");
      const { createCardPaymentIntent } = await import("../services/stripe-klarna");
      const factsForCharge = await listingFacts((m as any).listingId);
      const petSafe = (x: any) => factsForCharge.pets
        ? x
        : { ...x, extras: ((x as any).extras ?? []).filter((e: any) => !PETS_ONLY_SKUS.includes(e.sku)) };
      let mSafe = petSafe(m);
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

      // ── Plano (duas partes ou integral) ─────────────────────────────────
      // A oferta depende só da estadia, da tarifa e das datas (nunca do Flex),
      // por isso mede-se já; o Flex oferecido é consequência da escolha.
      const measured = offerForIntent(m, b, { quote: trusted.quote });
      // O incentivo é a contrapartida de uma ESCOLHA que o hóspede viu: sem
      // `plan` no pedido (o checkout de hoje, sem seletor), nada de Flex
      // oferecido, mesmo com a flag ligada. Só o ecrã com as duas opções o dá.
      const offer = measured.available && input.plan === undefined ? { ...measured, incentive: "none" as const } : measured;
      const first = computePaymentPlan({ breakdown: b, offer, requested: input.plan ?? "full", wallet: !!input.wallet });
      if (first.requestedUnavailable) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "two-part payment is not available for this booking; refresh to see the options",
        });
      }
      if (first.incentiveApplied === "discount") {
        // Opção B sem o acerto do folio provado: nunca cobrar um valor que o
        // settle não consegue reconciliar no Guesty (readTwoPartsConfig recusa-a).
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "full-payment discount is not available" });
      }
      // Flex oferecido por pagamento integral: dá-se, renova-se ou retira-se
      // conforme a escolha. Só em memória por agora: grava-se junto com o PI,
      // depois de o PI anterior estar resolvido (um PI anterior que entretanto
      // ficou pago não pode ver o Flex do intent mudar debaixo dele).
      const giftPatch = fullPaymentGiftPatchFor(m, first);
      if (giftPatch) {
        m = { ...m, ...giftPatch } as any;
        mSafe = petSafe(m);
        b = breakdownFromIntent({ ...mSafe, quote: trusted.quote }, factsForCharge.bedrooms);
      }
      const decision = computePaymentPlan({ breakdown: b, offer, requested: first.plan, wallet: !!input.wallet });
      const intentPatch: Record<string, unknown> = { ...(giftPatch ?? {}) };
      if (input.flexImmediateConsent && (m as any).flex) {
        intentPatch.flexImmediateConsentAt = new Date();
        intentPatch.flexConsentVersion = FLEX_IMMEDIATE_CONSENT_VERSION;
      }
      const amountDue = decision.amountDueTodayCents;
      if (!Number.isSafeInteger(amountDue) || amountDue < 100) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "invalid total" });
      }

      // ── Duas partes: mandato e Customer da plataforma ───────────────────
      let customer: string | undefined;
      let mandate: ReturnType<typeof renderTwoPartsMandate> | null = null;
      let twoParts: Extract<typeof offer, { available: true }> | null = null;
      if (decision.plan === "two_parts") {
        if (!offer.available) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "inconsistent payment plan" });
        twoParts = offer;
        if (input.mandateAccepted !== true) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "the authorisation for the second payment must be accepted" });
        }
        mandate = renderTwoPartsMandate((m as any).locale, {
          amountLaterCents: decision.balanceCents,
          chargeAt: offer.instants.chargeAt,
          retryAt: offer.instants.retryAt,
          freeCancelDeadlineAt: offer.instants.freeCancelDeadlineAt,
        });
        // A plataforma é dona do cartão nas duas partes (spec 5.1): Customer
        // nosso, gravado ANTES do PI e nunca devolvido ao browser.
        customer = ((m as any).stripeCustomerId as string | null) || undefined;
        if (!customer) {
          const { ensureStripeCustomer } = await import("../services/stripe-klarna");
          customer = await ensureStripeCustomer({
            intentId: input.intentId,
            email: (m as any).email,
            name: [(m as any).guestFirstName, (m as any).guestLastName].filter(Boolean).join(" ") || null,
            phone: (m as any).guestPhone,
            locale: (m as any).locale,
          });
          const { setIntentStripeCustomer } = await import("../db");
          if (!(await setIntentStripeCustomer(input.intentId, customer))) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "payment could not be prepared; retry the same checkout" });
          }
        }
      }

      if (b.divergent.length) console.warn(`[Card2b] client amounts diverged intent=${input.intentId}: ${b.divergent.join(",")}`);
      const paymentParams = {
        amount: amountDue,
        currency: "eur",
        wallet: !!input.wallet,
        ...(customer && twoParts
          ? {
              // Dentro do objeto que alimenta a idempotency key: outro plano ou
              // outro Customer nunca reaproveita um PI anterior por engano.
              customer,
              statementDescriptorSuffix: "PART 1/2",
              description: `Estadia ${sanitizePropertyName(String((m as any).propertyName || (m as any).listingId))} ${(m as any).checkIn}: 1.a parte`,
            }
          : {}),
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
          // Medição da 2.6: só quando o Flex a 0 € vem mesmo do pagamento integral.
          if (decision.plan === "full" && decision.incentiveApplied === "flex" && isFullPaymentGift(m)) metadata.incentive = "flex";
          if (twoParts && mandate) {
            const split = splitTwoParts(b);
            Object.assign(metadata, {
              plan: "two_parts",
              part: "deposit",
              depositStayCents: String(split.depositStayCents),
              balanceCents: String(decision.balanceCents),
              policyCode: twoParts.schedule.policyCode,
              freeCancelDeadlineAt: twoParts.instants.freeCancelDeadlineAt.toISOString(),
              chargeAt: twoParts.instants.chargeAt.toISOString(),
              hardStopAt: twoParts.instants.hardStopAt.toISOString(),
              mandateVersion: mandate.version,
              mandateHash: mandate.hash,
            });
          }
          return metadata;
        })(),
      };

      /** Regista a autorização da 2.ª parte para o PI que o hóspede vai confirmar. Sem
       *  registo não há clientSecret: nada é cobrado sem a prova do mandato. */
      const recordMandate = async (paymentIntentId: string) => {
        if (!mandate || !twoParts) return;
        const { insertCardMandate } = await import("../db");
        try {
          await insertCardMandate({
            id: randomUUID(),
            intentId: input.intentId,
            paymentIntentId,
            mandateVersion: mandate.version,
            mandateLang: mandate.lang,
            mandateTextHash: mandate.hash,
            amountLaterCents: decision.balanceCents,
            chargeAt: twoParts.instants.chargeAt,
            acceptedAt: new Date(),
            acceptedIp: requestClientIp(ctx.req.headers as Record<string, unknown>),
            source: "checkout",
          } as any);
        } catch (err: any) {
          console.error(`[TwoParts] mandato nao registado intent=${input.intentId} pi=${paymentIntentId}: ${err?.message}`);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "payment could not be prepared; retry the same checkout" });
        }
      };
      const planResult = decision.plan === "two_parts" && twoParts
        ? { plan: "two_parts" as const, balanceCents: decision.balanceCents, chargeAt: twoParts.instants.chargeAt.toISOString() }
        : { plan: "full" as const, balanceCents: 0, chargeAt: null };
      /** Uma só escrita: o PI, o plano e o Flex oferecido ficam juntos ou não ficam. */
      const persist = async (paymentIntentId: string) => {
        const patch: Record<string, unknown> = { ...intentPatch, paymentIntentId };
        // O plano integral só se escreve quando muda: o caminho de hoje fica igual.
        if (decision.plan === "two_parts" || intentPaymentPlan(m) !== "full") patch.paymentPlan = decision.plan;
        return updateBookingIntent(input.intentId, patch as any);
      };
      /** Componentes do preço gravadas no PI: um PI só se reaproveita se forem
       *  todas iguais às de agora, não só o total. Um Flex trocado por um extra
       *  do mesmo valor deixava no PI as linhas e o Flex antigos, e o settle e
       *  os reembolsos por linha liam um PI que já não descrevia a reserva. */
      const PRICE_FINGERPRINT = ["stayCents", "extrasCents", "receptionCents", "flexCents", "lines", "incentive"];
      /** Condições autorizadas no mandato: um PI de duas partes só se reaproveita se forem todas iguais. */
      const TWO_PART_TERMS = ["plan", "part", "depositStayCents", "balanceCents", "policyCode", "freeCancelDeadlineAt", "chargeAt", "hardStopAt", "mandateVersion", "mandateHash"];
      const sameTerms = (prev: { metadata?: Record<string, string> | null }) =>
        // PIs sem as componentes gravadas (anteriores ao 2b) comparam-se só pelo total, como antes.
        (prev.metadata?.stayCents == null ||
          PRICE_FINGERPRINT.every((k) => (prev.metadata?.[k] ?? null) === (paymentParams.metadata[k] ?? null))) &&
        (decision.plan !== "two_parts" || TWO_PART_TERMS.every((k) => prev.metadata?.[k] === paymentParams.metadata[k]));

      if (priorPi) {
        const { getPaymentIntent, cancelPaymentIntent } = await import("../services/stripe-klarna");
        const prev = await getPaymentIntent(priorPi);
        // Recheck after the validity checks in case a callback completed it.
        if (prev.status === "succeeded") {
          return { clientSecret: null, paymentIntentId: prev.id, totalCents: prev.amount, alreadyPaid: true };
        }
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(prev.status)) {
          const sameFormat = !!prev.automatic_payment_methods?.enabled === !!input.wallet;
          const samePlan = (prev.metadata?.plan === "two_parts" ? "two_parts" : "full") === decision.plan;
          const prevCustomer = typeof prev.customer === "string" ? prev.customer : (prev.customer as any)?.id ?? "";
          if (prev.amount === amountDue && sameFormat && samePlan && prevCustomer === (customer ?? "") && sameTerms(prev)) {
            if (decision.plan === "two_parts" || Object.keys(intentPatch).length) {
              if (!(await persist(prev.id))) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "payment could not be saved; retry the same checkout" });
              }
            }
            await recordMandate(prev.id);
            return { clientSecret: prev.client_secret!, paymentIntentId: prev.id, totalCents: amountDue, alreadyPaid: false, ...planResult };
          }
          // Retire the stale amount/method before exposing a replacement.
          // A cancel failure is surfaced; it must never be swallowed.
          await cancelPaymentIntent(prev.id);
        } else if (prev.status !== "canceled") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "payment is still processing; do not pay again" });
        }
      }
      const pi = await createCardPaymentIntent({ ...paymentParams,
        idempotencyKey: cardChargeIdempotencyKey(paymentParams, priorPi || null),
      });
      const saved = await persist(pi.id);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "payment could not be saved; retry the same checkout" });
      await recordMandate(pi.id);
      return { clientSecret: pi.client_secret!, paymentIntentId: pi.id, totalCents: amountDue, alreadyPaid: false, ...planResult };
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
      const saved = await updateBookingIntent(input.intentId, {
        email: input.email,
        locale: input.locale ?? intent.locale ?? undefined,
        ...(intent.status === "draft" ? { status: "contact_captured" as const } : {}),
      });
      if (!saved) return { ok: false };

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
