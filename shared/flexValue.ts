/**
 * Flex (remarcação garantida, docs/checkout_spec.md §6): o que acrescenta a
 * uma tarifa e quanto custa, numa só regra para o ecrã e para quem a quiser
 * usar no servidor (a recuperação também oferece o Flex).
 *
 * Auditoria do funil (29 out 2026, n.º 14):
 *  - O Flex deixa remarcar até `rescheduleDaysBefore` (7) dias antes da
 *    chegada. Numa tarifa com cancelamento gratuito até 7 dias antes
 *    (moderate) não acrescenta nenhum dia: dentro dessa janela o hóspede
 *    cancela e recebe o dinheiro (spec §6, regra de honestidade), e depois
 *    dela o Flex também já não deixa remarcar. Vender o Flex aí é vender nada.
 *  - O preço é 10% das noites DA TARIFA ESCOLHIDA. O ecrã usava as noites da
 *    tarifa com que o hóspede chegou; ao trocar de tarifa, o servidor cobrava
 *    sobre as novas noites e o valor do botão deixava de bater com a cobrança.
 */
import { freeCancellationDeadline, lisbonToday, normalizePolicyCode } from "./cancellationPolicy";

function minusDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Dias de calendário de `from` a `to`, os dois incluídos (0 se `to` < `from`). */
function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Quantos dias o Flex acrescenta à tarifa: os dias em que se pode remarcar
 * com o Flex mas já não se pode cancelar de graça.
 *
 *   - 0: não acrescenta nada (moderate = 7 dias, ou a chegada já está a menos
 *     de `rescheduleDaysBefore` dias e o Flex já não serviria);
 *   - null: a política da tarifa é desconhecida (o site nunca adivinha uma
 *     regra); quem chama mantém o Flex como até aqui.
 *
 * O último dia de cada janela conta (a mesma leitura de "até 7 dias antes"
 * que a frase da política usa).
 */
export function flexExtraDays(input: {
  /** O código da tarifa escolhida (planPolicyCode), ou o código cru do Guesty. */
  policyCode: unknown;
  checkIn: string | null | undefined;
  rescheduleDaysBefore: number;
  today?: string;
}): number | null {
  const code = normalizePolicyCode(input.policyCode);
  const arrival = String(input.checkIn || "").slice(0, 10);
  if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return null;
  const today = input.today ?? lisbonToday();
  const flexLastDay = minusDays(arrival, Math.max(0, input.rescheduleDaysBefore));
  if (flexLastDay < today) return 0;
  const freeUntil = code === "non_refundable" ? null : freeCancellationDeadline(code, arrival, today);
  // Sem janela gratuita (não reembolsável, ou já passou): o Flex vale desde hoje
  const firstFlexOnlyDay = freeUntil ? minusDays(freeUntil, -1) : today;
  return daysInclusive(firstFlexOnlyDay, flexLastDay);
}

/** O Flex só se mostra (e só se vende) quando acrescenta algum dia. */
export function flexAddsValue(extraDays: number | null): boolean {
  return extraDays == null || extraDays > 0;
}

/** O que a cobrança usa de uma tarifa: o mesmo recorte do servidor. */
export interface FlexPricedPlan {
  total: number;
  cleaningFee: number;
  taxesAndFees?: number | null;
}

/**
 * Preço do Flex para a tarifa escolhida, com a MESMA conta que o servidor
 * cobra (server/config/checkout-extras.ts flexPriceFor sobre o totalNights da
 * quote de confiança, trusted-checkout-quote.ts: total − limpeza − taxas):
 * percentagem das noites ao euro; sem noites, o valor fixo de recurso.
 */
export function flexPriceForPlan(
  plan: FlexPricedPlan | null | undefined,
  config: { pricePercent?: number | null; price: number },
): number {
  const base = plan ? plan.total - plan.cleaningFee - (plan.taxesAndFees ?? 0) : 0;
  const pct = config.pricePercent ?? 10;
  return base > 0 ? Math.round((base * pct) / 100) : config.price;
}
