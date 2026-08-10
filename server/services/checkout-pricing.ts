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
    case "per_unit": return base * qty;
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
    lines.push({ sku: sel.sku, cents: eur * 100 });
    if (sel.amount != null && Math.round(sel.amount) !== eur) divergent.push(sel.sku);
  }

  const flexEur = input.flex ? flexPriceFor(input.totalNights) : 0;
  // Guarda-vidas: Flex só é cobrável acima do limiar
  const flexCents = flexEur > 0 && (input.quoteTotal ?? 0) >= FLEX_CONFIG.minTotal ? flexEur * 100 : 0;

  const receptionCents = receptionEur * 100;
  const extrasCents = extrasEur * 100;
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
