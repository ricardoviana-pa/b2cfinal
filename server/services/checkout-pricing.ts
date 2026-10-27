/**
 * Fase 2b — matemática canónica da cobrança única (decisão 12 jul 2026).
 *
 * REGRA DE OURO: o valor cobrado é SEMPRE recomputado aqui, no servidor, a
 * partir do intent + catálogo. Nunca se cobra um número vindo do cliente.
 *
 * Arquitetura decidida: o hóspede paga UM movimento (estadia+extras) na conta
 * Stripe da plataforma; a reserva Guesty é criada só com a ESTADIA
 * (recordExternalPayment) — os extras nunca entram no Guesty porque os totais
 * do Guesty alimentam a divisão com os owners e os extras são receita própria
 * ("bolo à parte"). Ver docs/checkout_2b_plan.md e HANDOVER §3.
 */
import {
  CHECKOUT_EXTRAS,
  CHECKOUT_RECEPTION,
  FLEX_CONFIG,
  flexPriceFor,
} from "../config/checkout-extras";

export interface IntentExtraSelection {
  sku: string;
  qty?: number | null;
  people?: number | null;
  sessions?: number | null;
  days?: number | null;
  /** Valor gravado pelo cliente — usado APENAS para detetar divergência */
  amount?: number | null;
}

export interface ChargeBreakdown {
  /** Tudo em cêntimos, inteiros */
  stayCents: number;
  receptionCents: number;
  extrasCents: number;
  flexCents: number;
  totalCents: number;
  /** Linhas recomputadas por sku (só extras com preço fixo) */
  lines: Array<{ sku: string; cents: number }>;
  /** Skus cujo amount do cliente divergiu do recomputado (alerta, não bloqueio) */
  divergent: string[];
}

/** Espelho servidor do extraAmount do cliente (EUR inteiros → cêntimos). */
export function extraAmountServer(sku: string, sel: IntentExtraSelection, unitPriceOverride?: number): number | null {
  const item = CHECKOUT_EXTRAS.find((e) => e.sku === sku);
  if (!item || item.pricingModel === "on_request") return null;
  const base = unitPriceOverride ?? item.unitPrice;
  if (base == null) return null;
  const qty = Math.max(1, Math.min(sel.qty ?? 1, item.maxQty ?? 30));
  const people = Math.max(1, Math.min(sel.people ?? item.minPeople ?? 1, 30));
  const sessions = Math.max(1, Math.min(sel.sessions ?? 1, 30));
  const days = Math.max(1, Math.min(sel.days ?? 1, 400));
  switch (item.pricingModel) {
    case "per_stay": return base;
    case "per_day": return base * days;
    case "per_person": return base * people;
    case "per_unit":
      if (item.tierPrices?.length) return item.tierPrices[Math.min(qty, item.tierPrices.length) - 1];
      return base * qty;
    case "per_person_per_unit": return base * people * sessions;
    case "included_selectable": return base * Math.max(0, qty - 1);
    case "per_person_per_day": return base * people * days;
  }
}

/**
 * Recomputa o valor total a cobrar a partir do estado persistido do intent.
 * `quoteTotal`/`totalNights` vêm do snapshot da quote Guesty no intent (EUR).
 */
export function computeChargeBreakdown(input: {
  quoteTotal: number;
  totalNights?: number | null;
  nights?: number | null;
  reception?: { type: "self" | "hosted"; late?: boolean | null } | null;
  extras?: IntentExtraSelection[] | null;
  flex?: boolean | null;
  /** Flex oferecido pelo funil de recuperação (contacto 3): conta 0 */
  flexGift?: boolean | null;
  /** Preços por casa (limpezas): sku → EUR */
  unitPriceOverrides?: Record<string, number> | null;
}): ChargeBreakdown {
  const stayCents = Math.round((input.quoteTotal ?? 0) * 100);

  const receptionEur = !input.reception || input.reception.type === "self"
    ? 0
    : input.reception.late
      ? CHECKOUT_RECEPTION.hostedLatePrice
      : CHECKOUT_RECEPTION.hostedPrice;

  const lines: Array<{ sku: string; cents: number }> = [];
  const divergent: string[] = [];
  let extrasEur = 0;
  for (const sel of input.extras ?? []) {
    // clamp defensivo: dias nunca acima das noites da estadia
    const capped = input.nights
      ? { ...sel, days: sel.days ? Math.min(sel.days, Math.max(1, input.nights)) : sel.days }
      : sel;
    const eur = extraAmountServer(sel.sku, capped, input.unitPriceOverrides?.[sel.sku]);
    if (eur == null) continue; // on_request nunca entra na cobrança
    extrasEur += eur;
    lines.push({ sku: sel.sku, cents: Math.round(eur * 100) });
    if (sel.amount != null && Math.round(sel.amount) !== eur) divergent.push(sel.sku);
  }

  const flexEur = input.flex ? flexPriceFor(input.totalNights) : 0;
  // Guarda-vidas: Flex só é cobrável acima do limiar
  const flexCents = !input.flexGift && flexEur > 0 && (input.quoteTotal ?? 0) >= FLEX_CONFIG.minTotal ? Math.round(flexEur * 100) : 0;

  // Cêntimos sempre inteiros: hoje todos os preços são euros inteiros (o
  // arredondamento não muda nada), mas um preço por casa com cêntimos dava
  // 110.00000000000001 e a divisão em duas partes recusava-o.
  const receptionCents = Math.round(receptionEur * 100);
  const extrasCents = lines.reduce((sum, l) => sum + l.cents, 0);
  return {
    stayCents,
    receptionCents,
    extrasCents,
    flexCents,
    totalCents: stayCents + receptionCents + extrasCents + flexCents,
    lines,
    divergent,
  };
}

/* ════════════════════════════════════════════════════════════════
   Pagamento em duas partes (docs/pagamento_duas_partes.md, 2.1, 2.2, 2.6).
   O plano é decidido AQUI, no servidor, a partir do breakdown canónico; o
   browser só diz o que o hóspede escolheu.
   ════════════════════════════════════════════════════════════════ */
import {
  twoPartsEligibility,
  twoPartsInstants,
  splitTwoParts,
  inTwoPartsHoldout,
  type TwoPartsConfig,
  type TwoPartsSchedule,
  type TwoPartsInstants,
  type TwoPartsSplit,
  type FullPaymentIncentive,
} from "./payment-plan";

export type PaymentPlan = "full" | "two_parts";

/** Porque é que a opção de duas partes não existe para este hóspede (para o CS e para a medição). */
export type PlanReason =
  | "disabled"
  | "engine_not_ready"
  | "holdout"
  | "currency"
  | "policy"
  | "lead_time"
  | "min_stay"
  | "invalid";

export type PaymentPlanOffer =
  | {
      available: true;
      schedule: TwoPartsSchedule;
      instants: TwoPartsInstants;
      split: TwoPartsSplit;
      /** Incentivo de quem paga tudo agora (2.6). */
      incentive: FullPaymentIncentive;
      /** Só na opção B: 1% da estadia, ao euro. 0 nas outras. */
      discountCents: number;
    }
  | { available: false; reason: PlanReason };

export interface PaymentPlanDecision {
  offer: PaymentPlanOffer;
  /** Plano efetivo desta cobrança. */
  plan: PaymentPlan;
  /** O hóspede pediu duas partes e não pode (oferta indisponível). Nunca se cai para 100% em silêncio. */
  requestedUnavailable: boolean;
  /** As wallets forçam o pagamento integral (spec 2.1, Método). */
  forcedFullByWallet: boolean;
  /** Incentivo aplicado a ESTA cobrança: só no pagamento integral de uma reserva elegível. */
  incentiveApplied: FullPaymentIncentive;
  amountDueTodayCents: number;
  /** 0 no plano integral. */
  balanceCents: number;
}

/** 1% da estadia, ao euro (opção B da 2.6). */
export function fullPaymentDiscountCents(stayCents: number): number {
  return Math.round(stayCents / 100 / 100) * 100;
}

export function computePaymentOffer(input: {
  breakdown: Pick<ChargeBreakdown, "stayCents" | "receptionCents" | "extrasCents" | "flexCents">;
  policy: unknown;
  checkIn: string;
  bookingDate: string;
  intentId: string;
  currency: string;
  config: TwoPartsConfig;
}): PaymentPlanOffer {
  const { config } = input;
  if (!config.enabled) return { available: false, reason: "disabled" };
  if (config.livemode && !config.engineReady) return { available: false, reason: "engine_not_ready" };
  if (String(input.currency || "").toUpperCase() !== "EUR") return { available: false, reason: "currency" };
  const verdict = twoPartsEligibility({
    policy: input.policy,
    checkIn: input.checkIn,
    bookingDate: input.bookingDate,
    stayCents: input.breakdown.stayCents,
    minStayCents: config.minStayCents,
  });
  if (!verdict.eligible) return { available: false, reason: verdict.reason };
  // O grupo de controlo é sorteado só entre as reservas elegíveis: o motivo de
  // uma reserva NR ou em cima da data é a tarifa ou a antecedência (o que o CS
  // precisa de ler), e a comparação tratamento/controlo mede iguais com iguais.
  if (inTwoPartsHoldout(input.intentId, config.holdout)) return { available: false, reason: "holdout" };
  let split: TwoPartsSplit;
  let instants: TwoPartsInstants;
  try {
    split = splitTwoParts(input.breakdown);
    instants = twoPartsInstants(verdict.schedule);
  } catch {
    // Valores que não se dividem ao cêntimo (ou datas ilegíveis) tiram a
    // opção, nunca o checkout: o pagamento integral tem de continuar a funcionar.
    return { available: false, reason: "invalid" };
  }
  return {
    available: true,
    schedule: verdict.schedule,
    instants,
    split,
    incentive: config.incentive,
    discountCents: config.incentive === "discount" ? fullPaymentDiscountCents(input.breakdown.stayCents) : 0,
  };
}

/**
 * Decide o plano de uma cobrança. `breakdown.totalCents` é o total já com o
 * incentivo Flex aplicado (o Flex oferecido entra a 0 € no breakdown, pelo
 * mesmo caminho do funil de recuperação); o desconto da opção B é abatido aqui.
 */
export function computePaymentPlan(input: {
  breakdown: Pick<ChargeBreakdown, "stayCents" | "receptionCents" | "extrasCents" | "flexCents" | "totalCents">;
  offer: PaymentPlanOffer;
  requested: PaymentPlan;
  wallet: boolean;
}): PaymentPlanDecision {
  const { offer, breakdown } = input;
  const wantsTwo = input.requested === "two_parts";
  const forcedFullByWallet = offer.available && wantsTwo && input.wallet;
  if (offer.available && wantsTwo && !input.wallet) {
    const split = splitTwoParts(breakdown);
    return {
      offer,
      plan: "two_parts",
      requestedUnavailable: false,
      forcedFullByWallet: false,
      incentiveApplied: "none",
      amountDueTodayCents: split.depositCents,
      balanceCents: split.balanceCents,
    };
  }
  const incentiveApplied: FullPaymentIncentive = offer.available ? offer.incentive : "none";
  const discount = offer.available && incentiveApplied === "discount" ? offer.discountCents : 0;
  return {
    offer,
    plan: "full",
    requestedUnavailable: wantsTwo && !offer.available,
    forcedFullByWallet,
    incentiveApplied,
    amountDueTodayCents: breakdown.totalCents - discount,
    balanceCents: 0,
  };
}
