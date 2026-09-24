/**
 * FUNIL DE RECUPERAÇÃO DO CHECKOUT — regras (set/2026).
 * Documento de referência: docs/checkout_recovery.md.
 *
 * Quatro contactos, cada um com um argumento diferente:
 *   1 · 1h   A casa (ou, se parou no pagamento, "ficou algo por resolver?")
 *   2 · 20h  Urgência verdadeira: a hora exata a que o preço expira e,
 *            quando for verdade, a escassez real do calendário
 *   3 · 72h  Datas re-verificadas, preço de hoje, e o Flex oferecido 72h
 *   4 · 7d   Alternativas na mesma região, livres nas mesmas datas. Último.
 *
 * Os contactos 1 e 2 falam da cotação que o hóspede pediu e vão para todos.
 * Os contactos 3 e 4 são marketing (incentivo, outras casas) e só vão para
 * quem deu consentimento de newsletter no checkout.
 *
 * 10% dos checkouts (grupo de controlo, determinístico pelo id) não recebem
 * nenhum email: é o que permite medir quantas reservas o funil gera de facto.
 *
 * Tudo aqui é puro (sem I/O) para ficar coberto por testes.
 */
import { createHash } from "crypto";

const HOUR_MS = 60 * 60 * 1000;

export const RECOVERY_TIMING = {
  stage1AfterMs: 1 * HOUR_MS,
  stage2AfterMs: 20 * HOUR_MS,
  stage3AfterMs: 72 * HOUR_MS,
  stage4AfterMs: 7 * 24 * HOUR_MS,
  /** Validade do Flex oferecido no contacto 3 */
  flexGiftMs: 72 * HOUR_MS,
  /** Validade da cotação refeita no contacto 3 (igual à do checkout) */
  requoteTtlMs: 23 * HOUR_MS,
  /** Sem contactos quando o check-in está a menos disto */
  minLeadDays: 2,
  /** Depois disto o intent sai do funil */
  maxAgeMs: 9 * 24 * HOUR_MS,
} as const;

export const HOLDOUT_PERCENT = 10;

/** Alerta ao concierge: abandono no pagamento a partir deste total (EUR). */
export const CONCIERGE_ALERT_MIN_TOTAL = 3000;

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
  if (i.consent && i.stage < 4 && i.ageMs >= T.stage4AfterMs) return 4;
  if (i.consent && i.stage < 3 && i.ageMs >= T.stage3AfterMs) return 3;
  if (i.quoteValid && i.stage < 2 && i.ageMs >= T.stage2AfterMs) return 2;
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
