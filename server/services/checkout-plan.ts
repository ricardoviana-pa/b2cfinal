/**
 * Pagamento em duas partes, Fase 1: a ponte entre o intent do checkout e a
 * matemática pura do plano (payment-plan.ts e computePaymentPlan em
 * checkout-pricing.ts). Regras e porquês em docs/pagamento_duas_partes.md.
 *
 * Tudo aqui é síncrono e sem rede: o router e o settle chamam estas funções
 * com o intent já lido e o breakdown já calculado, e decidem o resto.
 */
import { lisbonToday, planPolicyCode, type PolicyCode } from "@shared/cancellationPolicy";
import { computePaymentOffer, type PaymentPlan, type PaymentPlanOffer } from "./checkout-pricing";
import { readTwoPartsConfig, type TwoPartsConfig } from "./payment-plan";
import { flexGiftActive } from "./recovery-funnel";

/** Validade do Flex oferecido a quem paga tudo agora. Cobre a janela do
 *  settle (até 48 h depois do pagamento) com folga; o settle avalia a oferta
 *  no instante do pagamento, nunca no momento em que corre. */
export const FULL_PAYMENT_GIFT_MS = 7 * 24 * 60 * 60 * 1000;

export type FlexGiftReason = "recovery" | "full_payment";

/**
 * Política de cancelamento da tarifa que o hóspede está a pagar, pela mesma
 * classificação que o site mostra (planPolicyCode). Só a quote do intent
 * conta: sem plano identificado ou sem código conhecido, null, e a reserva
 * paga-se por inteiro (spec 2.1, "código desconhecido").
 */
export function intentPolicyCode(intent: any, quote: any = intent?.quote): PolicyCode | null {
  const id = String(intent?.ratePlanId ?? "").trim();
  if (!id) return null;
  const opts = Array.isArray(quote?.ratePlanOptions) ? quote.ratePlanOptions : [];
  const plan = opts.find((o: any) => String(o?.ratePlanId ?? "") === id);
  return planPolicyCode(plan ?? null);
}

/** Oferta de duas partes para um intent e um breakdown, hoje (calendário de Lisboa). */
export function offerForIntent(
  intent: any,
  breakdown: { stayCents: number; receptionCents: number; extrasCents: number; flexCents: number },
  opts: { quote?: any; now?: Date; config?: TwoPartsConfig } = {},
): PaymentPlanOffer {
  const quote = opts.quote ?? intent?.quote;
  return computePaymentOffer({
    breakdown,
    policy: intentPolicyCode(intent, quote),
    checkIn: String(intent?.checkIn ?? ""),
    bookingDate: lisbonToday(opts.now ?? new Date()),
    intentId: String(intent?.id ?? ""),
    currency: String(quote?.currency ?? "EUR"),
    config: opts.config ?? readTwoPartsConfig(),
  });
}

export function intentPaymentPlan(intent: any): PaymentPlan {
  return intent?.paymentPlan === "two_parts" ? "two_parts" : "full";
}

/** O Flex oferecido em vigor vem do incentivo ao pagamento integral? */
export function isFullPaymentGift(intent: any): boolean {
  return intent?.flexGiftReason === "full_payment";
}

/** Um Flex oferecido por pagamento integral que já não vale neste instante. */
export function fullPaymentGiftExpired(intent: any, at = Date.now()): boolean {
  return isFullPaymentGift(intent) && !flexGiftActive(intent, at);
}

/**
 * A escolha de Flex que conta para o preço. O Flex oferecido por pagamento
 * integral põe flex=true no intent; quando a oferta expira (o hóspede não
 * pagou e voltou dias depois), o Flex volta a ser o que ELE escolheu. Sem
 * isto, quem nunca escolheu o Flex passava a pagá-lo por ter visto a oferta.
 */
export function effectiveFlexChoice(intent: any, at = Date.now()): boolean {
  if (fullPaymentGiftExpired(intent, at)) return intent?.flexGiftPrevFlex === true;
  return !!intent?.flex;
}

/**
 * O intent como o hóspede o deve ver agora: uma oferta por pagamento
 * integral expirada desaparece e o Flex volta à escolha dele. Só leitura
 * (getIntent); quem grava a correção é o createCardCharge.
 */
export function withoutExpiredFullPaymentGift<T extends Record<string, any>>(intent: T, at = Date.now()): T {
  if (!fullPaymentGiftExpired(intent, at)) return intent;
  return { ...intent, ...revokeFullPaymentGiftPatch(intent) };
}

/**
 * Patch que oferece o Flex a quem paga tudo agora (opção A da 2.6). Reutiliza
 * o mecanismo do funil de recuperação (flex_gift_until + flex=true): o Flex
 * entra a 0 € na cobrança, no resumo, nos emails e no manifesto pelo mesmo
 * caminho. Uma oferta já em vigor (de qualquer origem) fica como está.
 */
export function grantFullPaymentGiftPatch(intent: any, now = Date.now()): Record<string, unknown> | null {
  if (flexGiftActive(intent, now)) return null;
  return {
    flexGiftUntil: new Date(now + FULL_PAYMENT_GIFT_MS),
    flex: true,
    flexGiftReason: "full_payment",
    // Repõe-se se a oferta deixar de valer: quem não tinha escolhido o Flex
    // não pode ficar a pagá-lo por ter visto a oferta. Numa oferta antiga já
    // expirada, a escolha é a que ficou guardada, não o flex=true forçado.
    flexGiftPrevFlex: effectiveFlexChoice(intent, now),
  };
}

/**
 * Patch que retira o Flex oferecido por pagamento integral: o hóspede passou
 * a duas partes, a reserva deixou de ser elegível ou a oferta expirou. Nunca
 * toca numa oferta do funil de recuperação.
 */
export function revokeFullPaymentGiftPatch(intent: any): Record<string, unknown> | null {
  if (!isFullPaymentGift(intent)) return null;
  return {
    flexGiftUntil: null,
    flexGiftReason: null,
    flexGiftPrevFlex: null,
    // Sem escolha guardada, sem Flex: na dúvida nunca se cobra o que o hóspede não pediu.
    flex: intent?.flexGiftPrevFlex === true,
  };
}

/**
 * Patch do Flex oferecido para uma cobrança: dá-o quando o hóspede paga tudo
 * agora numa reserva elegível com o incentivo Flex; retira-o em qualquer outro
 * caso (duas partes, reserva já não elegível, incentivo desligado). null se
 * não há nada a mudar.
 */
export function fullPaymentGiftPatchFor(
  intent: any,
  decision: { plan: PaymentPlan; incentiveApplied: string },
  now = Date.now(),
): Record<string, unknown> | null {
  if (decision.plan === "full" && decision.incentiveApplied === "flex") return grantFullPaymentGiftPatch(intent, now);
  return revokeFullPaymentGiftPatch(intent);
}

/* ════════════════════════════════════════════════════════════════
   Projeção pública do intent (getIntent). O id do intent é uma capacidade
   (vai nos links de retoma), por isso o browser recebe só o que o checkout
   lê. Cada coluna nova tem de entrar numa das duas listas: o teste
   checkout-plan.test.ts falha se aparecer uma coluna sem classificação.
   ════════════════════════════════════════════════════════════════ */

export const PUBLIC_INTENT_FIELDS = [
  "id",
  "listingId",
  "propertyName",
  "propertySlug",
  "destination",
  "guestyQuoteId",
  "checkIn",
  "checkOut",
  "guests",
  "ratePlanId",
  "ratePlanType",
  "email",
  "guestFirstName",
  "guestLastName",
  "guestPhone",
  "nif",
  "quote",
  "extras",
  "reception",
  "flex",
  "flexGiftUntil",
  "flexGiftReason",
  "paymentPlan",
  "status",
  "locale",
  "reservationId",
  "confirmationCode",
  "expiresAt",
] as const;

/** Nunca saem para o browser: identificadores de pagamento, estado interno dos funis e provas legais. */
export const PRIVATE_INTENT_FIELDS = [
  "paymentIntentId",
  "stripeCustomerId",
  "recoveryStage",
  "recoveryOptout",
  "conciergeAlerted",
  "flexGiftPrevFlex",
  "flexImmediateConsentAt",
  "flexConsentVersion",
  "createdAt",
  "updatedAt",
] as const;

export type PublicIntentField = (typeof PUBLIC_INTENT_FIELDS)[number];

export function publicIntent<T extends Record<string, any>>(intent: T): Pick<T, Extract<PublicIntentField, keyof T>> {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_INTENT_FIELDS) {
    if (k in intent) out[k] = (intent as any)[k];
  }
  return out as any;
}

/**
 * Origem gravada em cada linha da 2.ª parte (site_origin). Com `livemode`,
 * separa as linhas de cada ambiente: o motor da Fase 2 só toca nas linhas da
 * sua própria origem, e a BD já foi partilhada entre DEV e produção uma vez.
 */
export function siteOriginForSchedule(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SITE_URL || env.PUBLIC_BASE_URL || env.PUBLIC_URL || env.APP_URL || "";
  try {
    return new URL(configured).host.slice(0, 64) || "unknown";
  } catch {
    return "unknown";
  }
}
