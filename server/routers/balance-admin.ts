/**
 * Pagamento em duas partes, Fase 2c: o ecrã "Saldos" do CS (/admin/balances).
 * Regras em docs/pagamento_duas_partes.md 2.5, 3.2, 3.4 e 5.12; contrato da
 * Fase 2c. É o único sítio onde o CS mexe no saldo de um hóspede.
 *
 * Porque está escrito assim:
 * - adminProcedure: utilizador com papel admin (sessão própria), nunca a
 *   x-admin-key partilhada. Quem carregou no botão fica no registo.
 * - Cada ação grava uma linha em checkout_admin_actions ANTES de correr. Se
 *   o registo falhar, a ação não se faz: nenhum dinheiro mexe sem ficar
 *   escrito quem o mandou mexer. O resultado acrescenta-se depois.
 * - As ações que mexem no dinheiro (cobrar, marcar pago, cancelar e
 *   devolver) exigem a palavra de confirmação no input, para nenhum pedido
 *   (duplo clique, script, botão errado) as disparar sem intenção.
 * - Só se vê e só se toca no ambiente deste processo (balanceScope): a BD é
 *   partilhada com o DEV e um admin de teste nunca pode cobrar uma linha real.
 * - O browser nunca recebe o customer nem o cartão da Stripe (cus_…, pm_…):
 *   do cartão só a marca e os últimos 4 dígitos.
 * - A lógica do dinheiro é a do motor (services/checkout-balance.ts) e dos
 *   UPDATE condicionais de server/db.ts; aqui só se valida, regista e encadeia.
 */
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { lisbonToday } from "@shared/cancellationPolicy";
import { adminProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { withCheckoutChargeLock } from "../lib/checkout-charge-attempt";
import { lisbonWallTimeToUtc } from "../services/payment-plan";
import type { CheckoutAdminAction, CheckoutScheduledPayment } from "../../drizzle/schema";
import type { BalanceScope, ScheduledPaymentStatus } from "../db";

// Importados no momento (como no motor), para os testes os poderem simular
// e para o Stripe e o Guesty só carregarem quando uma ação os usa.
const db = () => import("../db");
const engine = () => import("../services/checkout-balance");
const stripe = () => import("../services/stripe-balance");
const guestyPay = () => import("../services/guesty-openapi-paypal");

type Row = CheckoutScheduledPayment;
type AdminUser = NonNullable<TrpcContext["user"]>;

const STATUSES = [
  "scheduled", "charging", "retry", "needs_action", "succeeded", "paid_externally",
  "needs_review", "cancelling", "cancelled_unpaid", "cancelled_by_guest",
] as const satisfies readonly ScheduledPaymentStatus[];

/** Por pagar e vivas (a mesma definição do motor). */
const OPEN_UNPAID = new Set<string>(["scheduled", "retry", "needs_action"]);
/** De onde o CS pode marcar pago fora (os mesmos estados de markPaidExternally). */
const PAYABLE_EXTERNALLY = new Set<string>(["scheduled", "retry", "needs_action", "needs_review"]);
/** Sem mais nada a fazer pelo hóspede: um link novo só confundia. */
const NO_LINK = new Set<string>(["cancelling", "cancelled_unpaid", "cancelled_by_guest", "paid_externally"]);
const CREDIT_NOTE = new Set<string>(["cancelling", "cancelled_unpaid", "cancelled_by_guest"]);
/** Estados de reembolso que não são falha (o mesmo critério do motor e do
 *  digest): fora destes, e não NULL, o reembolso falhou e alguém o resolve. */
const REFUND_NOT_FAILED = new Set<string>(["succeeded", "pending", "nothing", "manual"]);

export function refundFailed(row: Pick<Row, "refundStatus">): boolean {
  return row.refundStatus != null && !REFUND_NOT_FAILED.has(String(row.refundStatus));
}

/** Diferença tolerada entre o recebido por fora e o saldo (a mesma do motor
 *  na deteção de pagamentos de terceiros): 1 €. */
const SHORTFALL_TOLERANCE_CENTS = 100;
const idInput = z.string().min(1).max(36);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");
/** O estado que o CS tinha à frente quando decidiu: se mudou entretanto, a
 *  decisão foi tomada sobre outra realidade e é recusada. */
const expectedStatus = z.enum(STATUSES).optional();

/* ════════════════════════════════════════════════════════════════
   Utilitários puros
   ════════════════════════════════════════════════════════════════ */

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function isoRequired(value: Date | string): string {
  return iso(value) ?? new Date(0).toISOString();
}

function eur(cents: number): string {
  return `${(Number(cents) / 100).toFixed(2)} EUR`;
}

/** As mensagens de erro da Stripe gravadas em last_error podem trazer ids
 *  (por exemplo "No such PaymentMethod: 'pm_…'"). O browser nunca os vê. */
function scrubStripeIds(text: string | null | undefined): string | null {
  if (text == null) return null;
  return String(text).replace(/\b(cus|pm|seti|src|card)_[A-Za-z0-9]+/g, "$1_•••");
}

/** O mesmo, em profundidade, para o histórico de ações (defesa: nada do que
 *  este router grava traz esses ids, mas o histórico vai para o browser). */
function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") return scrubStripeIds(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubDeep(v)]));
  }
  return value;
}

function inScope(row: Row, scope: BalanceScope): boolean {
  return !!row.livemode === scope.livemode && row.siteOrigin === scope.siteOrigin;
}

function refuse(code: "PRECONDITION_FAILED" | "CONFLICT" | "NOT_FOUND" | "BAD_REQUEST", message: string): never {
  throw new TRPCError({ code, message });
}

/* ════════════════════════════════════════════════════════════════
   O que cada ação pode fazer a esta linha (fonte única para a UI e para
   as próprias ações: o botão desligado e a recusa do servidor dizem o
   mesmo)
   ════════════════════════════════════════════════════════════════ */

export type BalanceAdminActionKey =
  | "resendLink" | "chargeNow" | "markPaidExternally" | "pause" | "resume"
  | "cancelFull" | "cancelPolicy" | "continueCancellation" | "markCreditNote" | "markRefundResolved";

export interface BalanceAdminGate { allowed: boolean; reason: string | null }

type DeclineKind = "soft" | "hard" | "auth";

export interface BalanceAdminAvailability {
  gates: Record<BalanceAdminActionKey, BalanceAdminGate>;
  /** Cobrar agora só com pedido do hóspede: antes da data autorizada (o
   *  mandato diz C; a data nunca muda por iniciativa nossa, spec 2.3) ou
   *  depois de uma recusa hard/3DS (repetir esse cartão sem o hóspede é
   *  proibido pelas redes). null = não é preciso. */
  chargeNeedsGuestRequest: string | null;
}

const yes: BalanceAdminGate = { allowed: true, reason: null };
const no = (reason: string): BalanceAdminGate => ({ allowed: false, reason });

export function balanceAdminAvailability(
  row: Row,
  now: Date,
  opts: {
    chargesEnabled: boolean;
    declineKind: DeclineKind | null;
    /** guestIsActive(row, now) do motor: o hóspede agiu na página do saldo
     *  ("Pagar agora" ou "Usar outro cartão") há menos de 1 hora. */
    guestActive?: boolean;
  },
): BalanceAdminAvailability {
  const t = now.getTime();
  const status = row.status;
  const beforeH = t < new Date(row.hardStopAt).getTime();
  const beforeC = t < new Date(row.chargeAt).getTime();
  const withinFreeCancel = t <= new Date(row.freeCancelDeadline).getTime();
  const charging = status === "charging" ? no("Há uma cobrança a decorrer neste momento. Esperar uns minutos e reabrir.") : null;
  // O hóspede abriu "Pagar agora" ou "Usar outro cartão" há menos de 1 hora
  // (3DS a meio, talvez): o hard stop espera por ele (spec 2.4), e uma pausa
  // ou um cancelamento daqui também, para não fechar o pagamento debaixo do
  // hóspede nem cancelar (ou tirar da automação) uma reserva que está a ser
  // paga. A marca é guest_active_at, que só o hóspede escreve: o claim do
  // sweep ou do admin não a apaga (claim_source apagava).
  const guestPaying =
    PAYABLE_EXTERNALLY.has(status) && opts.guestActive
      ? no("O hóspede está a pagar agora na página do saldo (agiu há menos de 1 hora). Esperar, ou falar com ele antes de pausar ou cancelar.")
      : null;

  const resendLink = charging ?? (NO_LINK.has(status)
    ? no("A reserva já não tem nada a pagar nem a decidir pelo hóspede.")
    : !row.email ? no("A reserva não tem email do hóspede.") : yes);

  const chargeNow = charging ?? (!OPEN_UNPAID.has(status)
    ? no(status === "needs_review"
      ? "A linha está em revisão: retomar primeiro, ou marcar pago fora, ou cancelar e devolver."
      : "Só se cobra uma linha por pagar (agendada, nova tentativa ou à espera do hóspede).")
    : !beforeH ? no("O prazo H já passou: nunca se cobra depois de H. Cancelar e devolver, ou marcar pago fora.")
    : !opts.chargesEnabled ? no("As cobranças estão desligadas neste servidor (CHECKOUT_BALANCE). Nada pode ser cobrado daqui.")
    : yes);

  const chargeNeedsGuestRequest = !chargeNow.allowed ? null
    : opts.declineKind === "hard" ? "O banco recusou este cartão de forma definitiva. Só cobrar se o hóspede o pediu (por exemplo, depois de falar com o banco)."
    : opts.declineKind === "auth" ? "O banco pediu confirmação (3DS) ao hóspede. Só cobrar se o hóspede o pediu; o normal é ele confirmar pelo link."
    : beforeC ? "A data autorizada pelo hóspede ainda não chegou. Só cobrar antes dessa data a pedido do hóspede."
    : null;

  const markPaidExternally = charging ?? (PAYABLE_EXTERNALLY.has(status) ? yes
    : status === "succeeded" ? no("A 2.ª parte já foi cobrada pela plataforma.")
    : status === "paid_externally" ? no("Já está marcada como paga fora da plataforma.")
    : no("A reserva está cancelada ou a cancelar."));

  const pause = charging ?? guestPaying ?? (!PAYABLE_EXTERNALLY.has(status)
    ? no("Só se pausa uma linha por pagar ou em revisão.")
    : !withinFreeCancel ? no("O cancelamento gratuito já terminou: a pausa não pode ir além dele.")
    : yes);

  const resume = status !== "needs_review"
    ? no("Só se retoma uma linha em revisão.")
    : !beforeH ? no("O prazo H já passou: já não se cobra. Cancelar e devolver, ou marcar pago fora.")
    : yes;

  // "Devolver tudo" é o cancelamento pela equipa: devolve tudo o que foi pago
  // na 1.ª parte, sem retenção. Numa linha já paga deixaria a 2.ª parte por
  // devolver. Depois de D também se pode (decisão da gestão).
  const cancelFull = charging ?? guestPaying ?? (row.succeededAt || status === "succeeded"
    ? no("A 2.ª parte já foi cobrada: usar \"Cancelar pela política\", que devolve as duas partes.")
    : PAYABLE_EXTERNALLY.has(status) ? yes
    : status === "paid_externally" ? no("Pago fora da plataforma: a devolução dessa parte é manual. Falar com a gestão.")
    : no("A reserva já está cancelada ou a cancelar."));

  // A política do hóspede só se aplica dentro do cancelamento gratuito:
  // depois de D a política é 100% e não há nada a devolver por este botão.
  const cancelPolicy = charging ?? guestPaying ?? (!(PAYABLE_EXTERNALLY.has(status) || status === "succeeded")
    ? (status === "paid_externally"
      ? no("Pago fora da plataforma: a devolução dessa parte é manual. Falar com a gestão.")
      : no("A reserva já está cancelada ou a cancelar."))
    : !withinFreeCancel ? no("O cancelamento gratuito terminou: pela política não há nada a devolver. Para devolver na mesma, decide a gestão.")
    : yes);

  const continueCancellation = status === "cancelling" ? yes : no("Só para um cancelamento que ficou a meio.");

  const markCreditNote = CREDIT_NOTE.has(status) ? yes : no("A nota de crédito só existe depois de um cancelamento com reembolso.");

  const markRefundResolved = refundFailed(row)
    ? yes
    : no("Só para um reembolso que falhou na Stripe e foi resolvido por outra via.");

  return {
    gates: { resendLink, chargeNow, markPaidExternally, pause, resume, cancelFull, cancelPolicy, continueCancellation, markCreditNote, markRefundResolved },
    chargeNeedsGuestRequest,
  };
}

type Engine = Awaited<ReturnType<typeof engine>>;

/** As regras acima com o que só o motor sabe: se as cobranças estão ligadas
 *  e se o hóspede está a agir na página (guest_active_at). */
function availabilityFor(E: Engine, row: Row, now: Date, declineKind: DeclineKind | null): BalanceAdminAvailability {
  return balanceAdminAvailability(row, now, {
    chargesEnabled: E.canRunBalanceEngine(),
    declineKind,
    guestActive: E.guestIsActive(row, now),
  });
}

/* ════════════════════════════════════════════════════════════════
   Vistas (sem stripe_customer_id nem payment_method_id)
   ════════════════════════════════════════════════════════════════ */

function rowSummary(row: Row, extra: { declineKind: DeclineKind | null; cardExpiresBeforeCharge: boolean }) {
  return {
    id: row.id,
    intentId: row.intentId,
    status: row.status,
    reservationId: row.reservationId,
    confirmationCode: row.confirmationCode,
    listingId: row.listingId,
    propertyName: row.propertyName,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    guestEmail: row.email,
    guestPhone: row.phone,
    locale: row.locale,
    currency: row.currency,
    depositCents: row.depositCents,
    balanceCents: row.balanceCents,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    cardExpiresBeforeCharge: extra.cardExpiresBeforeCharge,
    chargeAt: isoRequired(row.chargeAt),
    hardStopAt: isoRequired(row.hardStopAt),
    freeCancelDeadlineAt: isoRequired(row.freeCancelDeadline),
    nextAttemptAt: isoRequired(row.nextAttemptAt),
    attempts: Number(row.attempts ?? 0),
    lastDeclineCode: row.lastDeclineCode,
    lastDeclineKind: extra.declineKind,
    reviewReason: row.reviewReason,
    reviewDueAt: iso(row.reviewDueAt),
    helpPausedUntil: iso(row.helpPausedUntil),
    succeededAt: iso(row.succeededAt),
    cancelledAt: iso(row.cancelledAt),
    paidExternallyRef: row.paidExternallyRef,
    refundCents: row.refundCents ?? null,
    refundStatus: row.refundStatus,
    creditNoteRef: row.creditNoteRef,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export type BalanceAdminRow = ReturnType<typeof rowSummary>;

function actionView(a: CheckoutAdminAction) {
  return {
    id: a.id,
    action: a.action,
    userId: a.userId ?? null,
    userEmail: a.userEmail ?? null,
    createdAt: iso(a.createdAt),
    details: scrubDeep(a.details ?? null) as Record<string, unknown> | null,
  };
}

/** O que o hóspede vê na página do saldo, montado a partir da linha (a vista
 *  do motor, guestBalanceView, precisa do token do link). As mesmas regras
 *  do motor, sem a chamada à Stripe do valor exato a devolver. */
function guestView(row: Row, now: Date, declineKind: DeclineKind | null) {
  const t = now.getTime();
  const open = OPEN_UNPAID.has(row.status);
  const beforeH = t < new Date(row.hardStopAt).getTime();
  return {
    status: row.status,
    amountLaterCents: row.balanceCents,
    amountPaidCents: row.depositCents,
    chargeAt: isoRequired(row.chargeAt),
    hardStopAt: isoRequired(row.hardStopAt),
    freeCancelDeadlineAt: isoRequired(row.freeCancelDeadline),
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    lastDeclineKind: declineKind,
    canPayNow: open && beforeH,
    canConfirmSameCard: open && beforeH && declineKind === "auth",
    canChangeCard: open && beforeH,
    canCancelFree: (open || row.status === "succeeded") && t <= new Date(row.freeCancelDeadline).getTime(),
    canRequestHelp: open,
    helpPausedUntil: iso(row.helpPausedUntil),
  };
}

/* ════════════════════════════════════════════════════════════════
   Carregar a linha, registar a ação
   ════════════════════════════════════════════════════════════════ */

async function loadRow(id: string): Promise<{ row: Row; scope: BalanceScope }> {
  const D = await db();
  const E = await engine();
  const scope = E.balanceScope();
  const row = await D.getScheduledPaymentById(id);
  // Uma linha de outro ambiente (teste vs produção) é, para este processo,
  // uma linha que não existe.
  if (!row || !inScope(row, scope)) refuse("NOT_FOUND", "Linha não encontrada neste ambiente.");
  return { row, scope };
}

function assertExpected(row: Row, expected: string | undefined): void {
  if (expected && row.status !== expected) {
    refuse("CONFLICT", `A linha mudou de estado (agora: ${row.status}). Reabrir o detalhe antes de decidir.`);
  }
}

async function declineKindOf(row: Row): Promise<DeclineKind | null> {
  if (!row.lastDeclineCode) return null;
  const { classifyDecline } = await stripe();
  return classifyDecline(row.lastDeclineCode, null);
}

interface ActionLog { id: string; details: Record<string, unknown> }

/**
 * Grava o pedido antes de agir. Qualquer falha aqui (BD em baixo, tabela em
 * falta) recusa a ação: o CS vê o erro e nada foi feito.
 */
async function logAction(user: AdminUser, row: Row, action: string, input: Record<string, unknown>): Promise<ActionLog> {
  const D = await db();
  const id = randomUUID();
  const details: Record<string, unknown> = {
    input,
    before: { status: row.status, reviewReason: row.reviewReason, helpPausedUntil: iso(row.helpPausedUntil) },
    actorName: user.name ?? null,
  };
  try {
    await D.insertAdminAction({
      id,
      scheduledPaymentId: row.id,
      userId: typeof user.id === "number" ? user.id : null,
      userEmail: user.email ?? null,
      action,
      details,
      createdAt: new Date(),
    });
  } catch (err: any) {
    console.error(`[BalanceAdmin] registo da acao ${action} falhou (linha ${row.id}): ${err?.message}`);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível registar a ação no histórico, por isso nada foi feito. Tentar outra vez daqui a pouco.",
    });
  }
  return { id, details };
}

/** Resultado no registo. Falhar aqui não desfaz nada: a ação já correu. */
async function finishAction(log: ActionLog, result: Record<string, unknown>): Promise<boolean> {
  try {
    const D = await db();
    return await D.setAdminActionResult(log.id, { ...log.details, result: scrubDeep(result) });
  } catch {
    return false;
  }
}

type RefundPreview = Awaited<ReturnType<Engine["adminRefundPreview"]>>;

async function refundPreviewOf(E: Engine, row: Row, now: Date): Promise<RefundPreview | null> {
  try {
    return await E.adminRefundPreview(row, now);
  } catch (err: any) {
    console.error(`[BalanceAdmin] pre-visualizacao do reembolso falhou linha ${row.id}: ${err?.message}`);
    return null;
  }
}

async function freshRow(id: string): Promise<Row | null> {
  const D = await db();
  return D.getScheduledPaymentById(id).catch(() => null);
}

/* ════════════════════════════════════════════════════════════════
   Mensagens ao CS (o que aconteceu ao dinheiro do hóspede)
   ════════════════════════════════════════════════════════════════ */

const CHARGE_MESSAGES: Record<string, string> = {
  succeeded: "Cobrado. O registo no Guesty e o email ao hóspede seguem a seguir.",
  processing: "O banco ainda está a decidir. Não repetir: o resultado aparece aqui quando a Stripe confirmar.",
  retry: "O banco recusou (recusa temporária). Nada foi cobrado. As novas tentativas automáticas mantêm-se, como o hóspede foi avisado.",
  needs_action: "O banco recusou de forma definitiva ou pediu confirmação (3DS), ou já não havia nova tentativa marcada. Nada foi cobrado. A linha passa a \"a resolver pelo hóspede\": recebe o aviso com o link e não há novas tentativas automáticas.",
  paid_externally: "Não cobrado: o Guesty mostra a 2.ª parte já paga por outra via. A linha ficou como paga fora da plataforma.",
  needs_review: "Não cobrado: a reserva no Guesty não está confirmada, ou tem um pagamento parcial por fora. A linha passou a \"a rever\".",
  released: "Não cobrado: falha técnica (Stripe ou Guesty sem resposta) ou o hóspede está a pagar na página neste momento. Ver o último erro da linha.",
  "not-claimed": "Não cobrado: a linha mudou de estado entretanto (outra tentativa a decorrer, ou o prazo H passou).",
};

const CANCEL_MESSAGES: Record<string, string> = {
  done: "Reserva cancelada no Guesty, reembolso feito e email enviado ao hóspede.",
  pending: "Cancelamento a meio (Guesty ou reembolso por concluir). Nada fica perdido: usar \"Continuar cancelamento\" ou esperar pela próxima passagem do sistema.",
  paid: "A 2.ª parte foi paga no momento do cancelamento. NADA foi cancelado nem devolvido: a reserva segue paga.",
};

/* ════════════════════════════════════════════════════════════════
   Router
   ════════════════════════════════════════════════════════════════ */

export const balanceAdminRouter = router({
  /** Linhas do ambiente, com contagens por estado para os filtros. */
  list: adminProcedure
    .input(z.object({
      statuses: z.array(z.enum(STATUSES)).max(STATUSES.length).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .query(async ({ input }) => {
      const D = await db();
      const E = await engine();
      const { classifyDecline } = await stripe();
      const scope = E.balanceScope();
      const now = new Date();
      const [rows, counts] = await Promise.all([
        D.listScheduledPaymentsForAdmin(scope, { statuses: input?.statuses, limit: input?.limit }),
        D.countScheduledPaymentsForAdmin(scope),
      ]);
      return {
        now: now.toISOString(),
        livemode: scope.livemode,
        siteOrigin: scope.siteOrigin,
        chargesEnabled: E.canRunBalanceEngine(),
        counts,
        rows: rows.map((row) => rowSummary(row, {
          declineKind: row.lastDeclineCode ? classifyDecline(row.lastDeclineCode, null) : null,
          cardExpiresBeforeCharge: E.cardExpiresBefore(row, new Date(row.chargeAt)),
        })),
      };
    }),

  /** Uma linha: valores, datas, tentativas, avisos, Guesty, o que o hóspede
   *  vê, o histórico de ações e o que cada botão pode fazer. */
  detail: adminProcedure
    .input(z.object({ id: idInput }))
    .query(async ({ input }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const declineKind = await declineKindOf(row);
      const chargesEnabled = E.canRunBalanceEngine();
      const availability = availabilityFor(E, row, now, declineKind);
      const canCancel = availability.gates.cancelFull.allowed || availability.gates.cancelPolicy.allowed;
      const [actions, intent, refundPreview] = await Promise.all([
        D.listAdminActions(row.id),
        D.getBookingIntent(row.intentId).catch(() => null),
        // O que o cancelamento devolveria agora, com os cálculos do reembolso
        // real (o browser nunca recalcula). Só quando há um cancelamento
        // possível: lê os pagamentos na Stripe. Ilegível → null, e o diálogo
        // diz que o valor exato sai no resultado.
        canCancel ? refundPreviewOf(E, row, now) : Promise.resolve(null),
      ]);
      const guestName = [intent?.guestFirstName, intent?.guestLastName].filter(Boolean).join(" ") || null;
      return {
        now: now.toISOString(),
        chargesEnabled,
        row: {
          ...rowSummary(row, { declineKind, cardExpiresBeforeCharge: E.cardExpiresBefore(row, new Date(row.chargeAt)) }),
          policyCode: row.policyCode,
          depositStayCents: row.depositStayCents,
          servicesCents: Math.max(0, row.depositCents - row.depositStayCents),
          lastError: scrubStripeIds(row.lastError),
          claimSource: row.claimSource,
          claimedAt: iso(row.claimedAt),
          guestActive: E.guestIsActive(row, now),
          refundFailed: refundFailed(row),
          // Ids de PaymentIntent e de reembolso servem ao CS para procurar na
          // Stripe; não são dados do cartão nem do customer.
          depositPaymentIntentId: row.depositPaymentIntentId,
          balancePaymentIntentId: row.balancePaymentIntentId,
          guestPaymentIntentId: row.guestPaymentIntentId,
          refundId: row.refundId,
        },
        guestName,
        notices: {
          reminderStage: Number(row.reminderStage ?? 0),
          failureNoticeStage: Number(row.failureNoticeStage ?? 0),
          failureNoticeSentAt: iso(row.failureNoticeSentAt),
          smsStage: Number(row.smsStage ?? 0),
          paidEmailAt: iso(row.emailPaidClaimedAt),
          cancelEmailAt: iso(row.emailCancelClaimedAt),
        },
        effects: {
          guestyDepositRecordedAt: iso(row.guestyDepositRecordedAt),
          guestyBalanceRecordedAt: iso(row.guestyBalanceRecordedAt),
          noteAt: iso(row.noteClaimedAt),
          guestyCancelledAt: iso(row.guestyCancelledAt),
          refundClaimedAt: iso(row.refundClaimedAt),
        },
        guesty: {
          status: row.guestyStatus,
          checkIn: row.guestyCheckIn,
          checkOut: row.guestyCheckOut,
          listingId: row.guestyListingId,
          totalCents: row.guestyTotalCents ?? null,
          totalPaidCents: row.guestyTotalPaidCents ?? null,
          pendingForeignCents: row.guestyPendingForeignCents ?? null,
          lastReconciledAt: iso(row.lastReconciledAt),
          lastReconcileError: scrubStripeIds(row.lastReconcileError),
          datesDiffer: !!row.guestyCheckIn && (row.guestyCheckIn !== row.checkIn || row.guestyCheckOut !== row.checkOut),
          listingDiffers: !!row.guestyListingId && row.guestyListingId !== row.listingId,
        },
        guestView: guestView(row, now, declineKind),
        refundPreview,
        actions: actions.map(actionView),
        ...availability,
      };
    }),

  /** Reenvia ao hóspede o link da página do saldo (sempre para o email da
   *  reserva). O CS passa por cima do travão de 10 minutos do hóspede (force):
   *  quem carrega aqui tem o hóspede ao telefone e precisa de saber se saiu. */
  resendLink: adminProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ input, ctx }) => {
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const gate = availabilityFor(E, row, now, null).gates.resendLink;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      const log = await logAction(ctx.user, row, "resend_link", { email: row.email });
      let sent = false;
      let error: string | null = null;
      try {
        const res = await E.resendBalanceLink(row.intentId, now, { force: true });
        sent = res?.sent === true;
      } catch (err: any) {
        error = scrubStripeIds(String(err?.message ?? err).slice(0, 200));
      }
      const resultLogged = await finishAction(log, { outcome: sent ? "sent" : "not_sent", ...(error ? { error } : {}) });
      return {
        ok: sent,
        outcome: sent ? "sent" as const : "not_sent" as const,
        actionId: log.id,
        resultLogged,
        message: sent
          ? `Enviado para ${row.email}.`
          : `Não foi possível enviar o link para ${row.email} (o fornecedor de email recusou ou o link não pôde ser gerado). Tentar outra vez daqui a uns minutos; se continuar, avisar a equipa técnica. Nunca enviar o link à mão por outro canal.`,
      };
    }),

  /** Cobra já a 2.ª parte no cartão guardado (motor, source "admin"). */
  chargeNow: adminProcedure
    .input(z.object({
      id: idInput,
      confirm: z.literal("COBRAR"),
      /** O hóspede pediu esta cobrança (obrigatório antes de C e depois de uma
       *  recusa hard/3DS; ver chargeNeedsGuestRequest). */
      guestRequested: z.boolean().default(false),
      expectedStatus,
    }))
    .mutation(async ({ input, ctx }) => {
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      assertExpected(row, input.expectedStatus);
      const declineKind = await declineKindOf(row);
      const av = availabilityFor(E, row, now, declineKind);
      if (!av.gates.chargeNow.allowed) refuse("PRECONDITION_FAILED", av.gates.chargeNow.reason!);
      if (av.chargeNeedsGuestRequest && !input.guestRequested) refuse("PRECONDITION_FAILED", av.chargeNeedsGuestRequest);

      const log = await logAction(ctx.user, row, "charge_now", {
        amountCents: row.balanceCents,
        guestRequested: input.guestRequested,
        guestRequestReason: av.chargeNeedsGuestRequest,
        cardLast4: row.cardLast4,
      });
      let outcome: string;
      try {
        outcome = await E.chargeScheduledPayment(row, "admin", now);
      } catch (err: any) {
        const error = scrubStripeIds(String(err?.message ?? err).slice(0, 300));
        await finishAction(log, { outcome: "error", error });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "A cobrança deu erro técnico. Não repetir: ver o estado da linha daqui a uns minutos (o sistema relê o pagamento na Stripe).",
        });
      }
      if (outcome === "succeeded") {
        // Os efeitos (registo no Guesty, nota, E4) têm um claim cada; correr já
        // dá ao CS o fecho completo sem esperar pela passagem do sweep.
        const paid = await freshRow(row.id);
        if (paid) {
          await E.runPostChargeEffects(paid, now).catch((err: any) =>
            console.error(`[BalanceAdmin] efeitos da cobranca por fazer linha ${row.id}: ${err?.message}`));
        }
      }
      const after = await freshRow(row.id);
      const resultLogged = await finishAction(log, {
        outcome,
        statusAfter: after?.status ?? null,
        declineCode: after?.lastDeclineCode ?? null,
      });
      return {
        ok: outcome === "succeeded",
        outcome,
        status: after?.status ?? row.status,
        actionId: log.id,
        resultLogged,
        message: CHARGE_MESSAGES[outcome] ?? `Resultado: ${outcome}.`,
      };
    }),

  /** Saldo recebido por outra via (transferência, por exemplo): a
   *  plataforma deixa de o cobrar. */
  markPaidExternally: adminProcedure
    .input(z.object({
      id: idInput,
      ref: z.string().trim().min(2, "Indicar a referência do pagamento").max(80),
      amountCents: z.number().int().positive().max(10_000_000),
      paidOn: ymd,
      /** Aceitar receber menos do que o saldo (comissões de transferência). */
      acceptShortfall: z.boolean().default(false),
      confirm: z.literal("PAGO"),
      expectedStatus,
    }))
    .mutation(async ({ input, ctx }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      assertExpected(row, input.expectedStatus);
      const gate = availabilityFor(E, row, now, null).gates.markPaidExternally;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      if (input.paidOn > lisbonToday(now)) refuse("BAD_REQUEST", "A data do pagamento não pode ser no futuro.");
      const shortfall = row.balanceCents - input.amountCents;
      if (shortfall > SHORTFALL_TOLERANCE_CENTS && !input.acceptShortfall) {
        refuse("PRECONDITION_FAILED",
          `O valor recebido (${eur(input.amountCents)}) é inferior ao saldo (${eur(row.balanceCents)}). ` +
          `Confirmar a diferença de ${eur(shortfall)}, ou pausar e decidir com a gestão.`);
      }

      const log = await logAction(ctx.user, row, "mark_paid_externally", {
        ref: input.ref,
        amountCents: input.amountCents,
        paidOn: input.paidOn,
        balanceCents: row.balanceCents,
        shortfallCents: Math.max(0, shortfall),
        acceptShortfall: input.acceptShortfall,
      });
      const ref = `admin ${input.paidOn} ${eur(input.amountCents)} ${input.ref}`.slice(0, 120);

      // Na mesma fila da cobrança desta reserva neste processo: o sweep e o
      // "pagar agora" não correm por cima.
      const result = await withCheckoutChargeLock(`balance:${row.intentId}`, async () => {
        const S = await stripe();
        // 1) Um PI do saldo ainda aberto (sweep ou hóspede na página) podia
        //    cobrar depois de marcarmos "pago fora": fecha-se antes. Se um deles
        //    já cobrou, a plataforma recebeu: nunca marcar pago fora por cima.
        for (const piId of [row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean) as string[]) {
          let r: "canceled" | "already-final" | "succeeded";
          try {
            r = await S.cancelOpenPaymentIntent(piId);
          } catch (err: any) {
            return { outcome: "pi_open" as const, piId, error: scrubStripeIds(String(err?.message ?? err).slice(0, 200)) };
          }
          if (r === "succeeded") {
            // A plataforma recebeu: a linha tem de ficar paga. Se o UPDATE não
            // mudou nada (linha em revisão, por exemplo), só vale como paga se
            // outro caminho (webhook) já a marcou; senão o CS tem de o saber,
            // nunca um "feito" com a linha a rever.
            const marked = await D.markScheduledPaymentSucceeded(row.id, piId, now);
            if (marked) return { outcome: "platform_paid" as const, piId };
            const now2 = await freshRow(row.id);
            if (now2?.status === "succeeded") return { outcome: "platform_paid" as const, piId };
            return { outcome: "platform_paid_unmarked" as const, piId, statusNow: now2?.status ?? null };
          }
        }
        // 2) Marca (UPDATE condicional: falha se a linha mudou entretanto).
        if (!(await D.markPaidExternally(row.id, ref))) return { outcome: "not_changed" as const };
        // 3) Um PI criado entre o passo 1 e o 2 (outro processo) fecha-se
        //    agora; se cobrou, o hóspede pagou duas vezes e isso tem de se ver.
        const after = await freshRow(row.id);
        const seen = new Set([row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean));
        for (const piId of [after?.balancePaymentIntentId, after?.guestPaymentIntentId].filter((x) => x && !seen.has(x)) as string[]) {
          const r = await S.cancelOpenPaymentIntent(piId).catch(() => "unknown" as const);
          if (r === "succeeded" || r === "unknown") return { outcome: "marked_but_platform_paid" as const, piId };
        }
        return { outcome: "marked" as const };
      });

      if (result.outcome === "platform_paid") {
        const paid = await freshRow(row.id);
        if (paid?.status === "succeeded") {
          await E.runPostChargeEffects(paid, now).catch(() => {});
        }
      }
      if (result.outcome === "marked" || result.outcome === "marked_but_platform_paid") {
        // Nota informativa no Guesty (sem registo de pagamento: o folio não
        // muda daqui). Falha aqui não desfaz a marca.
        const { appendReservationNote } = await guestyPay();
        await appendReservationNote(
          row.reservationId,
          `Checkout 2.0 em duas partes: 2.a parte (${eur(row.balanceCents)}) marcada como PAGA FORA DA PLATAFORMA no ecra Saldos ` +
            `por ${ctx.user.email ?? `utilizador ${ctx.user.id}`}: ${eur(input.amountCents)} recebidos a ${input.paidOn}, ref ${input.ref}. ` +
            `A plataforma NAO vai cobrar a 2.a parte.`,
        ).catch(() => false);
      }
      const after = await freshRow(row.id);
      const resultLogged = await finishAction(log, { ...result, statusAfter: after?.status ?? null });
      const messages: Record<string, string> = {
        marked: "Marcada como paga fora da plataforma. A plataforma não vai cobrar a 2.ª parte. Nota escrita no Guesty (o pagamento em si não é registado no Guesty por aqui).",
        marked_but_platform_paid: `ATENÇÃO: marcada como paga fora, mas a plataforma também cobrou ou pode ter cobrado (PI ${"piId" in result ? result.piId : "?"}). Verificar na Stripe e devolver uma das duas.`,
        platform_paid: "NÃO marcada: a plataforma já tinha cobrado a 2.ª parte no cartão. Se o hóspede também pagou por fora, devolver essa transferência.",
        platform_paid_unmarked:
          `NÃO marcada, e ATENÇÃO: a plataforma já cobrou a 2.ª parte no cartão (PI ${"piId" in result ? result.piId : "?"}), ` +
          `mas a linha não ficou como paga (continua "${"statusNow" in result ? result.statusNow ?? "?" : "?"}"). Não repetir. ` +
          `Reabrir daqui a uns minutos (o aviso da Stripe regista o pagamento); se continuar assim, falar com a equipa técnica. ` +
          `Se o hóspede também pagou por fora, devolver essa transferência.`,
        pi_open: "NÃO marcada: há um pagamento do saldo em processamento na Stripe. Esperar uns minutos e reabrir.",
        not_changed: "NÃO marcada: a linha mudou de estado entretanto. Reabrir o detalhe.",
      };
      return {
        ok: result.outcome === "marked",
        outcome: result.outcome,
        status: after?.status ?? row.status,
        actionId: log.id,
        resultLogged,
        message: messages[result.outcome],
      };
    }),

  /** Pausa a automação até uma data (fim do dia, Lisboa): → needs_review. */
  pause: adminProcedure
    .input(z.object({
      id: idInput,
      until: ymd,
      reason: z.string().trim().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const gate = availabilityFor(E, row, now, null).gates.pause;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      let untilAt: Date;
      try {
        untilAt = lisbonWallTimeToUtc(input.until, 23, 59);
      } catch {
        refuse("BAD_REQUEST", "Data da pausa inválida.");
      }
      if (untilAt.getTime() <= now.getTime()) refuse("BAD_REQUEST", "A pausa tem de terminar no futuro.");
      // Como no "Preciso de ajuda" do motor: a pausa nunca passa do fim do
      // cancelamento gratuito; até lá um humano decide.
      if (untilAt.getTime() > new Date(row.freeCancelDeadline).getTime()) {
        refuse("PRECONDITION_FAILED", "A pausa não pode passar do fim do cancelamento gratuito (D).");
      }
      const reason = `CS: ${input.reason?.trim() || "pausa pedida no ecrã Saldos"}`;
      const log = await logAction(ctx.user, row, "pause", { until: input.until, untilAt: untilAt.toISOString(), reason });
      const ok = await D.adminPause(row.id, untilAt, reason);
      const resultLogged = await finishAction(log, { outcome: ok ? "paused" : "not_changed" });
      if (!ok) refuse("CONFLICT", "A linha mudou de estado entretanto. Reabrir o detalhe.");
      return {
        ok: true as const,
        status: "needs_review" as const,
        actionId: log.id,
        resultLogged,
        message: "Pausada. Até essa data nada é cobrado nem cancelado automaticamente. No fim da pausa a linha NÃO volta sozinha: alguém tem de Retomar, Marcar pago, ou Cancelar e devolver.",
      };
    }),

  /** Volta a pôr a linha na automação (needs_review → scheduled/retry/needs_action). */
  resume: adminProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ input, ctx }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const declineKind = await declineKindOf(row);
      const chargesEnabled = E.canRunBalanceEngine();
      const gate = availabilityFor(E, row, now, declineKind).gates.resume;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      // Recusa hard ou 3DS: só o hóspede resolve. Sem nenhuma tentativa: a
      // cobrança vencida faz-se como agendada (sem aviso de falha falso).
      const holdForGuest = declineKind === "hard" || declineKind === "auth";
      const pastChargeStatus = Number(row.attempts ?? 0) === 0 && !row.lastDeclineCode ? "scheduled" as const : "retry" as const;
      const log = await logAction(ctx.user, row, "resume", { holdForGuest, pastChargeStatus, declineKind });
      const to = await D.adminResume(row.id, now, { pastChargeStatus, holdForGuest });
      const resultLogged = await finishAction(log, { outcome: to ? "resumed" : "not_changed", statusAfter: to });
      if (!to) refuse("CONFLICT", "Não foi possível retomar: a linha mudou de estado ou o prazo H passou. Reabrir o detalhe.");
      const off = chargesEnabled ? "" : " Atenção: as cobranças automáticas estão desligadas neste servidor; nada será cobrado até serem ligadas.";
      const beforeC = now.getTime() < new Date(row.chargeAt).getTime();
      const message =
        to === "needs_action"
          ? "Retomada à espera do hóspede: o banco recusou este cartão, por isso não há cobrança automática. O hóspede paga ou troca de cartão pelo link; o prazo H mantém-se."
          : beforeC
            ? "Retomada: volta a agendada e cobra na data marcada."
            : "Retomada: a próxima passagem do sistema (até 10 minutos) tenta cobrar.";
      return { ok: true as const, status: to, actionId: log.id, resultLogged, message: message + off };
    }),

  /**
   * Cancela a reserva e devolve. "full": cancelamento pela equipa (devolve
   * tudo o que foi pago, Flex incluído, sem retenção; o hóspede recebe o email
   * neutro "Cancelámos a sua reserva e devolvemos…", kind team no motor).
   * "policy": como o cancelamento pelo hóspede (1.ª parte menos o Flex se
   * passaram mais de 14 dias desde o pagamento, mais a 2.ª se já cobrada;
   * email E7). Claim para cancelling e depois o motor.
   */
  cancelAndRefund: adminProcedure
    .input(z.object({
      id: idInput,
      mode: z.enum(["full", "policy"]),
      confirm: z.literal("CANCELAR"),
      expectedStatus,
    }))
    .mutation(async ({ input, ctx }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      assertExpected(row, input.expectedStatus);
      const av = availabilityFor(E, row, now, null);
      const gate = input.mode === "full" ? av.gates.cancelFull : av.gates.cancelPolicy;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      // "full" é a equipa a cancelar com reembolso integral: nunca "falta de
      // pagamento" (o E5 diria ao hóspede que não pagou a tempo) nem "a seu
      // pedido" (o E7). O motor manda o email neutro da equipa.
      const kind = input.mode === "full" ? "admin" as const : "guest" as const;
      const reason = input.mode === "full" ? "cancel:admin" : "cancel:guest";
      const log = await logAction(ctx.user, row, "cancel_and_refund", {
        mode: input.mode,
        depositCents: row.depositCents,
        balanceCents: row.balanceCents,
        balancePaid: !!row.succeededAt,
      });
      // Só a partir do estado que acabou de ser validado: se a linha mudou
      // (por exemplo, a 2.ª parte foi paga entretanto), o reembolso a fazer
      // é outro e o CS tem de voltar a decidir.
      const claimed = await D.claimScheduledPaymentForCancel(row.id, [row.status], { reason });
      if (!claimed) {
        await finishAction(log, { outcome: "not_claimed" });
        refuse("CONFLICT", "A linha mudou de estado entretanto: nada foi cancelado. Reabrir o detalhe.");
      }
      const claimedRow = (await freshRow(row.id)) ?? row;
      let outcome: string;
      try {
        outcome = await E.runCancellation(claimedRow, kind, now);
      } catch (err: any) {
        // Fica em cancelling: "Continuar cancelamento" (ou o sweep) retoma
        // do passo que falhou, cada um com o seu claim.
        outcome = "pending";
        console.error(`[BalanceAdmin] cancelamento a meio linha ${row.id}: ${err?.message}`);
      }
      const after = await freshRow(row.id);
      const resultLogged = await finishAction(log, {
        outcome,
        statusAfter: after?.status ?? null,
        refundCents: after?.refundCents ?? null,
        refundStatus: after?.refundStatus ?? null,
        refundId: after?.refundId ?? null,
      });
      const refundLine = after?.refundCents != null ? ` Devolvido: ${eur(after.refundCents)} (${after.refundStatus ?? "?"}).` : "";
      // Numa reserva que já estava paga, "paid" não quer dizer "pagou agora":
      // o motor deu-a por paga e não cancelou. O CS tem de saber que nada mudou.
      const message = outcome === "paid" && row.status === "succeeded"
        ? "NADA foi cancelado nem devolvido: o sistema manteve a reserva como paga. Não repetir; falar com a gestão."
        : (CANCEL_MESSAGES[outcome] ?? `Resultado: ${outcome}.`) + (outcome === "done" ? refundLine : "");
      return {
        ok: outcome === "done",
        outcome,
        status: after?.status ?? "cancelling",
        refundCents: after?.refundCents ?? null,
        refundStatus: after?.refundStatus ?? null,
        actionId: log.id,
        resultLogged,
        message,
      };
    }),

  /** Retoma um cancelamento que ficou a meio (Guesty ou reembolso por fazer). */
  continueCancellation: adminProcedure
    .input(z.object({ id: idInput, confirm: z.literal("CANCELAR") }))
    .mutation(async ({ input, ctx }) => {
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const gate = availabilityFor(E, row, now, null).gates.continueCancellation;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      // O claim gravou quem pediu o cancelamento (a mesma leitura do sweep).
      const kind = E.cancellationKindFromReason(row.reviewReason);
      const log = await logAction(ctx.user, row, "continue_cancellation", { kind });
      let outcome: string;
      try {
        outcome = await E.runCancellation(row, kind, now);
      } catch (err: any) {
        outcome = "pending";
        console.error(`[BalanceAdmin] continuar cancelamento falhou linha ${row.id}: ${err?.message}`);
      }
      const after = await freshRow(row.id);
      const resultLogged = await finishAction(log, {
        outcome,
        statusAfter: after?.status ?? null,
        refundCents: after?.refundCents ?? null,
        refundStatus: after?.refundStatus ?? null,
      });
      return {
        ok: outcome === "done",
        outcome,
        status: after?.status ?? row.status,
        actionId: log.id,
        resultLogged,
        message: CANCEL_MESSAGES[outcome] ?? `Resultado: ${outcome}.`,
      };
    }),

  /** Um reembolso que falhou na Stripe (cartão fechado, por exemplo) e que a
   *  equipa devolveu por outra via: refund_status passa a "manual" e sai da
   *  secção "REEMBOLSOS POR RESOLVER" do digest. A referência (como foi
   *  devolvido) fica no histórico de ações, gravada antes de marcar. */
  markRefundResolved: adminProcedure
    .input(z.object({
      id: idInput,
      ref: z.string().trim().min(2, "Indicar como foi devolvido (ex.: transferência 12/11)").max(120),
      confirm: z.literal("RESOLVIDO"),
    }))
    .mutation(async ({ input, ctx }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const gate = availabilityFor(E, row, now, null).gates.markRefundResolved;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      const log = await logAction(ctx.user, row, "mark_refund_resolved", {
        ref: input.ref,
        refundStatus: row.refundStatus,
        refundId: row.refundId,
        refundCents: row.refundCents ?? null,
      });
      const ok = await D.markRefundManual(row.id);
      const resultLogged = await finishAction(log, { outcome: ok ? "marked" : "not_changed" });
      if (!ok) refuse("CONFLICT", "O estado do reembolso mudou entretanto (já resolvido, ou a Stripe atualizou). Reabrir o detalhe.");
      return {
        ok: true as const,
        actionId: log.id,
        resultLogged,
        message: `Reembolso marcado como resolvido à mão (${input.ref}). Sai dos reembolsos por resolver do digest.`,
      };
    }),

  /** Número da nota de crédito emitida pela Hostkit (spec 5.13). */
  markCreditNote: adminProcedure
    .input(z.object({ id: idInput, ref: z.string().trim().min(2, "Indicar o número da nota de crédito").max(64) }))
    .mutation(async ({ input, ctx }) => {
      const D = await db();
      const E = await engine();
      const now = new Date();
      const { row } = await loadRow(input.id);
      const gate = availabilityFor(E, row, now, null).gates.markCreditNote;
      if (!gate.allowed) refuse("PRECONDITION_FAILED", gate.reason!);
      const log = await logAction(ctx.user, row, "mark_credit_note", { ref: input.ref, previousRef: row.creditNoteRef });
      const ok = await D.markCreditNote(row.id, input.ref);
      const resultLogged = await finishAction(log, { outcome: ok ? "marked" : "not_changed" });
      if (!ok) refuse("CONFLICT", "A linha mudou de estado entretanto. Reabrir o detalhe.");
      return {
        ok: true as const,
        actionId: log.id,
        resultLogged,
        message: row.status === "cancelling" && !row.emailCancelClaimedAt
          ? "Nota de crédito registada. Vai no email de cancelamento ao hóspede."
          : "Nota de crédito registada.",
      };
    }),
});
