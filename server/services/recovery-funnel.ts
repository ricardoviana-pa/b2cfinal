/**
 * FUNIL DE RECUPERAÇÃO DO CHECKOUT — regras (nov/2026).
 * Documento de referência: docs/checkout_recovery.md.
 *
 * Quatro contactos, cada um com um argumento diferente:
 *   1 · 1h   A casa. Se parou no pagamento: sem tentativa de pagar, "ficou
 *            alguma dúvida?"; depois de uma tentativa, "ficou algo por
 *            resolver?" (checkout-recovery.ts, paymentStepFacts)
 *   2 · 24h  Datas re-verificadas, preço de hoje, e o Flex oferecido 48h
 *            (só quando acrescenta dias à tarifa: flexExtraDays)
 *   3 · 72h  Datas re-verificadas e 5% de desconto durante 48h, já aplicado
 *            no link (cupão do Guesty, sem código para escrever)
 *   4 · 7d   Alternativas na mesma região, livres nas mesmas datas. Último.
 *
 * Os contactos 1 a 3 falam da MESMA casa e das MESMAS datas que o hóspede
 * pediu, por isso vão para todos, com opt-out em cada email. Só o contacto 4
 * (outras casas) é marketing e exige consentimento de newsletter.
 * Decisão do Ricardo, 17 nov 2026: até aí os contactos 3 e 4 exigiam
 * consentimento e, em 30 dias, nenhum hóspede chegou a ver o Flex.
 *
 * 10% dos checkouts (grupo de controlo, determinístico pelo id) não recebem
 * nenhum email: é o que permite medir quantas reservas o funil gera de facto.
 *
 * Tudo aqui é puro (sem I/O) para ficar coberto por testes.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ENV } from "../_core/env";
import { FREE_CANCELLATION_DAYS, type PolicyCode } from "@shared/cancellationPolicy";
import { KLARNA_DEFAULT_COUNTRY, KLARNA_PAY_IN_3_MAX_CENTS, klarnaAvailable } from "@shared/klarna";

const HOUR_MS = 60 * 60 * 1000;

export const RECOVERY_TIMING = {
  stage1AfterMs: 1 * HOUR_MS,
  stage2AfterMs: 24 * HOUR_MS,
  stage3AfterMs: 72 * HOUR_MS,
  stage4AfterMs: 7 * 24 * HOUR_MS,
  /** Validade do Flex oferecido no contacto 2 */
  flexGiftMs: 48 * HOUR_MS,
  /** Validade do desconto oferecido no contacto 3 */
  discountGiftMs: 48 * HOUR_MS,
  /** Validade da cotação refeita nos contactos 2 e 3 (igual à do checkout) */
  requoteTtlMs: 23 * HOUR_MS,
  /** Sem contactos quando o check-in está a menos disto */
  minLeadDays: 2,
  /** Depois disto o intent sai do funil */
  maxAgeMs: 9 * 24 * HOUR_MS,
} as const;

export const HOLDOUT_PERCENT = 10;

/**
 * Desconto do contacto 3 (17 nov 2026). O valor vive num cupão do Guesty, não
 * no código: o site só aplica o cupão à cotação antes de enviar o email, para
 * o hóspede abrir o link já com o desconto feito, sem código para escrever.
 *
 * RECOVERY_DISCOUNT_COUPON vazio (por omissão) = sem desconto: o contacto 3
 * sai na mesma, com as datas re-verificadas e o preço de hoje. Assim o funil
 * pode entrar em produção antes de o cupão existir no Guesty, e um cupão
 * apagado nunca parte o email.
 */
export const RECOVERY_DISCOUNT_PERCENT = 5;

export function recoveryDiscountCoupon(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = String(env.RECOVERY_DISCOUNT_COUPON ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,40}$/.test(raw) ? raw : null;
}

/** Guesty may return the internal coupon name in place of the public code. */
export function isRecoveryDiscountCoupon(value?: string | null, coupon = recoveryDiscountCoupon()): boolean {
  if (!coupon || !value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === coupon || normalized.startsWith(`${coupon} `) || normalized.startsWith(`${coupon}-`);
}

/** Prove that the server applied the offer to this particular Guesty quote. */
export function recoveryQuoteProof(intentId: string, quoteId: string, until: Date, supplierReference: string): string {
  return createHmac("sha256", ENV.cookieSecret)
    .update(JSON.stringify(["recovery-discount", intentId, quoteId, until.getTime(), supplierReference.trim().toUpperCase()]))
    .digest("hex");
}

export function verifiesRecoveryQuoteProof(
  proof: string | undefined, intentId: string, quoteId: string, until: Date, supplierReference: string,
): boolean {
  if (!proof || !/^[a-f0-9]{64}$/.test(proof)) return false;
  return timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(recoveryQuoteProof(intentId, quoteId, until, supplierReference), "hex"));
}

/**
 * Alerta ao concierge: abandono no pagamento a partir deste total (EUR).
 * Era 3 000 € até 29 out 2026; decisão do Ricardo nesse dia: alerta para
 * TODOS os que param no passo de pagamento (0 = sem mínimo). Um número só,
 * para se poder voltar a subir sem mexer no código do funil.
 */
export const CONCIERGE_ALERT_MIN_TOTAL = 0;

/**
 * Klarna no checkout: desde 29 out 2026 o país de faturação é o REAL do
 * hóspede (shared/klarna.ts: telefone → língua do site → PT), e o contacto 1
 * volta a poder sugerir o Klarna a quem tentou pagar, dentro do tecto do país
 * (klarnaCanPay). Até aí ia sempre PT, e quem não era cliente Klarna em
 * Portugal era recusado em qualquer valor (auditoria 29 out, n.º 8).
 *
 * Interruptor de emergência, sem deploy: KLARNA_BILLING_COUNTRY_FORCED_PT=true
 * no ambiente volta a forçar PT na criação do PaymentIntent (routers/booking.ts)
 * e cala a sugestão do Klarna no funil. Por omissão (vazio) vale a constante.
 */
export const KLARNA_BILLING_COUNTRY_FORCED_PT = false;

export function klarnaBillingCountryForcedPt(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = String(env.KLARNA_BILLING_COUNTRY_FORCED_PT ?? "").trim().toLowerCase();
  if (!raw) return KLARNA_BILLING_COUNTRY_FORCED_PT;
  return raw === "true" || raw === "1" || raw === "yes";
}

/** "Paga em 3" do Klarna para clientes portugueses: até 1 000 € (tecto de PT em shared/klarna.ts). */
export const KLARNA_MAX_CENTS = KLARNA_PAY_IN_3_MAX_CENTS[KLARNA_DEFAULT_COUNTRY];

/** O Klarna aceita este total (cêntimos) neste país de faturação? Sem total
 *  conhecido, ou num país onde a Klarna não se oferece, não se sugere. */
export function klarnaCanPay(totalCents: number | null | undefined, country: unknown = KLARNA_DEFAULT_COUNTRY): boolean {
  return klarnaAvailable(country, totalCents);
}

/**
 * Dias que o Flex acrescenta ao cancelamento gratuito da tarifa. O Flex
 * deixa remarcar até `rescheduleDaysBefore` dias antes da chegada; uma tarifa
 * que já cancela de graça até N dias antes só ganha os dias entre N e esse
 * prazo. Na moderate (7 dias) com o Flex a 7 dias: 0, o Flex não acrescenta
 * nada. Não reembolsável: tudo (Infinity). Política desconhecida: null, não se
 * sabe (quem chama decide; o funil mantém a oferta, como antes).
 */
export function flexExtraDays(policy: PolicyCode | null | undefined, rescheduleDaysBefore: number): number | null {
  if (!policy) return null;
  if (policy === "non_refundable") return Infinity;
  const free = FREE_CANCELLATION_DAYS[policy];
  if (typeof free !== "number") return null;
  return Math.max(0, free - rescheduleDaysBefore);
}

export type RecoveryStage = 1 | 2 | 3 | 4;

/**
 * Grupo de controlo determinístico: o mesmo intent cai sempre no mesmo grupo,
 * sem estado na base de dados, e o relatório recalcula o grupo a partir do id.
 */
export function isRecoveryHoldout(intentId: string): boolean {
  const n = parseInt(createHash("sha256").update(intentId).digest("hex").slice(0, 8), 16);
  return n % 100 < HOLDOUT_PERCENT;
}

/**
 * O contacto devido agora, ou null. Se vários estão em atraso (servidor em
 * baixo), envia-se só o mais recente: nunca dois emails seguidos.
 */
export function nextRecoveryStage(i: {
  stage: number;
  ageMs: number;
  /** A cotação original ainda é válida (expiresAt no futuro) */
  quoteValid: boolean;
  /** Consentimento de marketing (newsletter) dado no checkout */
  consent: boolean;
}): RecoveryStage | null {
  const T = RECOVERY_TIMING;
  if (i.ageMs > T.maxAgeMs) return null;
  // Só o contacto 4 (outras casas) é marketing e exige consentimento.
  if (i.consent && i.stage < 4 && i.ageMs >= T.stage4AfterMs) return 4;
  // Os contactos 2 e 3 refazem a cotação antes de sair (a do checkout morre
  // às ~23h), por isso não dependem de ela ainda ser válida.
  if (i.stage < 3 && i.ageMs >= T.stage3AfterMs) return 3;
  if (i.stage < 2 && i.ageMs >= T.stage2AfterMs) return 2;
  if (i.quoteValid && i.stage < 1 && i.ageMs >= T.stage1AfterMs) return 1;
  return null;
}

/** O check-in ainda está longe o suficiente para contactar? (datas YYYY-MM-DD) */
export function hasEnoughLeadTime(checkIn: string, now = Date.now()): boolean {
  const ci = Date.parse(`${checkIn}T00:00:00Z`);
  if (!Number.isFinite(ci)) return false;
  return ci - now >= RECOVERY_TIMING.minLeadDays * 24 * HOUR_MS;
}

/** Flex oferecido ainda válido para este intent? */
export function flexGiftActive(intent: { flexGiftUntil?: Date | string | null } | null | undefined, now = Date.now()): boolean {
  const until = intent?.flexGiftUntil ? new Date(intent.flexGiftUntil as any).getTime() : NaN;
  return Number.isFinite(until) && until > now;
}

/**
 * Escassez real a partir do calendário à volta das datas. Só devolve algo
 * quando a maioria das noites já não está disponível — urgência inventada é
 * proibida pela spec (§2) e pela marca.
 */
export function calendarScarcity(days: Array<{ status?: string }>): { unavailable: number; total: number } | null {
  const total = days.length;
  if (total < 14) return null;
  const unavailable = days.filter((d) => d?.status && d.status !== "available").length;
  return unavailable / total >= 0.5 ? { unavailable, total } : null;
}
