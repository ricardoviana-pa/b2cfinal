/**
 * CHECKOUT RECOVERY — funil de recuperação de checkouts abandonados.
 * Regras e tempos: ./recovery-funnel.ts · Documento: docs/checkout_recovery.md
 *
 * Quatro contactos (1h, 20h, 72h, 7 dias), cada um com um argumento
 * diferente; 10% de grupo de controlo sem emails; alerta ao concierge para
 * todos os abandonos no passo de pagamento (com ou sem telefone; decisão do
 * Ricardo, 29 out 2026). Os contactos 1 (no pagamento), 2 e 3 levam por baixo
 * do total o cancelamento gratuito da tarifa e as duas partes como o checkout
 * as oferece no momento do envio.
 *
 * Idempotência: cada contacto é reclamado com um UPDATE condicional em
 * `recovery_stage` ANTES de o email sair, por isso nunca se repete, mesmo com
 * sweeps concorrentes. Se o servidor esteve em baixo, sai só o contacto mais
 * recente em atraso, nunca dois seguidos.
 *
 * O link de retoma leva a /:locale/checkout/:intentId, onde o cliente dispara
 * `checkout_resume` para sessões que não criaram o intent (CheckoutPage.tsx).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { CHECKOUT_EMAIL_ORIGIN, canSendCheckoutRecovery } from "../lib/checkout-email";
import { sanitizePropertyName } from "@shared/displayName";
import {
  listRecoveryCandidates,
  claimRecoveryStage,
  hasNewsletterConsent,
  claimConciergeAlert,
  updateBookingIntent,
} from "../db";
import { sendCheckoutRecovery, sendConciergeCallAlert, type RecoveryTwoParts } from "./transactional-email";
import { getPropertiesForSite, isHiddenFromCatalog } from "./properties-store";
import type { BookingIntent } from "../../drizzle/schema";
import { canRemindRecoveryStay } from './recovery-eligibility';
import {
  RECOVERY_TIMING,
  CONCIERGE_ALERT_MIN_TOTAL,
  isRecoveryHoldout,
  nextRecoveryStage,
  hasEnoughLeadTime,
  calendarScarcity,
  flexExtraDays,
  klarnaCanPay,
  klarnaBillingCountryForcedPt,
  type RecoveryStage,
} from "./recovery-funnel";
import { FLEX_CONFIG, flexPriceFor } from "../config/checkout-extras";
import { planPolicyCode } from "@shared/cancellationPolicy";
import { isKlarnaCountry, klarnaBillingCountry } from "@shared/klarna";
import { intentPolicyCode, withoutExpiredFullPaymentGift } from "./checkout-plan";

const HOUR_MS = 60 * 60 * 1000;

/* ────────────────────────────────────────────────────────────────
   Bloco 2 — opt-out dos lembretes (link discreto no rodapé).
   Token HMAC simples sobre o id do intent: o link só funciona para
   quem recebeu o email; sem estado extra na DB além do booleano.
   ──────────────────────────────────────────────────────────────── */

function optoutSecret(): string {
  return (
    process.env.RECOVERY_OPTOUT_SECRET ||
    process.env.JWT_SECRET ||
    "pa-recovery-optout-dev"
  );
}

/** Token HMAC-SHA256(intentId) truncado a 32 hex — chega para um opt-out. */
export function recoveryOptoutToken(intentId: string): string {
  return createHmac("sha256", optoutSecret()).update(intentId).digest("hex").slice(0, 32);
}

/** Comparação em tempo constante; qualquer formato inesperado falha. */
export function verifyRecoveryOptoutToken(intentId: string, token: string): boolean {
  if (!intentId || !token || token.length !== 32) return false;
  try {
    return timingSafeEqual(
      Buffer.from(recoveryOptoutToken(intentId), "utf8"),
      Buffer.from(token.toLowerCase(), "utf8"),
    );
  } catch {
    return false;
  }
}

/** Link de opt-out para o rodapé dos emails de recuperação. */
export function recoveryOptoutUrl(intentId: string): string {
  return `${CHECKOUT_EMAIL_ORIGIN}/api/checkout/recovery-optout?intent=${encodeURIComponent(intentId)}&t=${recoveryOptoutToken(intentId)}`;
}
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const STAGE_TAG: Record<RecoveryStage, string> = { 1: "1h", 2: "20h", 3: "3d", 4: "7d" };

function utm(stage: RecoveryStage): string {
  return `utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_${STAGE_TAG[stage]}`;
}

function resumeUrl(intent: BookingIntent, stage: RecoveryStage): string {
  const locale = intent.locale || "en";
  return `${CHECKOUT_EMAIL_ORIGIN}/${locale}/checkout/${intent.id}?${utm(stage)}`;
}

function propertyUrl(slug: string, intent: BookingIntent, stage: RecoveryStage): string {
  const locale = intent.locale || "en";
  const q = `checkin=${intent.checkIn}&checkout=${intent.checkOut}&guests=${intent.guests}&${utm(stage)}`;
  return `${CHECKOUT_EMAIL_ORIGIN}/${locale}/homes/${slug}?${q}`;
}


/** Mirror of client/src/lib/images.ts optimizeGuestyImage, with a 4:3 crop so
 *  the email card matches the checkout's aspect-[4/3] hero. */
function heroImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.includes("assets.guesty.com/image/upload/")) return raw;
  if (/\/image\/upload\/[a-z]{1,3}_/.test(raw)) return raw;
  return raw.replace("/image/upload/", "/image/upload/w_1200,ar_4:3,c_fill,q_auto,f_auto/");
}

/** First photo of the intent's property, by slug or Guesty listing id. Fail-soft. */
async function resolvePropertyPhoto(intent: BookingIntent): Promise<string | undefined> {
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

type QuoteSnap = {
  nightlyRate?: number; nights?: number; totalNights?: number;
  cleaningFee?: number; taxesAndFees?: number; total?: number;
};

/** Escassez real do calendário (±21 dias à volta das datas). Fail-soft. */
async function scarcityFor(intent: BookingIntent) {
  try {
    const { guestyClient } = await import("../lib/guesty");
    const day = 24 * HOUR_MS;
    const from = new Date(Date.parse(`${intent.checkIn}T00:00:00Z`) - 21 * day).toISOString().slice(0, 10);
    const to = new Date(Date.parse(`${intent.checkOut}T00:00:00Z`) + 21 * day).toISOString().slice(0, 10);
    const cal = await guestyClient.getListingCalendar(intent.listingId, from, to);
    const days = Array.isArray(cal) ? cal : (cal?.days || []);
    return calendarScarcity(days);
  } catch {
    return null;
  }
}

/**
 * Contacto 3: refaz a cotação no Guesty. Devolve a cotação nova (e grava-a no
 * intent com nova validade e o Flex oferecido), "unavailable" se as datas já
 * não se vendem, ou null se o Guesty não respondeu (adiar, não perder).
 */
async function requoteForStage3(intent: BookingIntent): Promise<
  | {
      kind: "ok";
      quote: QuoteSnap & { total: number };
      expiresAt: Date;
      flexGift: { until: Date; value: number; days: number } | null;
      /** O que ficou gravado no intent: o email do contacto 3 lê o intent assim. */
      patch: Record<string, unknown>;
    }
  | { kind: "unavailable" }
  | null
> {
  try {
    const { createBEQuote } = await import("./guesty-booking");
    const be = await createBEQuote({
      listingId: intent.listingId, checkIn: intent.checkIn, checkOut: intent.checkOut, guests: intent.guests,
    });
    const plans = be.ratePlanOptions ?? [];
    const plan = plans.find((p) => p.ratePlanId === intent.ratePlanId)
      ?? plans.find((p) => p.ratePlanId === be.ratePlanId)
      ?? null;
    const total = plan?.total ?? be.total;
    if (!(total > 0)) return null;
    const cleaningFee = plan?.cleaningFee ?? be.pricing.cleaningFee;
    const taxesAndFees = plan?.taxesAndFees ?? be.pricing.taxesAndFees ?? 0;
    const quote = {
      nightlyRate: plan?.nightlyRate ?? be.pricing.nightlyRate,
      totalNights: total - cleaningFee - taxesAndFees,
      cleaningFee,
      taxesAndFees,
      total,
      nights: be.nights,
      currency: be.currency || "EUR",
      quoteCreatedAt: Date.now(),
      ratePlanOptions: plans.map((o) => ({
        ratePlanId: o.ratePlanId, name: o.name, total: o.total, nightlyRate: o.nightlyRate,
        cleaningFee: o.cleaningFee, taxesAndFees: o.taxesAndFees ?? 0, cancellationPolicy: o.cancellationPolicy,
      })),
    };
    const expiresAt = new Date(Date.now() + RECOVERY_TIMING.requoteTtlMs);
    // O Flex só existe acima do limiar (decisão de produto); abaixo, o
    // contacto 3 vai sem incentivo em vez de oferecer algo que não se vende.
    // E só se oferece quando acrescenta dias à tarifa: na moderate (cancela de
    // graça até 7 dias antes) o Flex remarca até 7 dias antes, a mesma data,
    // e "oferecê-lo" era oferecer nada. Política desconhecida: como antes.
    const policy = planPolicyCode(plan ?? { cancellationPolicy: be.cancellationPolicy });
    const addsNothing = flexExtraDays(policy, FLEX_CONFIG.rescheduleDaysBefore) === 0;
    if (addsNothing && total >= FLEX_CONFIG.minTotal) {
      console.info(`[Recovery] Contacto 3 sem Flex oferecido (intent ${intent.id}): a tarifa ${policy} já cancela de graça até ao prazo do Flex`);
    }
    const giftEligible = total >= FLEX_CONFIG.minTotal && !addsNothing;
    const flexGift = giftEligible
      ? {
          until: new Date(Date.now() + RECOVERY_TIMING.flexGiftMs),
          value: flexPriceFor(quote.totalNights),
          days: FLEX_CONFIG.rescheduleDaysBefore,
        }
      : null;
    const patch: Record<string, unknown> = {
      quote: quote as any,
      guestyQuoteId: be.quoteId,
      ratePlanId: plan?.ratePlanId ?? be.ratePlanId,
      expiresAt,
      // A origem da oferta fica gravada: o pagamento em duas partes retira o
      // Flex oferecido por pagamento integral, e nunca pode retirar este.
      ...(flexGift ? { flexGiftUntil: flexGift.until, flex: true, flexGiftReason: "recovery", flexGiftPrevFlex: null } : {}),
    };
    const ok = await updateBookingIntent(intent.id, patch as any);
    if (!ok) return null;
    return { kind: "ok", quote, expiresAt, flexGift, patch };
  } catch (err: any) {
    const { describeGuestyError } = await import("./guesty");
    const reason = describeGuestyError(err);
    if (/not available|only available by request/i.test(reason)) return { kind: "unavailable" };
    console.warn(`[Recovery] Requote falhou para ${intent.id}: ${reason}`);
    return null;
  }
}

/** Contacto 4: até 3 casas na mesma região, com lugar e livres nas datas. */
async function alternativesFor(intent: BookingIntent, stage: RecoveryStage) {
  try {
    const { checkAvailability } = await import("./guesty");
    const props = (await getPropertiesForSite()) as any[];
    const region = String(intent.destination || "").toLowerCase();
    const current = props.find((p) => (p.guestyId || p.listingId) === intent.listingId);
    const refPrice = Number(current?.pricePerNight || current?.priceFrom || 0);
    const pool = props
      .filter((p) =>
        p.isActive !== false && !p.isPortfolio && !isHiddenFromCatalog(p) && p.guestyId && p.slug &&
        p.guestyId !== intent.listingId &&
        String(p.destination || "").toLowerCase() === region &&
        Number(p.maxGuests || 0) >= intent.guests)
      .sort((a, b) =>
        Math.abs(Number(a.pricePerNight || a.priceFrom || 0) - refPrice) -
        Math.abs(Number(b.pricePerNight || b.priceFrom || 0) - refPrice))
      .slice(0, 8);
    // Sem preço no cartão: o priceFrom do catálogo não é o preço destas datas
    // e a unidade (noite ou pessoa) não está confirmada. Serve só para ordenar
    // por semelhança.
    const out: Array<{ name: string; imageUrl?: string; url: string; locality?: string }> = [];
    for (const p of pool) {
      if (out.length >= 3) break;
      try {
        const a = await checkAvailability(p.guestyId, intent.checkIn, intent.checkOut);
        if (!a.available) continue;
      } catch {
        continue;
      }
      out.push({
        name: sanitizePropertyName(p.name || ""),
        imageUrl: heroImageUrl(p.images?.[0]),
        url: propertyUrl(p.slug, intent, stage),
        locality: p.locality,
      });
    }
    return {
      alternatives: out,
      ownUrl: current?.slug ? propertyUrl(current.slug, intent, stage) : resumeUrl(intent, stage),
    };
  } catch {
    return { alternatives: [], ownUrl: resumeUrl(intent, stage) };
  }
}

/** O que o contacto 1 sabe do passo de pagamento, lido no envio. */
export interface PaymentStepFacts {
  /** Chegou a carregar em Pagar (houve uma cobrança tentada). */
  attempted: boolean;
  /** Depois de uma tentativa: o Klarna pode ser sugerido, no país de
   *  faturação do hóspede e dentro do tecto desse país (shared/klarna.ts);
   *  nunca com o interruptor de emergência (país forçado a PT) ligado. */
  klarna: boolean;
  /** Política da tarifa, para a linha do cancelamento gratuito. */
  cancellation: { policy: unknown } | null;
  /** Duas partes como o checkout as mostraria agora. Depois de uma tentativa
   *  é a resposta a "um limite do banco": metade hoje, no mesmo cartão. */
  twoParts: RecoveryTwoParts | null;
}

/** As duas linhas por baixo do total nos contactos 2 e 3 (as mesmas do
 *  contacto 1 no pagamento): o cancelamento gratuito da tarifa e as duas
 *  partes como o checkout as oferece agora. */
export type BookingLineFacts = Pick<PaymentStepFacts, "cancellation" | "twoParts">;

/**
 * O hóspede chegou a tentar pagar? Cartão e wallets deixam o PI no intent (o
 * createCardCharge só corre depois do clique em Pagar). PayPal e Klarna
 * criam o PI no clique e não deixam nada no intent: procura-se na Stripe pelo
 * intentId. Sem resposta da Stripe: "sem tentativa", o texto que não fala de
 * falhas e que também serve a quem tentou.
 */
export async function paymentWasAttempted(intent: Pick<BookingIntent, "id" | "paymentIntentId">): Promise<boolean> {
  if (intent.paymentIntentId) return true;
  try {
    const { hasCheckoutPaymentAttempt } = await import("./stripe-klarna");
    return await hasCheckoutPaymentAttempt(intent.id);
  } catch (err: any) {
    console.warn(`[Recovery] Tentativa de pagamento por confirmar (intent ${intent.id}): ${err?.message ?? err}`);
    return false;
  }
}

/** Total que o checkout cobraria agora (cêntimos, o que o Klarna receberia). null se não se souber. */
async function checkoutTotalCents(intent: BookingIntent): Promise<number | null> {
  try {
    const { listingBreakdownFromIntent } = await import("./checkout-card-charge");
    const b = await listingBreakdownFromIntent(intent);
    return Number.isSafeInteger(b.totalCents) && b.totalCents > 0 ? b.totalCents : null;
  } catch {
    return null;
  }
}

/**
 * Duas partes como o ecrã do checkout as mostraria agora: a mesma função do
 * getIntent (clientPaymentPlanFor), com a flag, a tarifa, a antecedência e o
 * mínimo de hoje. Qualquer dúvida (erro, sem oferta): null, e o email vai sem
 * a linha.
 */
async function twoPartsOfferNow(intent: BookingIntent): Promise<RecoveryTwoParts | null> {
  try {
    const { clientPaymentPlanFor } = await import("../routers/checkout");
    const plan: any = await clientPaymentPlanFor(withoutExpiredFullPaymentGift(intent));
    if (!plan?.available) return null;
    return { todayCents: Number(plan.depositCents), laterCents: Number(plan.balanceCents), chargeAt: new Date(plan.chargeAt) };
  } catch (err: any) {
    console.warn(`[Recovery] Duas partes por calcular (intent ${intent.id}): ${err?.message ?? err}`);
    return null;
  }
}

/** Contacto 1 no passo de pagamento: que email sai e com que linhas. */
export async function paymentStepFacts(intent: BookingIntent): Promise<PaymentStepFacts> {
  const attempted = await paymentWasAttempted(intent);
  // O Klarna só depois de uma tentativa, no país de faturação que o checkout
  // mandaria (telefone do hóspede → língua do site → PT) e dentro do tecto
  // desse país. Com o interruptor de emergência (país forçado a PT) nunca:
  // sugeri-lo a quem teve "um limite do banco" mandava a maioria (não
  // clientes Klarna em Portugal) para outra recusa.
  const country = klarnaBillingCountry({ phone: intent.guestPhone, siteLang: intent.locale });
  const klarna = attempted && !klarnaBillingCountryForcedPt() && isKlarnaCountry(country) &&
    klarnaCanPay(await checkoutTotalCents(intent), country);
  return {
    attempted,
    klarna,
    cancellation: { policy: intentPolicyCode(intent) },
    twoParts: await twoPartsOfferNow(intent),
  };
}

/** Contactos 2 e 3: as duas razões para reservar já, calculadas no envio
 *  sobre o intent como está (no contacto 3, já com a cotação refeita). */
export async function bookingLineFacts(intent: BookingIntent): Promise<BookingLineFacts> {
  return {
    cancellation: { policy: intentPolicyCode(intent) },
    twoParts: await twoPartsOfferNow(intent),
  };
}

/**
 * Alerta ao concierge devido? Para todos os que param no passo de pagamento
 * (decisão do Ricardo, 29 out 2026): com ou sem telefone (o email chega
 * sempre, é o que abre o checkout), acima de CONCIERGE_ALERT_MIN_TOTAL (hoje
 * 0), uma vez por checkout (conciergeAlerted), entre 1 h e 48 h do abandono.
 */
function conciergeAlertDue(intent: BookingIntent, ageMs: number): boolean {
  const total = Number((intent.quote as QuoteSnap | null)?.total ?? 0);
  return intent.status === "payment_pending" && total >= CONCIERGE_ALERT_MIN_TOTAL &&
    !intent.conciergeAlerted && !!intent.email &&
    ageMs >= RECOVERY_TIMING.stage1AfterMs && ageMs <= 48 * HOUR_MS;
}

/** Alerta ao concierge: abandono verificado no pagamento (uma vez). Sem
 *  telefone, o alerta pede o contacto por email. */
async function maybeAlertConcierge(intent: BookingIntent, ageMs: number): Promise<void> {
  if (!conciergeAlertDue(intent, ageMs)) return;
  const total = Number((intent.quote as QuoteSnap | null)?.total ?? 0);
  if (!await claimConciergeAlert(intent.id)) return;
  await sendConciergeCallAlert({
    intentId: intent.id,
    guestName: [intent.guestFirstName, intent.guestLastName].filter(Boolean).join(" "),
    guestEmail: intent.email || "",
    guestPhone: intent.guestPhone || null,
    propertyName: sanitizePropertyName(intent.propertyName || ""),
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    guests: intent.guests,
    total,
    locale: intent.locale,
    resumeUrl: `${CHECKOUT_EMAIL_ORIGIN}/${intent.locale || "en"}/checkout/${intent.id}`,
  }).catch((e: any) => console.error(`[Recovery] Alerta concierge falhou ${intent.id}:`, e?.message));
}

/**
 * Uma passagem pelos checkouts abandonados. Exportada para testes e disparo
 * manual. Nunca lança: a recuperação não pode derrubar o servidor.
 */
export async function runCheckoutRecoverySweep(): Promise<{ sent: number; checked: number }> {
  let sent = 0;
  let checked = 0;
  // Resumo por passagem nos logs: sem isto, um funil parado não deixa rasto.
  const skip = { notDue: 0, holdout: 0, notRemindable: 0, deferred: 0, failed: 0 };
  // Check before reading or claiming anything in the shared database.
  if (!canSendCheckoutRecovery()) return { sent, checked };
  try {
    const candidates = await listRecoveryCandidates();
    checked = candidates.length;
    // Uma leitura de consentimento por email e por passagem (o mesmo hóspede
    // aparece em vários intents abandonados).
    const consentByEmail = new Map<string, Promise<boolean>>();
    const consentFor = (email: string) => {
      let p = consentByEmail.get(email);
      if (!p) consentByEmail.set(email, (p = hasNewsletterConsent(email)));
      return p;
    };
    for (const intent of candidates) {
      if (!intent.email || (intent as any).recoveryOptout) continue;
      if (!hasEnoughLeadTime(intent.checkIn)) continue;
      const now = Date.now();
      const ageMs = now - intent.createdAt.getTime();
      const stage = intent.recoveryStage ?? 0;
      const quoteValid = !!intent.expiresAt && intent.expiresAt.getTime() > now;

      // O consentimento só importa depois de a cotação expirar (contactos 3/4)
      const needsConsent = !quoteValid || ageMs >= RECOVERY_TIMING.stage3AfterMs;
      const consent = needsConsent ? await consentFor(intent.email) : false;
      let target = nextRecoveryStage({ stage, ageMs, quoteValid, consent });
      const holdout = isRecoveryHoldout(intent.id);
      const alertDue = conciergeAlertDue(intent, ageMs);
      if (!target && !alertDue) { skip.notDue++; continue; }
      if (holdout && !alertDue) { skip.holdout++; continue; }

      try {
        if (!await canRemindRecoveryStay(intent)) { skip.notRemindable++; continue; }
      } catch {
        skip.deferred++;
        // Leave the stage unclaimed so a later sweep can retry verification.
        console.warn('[Recovery] Stay verification unavailable; reminder deferred');
        continue;
      }

      // Human alerts include the control group, but must obey the same
      // booked/superseded-stay protection before an alert is claimed.
      await maybeAlertConcierge(intent, ageMs);
      if (!target) { skip.notDue++; continue; }
      if (holdout) { skip.holdout++; continue; }

      // Preparação específica de cada contacto, antes do claim: se o Guesty
      // falhar, adia-se sem perder o contacto.
      let quote = intent.quote as QuoteSnap | null;
      let expiresAt = intent.expiresAt;
      let flexGift: { until: Date; value: number; days: number } | null = null;
      // O intent como fica depois da preparação: no contacto 3, com a cotação
      // refeita e o Flex oferecido já gravados (as linhas do email lêem-no assim).
      let intentNow: BookingIntent = intent;
      if (target === 3) {
        const rq = await requoteForStage3(intent);
        if (!rq) { skip.deferred++; continue; }
        if (rq.kind === "unavailable") {
          target = 4; // datas perdidas: saltar para as alternativas
        } else {
          quote = rq.quote;
          expiresAt = rq.expiresAt;
          flexGift = rq.flexGift;
          intentNow = { ...intent, ...rq.patch } as BookingIntent;
        }
      }
      const scarcity = target === 2 ? await scarcityFor(intent) : null;
      const alt = target === 4 ? await alternativesFor(intent, 4) : null;
      // Contacto 1 no passo de pagamento: o texto depende de ter havido uma
      // tentativa de pagar; sem ela, o que o checkout ofereceria agora.
      const payFacts = target === 1 && intent.status === "payment_pending" ? await paymentStepFacts(intent) : null;
      // Contactos 2 e 3: as mesmas duas linhas por baixo do total (cancelamento
      // gratuito com data e duas partes), com as regras do contacto 1: só com
      // a oferta do servidor e só quando os valores somam o total do cartão.
      const bookingFacts = target === 2 || target === 3 ? await bookingLineFacts(intentNow) : null;
      const lineFacts = payFacts ?? bookingFacts;

      // Claim before sending — losing an email beats repeating one.
      const claimed = await claimRecoveryStage(intent.id, stage, target);
      if (!claimed) continue;

      try {
        await sendCheckoutRecovery({
          guestEmail: intent.email,
          guestFirstName: intent.guestFirstName,
          propertyName: sanitizePropertyName(intent.propertyName || ""),
          destination: intent.destination,
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          guests: intent.guests,
          total: quote?.total,
          quote,
          imageUrl: await resolvePropertyPhoto(intent),
          expiresAt,
          resumeUrl: resumeUrl(intent, target),
          optoutUrl: recoveryOptoutUrl(intent.id),
          locale: intent.locale,
          stage: target,
          paymentStep: intent.status === "payment_pending",
          paymentAttempted: payFacts?.attempted,
          klarna: payFacts?.klarna,
          cancellation: lineFacts?.cancellation,
          twoParts: lineFacts?.twoParts,
          scarcity,
          flexGift,
          alternatives: alt?.alternatives,
          propertyUrl: alt?.ownUrl,
        });
        sent++;
        const variant = payFacts ? (payFacts.attempted ? " · pagamento tentado" : " · sem tentativa de pagar") : "";
        console.info(`[Recovery] Contacto ${target} (${STAGE_TAG[target]}) enviado para intent ${intent.id}${variant}`);
      } catch (err: any) {
        skip.failed++;
        console.error(`[Recovery] Send failed for intent ${intent.id}:`, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.warn("[Recovery] Sweep failed:", err?.message ?? err);
  }
  if (checked > 0) {
    console.info(
      `[Recovery] Sweep: ${checked} candidatos, ${sent} enviados · por enviar: ${skip.notDue} sem contacto devido, ` +
        `${skip.holdout} controlo, ${skip.notRemindable} reservados/substituídos, ${skip.deferred} adiados (Guesty), ${skip.failed} falhas de envio`,
    );
  }
  return { sent, checked };
}

let started = false;

/** 10-minute interval sweep, started once at boot. Fail-soft if the DB is down. */
export function startCheckoutRecoveryScheduler(): void {
  // Fail closed outside explicitly configured production.
  if (!canSendCheckoutRecovery()) {
    console.info("[Recovery] Disabled: explicit production recovery configuration required");
    return;
  }
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    void runCheckoutRecoverySweep();
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
  // First pass shortly after boot so a restart doesn't delay overdue emails
  setTimeout(() => void runCheckoutRecoverySweep(), 30 * 1000).unref?.();
  console.info("[Recovery] Funil de recuperação agendado a cada 10 min (contactos 1h, 20h, 3d, 7d)");
}
