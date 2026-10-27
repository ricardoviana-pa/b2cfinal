/**
 * Pagamento em duas partes: calendário e elegibilidade.
 * Regras e porquês em docs/pagamento_duas_partes.md (secções 2.1 e 2.3).
 *
 * Fase 0: só a matemática das datas, pura e testada. Ainda nada no checkout a
 * usa; alimenta o relatório de antecedência (npm run report:leadtime), que diz
 * que parte das reservas do site teria podido pagar em duas partes e calibra
 * os limiares antes de a opção ser mostrada a alguém.
 *
 * Datas em YYYY-MM-DD no calendário de Lisboa, onde estão todas as casas. As
 * horas são fixas por regra (D até às 23:59, C às 10:00, H às 12:00, hora de
 * Lisboa) e só viram instantes UTC quando a cobrança for agendada (Fase 1).
 */
import {
  FREE_CANCELLATION_DAYS,
  normalizePolicyCode,
  type RefundablePolicyCode,
} from "@shared/cancellationPolicy";

export const TWO_PARTS_RULES = {
  /** C = último dia de cancelamento gratuito (D) menos estes dias. Decisão do Ricardo, 25 out 2026. */
  chargeDaysBeforeDeadline: 10,
  /** C tem de cair pelo menos estes dias depois da reserva, para o lembrete C−7 não colidir com a confirmação. */
  minDaysFromBookingToCharge: 10,
  /** Retentativas automáticas, só em recusas soft: C+1 e C+3. */
  retryOffsetsDays: [1, 3],
  /** Depois do aviso escrito de falha, dias para pagar por outro meio (regra Visa). */
  noticeDays: 7,
  /** Estadia mínima (noites + limpeza + taxas, depois de cupão) para oferecer a opção. Decisão de 25 out 2026. */
  minStayCents: 100_000,
} as const;

export interface TwoPartsSchedule {
  policyCode: RefundablePolicyCode;
  /** D: último dia de cancelamento gratuito, até às 23:59 de Lisboa. */
  freeCancelDeadline: string;
  /** C: segunda cobrança, às 10:00 de Lisboa. */
  chargeDate: string;
  /** Retentativas automáticas (só recusas soft), às 10:00 de Lisboa. */
  retryDates: string[];
  /** H no caso normal (aviso de falha enviado em C): min(C + 7, D − 1), às 12:00 de Lisboa. */
  hardStopDate: string;
}

export type TwoPartsIneligibleReason =
  /** Não reembolsável ou política desconhecida: não há data honesta para a 2.ª parte. */
  | "policy"
  /** A 2.ª cobrança cairia a menos de 10 dias da reserva. */
  | "lead_time"
  /** Estadia abaixo do mínimo. */
  | "min_stay"
  /** Datas ilegíveis. */
  | "invalid";

export type TwoPartsEligibility =
  | { eligible: true; schedule: TwoPartsSchedule }
  | { eligible: false; reason: TwoPartsIneligibleReason; schedule: TwoPartsSchedule | null };

function isYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Soma dias a uma data de calendário (meio-dia UTC: imune a mudanças de hora). */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dias de calendário de `from` até `to` (positivo se `to` é depois). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Antecedência mínima (dias entre a reserva e o check-in) para a opção existir. */
export function minLeadDaysForTwoParts(code: RefundablePolicyCode): number {
  return (
    FREE_CANCELLATION_DAYS[code] + TWO_PARTS_RULES.chargeDaysBeforeDeadline + TWO_PARTS_RULES.minDaysFromBookingToCharge
  );
}

/**
 * Calendário da segunda parte para uma política e um check-in. null quando a
 * política não tem cancelamento gratuito (não reembolsável) ou é desconhecida:
 * nesses casos a reserva paga-se por inteiro, sempre.
 */
export function twoPartsSchedule(rawPolicy: unknown, checkIn: string): TwoPartsSchedule | null {
  const code = normalizePolicyCode(rawPolicy);
  if (!code || code === "non_refundable") return null;
  if (!isYmd(checkIn)) return null;
  const freeCancelDeadline = addDays(checkIn, -FREE_CANCELLATION_DAYS[code]);
  const chargeDate = addDays(freeCancelDeadline, -TWO_PARTS_RULES.chargeDaysBeforeDeadline);
  const afterNotice = addDays(chargeDate, TWO_PARTS_RULES.noticeDays);
  const dayBeforeDeadline = addDays(freeCancelDeadline, -1);
  return {
    policyCode: code,
    freeCancelDeadline,
    chargeDate,
    retryDates: TWO_PARTS_RULES.retryOffsetsDays.map((o) => addDays(chargeDate, o)),
    hardStopDate: afterNotice < dayBeforeDeadline ? afterNotice : dayBeforeDeadline,
  };
}

/**
 * A reserva pode pagar em duas partes? Só as regras de produto (tarifa,
 * antecedência, valor). Método de pagamento, flag e grupo de controlo são
 * decididos em runtime no checkout (Fase 1).
 */
export function twoPartsEligibility(input: {
  policy: unknown;
  checkIn: string;
  /** Dia da reserva no calendário de Lisboa (lisbonToday no checkout). */
  bookingDate: string;
  stayCents: number;
}): TwoPartsEligibility {
  if (!isYmd(input.checkIn) || !isYmd(input.bookingDate)) {
    return { eligible: false, reason: "invalid", schedule: null };
  }
  const schedule = twoPartsSchedule(input.policy, input.checkIn);
  if (!schedule) return { eligible: false, reason: "policy", schedule: null };
  if (daysBetween(input.bookingDate, schedule.chargeDate) < TWO_PARTS_RULES.minDaysFromBookingToCharge) {
    return { eligible: false, reason: "lead_time", schedule };
  }
  if (!Number.isFinite(input.stayCents) || input.stayCents < TWO_PARTS_RULES.minStayCents) {
    return { eligible: false, reason: "min_stay", schedule };
  }
  return { eligible: true, schedule };
}
