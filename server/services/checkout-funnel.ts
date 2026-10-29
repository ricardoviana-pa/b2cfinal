/**
 * Funil do checkout (scripts/checkout-funnel-report.ts): as regras puras,
 * sem base de dados, para ficarem cobertas por testes.
 *
 * Três correções à medição (auditoria de 29 out 2026, n.º 15), porque a perda
 * de 59% no passo 1 estava inflacionada:
 * - Janela: por omissão nunca antes de 17 set 2026. Até 16 set o DEV escreveu
 *   na tabela de produção (commit 1b0ab73 separou-os); esses intents não são
 *   hóspedes. SINCE=AAAA-MM-DD pede outra data de propósito.
 * - Rascunhos repetidos: cada clique em "Reservar" cria um checkout novo. Um
 *   rascunho (sem email) com outro checkout da mesma casa nos 60 minutos
 *   seguintes é a mesma pessoa a voltar, não uma desistência no passo 1. O
 *   mais recente fica; o funil limpo mostra-se ao lado do bruto.
 * - Testes internos: o filtro pelo email (INTERNAL_EMAIL) fica. Um rascunho
 *   repetido de um checkout interno sai com os repetidos, porque a repetição
 *   conta contra todos os checkouts, internos incluídos.
 */
import { lisbonWallTimeToUtc } from "./payment-plan";

/** 1.º dia sem o DEV na tabela de produção (calendário de Lisboa). */
export const FUNNEL_CLEAN_SINCE = "2026-09-17";
/** Rascunho com outro checkout da mesma casa até este tempo depois: repetido. */
export const DUPLICATE_DRAFT_WINDOW_MS = 60 * 60 * 1000;
/** Intents com menos disto ainda podem fechar: ficam fora das taxas. */
export const FUNNEL_MIN_AGE_MS = 24 * 60 * 60 * 1000;
/** Testes internos, pelo email (só os intents com email se podem separar assim). */
export const INTERNAL_EMAIL = /@portugalactive\.com$|test|teste|example\.|mailinator/i;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** O que o funil lê de cada intent (subconjunto das colunas de booking_intents). */
export interface FunnelRow {
  id: string;
  listingId: string;
  status: string;
  email?: string | null;
  reception?: unknown;
  paymentIntentId?: string | null;
  createdAt: Date;
}

export interface FunnelWindow {
  start: Date;
  /** A janela pedida (DAYS) começava antes de 17 set e foi encurtada. */
  clamped: boolean;
  /** SINCE explícito: usado tal como veio, mesmo antes de 17 set. */
  explicit: boolean;
}

/** Meia-noite de Lisboa do dia AAAA-MM-DD. */
function lisbonMidnight(ymd: string): Date {
  return lisbonWallTimeToUtc(ymd, 0, 0);
}

/**
 * Início da janela do relatório. Sem SINCE: os últimos `days` dias, mas
 * nunca antes de 17 set 2026. Com SINCE (AAAA-MM-DD): essa data, à
 * meia-noite de Lisboa, mesmo antes de 17 set (quem pede sabe o que pede).
 */
export function funnelWindowStart(opts: { days: number; now?: Date; since?: string | null }): FunnelWindow {
  const since = String(opts.since ?? "").trim();
  if (since) {
    if (!YMD.test(since)) throw new Error(`SINCE inválido (${since}): use AAAA-MM-DD`);
    return { start: lisbonMidnight(since), clamped: false, explicit: true };
  }
  const days = Number(opts.days);
  if (!Number.isFinite(days) || days <= 0) throw new Error(`DAYS inválido (${opts.days})`);
  const now = (opts.now ?? new Date()).getTime();
  const requested = new Date(now - days * 86_400_000);
  const floor = lisbonMidnight(FUNNEL_CLEAN_SINCE);
  return requested < floor
    ? { start: floor, clamped: true, explicit: false }
    : { start: requested, clamped: false, explicit: false };
}

export function isInternalIntent(r: Pick<FunnelRow, "email">): boolean {
  return !!r.email && INTERNAL_EMAIL.test(r.email);
}

/** Rascunho: carregou em "Reservar" e saiu antes de deixar o email. */
export function isDraftIntent(r: Pick<FunnelRow, "status" | "email">): boolean {
  return r.status === "draft" && !r.email;
}

/**
 * Rascunhos repetidos: sem email e com outro checkout da mesma casa (de
 * qualquer estado, internos incluídos) criado depois, até `windowMs` mais
 * tarde. Só o mais antigo de cada par sai, por isso dois rascunhos seguidos
 * contam uma pessoa e não zero. Empates no instante decidem-se pelo id.
 */
export function duplicateDraftIds(rows: FunnelRow[], windowMs = DUPLICATE_DRAFT_WINDOW_MS): Set<string> {
  const byListing = new Map<string, FunnelRow[]>();
  for (const r of rows) {
    const list = byListing.get(r.listingId);
    if (list) list.push(r);
    else byListing.set(r.listingId, [r]);
  }
  const out = new Set<string>();
  for (const list of Array.from(byListing.values())) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    for (let i = 0; i < list.length - 1; i++) {
      const r = list[i];
      if (!isDraftIntent(r)) continue;
      // Ordenados por instante: basta o seguinte; se esse está fora da janela, todos estão.
      if (list[i + 1].createdAt.getTime() - r.createdAt.getTime() <= windowMs) out.add(r.id);
    }
  }
  return out;
}

/** Até onde chegou cada intent, pelos campos gravados (não pelo pixel). */
export const FUNNEL_STEPS = {
  intent: (_: FunnelRow) => true,
  email: (r: FunnelRow) => !!r.email,
  reception: (r: FunnelRow) => !!r.reception || !!r.paymentIntentId || r.status === "payment_pending" || r.status === "paid",
  payment: (r: FunnelRow) => !!r.paymentIntentId || r.status === "payment_pending" || r.status === "paid",
  paid: (r: FunnelRow) => r.status === "paid",
} as const;

export type FunnelStep = keyof typeof FUNNEL_STEPS;
export type FunnelCounts = Record<FunnelStep, number>;

export function funnelCounts(rows: FunnelRow[]): FunnelCounts {
  const n = (k: FunnelStep) => rows.filter(FUNNEL_STEPS[k]).length;
  return { intent: n("intent"), email: n("email"), reception: n("reception"), payment: n("payment"), paid: n("paid") };
}

/**
 * Os dois funis do relatório. `raw`: o de sempre (sem internos, só intents
 * com mais de 24 h). `clean`: o mesmo sem os rascunhos repetidos. A repetição
 * mede-se contra todos os intents lidos, também os internos e os das últimas
 * 24 h (o checkout que tornou o rascunho repetido pode ser recente).
 */
export function funnelRowSets<T extends FunnelRow>(
  all: T[],
  opts: { now?: number; windowMs?: number; minAgeMs?: number } = {},
): { raw: T[]; clean: T[]; internal: number; duplicates: number } {
  const now = opts.now ?? Date.now();
  const minAge = opts.minAgeMs ?? FUNNEL_MIN_AGE_MS;
  const dup = duplicateDraftIds(all, opts.windowMs ?? DUPLICATE_DRAFT_WINDOW_MS);
  const external = all.filter((r) => !isInternalIntent(r));
  const raw = external.filter((r) => now - r.createdAt.getTime() > minAge);
  const clean = raw.filter((r) => !dup.has(r.id));
  return { raw, clean, internal: all.length - external.length, duplicates: raw.length - clean.length };
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "-");

/** Uma linha do funil, no formato de sempre do relatório. */
export function funnelLine(label: string, c: FunnelCounts, width = 26): string {
  return (
    `${label.padEnd(width)} ${String(c.intent).padStart(4)} → email ${String(c.email).padStart(4)} (${pct(c.email, c.intent)}) → receção ${String(c.reception).padStart(4)} (${pct(c.reception, c.email)})` +
    ` → pagamento ${String(c.payment).padStart(4)} (${pct(c.payment, c.reception)}) → pago ${String(c.paid).padStart(3)} (${pct(c.paid, c.payment)})  | total ${pct(c.paid, c.intent)}`
  );
}

/** O mesmo segmento em bruto e sem os rascunhos repetidos, lado a lado. */
export function funnelPair<T extends FunnelRow>(label: string, raw: T[], clean: T[], keep: (r: T) => boolean = () => true): string[] {
  return [
    label,
    funnelLine("  em bruto", funnelCounts(raw.filter(keep))),
    funnelLine("  sem repetidos", funnelCounts(clean.filter(keep))),
  ];
}
