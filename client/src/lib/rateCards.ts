/**
 * Os cartões de tarifa (widget da casa e passo 1 do checkout), fora do
 * componente para se testarem sem React: o que cada cartão diz e compara.
 *
 * Decisão do Ricardo (29 out 2026): duas opções claras, "mais e-commerce",
 * com valores. Cada cartão tem o nome da tarifa, uma linha de benefício
 * (cancelamento gratuito até <data> / sem reembolso), o total da estadia e,
 * na não reembolsável, a poupança ("Poupe X €") ao lado do total da
 * reembolsável. Sem urgência inventada.
 */
import {
  freeCancellationDeadline,
  lisbonToday,
  planPolicyCode,
  rateKind,
  type PolicyCode,
  type RateKind,
} from "@shared/cancellationPolicy";

/** O que uma tarifa do widget ou do checkout traz (os códigos do Guesty como string[]). */
export interface RateCardOption {
  ratePlanId: string;
  total: number;
  name?: string | null;
  cancellationPolicy?: string[];
  cancellationFee?: string | number | null;
}

export interface RateCardModel<T extends RateCardOption = RateCardOption> {
  option: T;
  ratePlanId: string;
  kind: RateKind;
  policyCode: PolicyCode | null;
  /** Último dia de cancelamento gratuito (YYYY-MM-DD), quando o código é conhecido e a janela está aberta. */
  freeUntil: string | null;
  total: number;
  /** O total da tarifa com que esta se compara (a reembolsável), só quando esta é mais barata. */
  compareTotal: number | null;
  /** compareTotal − total, arredondado ao cêntimo; 0 quando não há poupança. */
  savings: number;
  /** A linha "pode pagar em duas partes" só faz sentido numa tarifa reembolsável com código conhecido. */
  twoPartsCandidate: boolean;
}

/**
 * Um modelo por tarifa mostrada. A poupança compara com a tarifa reembolsável
 * (a mais cara das duas); sem reembolsável na lista, com a mais cara das outras.
 */
export function rateCardModels<T extends RateCardOption>(
  options: readonly T[],
  checkIn?: string | null,
  today: string = lisbonToday(),
): RateCardModel<T>[] {
  const refundable = options.filter((o) => rateKind(o) === "refundable");
  const anchor = refundable.length
    ? Math.max(...refundable.map((o) => o.total))
    : Math.max(...options.map((o) => o.total));
  return options.map((option) => {
    const kind = rateKind(option);
    const policyCode = planPolicyCode(option);
    const freeUntil =
      kind === "refundable" && policyCode && policyCode !== "non_refundable"
        ? freeCancellationDeadline(policyCode, checkIn ?? undefined, today)
        : null;
    const savings = Math.max(0, Math.round((anchor - option.total) * 100) / 100);
    return {
      option,
      ratePlanId: option.ratePlanId,
      kind,
      policyCode,
      freeUntil,
      total: option.total,
      compareTotal: savings > 0 ? anchor : null,
      savings,
      twoPartsCandidate: kind === "refundable" && !!policyCode && policyCode !== "non_refundable",
    };
  });
}
