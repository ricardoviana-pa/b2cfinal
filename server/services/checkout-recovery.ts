/**
 * CHECKOUT RECOVERY — funil de recuperação de checkouts abandonados.
 * Regras e tempos: ./recovery-funnel.ts · Documento: docs/checkout_recovery.md
 *
 * Quatro contactos (1h, 20h, 72h, 7 dias), cada um com um argumento
 * diferente; 10% de grupo de controlo sem emails; alerta ao concierge para
 * abandonos de valor alto no passo de pagamento.
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
import { sendCheckoutRecovery, sendConciergeCallAlert } from "./transactional-email";
import { getPropertiesForSite } from "./properties-store";
import type { BookingIntent } from "../../drizzle/schema";
import { canRemindRecoveryStay } from './recovery-eligibility';
import {
  RECOVERY_TIMING,
  CONCIERGE_ALERT_MIN_TOTAL,
  isRecoveryHoldout,
  nextRecoveryStage,
  hasEnoughLeadTime,
  calendarScarcity,
  type RecoveryStage,
} from "./recovery-funnel";
import { FLEX_CONFIG, flexPriceFor } from "../config/checkout-extras";

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
  | { kind: "ok"; quote: QuoteSnap & { total: number }; expiresAt: Date; flexGift: { until: Date; value: number; days: number } | null }
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
    // contacto 3 vai sem incentivo em vez de oferecer algo que não se vende
    const giftEligible = total >= FLEX_CONFIG.minTotal;
    const flexGift = giftEligible
      ? {
          until: new Date(Date.now() + RECOVERY_TIMING.flexGiftMs),
          value: flexPriceFor(quote.totalNights),
          days: FLEX_CONFIG.rescheduleDaysBefore,
        }
      : null;
    const ok = await updateBookingIntent(intent.id, {
      quote: quote as any,
      guestyQuoteId: be.quoteId,
      ratePlanId: plan?.ratePlanId ?? be.ratePlanId,
      expiresAt,
      ...(flexGift ? { flexGiftUntil: flexGift.until, flex: true } : {}),
    } as any);
    if (!ok) return null;
    return { kind: "ok", quote, expiresAt, flexGift };
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
        p.isActive !== false && p.guestyId && p.slug &&
        p.guestyId !== intent.listingId &&
        String(p.destination || "").toLowerCase() === region &&
        Number(p.maxGuests || 0) >= intent.guests)
      .sort((a, b) =>
        Math.abs(Number(a.pricePerNight || a.priceFrom || 0) - refPrice) -
        Math.abs(Number(b.pricePerNight || b.priceFrom || 0) - refPrice))
      .slice(0, 8);
    const out: Array<{ name: string; imageUrl?: string; url: string; priceFrom?: number; locality?: string }> = [];
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
        priceFrom: Number(p.priceFrom || p.pricePerNight || 0) || undefined,
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

/** Alerta ao concierge: abandono no pagamento de valor alto (uma vez). */
async function maybeAlertConcierge(intent: BookingIntent, ageMs: number): Promise<void> {
  const total = Number((intent.quote as QuoteSnap | null)?.total ?? 0);
  if (intent.status !== "payment_pending" || total < CONCIERGE_ALERT_MIN_TOTAL) return;
  if ((intent as any).conciergeAlerted || !intent.guestPhone) return;
  if (ageMs < RECOVERY_TIMING.stage1AfterMs || ageMs > 48 * HOUR_MS) return;
  if (!await claimConciergeAlert(intent.id)) return;
  await sendConciergeCallAlert({
    intentId: intent.id,
    guestName: [intent.guestFirstName, intent.guestLastName].filter(Boolean).join(" "),
    guestEmail: intent.email || "",
    guestPhone: intent.guestPhone,
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
  // Check before reading or claiming anything in the shared database.
  if (!canSendCheckoutRecovery()) return { sent, checked };
  try {
    const candidates = await listRecoveryCandidates();
    checked = candidates.length;
    for (const intent of candidates) {
      if (!intent.email || (intent as any).recoveryOptout) continue;
      if (!hasEnoughLeadTime(intent.checkIn)) continue;
      const now = Date.now();
      const ageMs = now - intent.createdAt.getTime();
      const stage = intent.recoveryStage ?? 0;
      const quoteValid = !!intent.expiresAt && intent.expiresAt.getTime() > now;

      // O alerta humano vale para todos (inclui o grupo de controlo): o
      // controlo mede os emails automáticos, não a chamada do concierge.
      await maybeAlertConcierge(intent, ageMs);

      // O consentimento só importa depois de a cotação expirar (contactos 3/4)
      const needsConsent = !quoteValid || ageMs >= RECOVERY_TIMING.stage3AfterMs;
      const consent = needsConsent ? await hasNewsletterConsent(intent.email) : false;
      let target = nextRecoveryStage({ stage, ageMs, quoteValid, consent });
      if (!target) continue;
      if (isRecoveryHoldout(intent.id)) continue;

      try {
        if (!await canRemindRecoveryStay(intent)) continue;
      } catch {
        // Leave the stage unclaimed so a later sweep can retry verification.
        console.warn('[Recovery] Stay verification unavailable; reminder deferred');
        continue;
      }

      // Preparação específica de cada contacto, antes do claim: se o Guesty
      // falhar, adia-se sem perder o contacto.
      let quote = intent.quote as QuoteSnap | null;
      let expiresAt = intent.expiresAt;
      let flexGift: { until: Date; value: number; days: number } | null = null;
      if (target === 3) {
        const rq = await requoteForStage3(intent);
        if (!rq) continue;
        if (rq.kind === "unavailable") {
          target = 4; // datas perdidas: saltar para as alternativas
        } else {
          quote = rq.quote;
          expiresAt = rq.expiresAt;
          flexGift = rq.flexGift;
        }
      }
      const scarcity = target === 2 ? await scarcityFor(intent) : null;
      const alt = target === 4 ? await alternativesFor(intent, 4) : null;

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
          scarcity,
          flexGift,
          alternatives: alt?.alternatives,
          propertyUrl: alt?.ownUrl,
        });
        sent++;
        console.info(`[Recovery] Contacto ${target} (${STAGE_TAG[target]}) enviado para intent ${intent.id}`);
      } catch (err: any) {
        console.error(`[Recovery] Send failed for intent ${intent.id}:`, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.warn("[Recovery] Sweep failed:", err?.message ?? err);
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
