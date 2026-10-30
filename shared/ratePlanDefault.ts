/**
 * Tarifa pré-selecionada: a reembolsável, sempre que a estadia a ofereça
 * (decisão do Ricardo, 29 out 2026). Antes vinha a tarifa por omissão do
 * Guesty, que é a não reembolsável na maior parte das casas.
 *
 * Uma só regra para o widget da casa, o passo 1 do checkout (requote, cupão)
 * e o servidor (canonicalStayQuote, quando o intent ainda não tem tarifa):
 *   1. a tarifa reembolsável mais barata cujo cancelamento gratuito ainda
 *      está aberto para estas datas (código Guesty conhecido) ou cujo código
 *      não se conhece mas o próprio Guesty lhe chama "Reembolsável";
 *   2. senão, a tarifa por omissão do fornecedor, se estiver entre as mostradas;
 *   3. senão, a primeira mostrada.
 * A não reembolsável continua disponível para o hóspede escolher.
 */
import { freeCancellationDays, freeCancellationDeadline, lisbonToday, rateKind, type PolicyPlan } from "./cancellationPolicy";

export interface RatePlanChoice extends PolicyPlan {
  ratePlanId: string;
  total?: number;
}

/** Uma tarifa reembolsável que ainda vale a pena: janela aberta (ou código desconhecido com nome "Reembolsável"). */
export function isOpenRefundablePlan(plan: RatePlanChoice, checkIn?: string | null, today: string = lisbonToday()): boolean {
  if (rateKind(plan) !== "refundable") return false;
  // Código conhecido: só enquanto o cancelamento gratuito ainda está aberto.
  if (freeCancellationDays(plan.cancellationPolicy) != null) {
    if (!checkIn) return true;
    return freeCancellationDeadline(plan.cancellationPolicy, checkIn, today) != null;
  }
  // Código desconhecido mas nome "Reembolsável": o Guesty di-lo, aceita-se.
  return true;
}

export function preferredRatePlanId(
  options: readonly RatePlanChoice[] | null | undefined,
  supplierDefault?: string | null,
  checkIn?: string | null,
  today: string = lisbonToday(),
): string | null {
  if (!options || options.length === 0) return null;
  const refundable = options
    .filter((o) => isOpenRefundablePlan(o, checkIn, today))
    .sort((a, b) => (a.total ?? Number.POSITIVE_INFINITY) - (b.total ?? Number.POSITIVE_INFINITY));
  if (refundable.length) return refundable[0].ratePlanId;
  if (supplierDefault && options.some((o) => o.ratePlanId === supplierDefault)) return supplierDefault;
  return options[0].ratePlanId;
}
