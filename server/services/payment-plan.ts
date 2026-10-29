/**
 * Pagamento em duas partes: calendário e elegibilidade.
 * Regras e porquês em docs/pagamento_duas_partes.md (secções 2.1 e 2.3).
 *
 * Fase 0: a matemática das datas, pura e testada, que alimenta o relatório de
 * antecedência (npm run report:leadtime). Fase 1: instantes UTC das horas da
 * regra, divisão exata, grupo de controlo e configuração por env, usados por
 * computePaymentPlan (checkout-pricing.ts). Tudo puro, sem BD nem rede.
 *
 * Datas em YYYY-MM-DD no calendário de Lisboa, onde estão todas as casas. As
 * horas são fixas por regra (D até às 23:59, C às 10:00, H às 12:00, hora de
 * Lisboa) e só viram instantes UTC quando a cobrança for agendada (Fase 1).
 */
import { createHash } from "crypto";
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
  /** Mínimo configurado (CHECKOUT_TWO_PARTS_MIN_STAY_CENTS); por omissão o da regra. */
  minStayCents?: number;
}): TwoPartsEligibility {
  if (!isYmd(input.checkIn) || !isYmd(input.bookingDate)) {
    return { eligible: false, reason: "invalid", schedule: null };
  }
  const schedule = twoPartsSchedule(input.policy, input.checkIn);
  if (!schedule) return { eligible: false, reason: "policy", schedule: null };
  if (daysBetween(input.bookingDate, schedule.chargeDate) < TWO_PARTS_RULES.minDaysFromBookingToCharge) {
    return { eligible: false, reason: "lead_time", schedule };
  }
  const minStay = input.minStayCents ?? TWO_PARTS_RULES.minStayCents;
  if (!Number.isFinite(input.stayCents) || input.stayCents < minStay) {
    return { eligible: false, reason: "min_stay", schedule };
  }
  return { eligible: true, schedule };
}

/* ════════════════════════════════════════════════════════════════
   Fase 1: instantes, divisão, grupo de controlo e configuração.
   ════════════════════════════════════════════════════════════════ */

/** Horas fixas por regra, no relógio de Lisboa (spec 2.3). */
export const TWO_PARTS_TIMES = {
  freeCancelDeadline: { hour: 23, minute: 59 },
  charge: { hour: 10, minute: 0 },
  hardStop: { hour: 12, minute: 0 },
} as const;

/** Desvio de Lisboa face a UTC, em minutos, num dado instante (0 no inverno, 60 no verão). */
function lisbonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * Instante UTC de uma hora de parede em Lisboa. As horas da regra (10:00,
 * 12:00, 23:59) nunca caem no salto da mudança de hora (01:00 a 02:00), por
 * isso o desvio lido uma hora antes basta e é exato.
 */
export function lisbonWallTimeToUtc(ymd: string, hour: number, minute: number): Date {
  if (!isYmd(ymd)) throw new Error(`data inválida: ${ymd}`);
  const [y, m, d] = ymd.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, minute);
  const offset = lisbonOffsetMinutes(new Date(naive - 60 * 60_000));
  const at = new Date(naive - offset * 60_000);
  // Confirmação: o instante tem de voltar a dar a mesma hora de parede.
  const back = lisbonOffsetMinutes(at);
  return back === offset ? at : new Date(naive - back * 60_000);
}

export interface TwoPartsInstants {
  /** D às 23:59 de Lisboa. */
  freeCancelDeadlineAt: Date;
  /** C às 10:00 de Lisboa. */
  chargeAt: Date;
  /** Retentativas às 10:00 de Lisboa. */
  retryAt: Date[];
  /** H às 12:00 de Lisboa (caso normal; o motor recalcula-o quando o aviso de falha sai). */
  hardStopAt: Date;
}

export function twoPartsInstants(s: TwoPartsSchedule): TwoPartsInstants {
  const t = TWO_PARTS_TIMES;
  return {
    freeCancelDeadlineAt: lisbonWallTimeToUtc(s.freeCancelDeadline, t.freeCancelDeadline.hour, t.freeCancelDeadline.minute),
    chargeAt: lisbonWallTimeToUtc(s.chargeDate, t.charge.hour, t.charge.minute),
    retryAt: s.retryDates.map((d) => lisbonWallTimeToUtc(d, t.charge.hour, t.charge.minute)),
    hardStopAt: lisbonWallTimeToUtc(s.hardStopDate, t.hardStop.hour, t.hardStop.minute),
  };
}

export interface TwoPartsSplit {
  /** Metade da estadia, arredondada ao euro para cima. */
  depositStayCents: number;
  /** O que se paga hoje: metade da estadia + receção + extras + Flex, por inteiro. */
  depositCents: number;
  /** O que fica para a segunda cobrança: o resto exato da estadia. */
  balanceCents: number;
}

/**
 * Divisão exata (spec 2.2). Só a estadia se divide; a soma das duas partes é
 * sempre o total, ao cêntimo. Os valores vêm do breakdown do servidor.
 */
export function splitTwoParts(b: {
  stayCents: number;
  receptionCents: number;
  extrasCents: number;
  flexCents: number;
}): TwoPartsSplit {
  for (const v of [b.stayCents, b.receptionCents, b.extrasCents, b.flexCents]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`valor inválido para dividir: ${v}`);
  }
  const depositStayCents = Math.min(b.stayCents, Math.ceil(b.stayCents / 2 / 100) * 100);
  return {
    depositStayCents,
    depositCents: depositStayCents + b.receptionCents + b.extrasCents + b.flexCents,
    balanceCents: b.stayCents - depositStayCents,
  };
}

/**
 * Grupo de controlo determinístico: o mesmo intent cai sempre do mesmo lado,
 * em qualquer instância e em qualquer recarregamento da página.
 */
export function inTwoPartsHoldout(intentId: string, fraction: number): boolean {
  if (!(fraction > 0)) return false;
  if (fraction >= 1) return true;
  const hex = createHash("sha256").update(`two-parts-holdout:${intentId}`).digest("hex").slice(0, 8);
  return parseInt(hex, 16) / 0x1_0000_0000 < fraction;
}

export type FullPaymentIncentive = "flex" | "discount" | "none";

/**
 * O motor da segunda cobrança (Fase 2) existe desde 28 out 2026 e foi ligado
 * em produção nesse dia, por decisão do Ricardo. Em modo live a opção só
 * aparece se, além disto, o motor estiver ligado no env (CHECKOUT_BALANCE):
 * desligar o motor tira a opção do site na hora, para nunca haver metades
 * por cobrar sem ninguém para as cobrar. Em modo de teste da Stripe a opção
 * funciona sempre, para os testes.
 */
export const TWO_PARTS_BALANCE_ENGINE_READY = true;

export interface TwoPartsConfig {
  /** CHECKOUT_TWO_PARTS=true */
  enabled: boolean;
  /** Chave Stripe live (sk_live_/rk_live_). Sem chave conta como live: na dúvida, fechado. */
  livemode: boolean;
  engineReady: boolean;
  holdout: number;
  minStayCents: number;
  incentive: FullPaymentIncentive;
  /** Avisos de configuração (valores recusados), para o log do arranque. */
  warnings: string[];
}

export function readTwoPartsConfig(env: NodeJS.ProcessEnv = process.env): TwoPartsConfig {
  const warnings: string[] = [];
  const key = String(env.STRIPE_SECRET_KEY ?? "");
  const livemode = !/^(sk|rk)_test_/.test(key);
  const holdoutRaw = env.CHECKOUT_TWO_PARTS_HOLDOUT;
  // Sem grupo de controlo por omissão (decisão de 28 out 2026): o aviso na
  // página da casa e no passo 1 vem antes do sorteio, que só existe no
  // checkout, e o grupo de controlo via "pode pagar em duas partes" e depois
  // não tinha a opção. Mede-se contra o período anterior. Ligar com
  // CHECKOUT_TWO_PARTS_HOLDOUT=0.10 se um dia o sorteio for por visitante.
  let holdout = 0;
  if (holdoutRaw != null && holdoutRaw !== "") {
    const n = Number(holdoutRaw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) holdout = n;
    else warnings.push(`CHECKOUT_TWO_PARTS_HOLDOUT inválido (${holdoutRaw}); fica 0`);
  }
  const minRaw = env.CHECKOUT_TWO_PARTS_MIN_STAY_CENTS;
  let minStayCents: number = TWO_PARTS_RULES.minStayCents;
  if (minRaw != null && minRaw !== "") {
    const n = Number(minRaw);
    if (Number.isSafeInteger(n) && n >= 10_000) minStayCents = n;
    else warnings.push(`CHECKOUT_TWO_PARTS_MIN_STAY_CENTS inválido (${minRaw}); fica ${TWO_PARTS_RULES.minStayCents}`);
  }
  const incRaw = String(env.FULL_PAYMENT_INCENTIVE ?? "").trim().toLowerCase();
  // Sem incentivo por omissão (decisão do Ricardo, 28 out 2026): o Flex é um
  // extra pago; dá-lo a quem paga tudo tirava-lhe o valor sem o hóspede o
  // perceber. FULL_PAYMENT_INCENTIVE=flex volta a ligá-lo.
  let incentive: FullPaymentIncentive = "none";
  if (incRaw === "none") incentive = "none";
  else if (incRaw === "flex") incentive = "flex";
  else if (incRaw === "discount") {
    // Opção B (1%): a matemática existe e está testada, mas o acerto do folio
    // no Guesty (ajuste negativo ao AF via Price Adjustments) não foi provado
    // com dinheiro real (teste de 1 € da Fase 0, alínea d). Sem esse acerto o
    // folio ficava acima do cobrado e o CS via dívida falsa. Até lá, recusa.
    incentive = "none";
    warnings.push("FULL_PAYMENT_INCENTIVE=discount ainda não está disponível (acerto do folio Guesty por provar); fica none");
  } else if (incRaw && incRaw !== "flex") {
    warnings.push(`FULL_PAYMENT_INCENTIVE desconhecido (${incRaw}); fica none`);
  }
  return {
    enabled: env.CHECKOUT_TWO_PARTS === "true",
    livemode,
    engineReady: TWO_PARTS_BALANCE_ENGINE_READY && env.CHECKOUT_BALANCE === "true",
    holdout,
    minStayCents,
    incentive,
    warnings,
  };
}
