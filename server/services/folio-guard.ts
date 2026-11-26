/**
 * Vigilância dos folios do Guesty (20 nov 2026).
 *
 * PORQUÊ ISTO EXISTE
 *
 * O payout ao proprietário sai do folio da reserva no Guesty, não do que
 * entrou em caixa. E o Guesty recalcula o folio sempre que alguém edita uma
 * reserva de venda direta: o formulário de check-in do Hostkit a mudar a hora
 * de chegada ou de saída, o CS a corrigir o número de hóspedes. O registo de
 * atividade mostra "Financial update · Guesty System" no mesmo segundo.
 *
 *   GY-Huf4Lp8L  pagou 2.524,07; o Hostkit mudou a saída para 08:30 e o
 *                alojamento passou de 2.421 para 4.842 (owner +~1.370 €).
 *   GY-ndt4aNGi  pagou 1.547,91; 14→7 adultos e o alojamento passou de
 *                1.158 para 2.316.
 *   GY-kFGjqPnm  pagou 772; 14→11 adultos e o folio desceu para 672.
 *   20 reservas diretas de julho: a 6 ago o Guesty lançou uma linha
 *                "Host channel fee" de -10% depois do check-out.
 *
 * Ninguém viu nenhuma destas mudanças até o hóspede dizer "já paguei tudo".
 * Este módulo compara o folio de cada reserva de venda direta com o valor que
 * tinha quando foi paga e avisa a gestão assim que diverge. Não escreve nada
 * no Guesty: corrigir um folio mexe na receita do proprietário e fica para
 * uma pessoa (ver o alerta).
 *
 * COMO FUNCIONA
 *
 *   Linha de base  — o folio no momento em que a reserva ficou paga: no fim
 *                    do settle do checkout do site, ou na primeira leitura em
 *                    que o Guesty já mostra um pagamento. Enquanto nada está
 *                    pago a base acompanha o folio (o CS ainda está a fazer o
 *                    preço). Mudar casa ou datas é uma alteração da reserva e
 *                    renova a base sem alerta.
 *   Verificação    — a cada webhook reservation.updated (com 3 min de espera
 *                    para juntar a rajada de updates do Hostkit) e numa ronda
 *                    de 6 em 6 h a todas as reservas com saída nos últimos 45
 *                    dias ou no futuro.
 *   Alertas        — alojamento ou limpeza mudaram, total desceu, hóspede
 *                    pagou mais do que o folio, reserva do site paga com o
 *                    folio acima do pago (logo na criação: a Hostkit fatura
 *                    de madrugada ao valor do folio), saldo em aberto depois
 *                    do check-in, reserva do site sem pagamento registado. Um
 *                    email por problema novo (o mesmo problema com o mesmo
 *                    valor não volta a ser enviado).
 *   Relatório      — GET /api/admin/folio-guard/report corre a mesma
 *                    verificação a pedido, no servidor de produção (com o
 *                    token que ele já tem, sem gastar a quota de OAuth).
 *
 * Só corre no serviço de produção do Render: a BD é partilhada com o DEV.
 */
import { isPreviewDeployment } from "../lib/preview-isolation";

/* ─────────────────────────── Tipos ─────────────────────────── */

export type BaselineVia = "settle" | "observed";

/** O que interessa de um folio para saber se mudou. Euros. */
export interface FolioSnapshot {
  reservationId: string;
  confirmationCode: string;
  source: string;
  status: string;
  listingId: string;
  checkIn: string; // AAAA-MM-DD
  checkOut: string; // AAAA-MM-DD
  createdAt: string | null;
  fareAccommodation: number | null;
  fareCleaning: number | null;
  /** O total do folio (o "Payout" do ecrã do Guesty). */
  folioTotal: number | null;
  totalPaid: number;
  balanceDue: number | null;
  /** Pagamentos registados pelo checkout do site (nota com o id do PI). */
  sitePaid: number;
  /**
   * Plano do checkout do site, lido da nota que o próprio site escreve na
   * reserva ("Checkout 2.0: pagamento unico …" / "… em duas partes … 2.a parte
   * X EUR agendada …"). null em reservas sem essa nota (BE-API, manuais).
   */
  sitePlan: "full" | "two_parts" | null;
  /** Duas partes: a 2.ª parte ainda agendada (o saldo que é normal ver). */
  siteScheduledBalance: number;
  /** O settle já mandou ao CS o acerto exato (cupão recusado ou sem desconto). */
  settleAlerted: boolean;
}

export interface StoredBaseline {
  reservationId: string;
  confirmationCode: string;
  source: string;
  listingId: string;
  checkIn: string;
  checkOut: string;
  fareAccommodation: number | null;
  fareCleaning: number | null;
  folioTotal: number | null;
  totalPaid: number;
  via: BaselineVia;
  capturedAt: Date;
  /** Problemas já enviados por email (chave = tipo + valor arredondado). */
  alertedKeys: string[];
}

export type IssueKind =
  | "fare_changed"
  | "cleaning_changed"
  | "total_dropped"
  | "overpaid"
  | "open_after_checkin"
  | "site_unpaid"
  | "site_above_paid";

export interface FolioIssue {
  kind: IssueKind;
  /** Euros: diferença (atual − base) nas mudanças, saldo nos restantes. */
  amount: number;
  /** Frase pronta para o email e para o relatório. */
  message: string;
}

export interface FolioEvaluation {
  issues: FolioIssue[];
  /** O que fazer à linha de base depois desta leitura. */
  baseline: "insert" | "replace" | "keep" | "none";
}

/* ─────────────────────── Regras (puras) ─────────────────────── */

/** Fontes em que é o Guesty que calcula o preço (venda direta). Nas OTA o
 *  valor vem do canal e o Guesty não o recalcula do calendário. */
const DIRECT_SOURCE_NAMES = new Set([
  "website-checkout",
  "website",
  "website-direct",
  "website-paypal",
  "website direct",
  "be-api",
  "manual",
  "portugal active",
  "direct",
]);

export function isDirectSource(source: unknown): boolean {
  const s = String(source ?? "").trim().toLowerCase();
  return DIRECT_SOURCE_NAMES.has(s) || s.startsWith("website");
}

const INACTIVE_STATUS = /cancel|declin|expire|inquiry|closed|reserved/i;
const VOID_PAYMENT_STATUS = /fail|cancel|void|declin|revers/i;
/** Diferenças abaixo disto são arredondamentos do Guesty. */
const TOLERANCE_EUR = 0.5;
/** Uma reserva do site sem pagamento ao fim disto é um settle que falhou. */
const SITE_UNPAID_AFTER_MS = 2 * 60 * 60 * 1000;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function day(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** 2421 → "2.421,00". À mão: o pt-PT do ICU não agrupa números de 4
 *  algarismos e o resultado mudava com a versão do Node. */
export function eur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "?";
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** Plano do checkout do site a partir das notas da reserva (texto do settle). */
export function sitePlanFromNote(notes: unknown): Pick<FolioSnapshot, "sitePlan" | "siteScheduledBalance" | "settleAlerted"> {
  const text =
    typeof notes === "string" ? notes
    : notes && typeof notes === "object" ? String((notes as any).other ?? "")
    : "";
  const settleAlerted = /Adjust line item\s*>\s*Accommodation fare/i.test(text);
  if (/Checkout 2\.0 em duas partes/i.test(text)) {
    const m = text.match(/2\.a parte\s+([\d.]+)\s*EUR\s+agendada/i);
    return { sitePlan: "two_parts", siteScheduledBalance: m ? Number(m[1]) || 0 : 0, settleAlerted };
  }
  if (/Checkout 2\.0: pagamento unico/i.test(text)) return { sitePlan: "full", siteScheduledBalance: 0, settleAlerted };
  return { sitePlan: null, siteScheduledBalance: 0, settleAlerted };
}

/** Reserva do Open API (GET /v1/reservations[/:id] com `money`) → retrato. */
export function snapshotFromReservation(r: any): FolioSnapshot | null {
  const reservationId = String(r?._id ?? r?.id ?? "");
  if (!reservationId) return null;
  const m = r?.money ?? {};
  const fareAccommodation = num(m.fareAccommodation);
  const fareCleaning = num(m.fareCleaning);
  const folioTotal =
    num(m.hostPayout) ??
    num(m.totalPrice) ??
    (fareAccommodation != null ? round2(fareAccommodation + (fareCleaning ?? 0)) : null);
  let sitePaid = 0;
  for (const p of Array.isArray(m.payments) ? m.payments : []) {
    const status = String(p?.status ?? "");
    if (VOID_PAYMENT_STATUS.test(status)) continue;
    const note = String(p?.note ?? p?.notes ?? p?.description ?? "");
    const amount = num(p?.amount);
    if (amount != null && /PaymentIntent:\s*pi_/i.test(note)) sitePaid += amount;
  }
  return {
    reservationId,
    confirmationCode: String(r?.confirmationCode ?? ""),
    source: String(r?.source ?? ""),
    status: String(r?.status ?? "").toLowerCase(),
    listingId: String(r?.listingId ?? r?.listing?._id ?? ""),
    checkIn: day(r?.checkInDateLocalized) || day(r?.checkIn),
    checkOut: day(r?.checkOutDateLocalized) || day(r?.checkOut),
    createdAt: typeof r?.createdAt === "string" ? r.createdAt : null,
    fareAccommodation,
    fareCleaning,
    folioTotal,
    totalPaid: num(m.totalPaid) ?? 0,
    balanceDue: num(m.balanceDue),
    sitePaid: round2(sitePaid),
    ...sitePlanFromNote(r?.notes),
  };
}

export function baselineFromSnapshot(
  s: FolioSnapshot,
  via: BaselineVia,
  capturedAt: Date,
  alertedKeys: string[] = [],
): StoredBaseline {
  return {
    reservationId: s.reservationId,
    confirmationCode: s.confirmationCode,
    source: s.source,
    listingId: s.listingId,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    fareAccommodation: s.fareAccommodation,
    fareCleaning: s.fareCleaning,
    folioTotal: s.folioTotal,
    totalPaid: s.totalPaid,
    via,
    capturedAt,
    alertedKeys,
  };
}

function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${eur(Math.abs(n))}`;
}

/**
 * Compara o folio atual com a base e com ele próprio. Pura: tudo o que
 * precisa vem nos argumentos (o `now` decide "depois do check-in").
 */
export function evaluateFolio(cur: FolioSnapshot, base: StoredBaseline | null, now: Date): FolioEvaluation {
  if (INACTIVE_STATUS.test(cur.status) && !/checked/.test(cur.status)) {
    return { issues: [], baseline: base ? "keep" : "none" };
  }

  const issues: FolioIssue[] = [];
  let baseline: FolioEvaluation["baseline"];

  if (!base) {
    baseline = "insert";
  } else if (base.listingId !== cur.listingId || base.checkIn !== cur.checkIn || base.checkOut !== cur.checkOut) {
    // Mudou a casa ou as datas: é uma alteração da reserva, com preço novo
    // acordado com o hóspede. Não é o recálculo silencioso que se procura.
    baseline = "replace";
  } else if (base.via !== "settle" && base.totalPaid <= TOLERANCE_EUR) {
    // Nada pago quando a base foi tirada: o CS ainda pode estar a fazer o
    // preço. A base acompanha o folio até haver dinheiro.
    baseline = "replace";
  } else if (cur.totalPaid > TOLERANCE_EUR && cur.balanceDue != null && Math.abs(cur.balanceDue) <= TOLERANCE_EUR) {
    // O folio é igual ao que foi pago: o estado certo. É o que fica depois de
    // o CS acertar um folio que estava acima do pago; tratar essa correção
    // como "recálculo" mandava um alerta por cada acerto bem feito.
    baseline = "replace";
  } else {
    baseline = "keep";
    const fareDelta =
      cur.fareAccommodation != null && base.fareAccommodation != null ? round2(cur.fareAccommodation - base.fareAccommodation) : 0;
    const cleanDelta =
      cur.fareCleaning != null && base.fareCleaning != null ? round2(cur.fareCleaning - base.fareCleaning) : 0;
    const totalDelta = cur.folioTotal != null && base.folioTotal != null ? round2(cur.folioTotal - base.folioTotal) : 0;
    if (Math.abs(fareDelta) > TOLERANCE_EUR) {
      issues.push({
        kind: "fare_changed",
        amount: fareDelta,
        message: `Alojamento mudou depois de pago: ${eur(base.fareAccommodation)} → ${eur(cur.fareAccommodation)} EUR (${signed(fareDelta)}).`,
      });
    }
    if (Math.abs(cleanDelta) > TOLERANCE_EUR) {
      issues.push({
        kind: "cleaning_changed",
        amount: cleanDelta,
        message: `Limpeza mudou depois de paga: ${eur(base.fareCleaning)} → ${eur(cur.fareCleaning)} EUR (${signed(cleanDelta)}).`,
      });
    }
    // Total a descer com alojamento e limpeza iguais: linha negativa nova
    // (ex.: "Host channel fee"). Subidas com as tarifas iguais são extras
    // lançados pelo CS (aquecimento, animais) e não contam.
    if (!issues.length && totalDelta < -TOLERANCE_EUR) {
      issues.push({
        kind: "total_dropped",
        amount: totalDelta,
        message: `Total do folio desceu depois de pago: ${eur(base.folioTotal)} → ${eur(cur.folioTotal)} EUR (${signed(totalDelta)}), com alojamento e limpeza iguais (linha negativa nova no folio?).`,
      });
    }
  }

  // Coerência do folio com o que foi pago (não precisa de base).
  const paid = cur.totalPaid > TOLERANCE_EUR;
  if (paid && cur.balanceDue != null && cur.balanceDue < -TOLERANCE_EUR) {
    issues.push({
      kind: "overpaid",
      amount: cur.balanceDue,
      message: `O hóspede pagou ${eur(cur.totalPaid)} EUR e o folio vale ${eur(cur.folioTotal)} EUR: o folio está ${eur(-cur.balanceDue)} EUR abaixo do que foi pago (o owner é calculado sobre o folio).`,
    });
  }
  // Reserva do site paga e com o folio acima do pago: o Guesty precou a
  // estadia acima do que o site vendeu (cupão que não passou, plano tarifário
  // diferente). Visto logo na criação, não só no check-in: a Hostkit emite a
  // fatura-recibo de madrugada ao valor do folio, e o owner é pago por ele.
  let siteAbove = 0;
  if (paid && cur.sitePlan && cur.balanceDue != null) {
    siteAbove = round2(cur.balanceDue - (cur.sitePlan === "two_parts" ? cur.siteScheduledBalance : 0));
    if (siteAbove > TOLERANCE_EUR) {
      issues.push({
        kind: "site_above_paid",
        amount: siteAbove,
        message:
          `Reserva do site ${cur.sitePlan === "two_parts" ? "em duas partes" : "paga por inteiro"}: o folio do Guesty pede mais ${eur(siteAbove)} EUR do que o site cobrou` +
          `${cur.sitePlan === "two_parts" ? ` (além da 2.ª parte agendada de ${eur(cur.siteScheduledBalance)} EUR)` : ""}. ` +
          `Acertar hoje no Guesty: Guest folio and invoice → Adjust line item → Accommodation fare → menos ${eur(siteAbove)} EUR. ` +
          `A Hostkit emite a fatura-recibo de madrugada ao valor do folio.`,
      });
    }
  }
  const today = now.toISOString().slice(0, 10);
  if (siteAbove <= TOLERANCE_EUR && paid && cur.checkIn && cur.checkIn <= today && cur.balanceDue != null && cur.balanceDue > TOLERANCE_EUR) {
    issues.push({
      kind: "open_after_checkin",
      amount: cur.balanceDue,
      message: `Check-in a ${cur.checkIn} e o Guesty ainda mostra ${eur(cur.balanceDue)} EUR por pagar (pago ${eur(cur.totalPaid)} de ${eur(cur.folioTotal)} EUR).`,
    });
  }
  if (cur.source.toLowerCase() === "website-checkout" && !paid) {
    const created = cur.createdAt ? Date.parse(cur.createdAt) : NaN;
    if (Number.isFinite(created) && now.getTime() - created > SITE_UNPAID_AFTER_MS) {
      issues.push({
        kind: "site_unpaid",
        amount: cur.folioTotal ?? 0,
        message: `Reserva criada pelo checkout do site há mais de 2 horas sem nenhum pagamento registado no Guesty (folio ${eur(cur.folioTotal)} EUR). Confirmar no Stripe se foi paga.`,
      });
    }
  }

  return { issues, baseline };
}

/** O settle já mandou ao CS o acerto exato desta diferença: não repetir o email. */
export function alreadyAlertedBySettle(cur: FolioSnapshot, issue: FolioIssue): boolean {
  return issue.kind === "site_above_paid" && cur.settleAlerted;
}

export function issueKey(issue: FolioIssue): string {
  return `${issue.kind}:${Math.round(issue.amount)}`;
}

export function guestyFolioUrl(reservationId: string): string {
  return `https://app.guesty.com/reservations/${reservationId}/guest-folio-and-invoice`;
}

/** Corpo do email de uma reserva (alerta imediato). */
export function folioAlertLines(cur: FolioSnapshot, issues: FolioIssue[]): string[] {
  const changed = issues.some((i) => i.kind === "fare_changed" || i.kind === "cleaning_changed" || i.kind === "total_dropped");
  return [
    `Reserva ${cur.confirmationCode || cur.reservationId} · ${cur.source} · ${cur.checkIn} → ${cur.checkOut}.`,
    ...issues.map((i) => i.message),
    `Pago no Guesty: ${eur(cur.totalPaid)} EUR (pelo checkout do site: ${eur(cur.sitePaid)} EUR) · total do folio agora: ${eur(cur.folioTotal)} EUR · saldo que o Guesty mostra: ${eur(cur.balanceDue)} EUR.`,
    `NÃO pedir dinheiro ao hóspede nem devolver nada antes de confirmar: o que conta é o valor que ficou acordado e pago.`,
    `O payout ao proprietário é calculado sobre este folio: se ficar assim, o owner recebe com base no valor novo.`,
    ...(changed
      ? [
          `Causas já vistas: editar a reserva depois de paga (formulário de check-in do Hostkit a mudar a hora de chegada ou de saída, alteração do número de hóspedes) faz o Guesty recalcular o preço; linhas "Host channel fee" lançadas pelo Guesty. O Activity Log da reserva mostra "Financial update · Guesty System" logo a seguir à edição.`,
          `Corrigir no Guesty: Guest folio and invoice → Adjust line item, repor o valor que a reserva tinha quando foi paga.`,
        ]
      : []),
    `Folio: ${guestyFolioUrl(cur.reservationId)}`,
  ];
}

/* ─────────────────────── Orquestração ─────────────────────── */

export interface FolioGuardDeps {
  fetchReservation(reservationId: string): Promise<any | null>;
  /** Reservas com saída a partir de `checkOutFrom` (AAAA-MM-DD). */
  listReservations(checkOutFrom: string): Promise<any[]>;
  loadBaselines(reservationIds: string[]): Promise<Map<string, StoredBaseline>>;
  saveBaseline(b: StoredBaseline): Promise<void>;
  sendAlert(subject: string, lines: string[]): Promise<boolean>;
  now(): Date;
}

export interface FolioReportRow {
  reservationId: string;
  confirmationCode: string;
  source: string;
  status: string;
  checkIn: string;
  checkOut: string;
  fareAccommodation: number | null;
  fareCleaning: number | null;
  folioTotal: number | null;
  totalPaid: number;
  sitePaid: number;
  balanceDue: number | null;
  baseline: Pick<StoredBaseline, "via" | "fareAccommodation" | "fareCleaning" | "folioTotal" | "totalPaid"> & { capturedAt: string } | null;
  issues: FolioIssue[];
  folioUrl: string;
}

function reportRow(cur: FolioSnapshot, base: StoredBaseline | null, issues: FolioIssue[]): FolioReportRow {
  return {
    reservationId: cur.reservationId,
    confirmationCode: cur.confirmationCode,
    source: cur.source,
    status: cur.status,
    checkIn: cur.checkIn,
    checkOut: cur.checkOut,
    fareAccommodation: cur.fareAccommodation,
    fareCleaning: cur.fareCleaning,
    folioTotal: cur.folioTotal,
    totalPaid: cur.totalPaid,
    sitePaid: cur.sitePaid,
    balanceDue: cur.balanceDue,
    baseline: base
      ? {
          via: base.via,
          fareAccommodation: base.fareAccommodation,
          fareCleaning: base.fareCleaning,
          folioTotal: base.folioTotal,
          totalPaid: base.totalPaid,
          capturedAt: base.capturedAt.toISOString(),
        }
      : null,
    issues,
    folioUrl: guestyFolioUrl(cur.reservationId),
  };
}

/** Aplica a decisão sobre a base e devolve a base que fica em vigor. */
async function applyBaseline(
  deps: FolioGuardDeps,
  cur: FolioSnapshot,
  base: StoredBaseline | null,
  decision: FolioEvaluation["baseline"],
  dryRun: boolean,
): Promise<StoredBaseline | null> {
  if (decision === "insert" || decision === "replace") {
    const via: BaselineVia = base?.via === "settle" && decision === "replace" ? "observed" : base?.via ?? "observed";
    const next = baselineFromSnapshot(cur, via, deps.now(), base?.alertedKeys ?? []);
    if (!dryRun) await deps.saveBaseline(next);
    return next;
  }
  return base;
}

/**
 * Verifica uma reserva (webhook). Alerta já os problemas novos.
 * Devolve os problemas encontrados (novos ou não), para log e testes.
 */
export async function checkReservationFolio(reservationId: string, deps: FolioGuardDeps): Promise<FolioIssue[]> {
  const raw = await deps.fetchReservation(reservationId);
  const cur = raw ? snapshotFromReservation(raw) : null;
  if (!cur || !isDirectSource(cur.source)) return [];
  const base = (await deps.loadBaselines([cur.reservationId])).get(cur.reservationId) ?? null;
  const ev = evaluateFolio(cur, base, deps.now());
  const effective = await applyBaseline(deps, cur, base, ev.baseline, false);
  const alerted = new Set(effective?.alertedKeys ?? []);
  const fresh = ev.issues.filter((i) => !alerted.has(issueKey(i)) && !alreadyAlertedBySettle(cur, i));
  if (fresh.length && effective) {
    const subject = `FOLIO DO GUESTY A VERIFICAR — ${cur.confirmationCode || cur.reservationId}`;
    const delivered = await deps.sendAlert(subject, folioAlertLines(cur, fresh));
    if (delivered) {
      await deps.saveBaseline({ ...effective, alertedKeys: [...alerted, ...fresh.map(issueKey)].slice(-40) });
    }
  }
  return ev.issues;
}

/**
 * Base no fim do settle do checkout do site: é o folio que corresponde ao
 * que o hóspede acabou de pagar. Uma base "settle" já existente não é
 * substituída (um settle retomado dias depois não pode aceitar como certo um
 * folio que entretanto mudou).
 */
export async function captureSettleBaseline(reservationId: string, deps: FolioGuardDeps): Promise<boolean> {
  const raw = await deps.fetchReservation(reservationId);
  const cur = raw ? snapshotFromReservation(raw) : null;
  if (!cur) return false;
  const base = (await deps.loadBaselines([cur.reservationId])).get(cur.reservationId) ?? null;
  if (base?.via === "settle") return false;
  await deps.saveBaseline(baselineFromSnapshot(cur, "settle", deps.now(), base?.alertedKeys ?? []));
  return true;
}

export interface FolioSweepResult {
  checkedFrom: string;
  scanned: number;
  direct: number;
  withIssues: number;
  alerted: number;
  rows: FolioReportRow[];
}

/**
 * Ronda de 6 em 6 h (e relatório a pedido com `dryRun`): todas as reservas de
 * venda direta com saída a partir de `checkOutFrom`. Os problemas novos vão
 * num só email; o relatório não escreve nem envia nada.
 */
export async function runFolioSweep(
  deps: FolioGuardDeps,
  opts: { checkOutFrom?: string; daysBack?: number; dryRun?: boolean; includeOk?: boolean } = {},
): Promise<FolioSweepResult> {
  const now = deps.now();
  const checkedFrom =
    opts.checkOutFrom ?? new Date(now.getTime() - (opts.daysBack ?? 45) * 86_400_000).toISOString().slice(0, 10);
  const raws = await deps.listReservations(checkedFrom);
  const snaps = raws
    .map(snapshotFromReservation)
    .filter((s): s is FolioSnapshot => !!s && isDirectSource(s.source));
  const bases = await deps.loadBaselines(snaps.map((s) => s.reservationId));

  const rows: FolioReportRow[] = [];
  const digest: Array<{ cur: FolioSnapshot; base: StoredBaseline; fresh: FolioIssue[] }> = [];
  for (const cur of snaps) {
    const base = bases.get(cur.reservationId) ?? null;
    const ev = evaluateFolio(cur, base, now);
    const effective = await applyBaseline(deps, cur, base, ev.baseline, !!opts.dryRun);
    if (ev.issues.length || opts.includeOk) rows.push(reportRow(cur, base, ev.issues));
    if (!opts.dryRun && effective && ev.issues.length) {
      const alerted = new Set(effective.alertedKeys);
      const fresh = ev.issues.filter((i) => !alerted.has(issueKey(i)) && !alreadyAlertedBySettle(cur, i));
      if (fresh.length) digest.push({ cur, base: effective, fresh });
    }
  }

  let alerted = 0;
  if (digest.length) {
    const lines = [
      `Ronda aos folios de venda direta com saída desde ${checkedFrom}: ${digest.length} reserva(s) com problemas novos.`,
      `O payout ao proprietário sai do folio. Abrir cada reserva, ver o Activity Log e corrigir o folio (Adjust line item) para o valor acordado e pago. NÃO pedir dinheiro ao hóspede sem confirmar.`,
      ...digest.slice(0, 80).map(
        ({ cur, fresh }) =>
          `<b>${cur.confirmationCode || cur.reservationId}</b> (${cur.source}, ${cur.checkIn} → ${cur.checkOut}) — ${fresh.map((i) => i.message).join(" ")} ${guestyFolioUrl(cur.reservationId)}`,
      ),
      ...(digest.length > 80 ? [`… e mais ${digest.length - 80}. Lista completa no relatório /api/admin/folio-guard/report.`] : []),
    ];
    const delivered = await deps.sendAlert(`FOLIOS DO GUESTY A VERIFICAR — ${digest.length} reserva(s)`, lines);
    if (delivered) {
      alerted = digest.length;
      for (const d of digest) {
        await deps.saveBaseline({ ...d.base, alertedKeys: [...d.base.alertedKeys, ...d.fresh.map(issueKey)].slice(-40) });
      }
    }
  }

  return {
    checkedFrom,
    scanned: raws.length,
    direct: snaps.length,
    withIssues: rows.filter((r) => r.issues.length).length,
    alerted,
    rows,
  };
}

/* ─────────────────── Produção (Guesty + BD + email) ─────────────────── */

export function canRunFolioGuard(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.FOLIO_GUARD === "false") return false;
  if (env.NODE_ENV !== "production") return false;
  // Sem RENDER_SERVICE_ID é um `npm start` local: com a BD partilhada seria
  // um segundo vigilante a mandar os mesmos emails.
  if (!env.RENDER_SERVICE_ID) return false;
  return !isPreviewDeployment(env);
}

const RESERVATION_FIELDS =
  "_id confirmationCode source status listingId checkIn checkOut checkInDateLocalized checkOutDateLocalized createdAt money notes";

const TABLE_DDL =
  "CREATE TABLE IF NOT EXISTS `folio_baselines` (" +
  "`reservation_id` varchar(64) NOT NULL PRIMARY KEY, " +
  "`confirmation_code` varchar(64) NULL, " +
  "`source` varchar(64) NULL, " +
  "`listing_id` varchar(64) NULL, " +
  "`check_in` varchar(10) NULL, " +
  "`check_out` varchar(10) NULL, " +
  "`fare_accommodation` decimal(12,2) NULL, " +
  "`fare_cleaning` decimal(12,2) NULL, " +
  "`folio_total` decimal(12,2) NULL, " +
  "`total_paid` decimal(12,2) NULL, " +
  "`via` varchar(16) NOT NULL, " +
  "`captured_at` datetime NOT NULL, " +
  "`alerted_keys` text NULL, " +
  "KEY `idx_folio_baselines_check_out` (`check_out`))";

let tableReady: Promise<void> | null = null;

async function productionDb(): Promise<any> {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("BD indisponível");
  if (!tableReady) {
    const { sql } = await import("drizzle-orm");
    tableReady = (db as any).execute(sql.raw(TABLE_DDL)).then(() => undefined);
    tableReady!.catch(() => {
      tableReady = null;
    });
  }
  await tableReady;
  return db;
}

function rowsOf(res: any): any[] {
  const rows = Array.isArray(res) ? res[0] : res;
  return Array.isArray(rows) ? rows : [];
}

function baselineFromRow(r: any): StoredBaseline {
  let alertedKeys: string[] = [];
  try {
    const parsed = JSON.parse(String(r.alerted_keys ?? "[]"));
    if (Array.isArray(parsed)) alertedKeys = parsed.map(String);
  } catch {
    /* coluna ilegível: volta a alertar, que é o lado seguro */
  }
  return {
    reservationId: String(r.reservation_id),
    confirmationCode: String(r.confirmation_code ?? ""),
    source: String(r.source ?? ""),
    listingId: String(r.listing_id ?? ""),
    checkIn: String(r.check_in ?? ""),
    checkOut: String(r.check_out ?? ""),
    fareAccommodation: num(r.fare_accommodation),
    fareCleaning: num(r.fare_cleaning),
    folioTotal: num(r.folio_total),
    totalPaid: num(r.total_paid) ?? 0,
    via: r.via === "settle" ? "settle" : "observed",
    capturedAt: new Date(r.captured_at),
    alertedKeys,
  };
}

export function productionFolioGuardDeps(): FolioGuardDeps {
  return {
    async fetchReservation(reservationId) {
      const { guestyClient } = await import("../lib/guesty");
      return guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`, {
        query: { fields: RESERVATION_FIELDS },
      });
    },
    async listReservations(checkOutFrom) {
      const { guestyClient } = await import("../lib/guesty");
      const out: any[] = [];
      const limit = 100;
      const filters = JSON.stringify([{ field: "checkOut", operator: "$gte", value: checkOutFrom }]);
      for (let page = 0; page < 40; page++) {
        const data = await guestyClient.request<any>("GET", "/v1/reservations", {
          query: { filters, fields: RESERVATION_FIELDS, limit, skip: page * limit },
        });
        const results: any[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        out.push(...results);
        const count = Number(data?.count);
        if (results.length < limit || (Number.isFinite(count) && out.length >= count)) break;
      }
      // A listagem pode não trazer o `money` (campos aninhados variam entre
      // versões da Open API). Sem ele não há nada a comparar: lê-se cada
      // reserva direta à parte, devagar, em vez de concluir "tudo bem".
      if (out.length && out.every((r) => !r?.money)) {
        const direct = out.filter((r) => isDirectSource(r?.source)).slice(0, 600);
        console.warn(`[FolioGuard] listagem sem money: a ler ${direct.length} reservas diretas uma a uma`);
        const full: any[] = [];
        for (const r of direct) {
          const one = await guestyClient
            .request<any>("GET", `/v1/reservations/${r._id}`, { query: { fields: RESERVATION_FIELDS } })
            .catch(() => null);
          if (one) full.push(one);
          await new Promise((ok) => setTimeout(ok, 250));
        }
        return full;
      }
      return out;
    },
    async loadBaselines(ids) {
      const map = new Map<string, StoredBaseline>();
      if (!ids.length) return map;
      const db = await productionDb();
      const { sql } = await import("drizzle-orm");
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const res = await db.execute(
          sql`SELECT * FROM \`folio_baselines\` WHERE \`reservation_id\` IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})`,
        );
        for (const r of rowsOf(res)) {
          const b = baselineFromRow(r);
          map.set(b.reservationId, b);
        }
      }
      return map;
    },
    async saveBaseline(b) {
      const db = await productionDb();
      const { sql } = await import("drizzle-orm");
      const capturedAt = b.capturedAt.toISOString().slice(0, 19).replace("T", " ");
      await db.execute(sql`
        INSERT INTO \`folio_baselines\`
          (\`reservation_id\`, \`confirmation_code\`, \`source\`, \`listing_id\`, \`check_in\`, \`check_out\`,
           \`fare_accommodation\`, \`fare_cleaning\`, \`folio_total\`, \`total_paid\`, \`via\`, \`captured_at\`, \`alerted_keys\`)
        VALUES (${b.reservationId}, ${b.confirmationCode}, ${b.source}, ${b.listingId}, ${b.checkIn}, ${b.checkOut},
          ${b.fareAccommodation}, ${b.fareCleaning}, ${b.folioTotal}, ${b.totalPaid}, ${b.via}, ${capturedAt},
          ${JSON.stringify(b.alertedKeys)})
        ON DUPLICATE KEY UPDATE
          \`confirmation_code\` = VALUES(\`confirmation_code\`), \`source\` = VALUES(\`source\`),
          \`listing_id\` = VALUES(\`listing_id\`), \`check_in\` = VALUES(\`check_in\`), \`check_out\` = VALUES(\`check_out\`),
          \`fare_accommodation\` = VALUES(\`fare_accommodation\`), \`fare_cleaning\` = VALUES(\`fare_cleaning\`),
          \`folio_total\` = VALUES(\`folio_total\`), \`total_paid\` = VALUES(\`total_paid\`), \`via\` = VALUES(\`via\`),
          \`captured_at\` = VALUES(\`captured_at\`), \`alerted_keys\` = VALUES(\`alerted_keys\`)`);
    },
    async sendAlert(subject, lines) {
      const { sendOpsAlert } = await import("./transactional-email");
      const { FOLIO_ALERT_EMAIL } = await import("../config/alert-recipients");
      // É o CS que acerta o folio: caixa do booking, sem cópia à gestão.
      return sendOpsAlert(subject, lines, { to: FOLIO_ALERT_EMAIL });
    },
    now: () => new Date(),
  };
}

/* ─────────────────────────── Ligações ─────────────────────────── */

/** O Hostkit manda vários updates seguidos no check-in: espera-se que acalme. */
const CHECK_DEBOUNCE_MS = 3 * 60 * 1000;
const pendingChecks = new Map<string, ReturnType<typeof setTimeout>>();

/** Chamado pelo webhook do Guesty (reservation.new/created/updated). Com a
 *  origem no payload, os updates das OTA nem chegam a pedir a reserva. */
export function scheduleFolioCheck(
  reservationId: string,
  source?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!reservationId || !canRunFolioGuard(env)) return;
  if (source && !isDirectSource(source)) return;
  const prev = pendingChecks.get(reservationId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pendingChecks.delete(reservationId);
    checkReservationFolio(reservationId, productionFolioGuardDeps())
      .then((issues) => {
        if (issues.length) {
          console.warn(`[FolioGuard] ${reservationId}: ${issues.map((i) => `${i.kind}(${i.amount})`).join(", ")}`);
        }
      })
      .catch((e: any) => console.warn(`[FolioGuard] verificacao falhou ${reservationId}: ${e?.message ?? e}`));
  }, CHECK_DEBOUNCE_MS);
  t.unref?.();
  pendingChecks.set(reservationId, t);
}

/** Fim do settle do checkout do site. Nunca lança. */
export async function captureFolioBaselineAfterSettle(
  reservationId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!reservationId || !canRunFolioGuard(env)) return;
  try {
    await captureSettleBaseline(reservationId, productionFolioGuardDeps());
  } catch (e: any) {
    // Sem base de settle, a primeira leitura com pagamento faz de base.
    console.warn(`[FolioGuard] base do settle nao gravada ${reservationId}: ${e?.message ?? e}`);
  }
}

let sweepStarted = false;
let sweepRunning = false;

export async function runFolioSweepOnce(): Promise<FolioSweepResult | null> {
  if (sweepRunning) return null;
  sweepRunning = true;
  try {
    const r = await runFolioSweep(productionFolioGuardDeps());
    console.info(
      `[FolioGuard] ronda: ${r.direct} reservas diretas (de ${r.scanned}) desde ${r.checkedFrom}, ${r.withIssues} com problemas, ${r.alerted} alertadas agora`,
    );
    return r;
  } catch (e: any) {
    console.warn(`[FolioGuard] ronda falhou: ${e?.message ?? e}`);
    return null;
  } finally {
    sweepRunning = false;
  }
}

/** Ronda 15 min depois do arranque e depois de 6 em 6 h (a Hostkit fatura de madrugada). */
export function startFolioGuard(env: NodeJS.ProcessEnv = process.env): void {
  if (sweepStarted) return;
  if (!canRunFolioGuard(env)) {
    console.info("[FolioGuard] desligado neste ambiente (so corre no servico de producao)");
    return;
  }
  sweepStarted = true;
  const first = setTimeout(() => void runFolioSweepOnce(), 15 * 60 * 1000);
  first.unref?.();
  const timer = setInterval(() => void runFolioSweepOnce(), 6 * 60 * 60 * 1000);
  timer.unref?.();
  console.info("[FolioGuard] vigilancia dos folios ligada (webhook + ronda de 6 em 6 h)");
}
