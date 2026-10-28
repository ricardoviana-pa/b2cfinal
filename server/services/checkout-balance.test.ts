/**
 * Motor da 2.ª parte (server/services/checkout-balance.ts), pagamento em duas
 * partes: Fase 2a (sweep, cobrança, cancelamento, webhook, saúde) e Fase 2b
 * (página do saldo: vista, "Pagar agora", troca de cartão, cancelamento,
 * "Preciso de ajuda", reenvio do link). Corre contra:
 * - uma BD falsa em memória com as MESMAS transições condicionais de
 *   server/db.ts (secção "Fase 2a" e as ações do hóspede): cada função repete
 *   o WHERE da real (estados de origem, H, next_attempt_at, pausa de ajuda,
 *   escudo do hóspede, claims de efeito com prazo de 30 min, releaseEffect) e
 *   devolve true só quando a linha bate certo. As listas devolvem cópias, como
 *   uma leitura real: o motor decide com a fotografia que leu;
 * - uma Stripe falsa com estado e idempotency keys, com a fórmula de
 *   stripe-balance.ts (checkout-balance-{linha}-a{tentativa}-{origem}[-{keyNonce}]
 *   -create/-confirm): uma key repetida devolve a resposta guardada da 1.ª
 *   chamada, como a Stripe; cancelOpenPaymentIntent com a semântica real
 *   (lança em processing/requires_capture, "succeeded" se o dinheiro entrou);
 * - um Guesty falso (retrato da reserva por id e resultado do cancelamento).
 *   foreignPayments, paymentRecordsIntent, classifyDecline, o token do link
 *   (balanceLinkToken/verifyBalanceLinkToken) e o texto do mandato
 *   (renderCardChangeMandate) são os reais.
 *
 * Invariantes verificadas depois de CADA teste (afterEach): nunca mais de um
 * PaymentIntent criado por claim, nunca um create/confirm do servidor sem a
 * linha em `charging` com esse PI gravado, nunca a reserva cancelada no Guesty
 * com um PI do saldo ainda aberto, nunca um reembolso de cancelamento antes do
 * cancelamento no Guesty.
 *
 * Calendário fixo (spec 2.3): casa moderate, check-in 15 jul 2027 →
 * D = 8 jul 23:59, C = 28 jun 10:00, retentativas 29 jun e 1 jul às 10:00,
 * H = 5 jul 12:00, hora de Lisboa (verão, UTC+1).
 *
 * Os blocos com "Regressão" no comentário seguram defeitos já corrigidos:
 * o comentário diz o que falhava e porquê.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock, MockInstance } from "vitest";
import type { CheckoutScheduledPayment } from "../../drizzle/schema";
import type { ReservationSnapshot } from "./guesty-balance";

const h = vi.hoisted(() => {
  type Row = import("../../drizzle/schema").CheckoutScheduledPayment;
  type Scope = { livemode: boolean; siteOrigin: string };
  type Snapshot = import("./guesty-balance").ReservationSnapshot;
  type AnyFn = (...args: any[]) => any;
  type FakePi = {
    id: string;
    object: "payment_intent";
    status: string;
    amount: number;
    customer: string;
    payment_method: string | null;
    metadata: Record<string, string>;
    /** Segundos Unix, como na Stripe. */
    created: number;
    client_secret: string;
  };
  type FakeSetupIntent = {
    id: string;
    status: string;
    customer: string;
    client_secret: string;
    metadata: Record<string, string>;
    payment_method: { id: string; card: { brand: string; last4: string; exp_month: number; exp_year: number } } | null;
  };
  type Behavior = "succeed" | "soft" | "hard" | "auth" | "requires_action" | "processing" | "lost" | "charged-lost";
  type RefundResult = { refundId: string | null; refundCents: number; status: string };

  const log: string[] = [];
  const violations: string[] = [];
  const registry: Array<[Mock, AnyFn]> = [];
  const orig: Record<string, AnyFn> = {};

  /** vi.fn com a implementação por omissão, que regista o nome no log de chamadas. */
  function fake<F extends AnyFn>(name: string, impl: F): Mock<F> {
    const wrapped = ((...args: any[]) => {
      log.push(name);
      return impl(...args);
    }) as F;
    const mock = vi.fn(wrapped);
    registry.push([mock as unknown as Mock, wrapped]);
    orig[name] = wrapped;
    return mock;
  }

  function clone<T>(v: T): T {
    return structuredClone(v);
  }
  const ms = (d: Date | string | null | undefined): number | null => (d == null ? null : new Date(d).getTime());
  const req = (d: Date | string | null | undefined): number => ms(d) as number;

  /* ── BD falsa: as mesmas condições de server/db.ts ─────────────────────── */

  const store = new Map<string, Row>();
  const claims: Array<{ id: string; creates: number }> = [];
  const heartbeats = new Map<string, Date>();
  /** checkout_card_mandates (só o que o motor escreve). */
  const mandates: Array<Record<string, any>> = [];
  let tick = 0;

  const OPEN_UNPAID = ["scheduled", "retry", "needs_action"];
  const AUTO_CHARGEABLE = ["scheduled", "retry"];
  const NEVER_CANCEL_FROM = new Set(["charging", "cancelling", "cancelled_unpaid", "cancelled_by_guest"]);
  const EFFECT_COLUMNS = [
    "guestyBalanceClaimedAt", "noteClaimedAt", "emailPaidClaimedAt",
    "cancelPisClaimedAt", "guestyCancelClaimedAt", "refundClaimedAt", "emailCancelClaimedAt",
  ];

  function assertScope(scope: Scope): void {
    if (typeof scope?.livemode !== "boolean" || typeof scope?.siteOrigin !== "string" || !scope.siteOrigin.trim()) {
      throw new Error("BalanceScope inválido: livemode (boolean) e siteOrigin são obrigatórios");
    }
  }
  /** ORDER BY … ASC do MySQL: NULL primeiro. */
  function ascBy(...fields: (keyof Row)[]) {
    return (a: Row, b: Row): number => {
      for (const f of fields) {
        const x = ms(a[f] as any) ?? -Infinity;
        const y = ms(b[f] as any) ?? -Infinity;
        if (x < y) return -1;
        if (x > y) return 1;
      }
      return 0;
    };
  }
  function select(scope: Scope, where: (r: Row) => boolean, order: (a: Row, b: Row) => number): Row[] {
    assertScope(scope);
    return [...store.values()]
      .filter((r) => r.livemode === scope.livemode && r.siteOrigin === scope.siteOrigin && where(r))
      .sort(order)
      .map(clone);
  }
  /** UPDATE … WHERE id = ? AND <cond>: true só se a linha bateu certo (affectedRows > 0). */
  function update(id: string, where: (r: Row) => boolean, set: (r: Row) => Partial<Row>): boolean {
    const r = store.get(id);
    if (!r || !where(r)) return false;
    Object.assign(r, set(r), { updatedAt: new Date(Date.UTC(2030, 0, 1) + ++tick * 1000) });
    return true;
  }
  const notHelpPaused = (r: Row, now: Date) => r.helpPausedUntil == null || req(r.helpPausedUntil) <= now.getTime();
  /** O escudo do hóspede mede-se só por guest_active_at (NULL = sem escudo). */
  const notRecentGuestClaim = (r: Row, now: Date) =>
    r.guestActiveAt == null || req(r.guestActiveAt) <= now.getTime() - 60 * 60_000;
  const optionalText = (v: string | null | undefined, max: number): string | null =>
    v == null ? null : String(v) ? String(v).slice(0, max) : null;
  const heartbeatKey = (scope?: Scope) => (scope && scope.livemode === false ? "test" : "live");

  function markReconcileErrorImpl(id: string, error: string): boolean {
    return update(id, () => true, () => ({ lastReconcileError: (String(error ?? "") || "erro desconhecido").slice(0, 500) }));
  }

  const db = {
    // lib/guesty importa estes dois de ../db; nunca são chamados aqui.
    getSetting: fake("getSetting", async (_k: string) => null),
    upsertSetting: fake("upsertSetting", async (..._a: unknown[]) => undefined),
    getBookingIntent: fake("getBookingIntent", async (id: string) => ({ id, guestFirstName: "Ana" })),

    listDueScheduledPayments: fake("listDueScheduledPayments", async (scope: Scope, now: Date, limit = 50) =>
      select(
        scope,
        (r) =>
          AUTO_CHARGEABLE.includes(r.status) &&
          req(r.nextAttemptAt) <= now.getTime() &&
          req(r.hardStopAt) > now.getTime() &&
          notHelpPaused(r, now),
        ascBy("nextAttemptAt"),
      ).slice(0, limit)),

    claimScheduledPaymentForCharge: fake("claimScheduledPaymentForCharge", async (id: string, source: string, now: Date) => {
      if (!["sweep", "guest", "webhook", "admin"].includes(source)) throw new Error(`claim_source inválido: ${source}`);
      const automatic = source === "sweep" || source === "webhook";
      const ok = update(
        id,
        (r) =>
          (automatic ? AUTO_CHARGEABLE : OPEN_UNPAID).includes(r.status) &&
          req(r.hardStopAt) > now.getTime() &&
          (!automatic || (req(r.nextAttemptAt) <= now.getTime() && notHelpPaused(r, now))),
        (r) => ({ claimPrevStatus: r.status, status: "charging", claimedAt: now, claimSource: source as Row["claimSource"], attempts: r.attempts + 1 }),
      );
      if (ok) claims.push({ id, creates: 0 });
      return ok;
    }),

    setBalancePaymentIntentId: fake("setBalancePaymentIntentId", async (id: string, field: string, piId: string) => {
      if (field !== "balancePaymentIntentId" && field !== "guestPaymentIntentId") throw new Error(`Campo de PI inválido: ${field}`);
      if (!piId) throw new Error("setBalancePaymentIntentId sem id de PI");
      return update(id, (r) => r.status === "charging", () => ({ [field]: piId }) as Partial<Row>);
    }),

    markScheduledPaymentSucceeded: fake("markScheduledPaymentSucceeded", async (id: string, piId: string, now: Date) => {
      if (!piId) throw new Error("markScheduledPaymentSucceeded sem id de PI");
      return update(
        id,
        (r) => ["scheduled", "charging", "retry", "needs_action"].includes(r.status),
        () => ({ status: "succeeded", succeededAt: now, balancePaymentIntentId: piId }),
      );
    }),

    markCancellingAsSucceeded: fake("markCancellingAsSucceeded", async (id: string, piId: string, now: Date) => {
      if (!piId) throw new Error("markCancellingAsSucceeded sem id de PI");
      return update(
        id,
        (r) =>
          r.status === "cancelling" &&
          r.succeededAt == null &&
          r.guestyCancelClaimedAt == null &&
          r.guestyCancelledAt == null &&
          r.refundClaimedAt == null &&
          r.refundId == null &&
          r.emailCancelClaimedAt == null,
        () => ({ status: "succeeded", succeededAt: now, balancePaymentIntentId: piId, cancelPisClaimedAt: null }),
      );
    }),

    markReviewAsSucceeded: fake("markReviewAsSucceeded", async (id: string, piId: string, now: Date) => {
      if (!piId) throw new Error("markReviewAsSucceeded sem id de PI");
      return update(
        id,
        (r) => r.status === "needs_review" && r.succeededAt == null,
        () => ({ status: "succeeded", succeededAt: now, balancePaymentIntentId: piId }),
      );
    }),

    recordPaymentDuringReview: fake("recordPaymentDuringReview", async (id: string, piId: string, now: Date) => {
      if (!piId) throw new Error("recordPaymentDuringReview sem id de PI");
      return update(
        id,
        (r) => r.status === "needs_review" && r.succeededAt == null,
        () => ({ succeededAt: now, balancePaymentIntentId: piId }),
      );
    }),

    closeReviewAsPaid: fake("closeReviewAsPaid", async (id: string, piId: string) =>
      update(
        id,
        (r) => r.status === "needs_review" && r.succeededAt != null && r.balancePaymentIntentId === piId,
        () => ({ status: "succeeded" }),
      )),

    markScheduledPaymentRetry: fake(
      "markScheduledPaymentRetry",
      async (id: string, p: { declineCode: string | null; error: string | null; nextAttemptAt: Date }) =>
        update(id, (r) => r.status === "charging", () => ({
          status: "retry",
          lastDeclineCode: optionalText(p.declineCode, 64),
          lastError: optionalText(p.error, 500),
          nextAttemptAt: p.nextAttemptAt,
        })),
    ),

    markScheduledPaymentNeedsAction: fake(
      "markScheduledPaymentNeedsAction",
      async (id: string, p: { declineCode: string | null; error: string | null }) =>
        update(id, (r) => r.status === "charging", () => ({
          status: "needs_action",
          lastDeclineCode: optionalText(p.declineCode, 64),
          lastError: optionalText(p.error, 500),
        })),
    ),

    releaseChargeClaim: fake(
      "releaseChargeClaim",
      async (id: string, p: { toStatus: string; nextAttemptAt: Date; error: string }) => {
        if (!OPEN_UNPAID.includes(p.toStatus)) throw new Error(`releaseChargeClaim para estado inválido: ${p.toStatus}`);
        return update(id, (r) => r.status === "charging", (r) => ({
          status: p.toStatus as Row["status"],
          nextAttemptAt: p.nextAttemptAt,
          lastError: optionalText(p.error, 500),
          attempts: Math.max(r.attempts - 1, 0),
        }));
      },
    ),

    listStuckCharging: fake("listStuckCharging", async (scope: Scope, claimedBefore: Date) =>
      select(
        scope,
        (r) => r.status === "charging" && (r.claimedAt == null || req(r.claimedAt) < claimedBefore.getTime()),
        ascBy("claimedAt"),
      )),

    markPaidExternally: fake("markPaidExternally", async (id: string, ref: string) => {
      const text = String(ref ?? "").trim();
      if (!text) throw new Error("markPaidExternally exige uma referência");
      return update(
        id,
        (r) => ["scheduled", "retry", "needs_action", "needs_review"].includes(r.status),
        () => ({ status: "paid_externally", paidExternallyRef: text.slice(0, 120) }),
      );
    }),

    markNeedsReview: fake("markNeedsReview", async (id: string, reason: string, dueAt: Date | null) => {
      const text = String(reason ?? "").trim() || "sem motivo indicado";
      return update(
        id,
        (r) => ["scheduled", "retry", "needs_action", "charging"].includes(r.status),
        () => ({ status: "needs_review", reviewReason: text.slice(0, 120), reviewDueAt: dueAt }),
      );
    }),

    listScheduledForReminders: fake("listScheduledForReminders", async (scope: Scope, horizon: Date) =>
      select(
        scope,
        (r) => r.status === "scheduled" && req(r.chargeAt) <= horizon.getTime() && r.reminderStage < 2,
        ascBy("chargeAt"),
      )),

    claimReminderStage: fake("claimReminderStage", async (id: string, from: number, to: number) => {
      if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("reminder_stage tem de ser inteiro");
      return update(id, (r) => r.reminderStage === from && r.status === "scheduled", () => ({ reminderStage: to }));
    }),

    listFailureNoticeCandidates: fake("listFailureNoticeCandidates", async (scope: Scope) =>
      select(
        scope,
        (r) => ["retry", "needs_action"].includes(r.status) && [0, 1].includes(r.failureNoticeStage),
        ascBy("hardStopAt"),
      )),

    claimFailureNoticeStage: fake(
      "claimFailureNoticeStage",
      async (id: string, from: number, to: number, patch: { failureNoticeSentAt?: Date; hardStopAt?: Date } = {}) => {
        if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("failure_notice_stage tem de ser inteiro");
        return update(
          id,
          (r) => r.failureNoticeStage === from && ["retry", "needs_action"].includes(r.status),
          () => ({
            failureNoticeStage: to,
            ...(patch.failureNoticeSentAt ? { failureNoticeSentAt: patch.failureNoticeSentAt } : {}),
            ...(patch.hardStopAt ? { hardStopAt: patch.hardStopAt } : {}),
          }),
        );
      },
    ),

    listHardStopDue: fake("listHardStopDue", async (scope: Scope, now: Date) =>
      select(
        scope,
        (r) => OPEN_UNPAID.includes(r.status) && req(r.hardStopAt) <= now.getTime() && notRecentGuestClaim(r, now),
        ascBy("hardStopAt"),
      )),

    claimScheduledPaymentForCancel: fake(
      "claimScheduledPaymentForCancel",
      async (id: string, fromStatuses: string[], opts: { hardStopNow?: Date; reason?: string } = {}) => {
        const allowed = Array.from(new Set(fromStatuses));
        if (allowed.length === 0) throw new Error("claimScheduledPaymentForCancel sem estados de origem");
        const forbidden = allowed.filter((s) => NEVER_CANCEL_FROM.has(s));
        if (forbidden.length) throw new Error(`Nunca se cancela a partir de ${forbidden.join(", ")}`);
        const hs = opts.hardStopNow;
        return update(
          id,
          (r) => allowed.includes(r.status) && (!hs || (req(r.hardStopAt) <= hs.getTime() && notRecentGuestClaim(r, hs))),
          () => ({ status: "cancelling", ...(opts.reason ? { reviewReason: opts.reason.slice(0, 120) } : {}) }),
        );
      },
    ),

    listCancelling: fake("listCancelling", async (scope: Scope) =>
      select(scope, (r) => r.status === "cancelling", ascBy("updatedAt"))),

    claimEffect: fake("claimEffect", async (id: string, column: string, now: Date, staleMs: number | null = 30 * 60_000) => {
      if (!EFFECT_COLUMNS.includes(column)) throw new Error(`Coluna de efeito inválida: ${column}`);
      if (staleMs !== null && !(staleMs >= 0)) throw new Error(`staleMs inválido: ${staleMs}`);
      const repeatable = staleMs !== null && Number.isFinite(staleMs);
      return update(
        id,
        (r) => {
          const v = (r as any)[column] as Date | null;
          return repeatable ? v == null || req(v) < now.getTime() - (staleMs as number) : v == null;
        },
        () => ({ [column]: now }) as Partial<Row>,
      );
    }),

    releaseEffect: fake("releaseEffect", async (id: string, column: string) => {
      if (!EFFECT_COLUMNS.includes(column)) throw new Error(`Coluna de efeito inválida: ${column}`);
      update(id, () => true, () => ({ [column]: null }) as Partial<Row>);
    }),

    requeueAfterCardChange: fake("requeueAfterCardChange", async (id: string, nextAttemptAt: Date) =>
      update(
        id,
        (r) => ["retry", "needs_action"].includes(r.status) && req(r.hardStopAt) > nextAttemptAt.getTime(),
        () => ({ status: "retry", nextAttemptAt, lastDeclineCode: null, lastError: null }),
      )),

    markGuestyDepositRecordedByIntent: fake("markGuestyDepositRecordedByIntent", async (intentId: string, now: Date) => {
      for (const r of store.values()) {
        if (r.intentId === intentId && r.guestyDepositRecordedAt == null) update(r.id, () => true, () => ({ guestyDepositRecordedAt: now }));
      }
    }),

    getScheduledPaymentByIntent: fake("getScheduledPaymentByIntent", async (intentId: string) => {
      const r = [...store.values()].find((x) => x.intentId === intentId);
      return r ? clone(r) : null;
    }),

    setGuestPaymentIntent: fake("setGuestPaymentIntent", async (id: string, piId: string, now: Date) => {
      if (!piId) throw new Error("setGuestPaymentIntent sem id de PI");
      return update(
        id,
        (r) => OPEN_UNPAID.includes(r.status) && req(r.hardStopAt) > now.getTime(),
        () => ({ guestPaymentIntentId: piId, claimSource: "guest", claimedAt: now, guestActiveAt: now }),
      );
    }),

    markGuestActive: fake("markGuestActive", async (id: string, now: Date) =>
      update(id, (r) => OPEN_UNPAID.includes(r.status) && req(r.hardStopAt) > now.getTime(), () => ({ guestActiveAt: now }))),

    setSmsStage: fake("setSmsStage", async (id: string, stage: number) => {
      if (stage !== 1 && stage !== 2) throw new Error(`sms_stage inválido: ${stage}`);
      return update(id, (r) => r.smsStage < stage, () => ({ smsStage: stage }));
    }),

    markRefundManual: fake("markRefundManual", async (id: string) =>
      update(
        id,
        (r) => r.refundStatus != null && !["succeeded", "pending", "nothing", "manual"].includes(r.refundStatus),
        () => ({ refundStatus: "manual" }),
      )),

    updateScheduledPaymentCard: fake(
      "updateScheduledPaymentCard",
      async (id: string, card: { paymentMethodId: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null }) =>
        update(id, (r) => OPEN_UNPAID.includes(r.status), () => ({
          paymentMethodId: card.paymentMethodId,
          cardBrand: card.brand?.slice(0, 32) ?? null,
          cardLast4: card.last4?.slice(0, 4) ?? null,
          cardExpMonth: card.expMonth,
          cardExpYear: card.expYear,
        })),
    ),

    insertCardMandate: fake("insertCardMandate", async (m: Record<string, any>) => {
      // UNIQUE(payment_intent_id): vários NULL (trocas de cartão) são aceites.
      if (m.paymentIntentId != null && mandates.some((x) => x.paymentIntentId === m.paymentIntentId)) return "exists" as const;
      mandates.push({ supersededAt: null, ...clone(m) });
      return "inserted" as const;
    }),

    supersedeCardMandates: fake("supersedeCardMandates", async (scheduledPaymentId: string, keepPaymentMethodId: string, now: Date) => {
      for (const m of mandates) {
        // ne(payment_method_id, keep) com NULL dá NULL em SQL: essa linha não muda.
        if (m.scheduledPaymentId === scheduledPaymentId && m.supersededAt == null && m.paymentMethodId != null && m.paymentMethodId !== keepPaymentMethodId) {
          m.supersededAt = now;
        }
      }
    }),

    pauseForHelp: fake("pauseForHelp", async (id: string, until: Date, reason: string) =>
      update(id, (r) => OPEN_UNPAID.includes(r.status), () => ({
        status: "needs_review", helpPausedUntil: until, reviewReason: reason.slice(0, 120), reviewDueAt: until,
      }))),

    markGuestyBalanceRecorded: fake("markGuestyBalanceRecorded", async (id: string, now: Date) =>
      update(id, (r) => r.guestyBalanceRecordedAt == null, () => ({ guestyBalanceRecordedAt: now }))),

    markGuestyCancelled: fake("markGuestyCancelled", async (id: string, now: Date) =>
      update(id, (r) => r.guestyCancelledAt == null, () => ({ guestyCancelledAt: now }))),

    markRefund: fake("markRefund", async (id: string, p: { refundId: string | null; refundCents: number; refundStatus: string }) => {
      if (p.refundCents !== null && (!Number.isInteger(p.refundCents) || p.refundCents < 0)) {
        throw new Error(`refundCents tem de ser um inteiro de cêntimos >= 0 (recebido ${p.refundCents})`);
      }
      return update(id, (r) => (p.refundId ? true : r.refundId == null), () => ({
        refundId: p.refundId,
        refundCents: p.refundCents,
        refundStatus: optionalText(p.refundStatus, 32),
      }));
    }),

    markCancelledUnpaid: fake("markCancelledUnpaid", async (id: string, now: Date) =>
      update(id, (r) => r.status === "cancelling", () => ({ status: "cancelled_unpaid", cancelledAt: now }))),

    markCancelledByGuest: fake("markCancelledByGuest", async (id: string, now: Date) =>
      update(id, (r) => r.status === "cancelling", () => ({ status: "cancelled_by_guest", cancelledAt: now }))),

    listPostChargeIncomplete: fake("listPostChargeIncomplete", async (scope: Scope) =>
      select(
        scope,
        (r) =>
          r.status === "succeeded" &&
          (r.guestyBalanceRecordedAt == null || r.noteClaimedAt == null || r.emailPaidClaimedAt == null),
        ascBy("succeededAt"),
      )),

    listForReconciliation: fake(
      "listForReconciliation",
      async (scope: Scope, p: { actionBefore: Date; staleBefore: Date; limit?: number }) =>
        select(
          scope,
          (r) =>
            ["scheduled", "retry", "needs_action", "needs_review"].includes(r.status) &&
            (req(r.nextAttemptAt) <= p.actionBefore.getTime() ||
              req(r.hardStopAt) <= p.actionBefore.getTime() ||
              r.lastReconciledAt == null ||
              req(r.lastReconciledAt) < p.staleBefore.getTime()),
          ascBy("lastReconciledAt", "nextAttemptAt"),
        ).slice(0, p.limit ?? 100),
    ),

    applyReconciliation: fake("applyReconciliation", async (id: string, snap: Record<string, any>, now: Date) => {
      if (snap.error != null && String(snap.error).trim()) return markReconcileErrorImpl(id, String(snap.error));
      const cents = (v: number | null | undefined, label: string): number | null => {
        if (v == null) return null;
        if (!Number.isFinite(v)) throw new Error(`${label} inválido na reconciliação: ${v}`);
        return Math.round(v);
      };
      const total = cents(snap.guestyTotalCents, "guestyTotalCents");
      const paid = cents(snap.guestyTotalPaidCents, "guestyTotalPaidCents");
      const pending = cents(snap.guestyPendingForeignCents, "guestyPendingForeignCents");
      return update(id, () => true, () => ({
        guestyStatus: optionalText(snap.guestyStatus, 32),
        guestyCheckIn: optionalText(snap.guestyCheckIn, 10),
        guestyCheckOut: optionalText(snap.guestyCheckOut, 10),
        guestyListingId: optionalText(snap.guestyListingId, 64),
        guestyTotalCents: total,
        guestyTotalPaidCents: paid,
        guestyPendingForeignCents: pending,
        lastReconciledAt: now,
        lastReconcileError: null,
      }));
    }),

    markReconcileError: fake("markReconcileError", async (id: string, error: string) => markReconcileErrorImpl(id, error)),

    getScheduledPaymentById: fake("getScheduledPaymentById", async (id: string) => {
      const r = store.get(id);
      return r ? clone(r) : null;
    }),

    getScheduledPaymentByBalancePi: fake("getScheduledPaymentByBalancePi", async (piId: string) => {
      if (!piId) return null;
      const rows = [...store.values()].filter((r) => r.balancePaymentIntentId === piId || r.guestPaymentIntentId === piId);
      if (rows.length > 1) throw new Error(`PI ${piId} ligado a mais de uma linha de saldo`);
      return rows[0] ? clone(rows[0]) : null;
    }),

    setBalanceHeartbeat: fake("setBalanceHeartbeat", async (now: Date, scope?: Scope) => {
      heartbeats.set(heartbeatKey(scope), now);
      return true;
    }),

    getBalanceHeartbeat: fake("getBalanceHeartbeat", async (scope?: Scope) => heartbeats.get(heartbeatKey(scope)) ?? null),

    listBalanceDigest: fake("listBalanceDigest", async (scope: Scope, _now: Date) => {
      assertScope(scope);
      return {
        counts: {}, upcoming7d: [], failing: [], review: [], cancelled24h: [],
        postChargeIncomplete: [], stuckCharging: [], stuckCancelling: [], refundFailures: [],
      };
    }),
  };

  /* ── Stripe falsa, com estado e idempotency keys ───────────────────────── */

  const defaultRefund = (_p: unknown): RefundResult => ({ refundId: "re_1", refundCents: 600_000, status: "succeeded" });
  const stripeState = {
    pis: new Map<string, FakePi>(),
    /** key de create → resposta guardada (a Stripe devolve-a tal e qual a uma key repetida). */
    createKeys: new Map<string, FakePi>(),
    confirmKeys: new Map<string, unknown>(),
    /** Resultado dos próximos confirms (por omissão: aprovado). */
    confirmPlan: [] as Behavior[],
    seq: 0,
    failRetrieve: (_id: string) => false,
    /** Quantas chamadas a cancelOpenPaymentIntent falham por rede antes de responder. */
    cancelFailures: 0,
    createError: null as Error | null,
    onCreate: null as null | ((pi: FakePi) => void),
    refund: defaultRefund as (p: any) => RefundResult,
    /** PIs da 1.ª parte, lidos por guestRefundPlan e depositCardLast4 (stripe-klarna.getPaymentIntent). */
    deposits: new Map<string, Record<string, any>>(),
    setupIntents: new Map<string, FakeSetupIntent>(),
    /** Relógio da Stripe para o `created` dos PIs criados (por omissão, a hora real). */
    clockMs: null as number | null,
  };
  /** A fórmula de stripe-balance.ts (balanceKeyBase), com o keyNonce. */
  const keyBase = (id: string, attempt: number, source: string, keyNonce?: string) =>
    `checkout-balance-${id}-a${attempt}-${source}${keyNonce ? `-${String(keyNonce).replace(/[^A-Za-z0-9_]/g, "").slice(0, 40)}` : ""}`;
  const createKey = (id: string, attempt: number, source: string, keyNonce?: string) => `${keyBase(id, attempt, source, keyNonce)}-create`;
  const confirmKey = (id: string, attempt: number, source: string, keyNonce?: string) => `${keyBase(id, attempt, source, keyNonce)}-confirm`;
  function registerPi(pi: FakePi, key?: string): FakePi {
    stripeState.pis.set(pi.id, pi);
    if (key) stripeState.createKeys.set(key, clone(pi));
    return pi;
  }

  const stripe = {
    createBalancePaymentIntent: fake("createBalancePaymentIntent", async (p: {
      scheduledPaymentId: string; attempt: number; source: string; amountCents: number; customer: string;
      paymentMethod?: string; description: string; metadata: Record<string, string>; keyNonce?: string;
    }) => {
      // As validações do real (stripe-balance.ts) antes de qualquer pedido.
      if (!Number.isInteger(p.attempt) || p.attempt < 1) throw new Error(`tentativa inválida (${p.attempt})`);
      if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) throw new Error(`valor inválido (${p.amountCents})`);
      if (typeof p.customer !== "string" || !p.customer.startsWith("cus_")) throw new Error("Customer da plataforma em falta");
      if (p.source !== "guest" && !p.paymentMethod) throw new Error("cobrança fora de sessão sem cartão guardado");
      if (!p.metadata?.intentId) throw new Error("metadata.intentId em falta");
      // A cobrança do servidor (chargeScheduledPayment: metadata com a
      // tentativa e a origem) só cria com a linha reclamada; o "Pagar agora"
      // da página cria o PI do hóspede sem claim, de propósito (o browser
      // confirma), também com keyNonce (o PI anterior do hóspede).
      if (p.metadata?.attempt !== undefined) {
        const row = store.get(p.scheduledPaymentId);
        if (!row || row.status !== "charging") violations.push(`create com a linha ${p.scheduledPaymentId} em ${row?.status ?? "—"}`);
        const claim = [...claims].reverse().find((c) => c.id === p.scheduledPaymentId);
        if (!claim) violations.push(`create sem claim (${p.scheduledPaymentId})`);
        else claim.creates++;
      }
      if (stripeState.createError) throw stripeState.createError;
      const key = createKey(p.scheduledPaymentId, p.attempt, p.source, p.keyNonce);
      const replay = stripeState.createKeys.get(key);
      if (replay) return clone(replay);
      const n = ++stripeState.seq;
      const pi = registerPi({
        id: `pi_bal_${n}`,
        object: "payment_intent",
        status: "requires_confirmation",
        amount: p.amountCents,
        customer: p.customer,
        payment_method: p.paymentMethod ?? null,
        created: Math.floor((stripeState.clockMs ?? Date.now()) / 1000),
        client_secret: `pi_bal_${n}_secret_x`,
        metadata: {
          ...p.metadata,
          flow: "card_v2_balance",
          part: "balance",
          scheduledPaymentId: p.scheduledPaymentId,
          attempt: String(p.attempt),
          source: p.source,
        },
      }, key);
      stripeState.onCreate?.(pi);
      return clone(pi);
    }),

    confirmBalanceOffSession: fake(
      "confirmBalanceOffSession",
      async (piId: string, p: { scheduledPaymentId: string; attempt: number; source: string; keyNonce?: string }): Promise<any> => {
        const row = store.get(p.scheduledPaymentId);
        const field = p.source === "guest" ? "guestPaymentIntentId" : "balancePaymentIntentId";
        if (!row || row.status !== "charging" || row[field] !== piId) {
          violations.push(`confirm de ${piId} sem a linha em charging com esse PI gravado (${row?.status}, ${row?.[field]})`);
        }
        const key = confirmKey(p.scheduledPaymentId, p.attempt, p.source, p.keyNonce);
        if (stripeState.confirmKeys.has(key)) return clone(stripeState.confirmKeys.get(key));
        const pi = stripeState.pis.get(piId);
        if (!pi) return { outcome: "error", message: `No such payment_intent: '${piId}'`, ambiguous: false, code: "resource_missing" };
        if (!["requires_confirmation", "requires_payment_method", "requires_action"].includes(pi.status)) {
          // 400 payment_intent_unexpected_state: stripe-balance.ts trata-o como ambíguo.
          const res = { outcome: "error", message: `This PaymentIntent's status is ${pi.status}`, ambiguous: true, code: "payment_intent_unexpected_state" };
          stripeState.confirmKeys.set(key, res);
          return clone(res);
        }
        const behavior = stripeState.confirmPlan.shift() ?? "succeed";
        let res: any;
        switch (behavior) {
          case "succeed":
            pi.status = "succeeded";
            res = { outcome: "succeeded", pi: clone(pi) };
            break;
          case "soft":
            pi.status = "requires_payment_method";
            res = { outcome: "declined", kind: "soft", declineCode: "insufficient_funds", message: "Your card has insufficient funds." };
            break;
          case "hard":
            pi.status = "requires_payment_method";
            res = { outcome: "declined", kind: "hard", declineCode: "expired_card", message: "Your card has expired." };
            break;
          case "auth":
            pi.status = "requires_payment_method";
            res = { outcome: "declined", kind: "auth", declineCode: "authentication_required", message: "This transaction requires authentication." };
            break;
          case "requires_action":
            pi.status = "requires_action";
            res = { outcome: "requires_action", pi: clone(pi) };
            break;
          case "processing":
            pi.status = "processing";
            res = { outcome: "processing", pi: clone(pi) };
            break;
          case "lost":
            // O pedido nunca chegou à Stripe: nada fica guardado na key.
            return { outcome: "error", message: "Request timed out", ambiguous: true, code: null };
          case "charged-lost":
            // Chegou e cobrou; a resposta perdeu-se. A Stripe guarda o resultado na key.
            pi.status = "succeeded";
            stripeState.confirmKeys.set(key, { outcome: "succeeded", pi: clone(pi) });
            return { outcome: "error", message: "socket hang up", ambiguous: true, code: null };
        }
        stripeState.confirmKeys.set(key, res);
        return clone(res);
      },
    ),

    retrieveBalancePaymentIntent: fake("retrieveBalancePaymentIntent", async (id: string) => {
      if (stripeState.failRetrieve(id)) throw new Error("Stripe indisponível (timeout)");
      const pi = stripeState.pis.get(id);
      if (!pi) throw new Error(`No such payment_intent: '${id}'`);
      return clone(pi);
    }),

    cancelOpenPaymentIntent: fake("cancelOpenPaymentIntent", async (id: string) => {
      if (stripeState.cancelFailures > 0) {
        stripeState.cancelFailures--;
        throw new Error("Stripe indisponível (timeout)");
      }
      const pi = stripeState.pis.get(id);
      if (!pi) throw new Error(`No such payment_intent: '${id}'`);
      if (pi.metadata?.part !== "balance" && pi.metadata?.flow !== "card_v2_balance") {
        throw new Error(`stripe-balance: ${id} não é um PI da 2.ª parte`);
      }
      if (pi.status === "succeeded") return "succeeded" as const;
      if (pi.status === "canceled") return "already-final" as const;
      if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status)) {
        throw new Error(`stripe-balance: PI ${id} em ${pi.status}, ainda não cancelável`);
      }
      pi.status = "canceled";
      return "canceled" as const;
    }),

    createCardChangeSetupIntent: fake("createCardChangeSetupIntent", async (p: { scheduledPaymentId: string; intentId: string; customer: string; now?: Date }) => {
      if (!/^cus_/.test(String(p.customer ?? ""))) throw new Error("stripe-balance: SetupIntent sem customer da plataforma");
      const id = `seti_${++stripeState.seq}`;
      const si: FakeSetupIntent = {
        id, status: "requires_payment_method", customer: p.customer, client_secret: `${id}_secret_x`,
        metadata: { flow: "card_v2_card_change", intentId: p.intentId, scheduledPaymentId: p.scheduledPaymentId }, payment_method: null,
      };
      stripeState.setupIntents.set(id, si);
      return clone(si);
    }),
    retrieveCardChangeSetupIntent: fake("retrieveCardChangeSetupIntent", async (id: string) => {
      const si = stripeState.setupIntents.get(id);
      if (!si) throw new Error(`No such setupintent: '${id}'`);
      return clone(si);
    }),
    allowRedisplay: fake("allowRedisplay", async (_pm: string) => undefined),

    refundRemaining: fake("refundRemaining", async (p: { paymentIntentId: string; intentId: string; scheduledPaymentId: string; reason: string; withholdCents?: number }) => {
      // Os reembolsos de cancelamento só depois da reserva cancelada no Guesty.
      if (["two_parts_unpaid", "two_parts_guest_cancel", "two_parts_admin_cancel"].includes(p.reason)) {
        const row = store.get(p.scheduledPaymentId);
        if (!row?.guestyCancelledAt) violations.push(`reembolso de ${p.paymentIntentId} sem a reserva cancelada no Guesty`);
      }
      return stripeState.refund(p);
    }),
  };
  /** stripe-klarna.getPaymentIntent (guestRefundPlan): 1.ª parte e PIs do saldo. */
  const klarna = {
    getPaymentIntent: fake("getPaymentIntent", async (id: string, ..._rest: unknown[]) => {
      const dep = stripeState.deposits.get(id);
      if (dep) return clone(dep);
      const pi = stripeState.pis.get(id);
      if (pi) return { ...clone(pi), amount_received: pi.status === "succeeded" ? pi.amount : 0, latest_charge: { amount_refunded: 0 } };
      throw new Error(`No such payment_intent: '${id}'`);
    }),
  };

  /* ── Guesty falso ──────────────────────────────────────────────────────── */

  const guestyState = {
    snapshots: new Map<string, Snapshot | null | Error>(),
    cancelResult: "canceled" as "canceled" | "already-canceled" | "refused" | "unknown",
  };
  const guesty = {
    readReservationSnapshot: fake("readReservationSnapshot", async (reservationId: string) => {
      const s = guestyState.snapshots.get(reservationId);
      if (s instanceof Error) throw s;
      return s ? clone(s) : null;
    }),
    cancelGuestyReservation: fake("cancelGuestyReservation", async (reservationId: string, _p: { reason: string; note: string }) => {
      const row = [...store.values()].find((r) => r.reservationId === reservationId);
      for (const id of [row?.balancePaymentIntentId, row?.guestPaymentIntentId]) {
        // O saldo já cobrado de uma reserva paga (o hóspede cancela e é
        // reembolsado) não é um PI "aberto".
        if (row?.succeededAt && id === row.balancePaymentIntentId) continue;
        const pi = id ? stripeState.pis.get(id) : undefined;
        // Aberto (pode ainda cobrar) é sempre proibido; pago só numa linha por
        // pagar (numa linha já paga, um 2.º pagamento devolve-o o webhook).
        const open = pi && pi.status !== "canceled" && pi.status !== "succeeded";
        const paidOnUnpaidRow = pi && pi.status === "succeeded" && !row?.succeededAt;
        if (open || paidOnUnpaidRow) violations.push(`reserva ${reservationId} cancelada no Guesty com o PI ${pi!.id} em ${pi!.status}`);
      }
      const r = guestyState.cancelResult;
      const s = guestyState.snapshots.get(reservationId);
      if (r === "canceled" && s && !(s instanceof Error)) s.status = "canceled";
      return r;
    }),
  };
  const guestyPay = {
    recordExternalPayment: fake(
      "recordExternalPayment",
      async (_res: string, _amount: number, _currency: string, _pi: string): Promise<"recorded" | "already-recorded" | "settled"> => "recorded",
    ),
    appendReservationNote: fake("appendReservationNote", async (_res: string, _note: string) => true),
  };

  /* ── Emails, SMS e links ───────────────────────────────────────────────── */

  const mail = {
    sendOpsAlert: fake("sendOpsAlert", async (_subject: string, _lines: string[], _opts?: { copyToSales?: boolean }) => true),
    sendBalanceReminder: fake("sendBalanceReminder", async (_d: any) => true),
    sendBalanceFailed: fake("sendBalanceFailed", async (_d: any) => true),
    sendBalanceLastCall: fake("sendBalanceLastCall", async (_d: any) => true),
    sendBalancePaid: fake("sendBalancePaid", async (_d: any) => true),
    sendBalanceCancelled: fake("sendBalanceCancelled", async (_d: any) => true),
    sendBalanceDigest: fake("sendBalanceDigest", async (_d: any) => true),
    sendBalanceCardUpdated: fake("sendBalanceCardUpdated", async (_d: any) => true),
    sendBalanceLinkEmail: fake("sendBalanceLinkEmail", async (_d: any) => true),
  };
  const sms = {
    sendBalanceFailedSms: fake("sendBalanceFailedSms", async (_d: any) => true),
    sendBalanceLastCallSms: fake("sendBalanceLastCallSms", async (_d: any) => true),
  };
  const links = {
    balanceLinkUrl: fake("balanceLinkUrl", (intentId: string, locale: string | null | undefined, expiresAt: Date) =>
      `https://www.portugalactive.com/${locale || "en"}/booking/balance/${intentId}#t=${Math.floor(expiresAt.getTime() / 1000)}.mac`),
  };

  function reset(): void {
    store.clear();
    claims.length = 0;
    heartbeats.clear();
    log.length = 0;
    violations.length = 0;
    tick = 0;
    stripeState.pis.clear();
    stripeState.createKeys.clear();
    stripeState.confirmKeys.clear();
    stripeState.confirmPlan.length = 0;
    stripeState.seq = 0;
    stripeState.failRetrieve = () => false;
    stripeState.cancelFailures = 0;
    stripeState.createError = null;
    stripeState.onCreate = null;
    stripeState.refund = defaultRefund;
    stripeState.deposits.clear();
    stripeState.setupIntents.clear();
    stripeState.clockMs = null;
    mandates.length = 0;
    guestyState.snapshots.clear();
    guestyState.cancelResult = "canceled";
    for (const [mock, impl] of registry) {
      mock.mockReset();
      mock.mockImplementation(impl);
    }
  }

  return {
    log, violations, store, claims, heartbeats, mandates, stripeState, guestyState, orig,
    db, stripe, klarna, guesty, guestyPay, mail, sms, links,
    reset, registerPi, createKey,
  };
});

vi.mock("../db", () => h.db);
vi.mock("./stripe-balance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe-balance")>();
  return { ...actual, ...h.stripe };
});
vi.mock("./guesty-balance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./guesty-balance")>();
  return { ...actual, ...h.guesty };
});
vi.mock("./guesty-openapi-paypal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./guesty-openapi-paypal")>();
  return { ...actual, ...h.guestyPay };
});
vi.mock("./stripe-klarna", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe-klarna")>();
  return { ...actual, ...h.klarna };
});
vi.mock("./transactional-email", () => h.mail);
vi.mock("./sms", () => h.sms);
// O link (URL) é falso e previsível; o token (HMAC, prazo) é o real.
vi.mock("./balance-link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./balance-link")>();
  return { ...actual, ...h.links };
});
// Rede de segurança: nenhum pedido real ao Guesty sai deste ficheiro.
vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyClient: { request: vi.fn(async () => { throw new Error("Guesty real proibido neste teste"); }) },
  };
});

import {
  balanceHealth,
  balanceScope,
  canRunBalanceEngine,
  cardExpiresBefore,
  chargeScheduledPayment,
  GUESTY_UNREADABLE_RETRY_MS,
  handleBalancePaymentSucceeded,
  hardStopAfterNotice,
  lastCallAt,
  nextRetryAt,
  noticePeriodComplete,
  reminderDue,
  retryDatesFor,
  runBalanceSweep,
  runCancellation,
  sendDailyBalanceDigest,
  STUCK_CHARGING_MS,
  resetBalanceAlertThrottle,
  cancellationKindFromReason,
  guestRefundPlan,
  guestBalanceView,
  prepareGuestPayment,
  startCardChange,
  finishCardChange,
  guestCancel,
  guestHelp,
  resendBalanceLink,
  guestIsActive,
  refundCardsFor,
  adminRefundPreview,
  isBalanceProductionService,
} from "./checkout-balance";
import { balanceLinkToken } from "./balance-link";
import { CARD_CHANGE_MANDATE_VERSION, renderCardChangeMandate } from "./two-parts-mandate";
import { lisbonWallTimeToUtc, twoPartsInstants, twoPartsSchedule } from "./payment-plan";

/* ════════════════════════════════════════════════════════════════
   Datas, linhas e utilitários
   ════════════════════════════════════════════════════════════════ */

type Row = CheckoutScheduledPayment;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const L = (ymd: string, hour: number, minute = 0) => lisbonWallTimeToUtc(ymd, hour, minute);
const plus = (d: Date, msDelta: number) => new Date(d.getTime() + msDelta);

/** D: fim do cancelamento gratuito (23:59). */
const D = L("2027-07-08", 23, 59);
/** C: 2.ª cobrança (10:00). */
const C = L("2027-06-28", 10);
const R1 = L("2027-06-29", 10);
const R2 = L("2027-07-01", 10);
/** H no caso normal: C + 7 às 12:00. */
const H = L("2027-07-05", 12);
/** Limite de H: D − 1 às 12:00. */
const D_MINUS_1 = L("2027-07-07", 12);
const E1 = L("2027-06-21", 9);
const E2 = L("2027-06-27", 9);
/** A reserva foi feita a 24 de outubro de 2026 (exemplo da spec 2.3). */
const CREATED = new Date("2026-10-24T15:00:00.000Z");

const ORIGIN = "www.portugalactive.com";
const LIVE: NodeJS.ProcessEnv = { STRIPE_SECRET_KEY: "sk_live_fake", SITE_URL: `https://${ORIGIN}` };
const LIVE_SCOPE = { livemode: true, siteOrigin: ORIGIN };
/** O id do serviço de produção no Render, como em server/lib/preview-isolation.ts. */
const PROD_SERVICE_ID = "srv-d700n5fgi27c73f9bse0";
const PROD_ENV: NodeJS.ProcessEnv = {
  ...LIVE,
  CHECKOUT_BALANCE: "true",
  NODE_ENV: "production",
  RENDER_SERVICE_ID: PROD_SERVICE_ID,
  RENDER_GIT_BRANCH: "main",
};

/** Linha n.º n: casa moderate, 10 000 € de estadia; 1.ª parte 6 000 € (5 000 de estadia + 1 000 de serviços), 2.ª 5 000 €. */
function rowN(n: number, over: Partial<Row> = {}): Row {
  const base: Row = {
    id: `sp-${n}`,
    intentId: `int-${n}`,
    livemode: true,
    siteOrigin: ORIGIN,
    reservationId: `res-${n}`,
    confirmationCode: `GY-${n}`,
    listingId: "lst-1",
    propertyName: "Villa Aura",
    checkIn: "2027-07-15",
    checkOut: "2027-07-22",
    email: "ana@example.com",
    phone: "+351912345678",
    locale: "pt",
    currency: "EUR",
    depositPaymentIntentId: `pi_dep_${n}`,
    depositCents: 600_000,
    depositStayCents: 500_000,
    balanceCents: 500_000,
    depositFiscalLines: null,
    stripeCustomerId: "cus_1",
    paymentMethodId: "pm_1",
    cardBrand: "visa",
    cardLast4: "4242",
    cardExpMonth: 12,
    cardExpYear: 2030,
    policyCode: "moderate",
    freeCancelDeadline: D,
    chargeAt: C,
    hardStopAt: H,
    nextAttemptAt: C,
    status: "scheduled",
    attempts: 0,
    claimPrevStatus: null,
    claimedAt: null,
    claimSource: null,
    guestActiveAt: null,
    lastDeclineCode: null,
    lastError: null,
    balancePaymentIntentId: null,
    guestPaymentIntentId: null,
    succeededAt: null,
    paidExternallyRef: null,
    failureNoticeSentAt: null,
    failureNoticeStage: 0,
    reminderStage: 0,
    smsStage: 0,
    helpPausedUntil: null,
    reviewReason: null,
    reviewDueAt: null,
    guestyDepositRecordedAt: CREATED,
    guestyBalanceClaimedAt: null,
    guestyBalanceRecordedAt: null,
    noteClaimedAt: null,
    emailPaidClaimedAt: null,
    invoiceClaimedAt: null,
    cancelPisClaimedAt: null,
    guestyCancelClaimedAt: null,
    refundClaimedAt: null,
    creditNoteClaimedAt: null,
    emailCancelClaimedAt: null,
    guestyStatus: null,
    guestyCheckIn: null,
    guestyCheckOut: null,
    guestyListingId: null,
    guestyTotalCents: null,
    guestyTotalPaidCents: null,
    guestyPendingForeignCents: null,
    lastReconciledAt: null,
    lastReconcileError: null,
    invoiceServicesRef: null,
    invoiceStayRef: null,
    invoiceBalanceRef: null,
    creditNoteRef: null,
    creditNoteDue: false,
    guestyCancelledAt: null,
    refundId: null,
    refundCents: null,
    refundStatus: null,
    cancelledAt: null,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
  return { ...base, ...over };
}

/** O registo da 1.ª parte que o settle pôs no Guesty, com o PI na nota. Vale
 *  5 000 €, exatamente o saldo: se não fosse reconhecido como nosso, cada
 *  cobrança parava como "paga por fora". */
function ourDepositRecord(r: Row) {
  return {
    id: `gp_dep_${r.id}`,
    amountCents: r.depositStayCents,
    status: "SUCCEEDED",
    note: `Stripe external payment (EUR) — PaymentIntent: ${r.depositPaymentIntentId}`,
    method: "OTHER",
  };
}
function snapshotFor(r: Row, over: Partial<ReservationSnapshot> = {}): ReservationSnapshot {
  return {
    status: "confirmed",
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    listingId: r.listingId,
    totalCents: 1_100_000,
    totalPaidCents: r.depositStayCents,
    payments: [ourDepositRecord(r)],
    ...over,
  };
}
function foreignPayment(amountCents: number, status = "SUCCEEDED") {
  return { id: `gp_ext_${amountCents}_${status}`, amountCents, status, note: "Transferência recebida pelo CS", method: "BANK_TRANSFER" };
}
function withForeign(r: Row, ...payments: ReturnType<typeof foreignPayment>[]): ReservationSnapshot {
  return snapshotFor(r, { payments: [ourDepositRecord(r), ...payments], totalPaidCents: r.depositStayCents + payments.reduce((a, p) => a + p.amountCents, 0) });
}

function seed(...rows: Row[]): void {
  for (const r of rows) {
    h.store.set(r.id, structuredClone(r));
    if (!h.guestyState.snapshots.has(r.reservationId)) h.guestyState.snapshots.set(r.reservationId, snapshotFor(r));
  }
}
const stored = (id = "sp-1"): Row => structuredClone(h.store.get(id)!);
function setSnapshot(r: Row, snap: ReservationSnapshot | null | Error): void {
  h.guestyState.snapshots.set(r.reservationId, snap);
}
/** Um PI do saldo que já existe na Stripe (opcionalmente com a key de create da tentativa que o criou). */
function seedPi(
  id: string,
  status: string,
  r: Row,
  createdBy?: { attempt: number; source: string; keyNonce?: string },
  createdAt: Date = CREATED,
): void {
  h.registerPi(
    {
      id,
      object: "payment_intent",
      status,
      amount: r.balanceCents,
      customer: r.stripeCustomerId,
      payment_method: r.paymentMethodId,
      created: Math.floor(createdAt.getTime() / 1000),
      client_secret: `${id}_secret_x`,
      metadata: {
        intentId: r.intentId,
        scheduledPaymentId: r.id,
        flow: "card_v2_balance",
        part: "balance",
        attempt: String(createdBy?.attempt ?? 1),
        source: createdBy?.source ?? "sweep",
      },
    },
    createdBy ? h.createKey(r.id, createdBy.attempt, createdBy.source, createdBy.keyNonce) : undefined,
  );
}
const piStatus = (id: string | null | undefined) => (id ? h.stripeState.pis.get(id)?.status : undefined);
/** Prazo do link: max(H, D) + 3 dias (balanceLinkExpiresAt). */
const expectedLink = (r: Row, hardStopAt: Date) =>
  `https://www.portugalactive.com/${r.locale}/booking/balance/${r.intentId}#t=${Math.floor((Math.max(hardStopAt.getTime(), new Date(r.freeCancelDeadline).getTime()) + 3 * DAY) / 1000)}.mac`;
const alertSubjects = () => h.mail.sendOpsAlert.mock.calls.map((c) => String(c[0]));
const sweep = (now: Date, env: NodeJS.ProcessEnv = LIVE) => runBalanceSweep(now, env);

/** As chamadas aparecem no log por esta ordem (outras podem estar no meio). */
function expectOrder(names: string[]): void {
  let from = -1;
  for (const name of names) {
    const i = h.log.indexOf(name, from + 1);
    expect(i, `"${name}" devia aparecer depois de [${names.slice(0, names.indexOf(name)).join(" → ")}]; log: ${h.log.join(", ")}`).toBeGreaterThan(from);
    from = i;
  }
}

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  h.reset();
  resetBalanceAlertThrottle();
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  for (const s of consoleSpies) s.mockRestore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expect(h.violations, "invariantes da Stripe/Guesty falsas").toEqual([]);
  expect(h.claims.filter((c) => c.creates > 1), "mais de um PaymentIntent criado no mesmo claim").toEqual([]);
});

/* ════════════════════════════════════════════════════════════════
   1. Calendário e guarda (puros)
   ════════════════════════════════════════════════════════════════ */

describe("calendário de referência (moderate, check-in 15 jul 2027)", () => {
  it("D, C, retentativas e H em UTC (verão, Lisboa = UTC+1)", () => {
    expect(D.toISOString()).toBe("2027-07-08T22:59:00.000Z");
    expect(C.toISOString()).toBe("2027-06-28T09:00:00.000Z");
    expect(R1.toISOString()).toBe("2027-06-29T09:00:00.000Z");
    expect(R2.toISOString()).toBe("2027-07-01T09:00:00.000Z");
    expect(H.toISOString()).toBe("2027-07-05T11:00:00.000Z");
    expect(D_MINUS_1.toISOString()).toBe("2027-07-07T11:00:00.000Z");
  });

  it("bate certo com o plano da Fase 1 (twoPartsSchedule + twoPartsInstants)", () => {
    const s = twoPartsSchedule("moderate", "2027-07-15")!;
    const i = twoPartsInstants(s);
    expect(i.freeCancelDeadlineAt).toEqual(D);
    expect(i.chargeAt).toEqual(C);
    expect(i.retryAt).toEqual([R1, R2]);
    expect(i.hardStopAt).toEqual(H);
  });
});

describe("retryDatesFor: C+1 e C+3 às 10:00 de Lisboa", () => {
  it("devolve as duas retentativas da spec", () => {
    expect(retryDatesFor(C)).toEqual([R1, R2]);
  });

  it("conta a partir do dia de Lisboa da cobrança, não do de UTC", () => {
    // 28 jun 23:30 UTC já é 29 jun 00:30 em Lisboa.
    expect(retryDatesFor(new Date("2027-06-28T23:30:00.000Z"))).toEqual([L("2027-06-30", 10), L("2027-07-02", 10)]);
  });

  it("atravessa a mudança para a hora de verão sem mudar a hora de parede", () => {
    // 2027: a hora muda a 28 de março. 27 mar ainda é UTC+0; 29 mar já é UTC+1.
    const [a, b] = retryDatesFor(L("2027-03-26", 10));
    expect(a.toISOString()).toBe("2027-03-27T10:00:00.000Z");
    expect(b.toISOString()).toBe("2027-03-29T09:00:00.000Z");
  });
});

describe("nextRetryAt", () => {
  const row = { chargeAt: C, hardStopAt: H };

  it("1.ª tentativa (em C) recusada → C+1 às 10:00", () => {
    expect(nextRetryAt(row, 1, plus(C, 5 * MIN))).toEqual(R1);
  });

  it("2.ª tentativa recusada → C+3 às 10:00", () => {
    expect(nextRetryAt(row, 2, plus(R1, 5 * MIN))).toEqual(R2);
  });

  it("3.ª tentativa recusada → null (acabaram as automáticas)", () => {
    expect(nextRetryAt(row, 3, plus(R2, 5 * MIN))).toBeNull();
  });

  it("sem tentativa feita → null", () => {
    expect(nextRetryAt(row, 0, plus(C, 5 * MIN))).toBeNull();
  });

  it("retentativa já passada (sweep atrasado) → daqui a uma hora", () => {
    const now = L("2027-07-03", 9);
    expect(nextRetryAt(row, 2, now)).toEqual(plus(now, HOUR));
  });

  it("retentativa que cairia em H → null", () => {
    expect(nextRetryAt({ chargeAt: C, hardStopAt: R1 }, 1, plus(C, 5 * MIN))).toBeNull();
  });

  it("retentativa adiada (agora + 1 h) que já cai depois de H → null", () => {
    expect(nextRetryAt(row, 2, plus(H, -30 * MIN))).toBeNull();
  });

  it("um minuto antes de H ainda vale", () => {
    expect(nextRetryAt({ chargeAt: C, hardStopAt: plus(R1, MIN) }, 1, plus(C, 5 * MIN))).toEqual(R1);
  });

  it("uma tentativa a mais pelo meio (admin) não salta uma retentativa ainda por vir", () => {
    expect(nextRetryAt(row, 2, plus(C, 5 * HOUR))).toEqual(R1);
    expect(nextRetryAt(row, 3, plus(R1, 5 * MIN))).toEqual(R2);
    expect(nextRetryAt(row, 4, plus(R2, 5 * MIN))).toBeNull();
  });
});

describe("hardStopAfterNotice: H conta do aviso escrito, limitado a D − 1 às 12:00", () => {
  const row = { chargeAt: C, freeCancelDeadline: D };

  it("aviso no dia da falha → H = C + 7 às 12:00, aviso completo", () => {
    expect(hardStopAfterNotice(row, plus(C, 5 * MIN))).toEqual({ hardStopAt: H, complete: true });
  });

  it("aviso atrasado → H passa para aviso + 7 dias (sai das 12:00)", () => {
    expect(hardStopAfterNotice(row, L("2027-06-29", 13))).toEqual({ hardStopAt: L("2027-07-06", 13), complete: true });
  });

  it("aviso + 7 dias exatamente em D − 1 às 12:00 → ainda completo", () => {
    expect(hardStopAfterNotice(row, L("2027-06-30", 12))).toEqual({ hardStopAt: D_MINUS_1, complete: true });
  });

  it("aviso tão atrasado que os 7 dias passam D − 1 → H fica em D − 1 e complete=false", () => {
    expect(hardStopAfterNotice(row, L("2027-07-01", 15))).toEqual({ hardStopAt: D_MINUS_1, complete: false });
    expect(hardStopAfterNotice(row, plus(L("2027-06-30", 12), MIN))).toEqual({ hardStopAt: D_MINUS_1, complete: false });
  });

  it.each(["moderate", "firm", "strict", "strict_60"])("%s: aviso em C dá o H do plano da Fase 1", (policy) => {
    const i = twoPartsInstants(twoPartsSchedule(policy, "2027-09-30")!);
    expect(hardStopAfterNotice({ chargeAt: i.chargeAt, freeCancelDeadline: i.freeCancelDeadlineAt }, plus(i.chargeAt, 5 * MIN)))
      .toEqual({ hardStopAt: i.hardStopAt, complete: true });
  });
});

describe("noticePeriodComplete", () => {
  const sent = plus(C, 5 * MIN);

  it("sem aviso enviado → false", () => {
    expect(noticePeriodComplete({ failureNoticeSentAt: null }, plus(H, DAY))).toBe(false);
  });

  it("um milissegundo antes dos 7 dias → false; aos 7 dias → true", () => {
    expect(noticePeriodComplete({ failureNoticeSentAt: sent }, plus(sent, 7 * DAY - 1))).toBe(false);
    expect(noticePeriodComplete({ failureNoticeSentAt: sent }, plus(sent, 7 * DAY))).toBe(true);
  });
});

describe("reminderDue: E1 a C − 7 e E2 a C − 1, às 09:00 de Lisboa", () => {
  const row = (reminderStage: number, createdAt: Date = CREATED) => ({ chargeAt: C, reminderStage, createdAt });

  it("E1 e E2 às 09:00 de Lisboa (08:00 UTC no verão)", () => {
    expect(E1.toISOString()).toBe("2027-06-21T08:00:00.000Z");
    expect(E2.toISOString()).toBe("2027-06-27T08:00:00.000Z");
  });

  it("nada antes de C − 7 às 09:00", () => {
    expect(reminderDue(row(0), plus(E1, -1))).toBeNull();
  });

  it("E1 a C − 7 às 09:00", () => {
    expect(reminderDue(row(0), E1)).toEqual({ to: 1, send: true });
  });

  it("confirmação com menos de 48 h: o E1 consome-se sem enviar (salta para o E2)", () => {
    expect(reminderDue(row(0, plus(E1, -47 * HOUR)), E1)).toEqual({ to: 1, send: false });
    expect(reminderDue(row(0, plus(E1, -48 * HOUR)), E1)).toEqual({ to: 1, send: true });
  });

  it("depois do E1, nada até ao E2", () => {
    expect(reminderDue(row(1), plus(E1, 3 * DAY))).toBeNull();
    expect(reminderDue(row(1), plus(E2, -1))).toBeNull();
  });

  it("E2 a C − 1 às 09:00", () => {
    expect(reminderDue(row(1), E2)).toEqual({ to: 2, send: true });
  });

  it("os dois atrasados (sweep parado) → só o E2", () => {
    expect(reminderDue(row(0), plus(E2, 2 * HOUR))).toEqual({ to: 2, send: true });
  });

  it("já depois de C → consome o E2 sem enviar", () => {
    expect(reminderDue(row(0), plus(C, MIN))).toEqual({ to: 2, send: false });
    expect(reminderDue(row(1), C)).toEqual({ to: 2, send: false });
  });

  it("com os dois lembretes feitos → null", () => {
    expect(reminderDue(row(2), plus(E2, HOUR))).toBeNull();
  });
});

describe("cardExpiresBefore (último dia do mês de validade)", () => {
  it("cartão válido muito depois de C → false", () => {
    expect(cardExpiresBefore({ cardExpMonth: 12, cardExpYear: 2030 }, C)).toBe(false);
  });

  it("expira no fim do próprio mês de C → false (ainda serve a 28 de junho)", () => {
    expect(cardExpiresBefore({ cardExpMonth: 6, cardExpYear: 2027 }, C)).toBe(false);
  });

  it("expira no mês anterior a C → true", () => {
    expect(cardExpiresBefore({ cardExpMonth: 5, cardExpYear: 2027 }, C)).toBe(true);
  });

  it("fronteira: último milissegundo do mês ainda vale, o primeiro do mês seguinte não", () => {
    expect(cardExpiresBefore({ cardExpMonth: 6, cardExpYear: 2027 }, new Date("2027-06-30T23:59:59.999Z"))).toBe(false);
    expect(cardExpiresBefore({ cardExpMonth: 6, cardExpYear: 2027 }, new Date("2027-07-01T00:00:00.000Z"))).toBe(true);
  });

  it("dezembro passa para janeiro do ano seguinte", () => {
    expect(cardExpiresBefore({ cardExpMonth: 12, cardExpYear: 2026 }, new Date("2026-12-31T12:00:00.000Z"))).toBe(false);
    expect(cardExpiresBefore({ cardExpMonth: 12, cardExpYear: 2026 }, new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("sem validade conhecida → false (não pede para trocar o cartão às cegas)", () => {
    expect(cardExpiresBefore({ cardExpMonth: null, cardExpYear: null }, C)).toBe(false);
  });
});

describe("lastCallAt: véspera de H (dia de Lisboa) às 10:00", () => {
  it("H a 5 jul 12:00 → 4 jul 10:00", () => {
    expect(lastCallAt(H)).toEqual(L("2027-07-04", 10));
    expect(lastCallAt(H).toISOString()).toBe("2027-07-04T09:00:00.000Z");
  });

  it("H logo depois da meia-noite de Lisboa (ainda dia anterior em UTC) → véspera pelo dia de Lisboa", () => {
    const hJustAfterMidnight = L("2027-07-06", 0, 30);
    expect(hJustAfterMidnight.toISOString()).toBe("2027-07-05T23:30:00.000Z");
    expect(lastCallAt(hJustAfterMidnight)).toEqual(L("2027-07-05", 10));
  });

  it("no inverno (Lisboa = UTC)", () => {
    expect(lastCallAt(L("2027-01-10", 12)).toISOString()).toBe("2027-01-09T10:00:00.000Z");
  });
});

describe("canRunBalanceEngine: só o serviço de produção, com a flag", () => {
  it("liga com CHECKOUT_BALANCE=true, NODE_ENV=production e o serviço de produção", () => {
    expect(canRunBalanceEngine(PROD_ENV)).toBe(true);
  });

  it("o processo de testes nunca o liga (process.env por omissão)", () => {
    expect(canRunBalanceEngine()).toBe(false);
  });

  it.each([
    ["flag ausente", { CHECKOUT_BALANCE: undefined }],
    ["flag '1'", { CHECKOUT_BALANCE: "1" }],
    ["flag 'TRUE'", { CHECKOUT_BALANCE: "TRUE" }],
    ["CHECKOUT_BALANCE=false (desligar sem deploy)", { CHECKOUT_BALANCE: "false" }],
    ["NODE_ENV development", { NODE_ENV: "development" }],
    ["NODE_ENV test", { NODE_ENV: "test" }],
    ["sem RENDER_SERVICE_ID (fora do Render)", { RENDER_SERVICE_ID: undefined }],
    ["outro serviço do Render (DEV/preview)", { RENDER_SERVICE_ID: "srv-dev0000000000000000" }],
    ["APP_ENV=preview", { APP_ENV: "preview" }],
    ["branch que não é a main", { RENDER_GIT_BRANCH: "feat/two-parts-fase2" }],
    ["SITE_URL de outro site", { SITE_URL: "https://dev.portugalactive.com" }],
    ["SITE_URL ilegível", { SITE_URL: "isto não é um url" }],
  ])("desliga: %s", (_label, patch) => {
    expect(canRunBalanceEngine({ ...PROD_ENV, ...patch } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("balanceScope", () => {
  it("livemode pela chave Stripe e origem pelo SITE_URL", () => {
    expect(balanceScope(LIVE)).toEqual(LIVE_SCOPE);
    expect(balanceScope({ ...LIVE, STRIPE_SECRET_KEY: "sk_test_x" })).toEqual({ livemode: false, siteOrigin: ORIGIN });
  });

  it("sem chave conta como live (na dúvida, fechado) e sem SITE_URL a origem é 'unknown'", () => {
    expect(balanceScope({})).toEqual({ livemode: true, siteOrigin: "unknown" });
  });
});

/* ════════════════════════════════════════════════════════════════
   2. chargeScheduledPayment
   ════════════════════════════════════════════════════════════════ */

describe("chargeScheduledPayment", () => {
  const NOW = plus(C, MIN);

  it("caminho feliz: claim → Guesty → criar PI exato → gravar id → confirmar fora de sessão → succeeded", async () => {
    seed(rowN(1));
    expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("succeeded");

    expectOrder([
      "claimScheduledPaymentForCharge",
      "getScheduledPaymentById",
      "readReservationSnapshot",
      "createBalancePaymentIntent",
      "setBalancePaymentIntentId",
      "confirmBalanceOffSession",
      "markScheduledPaymentSucceeded",
    ]);
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledWith({
      scheduledPaymentId: "sp-1",
      attempt: 1,
      source: "sweep",
      // Sem PI anterior: a key leva "first"; uma retoma depois de um PI cancelado leva o id dele.
      keyNonce: "first",
      amountCents: 500_000,
      customer: "cus_1",
      paymentMethod: "pm_1",
      description: "Estadia Villa Aura 2027-07-15: 2.a parte",
      metadata: {
        intentId: "int-1",
        scheduledPaymentId: "sp-1",
        reservationId: "res-1",
        confirmationCode: "GY-1",
        attempt: "1",
        source: "sweep",
      },
    });
    const piId = "pi_bal_1";
    expect(h.db.setBalancePaymentIntentId).toHaveBeenCalledWith("sp-1", "balancePaymentIntentId", piId);
    expect(h.stripe.confirmBalanceOffSession).toHaveBeenCalledWith(piId, { scheduledPaymentId: "sp-1", attempt: 1, source: "sweep", keyNonce: "first" });
    expect(h.stripe.confirmBalanceOffSession).toHaveBeenCalledTimes(1);
    expect(stored()).toMatchObject({
      status: "succeeded",
      balancePaymentIntentId: piId,
      attempts: 1,
      claimSource: "sweep",
      claimedAt: NOW,
      succeededAt: NOW,
    });
    expect(piStatus(piId)).toBe("succeeded");
    // Nenhuma chamada para cancelar ou reler: não havia PI anterior.
    expect(h.stripe.retrieveBalancePaymentIntent).not.toHaveBeenCalled();
    expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
  });

  it("duas chamadas em paralelo com a mesma leitura: um só claim e um só PaymentIntent", async () => {
    seed(rowN(1));
    const row = stored();
    const results = await Promise.all([
      chargeScheduledPayment(structuredClone(row), "sweep", NOW),
      chargeScheduledPayment(structuredClone(row), "sweep", NOW),
    ]);
    expect(results.sort()).toEqual(["not-claimed", "succeeded"]);
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
  });

  describe("recusas", () => {
    it("soft na 1.ª tentativa → retry marcado para C+1 às 10:00", async () => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push("soft");
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("retry");
      expect(stored()).toMatchObject({
        status: "retry",
        nextAttemptAt: R1,
        attempts: 1,
        lastDeclineCode: "insufficient_funds",
        lastError: "Your card has insufficient funds.",
        balancePaymentIntentId: "pi_bal_1",
      });
      expect(h.db.markScheduledPaymentNeedsAction).not.toHaveBeenCalled();
    });

    it("soft na 2.ª tentativa → o PI anterior é cancelado, um novo é criado, retry para C+3", async () => {
      const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, balancePaymentIntentId: "pi_prev", lastDeclineCode: "insufficient_funds", failureNoticeStage: 1 });
      seed(row);
      seedPi("pi_prev", "requires_payment_method", row, { attempt: 1, source: "sweep" });
      h.stripeState.confirmPlan.push("soft");
      expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("retry");
      expect(piStatus("pi_prev")).toBe("canceled");
      expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2, keyNonce: "pi_prev" }));
      expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: R2, attempts: 2, balancePaymentIntentId: "pi_bal_1" });
      expectOrder(["retrieveBalancePaymentIntent", "cancelOpenPaymentIntent", "readReservationSnapshot", "createBalancePaymentIntent"]);
    });

    it("soft na 3.ª tentativa → needs_action (sem mais automáticas)", async () => {
      const row = rowN(1, { status: "retry", attempts: 2, nextAttemptAt: R2, balancePaymentIntentId: "pi_prev", lastDeclineCode: "insufficient_funds", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN) });
      seed(row);
      seedPi("pi_prev", "requires_payment_method", row, { attempt: 2, source: "sweep" });
      h.stripeState.confirmPlan.push("soft");
      expect(await chargeScheduledPayment(stored(), "sweep", plus(R2, MIN))).toBe("needs_action");
      expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ attempt: 3 }));
      expect(stored()).toMatchObject({ status: "needs_action", attempts: 3, lastDeclineCode: "insufficient_funds", balancePaymentIntentId: "pi_bal_1" });
      expect(h.db.markScheduledPaymentRetry).not.toHaveBeenCalled();
    });

    it.each([
      ["hard", "expired_card"],
      ["auth", "authentication_required"],
    ] as const)("recusa %s → needs_action (%s), nunca nova tentativa automática", async (kind, code) => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push(kind);
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("needs_action");
      expect(stored()).toMatchObject({ status: "needs_action", lastDeclineCode: code, attempts: 1 });
      expect(h.db.markScheduledPaymentRetry).not.toHaveBeenCalled();
    });

    it("o banco pede 3DS (requires_action) → needs_action com authentication_required", async () => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push("requires_action");
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("needs_action");
      expect(stored()).toMatchObject({
        status: "needs_action",
        lastDeclineCode: "authentication_required",
        lastError: "o banco pede confirmacao (3DS)",
      });
    });

    it("recusa soft numa tentativa do hóspede → needs_action (só o sweep agenda retentativas)", async () => {
      const row = rowN(1, { status: "needs_action", attempts: 1, nextAttemptAt: C, lastDeclineCode: "expired_card", failureNoticeStage: 1 });
      seed(row);
      h.stripeState.confirmPlan.push("soft");
      expect(await chargeScheduledPayment(stored(), "guest", plus(R1, 3 * HOUR))).toBe("needs_action");
      expect(h.db.setBalancePaymentIntentId).toHaveBeenCalledWith("sp-1", "guestPaymentIntentId", "pi_bal_1");
      expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ source: "guest", attempt: 2 }));
      expect(stored()).toMatchObject({ status: "needs_action", guestPaymentIntentId: "pi_bal_1", claimSource: "guest" });
    });
  });

  describe("resultado desconhecido (erro técnico no confirm)", () => {
    it("erro ambíguo e o PI afinal cobrou → succeeded", async () => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push("charged-lost");
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("succeeded");
      expectOrder(["confirmBalanceOffSession", "retrieveBalancePaymentIntent", "markScheduledPaymentSucceeded"]);
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_1" });
    });

    it("erro ambíguo e o PI continua por confirmar → released daqui a 1 h, tentativa descontada", async () => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push("lost");
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("released");
      const after = stored();
      expect(after).toMatchObject({ status: "scheduled", attempts: 0, nextAttemptAt: plus(NOW, HOUR), balancePaymentIntentId: "pi_bal_1" });
      expect(after.lastError).toMatch(/^confirmar: /);
      expect(h.db.markScheduledPaymentRetry).not.toHaveBeenCalled();
      expect(h.db.markScheduledPaymentNeedsAction).not.toHaveBeenCalled();
    });

    it("erro ambíguo e a releitura falha → processing (fica em charging para o sweep das presas)", async () => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push("lost");
      h.stripeState.failRetrieve = (id) => id === "pi_bal_1";
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("processing");
      expect(stored()).toMatchObject({ status: "charging", attempts: 1, balancePaymentIntentId: "pi_bal_1" });
    });

    it("confirm em processing → processing, a linha fica em charging", async () => {
      seed(rowN(1));
      h.stripeState.confirmPlan.push("processing");
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("processing");
      expect(stored().status).toBe("charging");
    });

    it("criar o PI falha → released daqui a 1 h, sem confirm", async () => {
      seed(rowN(1));
      h.stripeState.createError = new Error("Stripe 500");
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("released");
      expect(stored()).toMatchObject({ status: "scheduled", attempts: 0, nextAttemptAt: plus(NOW, HOUR), lastError: "criar PI: Stripe 500" });
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
    });
  });

  describe("leitura do Guesty antes de cobrar", () => {
    it.each([
      ["null (leitura inválida)", null],
      ["erro", new Error("Guesty 503")],
    ])("Guesty ilegível (%s) → released daqui a 1 h, sem tocar na Stripe", async (_label, snap) => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, snap);
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("released");
      expect(stored()).toMatchObject({
        status: "scheduled",
        attempts: 0,
        nextAttemptAt: plus(NOW, GUESTY_UNREADABLE_RETRY_MS),
        lastError: "reserva Guesty ilegivel antes da cobranca",
      });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
      expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
    });

    it.each(["canceled", "cancelled", "inquiry", "declined"])("reserva em %s no Guesty → needs_review e alerta, sem tocar na Stripe", async (status) => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, snapshotFor(row, { status }));
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("needs_review");
      expect(stored()).toMatchObject({
        status: "needs_review",
        reviewReason: `reserva Guesty em ${status}`,
        reviewDueAt: H,
        attempts: 0,
      });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte suspensa — GY-1")]);
      expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toBe(`Estado no Guesty: ${status}.`);
    });

    it.each([
      ["o saldo inteiro", 500_000],
      ["o saldo menos 1 € (tolerância)", 499_900],
      ["mais do que o saldo", 650_000],
    ])("pagamento de terceiros com %s → paid_externally, sem tocar na Stripe", async (_label, cents) => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, withForeign(row, foreignPayment(cents)));
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("paid_externally");
      expect(stored()).toMatchObject({ status: "paid_externally", paidExternallyRef: `guesty:${(cents / 100).toFixed(2)} EUR` });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte já paga por fora")]);
    });

    it.each([
      [100_000, "1000.00"],
      [499_899, "4998.99"],
    ])("pagamento parcial de terceiros (%i) → needs_review, sem tocar na Stripe", async (cents, label) => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, withForeign(row, foreignPayment(cents)));
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("needs_review");
      expect(stored()).toMatchObject({ status: "needs_review", reviewReason: `pagamento parcial por fora (${label} EUR)`, reviewDueAt: H });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte suspensa — GY-1")]);
    });

    it("pagamento PENDENTE de terceiros (payment link do Guesty) → needs_review e alerta, sem cobrar por cima", async () => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, withForeign(row, foreignPayment(500_000, "PENDING")));
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("needs_review");
      expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "pagamento pendente no Guesty (payment link?)", reviewDueAt: H, attempts: 0 });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toContain("5000.00 EUR pendentes");
    });

    it.each([
      ["check-in", { checkIn: "2027-07-16" }],
      ["check-out", { checkOut: "2027-07-21" }],
      ["casa", { listingId: "lst-9" }],
    ])("%s diferente no Guesty → needs_review até H e alerta, sem cobrar", async (_label, change) => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, snapshotFor(row, change));
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("needs_review");
      expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "datas ou casa alteradas no Guesty", reviewDueAt: H });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte suspensa — GY-1")]);
    });

    it("Guesty ilegível há mais de 6 h desde C → alerta ao ops, no máximo um a cada 6 h", async () => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, null);
      // 5 h depois de C: só adia, sem alerta.
      expect(await chargeScheduledPayment(stored(), "sweep", plus(C, 5 * HOUR))).toBe("released");
      expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
      // 6 h e 1 min depois de C: adia e alerta.
      h.store.get("sp-1")!.nextAttemptAt = C;
      expect(await chargeScheduledPayment(stored(), "sweep", plus(C, 6 * HOUR + MIN))).toBe("released");
      expect(alertSubjects()).toEqual([expect.stringContaining("Guesty ilegível há mais de 6 h — GY-1")]);
      // A tentativa seguinte, logo a seguir: o travão de 6 h não repete o alerta.
      h.store.get("sp-1")!.nextAttemptAt = C;
      expect(await chargeScheduledPayment(stored(), "sweep", plus(C, 7 * HOUR + 2 * MIN))).toBe("released");
      expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
      // Passadas 6 h no relógio real, volta a avisar.
      const realNow = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(realNow + 6 * HOUR + MIN);
      h.store.get("sp-1")!.nextAttemptAt = C;
      expect(await chargeScheduledPayment(stored(), "sweep", plus(C, 13 * HOUR))).toBe("released");
      expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(2);
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("pagamentos anulados de terceiros não contam", async () => {
      const row = rowN(1);
      seed(row);
      setSnapshot(row, withForeign(row, foreignPayment(500_000, "FAILED"), foreignPayment(500_000, "CANCELED")));
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("succeeded");
    });
  });

  describe("PI de uma tentativa anterior", () => {
    it("já cobrou (webhook perdido) → succeeded sem criar outro PI", async () => {
      const row = rowN(1, { balancePaymentIntentId: "pi_prev", attempts: 0 });
      seed(row);
      seedPi("pi_prev", "succeeded", row);
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("succeeded");
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
      expect(h.guesty.readReservationSnapshot).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_prev" });
    });

    it.each(["processing", "requires_capture"])("em %s → processing, sem PI novo nem cancelamento", async (status) => {
      const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, balancePaymentIntentId: "pi_prev" });
      seed(row);
      seedPi("pi_prev", status, row);
      expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("processing");
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ status: "charging", attempts: 2 });
    });

    it("aberto (requires_action) → cancelado antes de criar o novo", async () => {
      const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, balancePaymentIntentId: "pi_prev" });
      seed(row);
      seedPi("pi_prev", "requires_action", row, { attempt: 1, source: "sweep" });
      expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("succeeded");
      expect(piStatus("pi_prev")).toBe("canceled");
      expectOrder(["cancelOpenPaymentIntent", "createBalancePaymentIntent"]);
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_1" });
    });

    it("o cancelamento revela que acabou de cobrar → succeeded com esse PI, sem criar outro", async () => {
      const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, balancePaymentIntentId: "pi_prev" });
      seed(row);
      seedPi("pi_prev", "requires_action", row);
      h.stripe.cancelOpenPaymentIntent.mockImplementationOnce(async () => "succeeded");
      expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("succeeded");
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_prev" });
    });

    it("ilegível na Stripe → released daqui a 1 h, sem ler o Guesty nem criar PI", async () => {
      const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, balancePaymentIntentId: "pi_prev" });
      seed(row);
      seedPi("pi_prev", "requires_payment_method", row);
      h.stripeState.failRetrieve = (id) => id === "pi_prev";
      expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("released");
      const after = stored();
      expect(after).toMatchObject({ status: "retry", attempts: 1, nextAttemptAt: plus(R1, MIN + HOUR) });
      expect(after.lastError).toMatch(/^PI anterior ilegivel: /);
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.guesty.readReservationSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("PI do hóspede (página do saldo)", () => {
    const AT = plus(R1, MIN);
    const withGuestPi = (over: Partial<Row> = {}) =>
      rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, failureNoticeStage: 1, guestPaymentIntentId: "pi_g", claimSource: "guest", claimedAt: plus(AT, -10 * MIN), ...over });

    it("hóspede a confirmar o 3DS há menos de 1 h → o sweep espera 30 min, sem cancelar nem criar PI", async () => {
      const row = withGuestPi();
      seed(row);
      seedPi("pi_g", "requires_action", row, { attempt: 1, source: "guest" }, plus(AT, -10 * MIN));
      expect(await chargeScheduledPayment(stored(), "sweep", AT)).toBe("released");
      expect(stored()).toMatchObject({ status: "retry", attempts: 1, nextAttemptAt: plus(AT, 30 * MIN), lastError: "hospede a pagar na pagina" });
      expect(piStatus("pi_g")).toBe("requires_action");
      expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("PI do hóspede abandonado há mais de 1 h → cancelado e o sweep cobra com um PI seu", async () => {
      // claimed_at recente (o próprio sweep reclamou há pouco) mas o PI do hóspede tem 2 h: não espera.
      const row = withGuestPi({ claimedAt: plus(AT, -5 * MIN), claimSource: "sweep" });
      seed(row);
      seedPi("pi_g", "requires_action", row, { attempt: 1, source: "guest" }, plus(AT, -2 * HOUR));
      expect(await chargeScheduledPayment(stored(), "sweep", AT)).toBe("succeeded");
      expect(piStatus("pi_g")).toBe("canceled");
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_1" });
    });

    it("PI do hóspede já pago → succeeded com esse PI, sem cobrar outra vez", async () => {
      const row = withGuestPi({ balancePaymentIntentId: "pi_prev" });
      seed(row);
      seedPi("pi_g", "succeeded", row, { attempt: 1, source: "guest" });
      seedPi("pi_prev", "requires_payment_method", row);
      expect(await chargeScheduledPayment(stored(), "sweep", AT)).toBe("succeeded");
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_g" });
    });
  });

  describe("claim e H", () => {
    it.each([
      ["outra instância já está a cobrar", { status: "charging" as const, claimedAt: C, claimSource: "sweep" as const, attempts: 1 }],
      ["outra instância já recusou e marcou a retentativa", { status: "retry" as const, attempts: 1, nextAttemptAt: R1 }],
      ["já paga", { status: "succeeded" as const, attempts: 1 }],
      ["em revisão", { status: "needs_review" as const }],
      ["pausada pelo hóspede (Preciso de ajuda)", { helpPausedUntil: plus(NOW, DAY) }],
      ["só o hóspede resolve (needs_action)", { status: "needs_action" as const, attempts: 1 }],
    ])("claim perdido (%s) → not-claimed, nenhuma chamada à Stripe nem ao Guesty", async (_label, live) => {
      const leitura = rowN(1);
      seed(rowN(1, live));
      expect(await chargeScheduledPayment(leitura, "sweep", NOW)).toBe("not-claimed");
      expect(h.stripe.retrieveBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
      expect(h.guesty.readReservationSnapshot).not.toHaveBeenCalled();
    });

    it("em H ou depois → not-claimed, sem sequer tentar o claim", async () => {
      seed(rowN(1, { status: "retry", attempts: 2, nextAttemptAt: R2 }));
      expect(await chargeScheduledPayment(stored(), "sweep", H)).toBe("not-claimed");
      expect(await chargeScheduledPayment(stored(), "sweep", plus(H, DAY))).toBe("not-claimed");
      expect(h.db.claimScheduledPaymentForCharge).not.toHaveBeenCalled();
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("leitura com H antigo mas H já passou na BD → o claim recusa e nada se cobra", async () => {
      seed(rowN(1, { status: "retry", attempts: 2, nextAttemptAt: R2 }));
      const leitura = { ...stored(), hardStopAt: plus(H, DAY) };
      expect(await chargeScheduledPayment(leitura, "sweep", plus(H, MIN))).toBe("not-claimed");
      expect(h.db.claimScheduledPaymentForCharge).toHaveBeenCalledTimes(1);
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("a linha sai de charging entre criar e gravar o PI → o PI novo é cancelado e não se confirma", async () => {
      seed(rowN(1));
      h.stripeState.onCreate = () => {
        // O admin pôs a linha em revisão enquanto o create estava em curso.
        h.store.get("sp-1")!.status = "needs_review";
      };
      expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("not-claimed");
      expect(h.stripe.cancelOpenPaymentIntent).toHaveBeenCalledWith("pi_bal_1");
      expect(piStatus("pi_bal_1")).toBe("canceled");
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ status: "needs_review", balancePaymentIntentId: null });
    });
  });
});

/**
 * Regressão (era BUG): releaseChargeClaim desconta a tentativa, por isso a
 * seguinte volta a usar o mesmo número. Sem o keyNonce na idempotency key, o
 * create repetido devolvia da Stripe o PI já cancelado e a linha ficava
 * presa, hora a hora, até a key ser podada (spec 3.1 ponto 3). Agora a key
 * leva o PI anterior desta origem ("first" na primeira).
 */
describe("retoma depois de libertar uma tentativa com PI gravado: PI novo, key nova", () => {
  it("confirm perdido na rede → released; uma hora depois cobra com um PI NOVO (key com o PI anterior)", async () => {
    seed(rowN(1));
    h.stripeState.confirmPlan.push("lost");
    const NOW = plus(C, MIN);
    expect(await chargeScheduledPayment(stored(), "sweep", NOW)).toBe("released");
    expect(stored()).toMatchObject({ balancePaymentIntentId: "pi_bal_1", attempts: 0 });

    const r2 = await chargeScheduledPayment(stored(), "sweep", plus(NOW, HOUR));
    expect(r2).toBe("succeeded");
    expect(piStatus("pi_bal_1")).toBe("canceled");
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_2", attempts: 1 });
    expect(h.stripe.createBalancePaymentIntent.mock.calls.map((c) => [c[0].attempt, c[0].keyNonce])).toEqual([[1, "first"], [1, "pi_bal_1"]]);
    expect(h.stripe.confirmBalanceOffSession.mock.calls.map((c) => c[1].keyNonce)).toEqual(["first", "pi_bal_1"]);
  });

  it("tentativa presa (processo morreu entre gravar o PI e confirmar) → a passagem seguinte cobra", async () => {
    const row = rowN(1, { status: "charging", attempts: 1, claimedAt: C, claimSource: "sweep", reminderStage: 2, balancePaymentIntentId: "pi_stuck" });
    seed(row);
    seedPi("pi_stuck", "requires_confirmation", row, { attempt: 1, source: "sweep", keyNonce: "first" });
    const t1 = plus(C, 40 * MIN);
    await sweep(t1);
    expect(stored()).toMatchObject({ status: "scheduled", attempts: 0, nextAttemptAt: plus(t1, 5 * MIN) });
    expect(piStatus("pi_stuck")).toBe("canceled");

    const report = await sweep(plus(t1, 10 * MIN));
    expect(report.charged).toEqual({ succeeded: 1 });
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_1" });
  });

  it("uma retoma com o mesmo PI anterior (resposta perdida do create) recebe o MESMO PI, não um segundo", async () => {
    seed(rowN(1));
    // A Stripe criou o PI mas o processo morreu antes de gravar o id: a key
    // (tentativa 1, "first") já existe na Stripe.
    seedPi("pi_lost", "requires_confirmation", rowN(1), { attempt: 1, source: "sweep", keyNonce: "first" });
    expect(await chargeScheduledPayment(stored(), "sweep", plus(C, MIN))).toBe("succeeded");
    expect(stored().balancePaymentIntentId).toBe("pi_lost");
    expect([...h.stripeState.pis.keys()]).toEqual(["pi_lost"]);
  });
});

/**
 * Regressão (era BUG): "o hóspede está a confirmar o 3DS" media-se com
 * row.claimedAt, que o claim do próprio sweep reescreve; um "Pagar agora"
 * abandonado bloqueava as cobranças automáticas até H. Agora mede-se pelo
 * `created` do PI do hóspede.
 */
describe("um PI do hóspede abandonado a meio do 3DS só segura o sweep durante 1 h", () => {
  it("o sweep espera enquanto o PI tem menos de 1 h e cobra na primeira passagem a seguir", async () => {
    const row = rowN(1, {
      status: "retry", attempts: 1, nextAttemptAt: R1, failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN),
      lastDeclineCode: "insufficient_funds", reminderStage: 2,
      guestPaymentIntentId: "pi_g", claimSource: "guest", claimedAt: plus(R1, -10 * MIN),
    });
    seed(row);
    seedPi("pi_g", "requires_action", row, { attempt: 1, source: "guest" }, plus(R1, -10 * MIN));
    const results: Array<Record<string, number>> = [];
    // Sweeps de 30 em 30 min; o hóspede nunca volta à página.
    for (let t = plus(R1, MIN); t.getTime() <= plus(R1, 2 * HOUR).getTime(); t = plus(t, 30 * MIN)) {
      results.push((await sweep(t)).charged);
    }
    // R1+1 (PI com 11 min) e R1+31 (41 min): espera; R1+61 (71 min): cancela o PI do hóspede e cobra.
    expect(results).toEqual([{ released: 1 }, { released: 1 }, { succeeded: 1 }, {}]);
    expect(piStatus("pi_g")).toBe("canceled");
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_1" });
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. runCancellation
   ════════════════════════════════════════════════════════════════ */

/** 1.ª parte na Stripe (guestRefundPlan e o cartão do E5/E7): 6 000 € recebidos, Flex de 300 €. */
function seedDeposit(opts: { boughtAt?: Date; flexCents?: number; refunded?: number; last4?: string | null; flexRefunded?: boolean } = {}): void {
  h.stripeState.deposits.set("pi_dep_1", {
    id: "pi_dep_1",
    amount_received: 600_000,
    latest_charge: { amount_refunded: opts.refunded ?? 0 },
    metadata: { intentId: "int-1", flexCents: String(opts.flexCents ?? 30_000), ...(opts.flexRefunded ? { refunded_skus: "reception,flex" } : {}) },
    created: Math.floor((opts.boughtAt ?? CREATED).getTime() / 1000),
    payment_method: opts.last4 === null ? null : { id: "pm_dep", card: { last4: opts.last4 ?? "1881" } },
  });
}

describe("runCancellation", () => {
  const NOW_H = plus(H, 5 * MIN);
  function cancellingRow(over: Partial<Row> = {}): Row {
    return rowN(1, {
      status: "cancelling",
      reviewReason: "cancel:unpaid",
      attempts: 3,
      nextAttemptAt: plus(R2, HOUR),
      lastDeclineCode: "insufficient_funds",
      failureNoticeStage: 2,
      failureNoticeSentAt: plus(C, 10 * MIN),
      reminderStage: 2,
      balancePaymentIntentId: "pi_last",
      ...over,
    });
  }
  function seedCancelling(over: Partial<Row> = {}, piState = "requires_payment_method"): Row {
    const row = cancellingRow(over);
    seed(row);
    seedPi("pi_last", piState, row);
    return row;
  }

  it("ordem: cancelar PIs abertos → cancelar no Guesty → reembolsar → email E5 → cancelled_unpaid", async () => {
    seedCancelling({ guestPaymentIntentId: "pi_guest" });
    seedPi("pi_guest", "requires_action", cancellingRow());
    seedDeposit();
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");

    expectOrder(["cancelOpenPaymentIntent", "cancelGuestyReservation", "markGuestyCancelled", "refundRemaining", "markRefund", "sendBalanceCancelled", "markCancelledUnpaid"]);
    expect(h.stripe.cancelOpenPaymentIntent.mock.calls.map((c) => c[0])).toEqual(["pi_last", "pi_guest"]);
    expect(piStatus("pi_last")).toBe("canceled");
    expect(piStatus("pi_guest")).toBe("canceled");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledWith("res-1", {
      canceledBy: "HOST",
      reason: "2.a parte por pagar no prazo",
      note: expect.stringContaining("2.a parte de 5000.00 EUR por pagar ao fim do prazo de aviso"),
    });
    // A nota é escrita antes do reembolso: não pode dizer que já foi reembolsada.
    const note = h.guesty.cancelGuestyReservation.mock.calls[0][1].note;
    expect(note).toContain("vai ser reembolsada");
    expect(note).not.toMatch(/reembolsada por inteiro/);
    // Falta de pagamento: devolve-se tudo, nada retido (nem o Flex); não se lê o plano do hóspede.
    expect(h.stripe.refundRemaining).toHaveBeenCalledTimes(1);
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith({
      paymentIntentId: "pi_dep_1",
      intentId: "int-1",
      scheduledPaymentId: "sp-1",
      reason: "two_parts_unpaid",
      withholdCents: 0,
    });
    // A única leitura da 1.ª parte é a do cartão para onde vai o reembolso.
    expect(h.klarna.getPaymentIntent.mock.calls).toEqual([["pi_dep_1", undefined, { expand: ["payment_method"] }]]);
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith({
      kind: "unpaid",
      email: "ana@example.com",
      locale: "pt",
      guestFirstName: "Ana",
      propertyName: "Villa Aura",
      checkIn: "2027-07-15",
      checkOut: "2027-07-22",
      refundCents: 600_000,
      confirmationCode: "GY-1",
      deadlineAt: H,
      // O cartão do pagamento original (onde o reembolso cai), não o atual da linha (4242).
      refundCardsLast4: ["1881"],
      creditNoteRef: null,
    });
    expect(stored()).toMatchObject({
      status: "cancelled_unpaid",
      cancelledAt: NOW_H,
      guestyCancelledAt: NOW_H,
      refundId: "re_1",
      refundCents: 600_000,
      refundStatus: "succeeded",
    });
    expect(alertSubjects().at(-1)).toContain("reserva cancelada por falta da 2.ª parte — GY-1");
    expect(h.mail.sendOpsAlert.mock.calls.at(-1)![1][0]).toBe("Reserva cancelada no Guesty e reembolso de 6000.00 EUR (succeeded). Email enviado ao hóspede.");
    expect(h.mail.sendOpsAlert.mock.calls.at(-1)![2]).toEqual({ copyToSales: true });
  });

  it("sem leitura do cartão da 1.ª parte → E5 sai na mesma, sem os últimos 4 dígitos", async () => {
    seedCancelling();
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ refundCardsLast4: [] }));
  });

  it("reserva que o Guesty diz já cancelada → segue para o reembolso", async () => {
    seedCancelling();
    h.guestyState.cancelResult = "already-canceled";
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(stored()).toMatchObject({ status: "cancelled_unpaid", guestyCancelledAt: NOW_H });
  });

  it("PI do saldo em processing (cancel lança) → pending, nada cancelado no Guesty nem reembolsado", async () => {
    seedCancelling({}, "processing");
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "cancelling", guestyCancelClaimedAt: null, refundClaimedAt: null });
  });

  it("o PI do saldo afinal pagou → markCancellingAsSucceeded, nada cancelado nem reembolsado", async () => {
    seedCancelling({}, "succeeded");
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("paid");
    expect(h.db.markCancellingAsSucceeded).toHaveBeenCalledWith("sp-1", "pi_last", NOW_H);
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_last", succeededAt: NOW_H, cancelPisClaimedAt: null });
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga no momento do cancelamento")]);
  });

  it.each(["refused", "unknown"] as const)("Guesty responde %s → alerta (escapado), pending, sem reembolso nem email", async (result) => {
    seedCancelling();
    h.guestyState.cancelResult = result;
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(alertSubjects()).toEqual([expect.stringContaining("cancelamento no Guesty por fazer — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toBe(`O Guesty respondeu &quot;${result}&quot; ao cancelamento automático. O sweep volta a tentar em 30 min.`);
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "cancelling", guestyCancelledAt: null, refundClaimedAt: null, refundStatus: null });
  });

  it("Guesty a recusar várias passagens seguidas → um só alerta em 6 h", async () => {
    seedCancelling();
    h.guestyState.cancelResult = "refused";
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 31 * MIN))).toBe("pending");
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 62 * MIN))).toBe("pending");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledTimes(3);
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
  });

  it.each(["failed", "requires_action", "canceled"])(
    "reembolso em %s → pending, alerta, sem email ao hóspede e sem fechar a linha",
    async (status) => {
      seedCancelling();
      h.stripeState.refund = () => ({ refundId: "re_1", refundCents: 600_000, status });
      expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
      expect(stored()).toMatchObject({ status: "cancelling", refundStatus: status, refundId: "re_1", cancelledAt: null });
      expect(h.db.markCancelledUnpaid).not.toHaveBeenCalled();
      expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
      expect(alertSubjects()).toEqual([expect.stringContaining(`reembolso em &quot;${status}&quot; — GY-1`)]);
      // As passagens seguintes não repetem o reembolso nem o alerta (travão de 6 h).
      expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("pending");
      expect(h.stripe.refundRemaining).toHaveBeenCalledTimes(1);
      expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["pending", 600_000],
    ["nothing", 0],
  ])("reembolso em %s → E5 e cancelled_unpaid", async (status, cents) => {
    seedCancelling();
    h.stripeState.refund = () => ({ refundId: status === "nothing" ? null : "re_1", refundCents: cents, status });
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ refundCents: cents }));
    expect(stored()).toMatchObject({ status: "cancelled_unpaid", refundStatus: status });
  });

  it("reembolso que lança → claim libertado e alerta; a passagem seguinte tenta logo e fecha", async () => {
    seedCancelling();
    h.stripeState.refund = () => {
      throw new Error("Stripe 500");
    };
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(alertSubjects()).toEqual([expect.stringContaining("reembolso por fazer — GY-1")]);
    expect(h.db.releaseEffect).toHaveBeenCalledWith("sp-1", "refundClaimedAt");
    expect(stored()).toMatchObject({ status: "cancelling", refundClaimedAt: null, refundStatus: null, guestyCancelledAt: NOW_H });
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();

    h.stripeState.refund = () => ({ refundId: "re_1", refundCents: 600_000, status: "succeeded" });
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("done");
    expect(h.stripe.refundRemaining).toHaveBeenCalledTimes(2);
    // O passo 1 corre outra vez (idempotente: o PI já está cancelado); o Guesty não repete.
    expect(await h.stripe.cancelOpenPaymentIntent.mock.results.at(-1)!.value).toBe("already-final");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledTimes(1);
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("claim do reembolso nas mãos de outra passagem (fresco) → pending, sem reembolsar", async () => {
    seedCancelling({ guestyCancelClaimedAt: plus(NOW_H, -10 * MIN), guestyCancelledAt: plus(NOW_H, -10 * MIN), refundClaimedAt: plus(NOW_H, -5 * MIN) }, "canceled");
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelling");
  });

  it("E5 não aceite pelo fornecedor → claim libertado, pending; a passagem seguinte envia e só então fecha", async () => {
    seedCancelling();
    h.mail.sendBalanceCancelled.mockImplementationOnce(async () => false);
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(h.db.releaseEffect).toHaveBeenCalledWith("sp-1", "emailCancelClaimedAt");
    expect(stored()).toMatchObject({ status: "cancelling", emailCancelClaimedAt: null, refundStatus: "succeeded" });
    expect(h.db.markCancelledUnpaid).not.toHaveBeenCalled();

    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("done");
    expect(h.stripe.refundRemaining).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledTimes(2);
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("claim do E5 perdido (outra instância a enviar) → pending, sem segundo email", async () => {
    seedCancelling({
      guestyCancelClaimedAt: plus(NOW_H, -40 * MIN), guestyCancelledAt: plus(NOW_H, -40 * MIN),
      refundClaimedAt: plus(NOW_H, -40 * MIN), refundId: "re_9", refundCents: 600_000, refundStatus: "succeeded",
    }, "canceled");
    const leitura = stored();
    h.store.get("sp-1")!.emailCancelClaimedAt = plus(NOW_H, -MIN);
    expect(await runCancellation(leitura, "unpaid", NOW_H)).toBe("pending");
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelling");
  });

  it("retoma com reembolso feito e email por enviar → só o E5 (valor gravado) e o estado final", async () => {
    seedCancelling({
      guestyCancelClaimedAt: plus(NOW_H, -40 * MIN),
      guestyCancelledAt: plus(NOW_H, -40 * MIN),
      refundClaimedAt: plus(NOW_H, -40 * MIN),
      refundId: "re_9",
      refundCents: 580_000,
      refundStatus: "succeeded",
    }, "canceled");
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(await h.stripe.cancelOpenPaymentIntent.mock.results[0].value).toBe("already-final");
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ refundCents: 580_000 }));
    expect(stored()).toMatchObject({ status: "cancelled_unpaid", refundId: "re_9" });
  });

  it("retoma com o E5 já reclamado → não o repete, só fecha a linha", async () => {
    seedCancelling({
      guestyCancelClaimedAt: plus(NOW_H, -40 * MIN),
      guestyCancelledAt: plus(NOW_H, -40 * MIN),
      refundClaimedAt: plus(NOW_H, -40 * MIN),
      refundId: "re_9",
      refundCents: 600_000,
      refundStatus: "succeeded",
      emailCancelClaimedAt: plus(NOW_H, -35 * MIN),
    }, "canceled");
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("sem email do hóspede → fecha na mesma (sem E5) e o alerta pede o aviso por telefone", async () => {
    seedCancelling({ email: null });
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelled_unpaid");
    expect(h.mail.sendOpsAlert.mock.calls.at(-1)![1][0]).toContain("Sem email do hóspede: avisar por telefone.");
  });

  it("cancelamento pelo hóspede antes de 14 dias da compra → Guesty GUEST, Flex devolvido, E7, cancelled_by_guest", async () => {
    const now = L("2027-06-20", 15);
    seedCancelling({ reviewReason: "cancel:guest", attempts: 0, failureNoticeStage: 0, failureNoticeSentAt: null, balancePaymentIntentId: null });
    seedDeposit({ boughtAt: plus(now, -3 * DAY) });
    expect(await runCancellation(stored(), "guest", now)).toBe("done");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledWith("res-1", {
      canceledBy: "GUEST",
      reason: "cancelada pelo hospede",
      note: "Cancelada pelo hospede dentro do prazo gratuito. O reembolso e feito pela plataforma.",
    });
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith(expect.objectContaining({ reason: "two_parts_guest_cancel", withholdCents: 0 }));
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ kind: "guest", deadlineAt: null }));
    expect(stored().status).toBe("cancelled_by_guest");
    expect(alertSubjects().at(-1)).toContain("reserva cancelada pelo hóspede — GY-1");
  });

  it("cancelamento pelo hóspede mais de 14 dias depois da compra → o Flex fica retido", async () => {
    const now = L("2027-06-20", 15);
    seedCancelling({ reviewReason: "cancel:guest", attempts: 0, failureNoticeStage: 0, failureNoticeSentAt: null, balancePaymentIntentId: null });
    seedDeposit({ boughtAt: CREATED });
    expect(await runCancellation(stored(), "guest", now)).toBe("done");
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith(expect.objectContaining({ withholdCents: 30_000 }));
  });

  it("Flex já devolvido por linha → nada retido outra vez", async () => {
    const now = L("2027-06-20", 15);
    seedCancelling({ reviewReason: "cancel:guest", attempts: 0, failureNoticeStage: 0, failureNoticeSentAt: null, balancePaymentIntentId: null });
    seedDeposit({ boughtAt: CREATED, flexRefunded: true, refunded: 30_000 });
    expect(await runCancellation(stored(), "guest", now)).toBe("done");
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith(expect.objectContaining({ withholdCents: 0 }));
  });

  it("plano do hóspede ilegível (Stripe em baixo) → nada reembolsado, claim libertado, pending", async () => {
    const now = L("2027-06-20", 15);
    seedCancelling({ reviewReason: "cancel:guest", attempts: 0, failureNoticeStage: 0, failureNoticeSentAt: null, balancePaymentIntentId: null });
    expect(await runCancellation(stored(), "guest", now)).toBe("pending");
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "cancelling", refundClaimedAt: null, guestyCancelledAt: now });
  });

  it("cancelamento pela equipa (admin) → tudo devolvido, Flex incluído, email da equipa (team) e cancelled_by_guest", async () => {
    const now = L("2027-06-20", 15);
    seedCancelling({ reviewReason: "cancel:admin", attempts: 0, failureNoticeStage: 0, failureNoticeSentAt: null, balancePaymentIntentId: null });
    seedDeposit({ boughtAt: CREATED });
    expect(await runCancellation(stored(), "admin", now)).toBe("done");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledWith("res-1", expect.objectContaining({ canceledBy: "HOST", reason: "cancelada pela equipa" }));
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith(expect.objectContaining({ reason: "two_parts_admin_cancel", withholdCents: 0 }));
    // Nunca o E7 "como pediu, dentro do prazo": a equipa cancelou (C6/C15/C29).
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ kind: "team", deadlineAt: null }));
    expect(stored().status).toBe("cancelled_by_guest");
    expect(alertSubjects().at(-1)).toContain("reserva cancelada pela equipa — GY-1");
  });

  it("passo 8 do sweep retoma cada cancelamento com o tipo gravado no claim", async () => {
    const now = L("2027-06-20", 15);
    seedCancelling({ reviewReason: "cancel:guest", attempts: 0, failureNoticeStage: 0, failureNoticeSentAt: null, balancePaymentIntentId: null, reminderStage: 2 });
    seedDeposit({ boughtAt: plus(now, -3 * DAY) });
    const report = await sweep(now);
    expect(report.cancellations).toBe(1);
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledWith("res-1", expect.objectContaining({ canceledBy: "GUEST" }));
    expect(stored().status).toBe("cancelled_by_guest");
  });

  it("cancellationKindFromReason", () => {
    expect(cancellationKindFromReason("cancel:guest")).toBe("guest");
    expect(cancellationKindFromReason("cancel:admin")).toBe("admin");
    expect(cancellationKindFromReason("cancel:unpaid")).toBe("unpaid");
    // Sem marca (linhas antigas, ou outro motivo): o caminho da paragem dura.
    expect(cancellationKindFromReason(null)).toBe("unpaid");
    expect(cancellationKindFromReason("Preciso de ajuda")).toBe("unpaid");
  });
});

describe("cancelamento de uma reserva já paga na totalidade (regressão: era BUG)", () => {
  // Antes o passo 1 passava o saldo JÁ PAGO por cancelOpenPaymentIntent,
  // recebia "succeeded" e devolvia "paid": nada era cancelado nem devolvido e
  // guestCancel dizia ok ao hóspede.
  const now = L("2027-06-30", 15); // depois de C, antes de D
  function paidCancelling(over: Partial<Row> = {}): Row {
    const row = rowN(1, {
      status: "cancelling", reviewReason: "cancel:guest", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN),
      guestyBalanceRecordedAt: plus(C, 10 * MIN), noteClaimedAt: plus(C, 10 * MIN), emailPaidClaimedAt: plus(C, 10 * MIN), reminderStage: 2, ...over,
    });
    seed(row);
    seedPi("pi_paid", "succeeded", row);
    seedDeposit({ flexCents: 0 });
    h.stripeState.refund = (p: { paymentIntentId: string }) =>
      p.paymentIntentId === "pi_dep_1"
        ? { refundId: "re_dep", refundCents: 600_000, status: "succeeded" }
        : { refundId: "re_bal", refundCents: 500_000, status: "succeeded" };
    return row;
  }

  it("hóspede → cancela no Guesty, devolve as duas partes, cancelled_by_guest", async () => {
    paidCancelling();
    expect(await runCancellation(stored(), "guest", now)).toBe("done");
    expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledTimes(1);
    expect(h.stripe.refundRemaining.mock.calls.map((c) => [c[0].paymentIntentId, c[0].reason])).toEqual([
      ["pi_dep_1", "two_parts_guest_cancel"],
      ["pi_paid", "two_parts_guest_cancel"],
    ]);
    expect(stored()).toMatchObject({ status: "cancelled_by_guest", refundCents: 1_100_000, refundId: "re_dep", refundStatus: "succeeded" });
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ kind: "guest", refundCents: 1_100_000 }));
  });

  it("um segundo PI pago (do hóspede) numa linha já paga não trava o cancelamento", async () => {
    const row = paidCancelling({ guestPaymentIntentId: "pi_g2" });
    seedPi("pi_g2", "succeeded", row);
    expect(await runCancellation(stored(), "guest", now)).toBe("done");
    expect(h.stripe.cancelOpenPaymentIntent.mock.calls.map((c) => c[0])).toEqual(["pi_g2"]);
    expect(h.db.markCancellingAsSucceeded).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelled_by_guest");
  });

  it("reembolso da 1.ª parte ok mas o da 2.ª falhado → o pior decide: pending, sem E7", async () => {
    paidCancelling();
    h.stripeState.refund = (p: { paymentIntentId: string }) =>
      p.paymentIntentId === "pi_dep_1"
        ? { refundId: "re_dep", refundCents: 600_000, status: "succeeded" }
        : { refundId: "re_bal", refundCents: 500_000, status: "failed" };
    expect(await runCancellation(stored(), "guest", now)).toBe("pending");
    expect(stored()).toMatchObject({ status: "cancelling", refundStatus: "failed", refundCents: 1_100_000 });
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
  });

  it("falta de pagamento nunca devolve uma 2.ª parte (só a 1.ª)", async () => {
    paidCancelling({ reviewReason: "cancel:unpaid" });
    expect(await runCancellation(stored(), "unpaid", now)).toBe("done");
    expect(h.stripe.refundRemaining.mock.calls.map((c) => c[0].paymentIntentId)).toEqual(["pi_dep_1"]);
  });
});

/**
 * Regressão: numa versão anterior o passo 1 só corria com
 * `!row.cancelPisClaimedAt`, e um PI em processing (ou a Stripe ilegível)
 * travava só a primeira passagem; a seguinte saltava o passo e cancelava no
 * Guesty com o PI do saldo ainda vivo. Agora o passo 1 corre em todas as
 * passagens.
 */
describe("o passo 1 do cancelamento (fechar os PIs do saldo) corre em todas as passagens", () => {
  const NOW_H = plus(H, 5 * MIN);

  it("PI em processing: a passagem seguinte não pode cancelar no Guesty nem reembolsar", async () => {
    const row = rowN(1, { status: "cancelling", reviewReason: "cancel:unpaid", attempts: 3, failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), balancePaymentIntentId: "pi_last" });
    seed(row);
    seedPi("pi_last", "processing", row);
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("pending");
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelling");
  });

  it("numa só passagem do sweep: a Stripe falha ao cancelar o PI aberto em H; o passo 8 fecha-o antes de cancelar no Guesty", async () => {
    const row = rowN(1, { status: "needs_action", attempts: 1, failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2, balancePaymentIntentId: "pi_open", lastDeclineCode: "authentication_required" });
    seed(row);
    seedPi("pi_open", "requires_action", row);
    h.stripeState.cancelFailures = 1; // um timeout da Stripe no passo 1
    await sweep(plus(H, MIN));
    expect(piStatus("pi_open")).toBe("canceled");
    expect(stored().status).toBe("cancelled_unpaid");
    expectOrder(["cancelOpenPaymentIntent", "cancelOpenPaymentIntent", "cancelGuestyReservation"]);
  });
});

/**
 * Regressão (era BUG): com o Guesty a recusar, guesty_cancel_claimed_at fica
 * gravado; a passagem seguinte perdia o claim e o `&&` deixava cair o passo
 * 2 até ao reembolso, ao E5 e a cancelled_unpaid com a reserva ATIVA no
 * Guesty. No sweep acontecia na mesma passagem (passo 7 e depois passo 8).
 */
describe("com o Guesty a recusar o cancelamento, nada é reembolsado nem dado como cancelado", () => {
  const NOW_H = plus(H, 5 * MIN);

  it("runCancellation outra vez 10 min depois (claim do Guesty ainda fresco) → pending; 31 min depois tenta o Guesty de novo", async () => {
    const row = rowN(1, { status: "cancelling", reviewReason: "cancel:unpaid", attempts: 3, failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), balancePaymentIntentId: "pi_last" });
    seed(row);
    seedPi("pi_last", "requires_payment_method", row);
    h.guestyState.cancelResult = "refused";
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("pending");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledTimes(1);
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "cancelling", guestyCancelledAt: null });

    h.guestyState.cancelResult = "canceled";
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 31 * MIN))).toBe("done");
    expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledTimes(2);
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("numa só passagem do sweep em H: Guesty recusa → passos 7 e 8 ficam em pending", async () => {
    const row = rowN(1, { status: "needs_action", attempts: 1, failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2, balancePaymentIntentId: "pi_last", lastDeclineCode: "expired_card" });
    seed(row);
    seedPi("pi_last", "requires_payment_method", row);
    h.guestyState.cancelResult = "refused";
    const report = await sweep(plus(H, MIN));
    expect(report.hardStops).toBe(1);
    expect(report.cancellations).toBe(1);
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "cancelling", guestyCancelledAt: null, reviewReason: "cancel:unpaid" });
  });
});

/* ════════════════════════════════════════════════════════════════
   4. runBalanceSweep
   ════════════════════════════════════════════════════════════════ */

describe("runBalanceSweep: uma passagem com linhas em vários estados", () => {
  const NOW = plus(C, 5 * MIN);
  // Segunda reserva, já depois do seu H (check-in 7 jul): D2 30 jun, C2 20 jun, H2 27 jun.
  const D2 = L("2027-06-30", 23, 59);
  const C2 = L("2027-06-20", 10);
  const H2 = L("2027-06-27", 12);

  function seedMixed() {
    const stuck = rowN(1, { status: "charging", attempts: 1, claimedAt: plus(NOW, -40 * MIN), claimSource: "sweep", reminderStage: 2, balancePaymentIntentId: "pi_stuck" });
    const due = rowN(2, { reminderStage: 2 });
    const failing = rowN(3, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", reminderStage: 2, balancePaymentIntentId: "pi_fail" });
    const hard = rowN(4, {
      checkIn: "2027-07-07", checkOut: "2027-07-14", freeCancelDeadline: D2, chargeAt: C2, hardStopAt: H2,
      nextAttemptAt: L("2027-06-23", 10), status: "needs_action", attempts: 3, failureNoticeStage: 2,
      failureNoticeSentAt: plus(C2, 10 * MIN), lastDeclineCode: "insufficient_funds", reminderStage: 2, balancePaymentIntentId: "pi_hard",
    });
    const otherScope = rowN(5, { livemode: false, reminderStage: 2 });
    seed(stuck, due, failing, hard, otherScope);
    seedPi("pi_stuck", "requires_confirmation", stuck);
    seedPi("pi_fail", "requires_payment_method", failing);
    seedPi("pi_hard", "requires_payment_method", hard);
    return { stuck, due, failing, hard, otherScope };
  }

  it("cada passo pela ordem da spec 5.3, cada linha no seu passo, o outro scope intocado", async () => {
    const { otherScope } = seedMixed();
    const report = await sweep(NOW);

    expect(report).toEqual({
      stuck: 1,
      reconciled: 4,
      reminders: 0,
      charged: { succeeded: 1 },
      effects: 1,
      notices: 1,
      hardStops: 1,
      cancellations: 0,
      errors: [],
    });
    expectOrder([
      "listStuckCharging",
      "listForReconciliation",
      "listScheduledForReminders",
      "listDueScheduledPayments",
      "listPostChargeIncomplete",
      "listFailureNoticeCandidates",
      "listHardStopDue",
      "listCancelling",
      "setBalanceHeartbeat",
    ]);
    expectOrder(["releaseChargeClaim", "applyReconciliation", "createBalancePaymentIntent", "recordExternalPayment", "sendBalanceFailed", "cancelGuestyReservation", "setBalanceHeartbeat"]);

    // 1) presa: PI cancelado, de volta a scheduled daqui a 5 min, tentativa descontada.
    expect(stored("sp-1")).toMatchObject({ status: "scheduled", attempts: 0, nextAttemptAt: plus(NOW, 5 * MIN), lastError: "tentativa presa, retomada" });
    expect(piStatus("pi_stuck")).toBe("canceled");
    // 4) e 5) devida: cobrada e registada no Guesty na mesma passagem.
    expect(stored("sp-2")).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_bal_1", guestyBalanceRecordedAt: NOW });
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-2", 5000, "EUR", "pi_bal_1");
    // 6) falhada: E3 enviado, relógio dos 7 dias a contar.
    expect(stored("sp-3")).toMatchObject({ status: "retry", failureNoticeStage: 1, failureNoticeSentAt: NOW, hardStopAt: H });
    // 7) H passado com aviso completo: cancelada e reembolsada.
    expect(stored("sp-4")).toMatchObject({ status: "cancelled_unpaid", refundStatus: "succeeded", guestyCancelledAt: NOW });
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith(expect.objectContaining({ paymentIntentId: "pi_dep_4" }));
    // Linha de teste num sweep de produção: nem lida.
    expect(stored("sp-5")).toEqual(otherScope);
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
    expect(h.db.setBalanceHeartbeat).toHaveBeenCalledWith(NOW, LIVE_SCOPE);
  });

  it("uma exceção na reconciliação não impede as cobranças, a paragem dura nem o heartbeat", async () => {
    seedMixed();
    h.db.applyReconciliation.mockImplementation(async () => {
      throw new Error("BD em baixo");
    });
    const report = await sweep(NOW);
    expect(report.errors).toEqual(["reconciliacao: BD em baixo"]);
    expect(stored("sp-2").status).toBe("succeeded");
    expect(stored("sp-3").failureNoticeStage).toBe(1);
    expect(stored("sp-4").status).toBe("cancelled_unpaid");
    expect(h.db.setBalanceHeartbeat).toHaveBeenCalledWith(NOW, LIVE_SCOPE);
  });

  it("uma linha que rebenta na cobrança não impede as outras", async () => {
    seed(rowN(2, { reminderStage: 2, nextAttemptAt: plus(C, -MIN) }), rowN(3, { reminderStage: 2 }));
    h.db.claimScheduledPaymentForCharge.mockImplementation(async (id: string, source: string, now: Date) => {
      if (id === "sp-2") throw new Error("deadlock");
      return h.orig.claimScheduledPaymentForCharge(id, source, now);
    });
    const report = await sweep(NOW);
    expect(report.errors).toEqual(["cobranca sp-2: deadlock"]);
    expect(report.charged).toEqual({ released: 1, succeeded: 1 });
    expect(stored("sp-3").status).toBe("succeeded");
    expect(stored("sp-2").status).toBe("scheduled");
  });

  it("uma lista que rebenta fica no relatório e os passos seguintes correm", async () => {
    seed(rowN(2, { reminderStage: 2 }));
    h.db.listStuckCharging.mockImplementation(async () => {
      throw new Error("timeout");
    });
    const report = await sweep(NOW);
    expect(report.errors).toEqual(["presas: timeout"]);
    expect(stored("sp-2").status).toBe("succeeded");
  });

  it("heartbeat de um sweep de teste vai com o scope de teste e não toca em linhas reais", async () => {
    seed(rowN(1, { reminderStage: 2 }));
    await sweep(NOW, { ...LIVE, STRIPE_SECRET_KEY: "sk_test_x" });
    expect(h.db.setBalanceHeartbeat).toHaveBeenCalledWith(NOW, { livemode: false, siteOrigin: ORIGIN });
    expect(stored("sp-1")).toMatchObject({ status: "scheduled", attempts: 0 });
    expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
  });
});

describe("sweep: linhas presas em charging", () => {
  const NOW = plus(C, 40 * MIN);
  const stuck = (over: Partial<Row> = {}) =>
    rowN(1, { status: "charging", attempts: 1, claimedAt: C, claimSource: "sweep", reminderStage: 2, failureNoticeStage: 1, ...over });

  it("só conta como presa depois de 30 min", async () => {
    seed(stuck({ claimedAt: plus(NOW, -STUCK_CHARGING_MS + MIN) }));
    const report = await sweep(NOW);
    expect(report.stuck).toBe(0);
    expect(stored().status).toBe("charging");
  });

  it("PI que afinal cobrou → succeeded (e os efeitos correm na mesma passagem)", async () => {
    const row = stuck({ balancePaymentIntentId: "pi_s" });
    seed(row);
    seedPi("pi_s", "succeeded", row);
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_s" });
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-1", 5000, "EUR", "pi_s");
  });

  it("PI em processing → fica em charging, sem cancelar", async () => {
    const row = stuck({ balancePaymentIntentId: "pi_s" });
    seed(row);
    seedPi("pi_s", "processing", row);
    await sweep(NOW);
    expect(stored().status).toBe("charging");
    expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
  });

  it("Stripe ilegível → fica em charging para a passagem seguinte", async () => {
    const row = stuck({ balancePaymentIntentId: "pi_s" });
    seed(row);
    seedPi("pi_s", "requires_confirmation", row);
    h.stripeState.failRetrieve = () => true;
    await sweep(NOW);
    expect(stored().status).toBe("charging");
    expect(h.db.releaseChargeClaim).not.toHaveBeenCalled();
  });

  it("sem PI gravado (morreu antes de criar) → volta a scheduled daqui a 5 min, tentativa descontada", async () => {
    seed(stuck());
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "scheduled", attempts: 0, nextAttemptAt: plus(NOW, 5 * MIN) });
    expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
  });

  it("2.ª tentativa presa → volta a retry", async () => {
    seed(stuck({ attempts: 2, claimedAt: plus(R1, -10 * MIN) }));
    await sweep(plus(R1, 30 * MIN));
    expect(stored()).toMatchObject({ status: "retry", attempts: 1 });
  });

  it.each(["guest", "admin"] as const)("tentativa presa de %s → needs_action (nunca volta à cobrança automática)", async (source) => {
    const row = stuck({ claimSource: source, attempts: 2, guestPaymentIntentId: source === "guest" ? "pi_g" : null, status: "charging" });
    seed(row);
    if (source === "guest") seedPi("pi_g", "requires_action", row);
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_action", attempts: 1 });
    if (source === "guest") expect(piStatus("pi_g")).toBe("canceled");
  });

  it("a próxima tentativa nunca fica marcada para depois de H", async () => {
    seed(stuck({ hardStopAt: plus(NOW, 3 * MIN) }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "scheduled", nextAttemptAt: plus(NOW, 2 * MIN) });
  });
});

describe("sweep: aviso escrito de falha (E3 + S1)", () => {
  it("recusa soft em C → E3 soft com as duas retentativas, S1, relógio dos 7 dias e H = C + 7", async () => {
    const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", reminderStage: 2 });
    seed(row);
    const now = plus(C, 10 * MIN);
    const report = await sweep(now);
    expect(report.notices).toBe(1);
    expect(h.mail.sendBalanceFailed).toHaveBeenCalledWith({
      variant: "soft",
      email: "ana@example.com",
      locale: "pt",
      guestFirstName: "Ana",
      propertyName: "Villa Aura",
      checkIn: "2027-07-15",
      amountCents: 500_000,
      nextRetryAt: R1,
      retryAts: [R1, R2],
      // Sem amountPaidCents: o texto diz "devolvemos o que já pagou".
      hardStopAt: H,
      freeCancelDeadlineAt: D,
      cardLast4: "4242",
      link: expectedLink(row, H),
      now,
    });
    expect(h.sms.sendBalanceFailedSms).toHaveBeenCalledWith({
      phone: "+351912345678", locale: "pt", propertyName: "Villa Aura", link: expectedLink(row, H), hardStopAt: H, now,
    });
    expect(h.db.claimFailureNoticeStage.mock.calls).toEqual([
      ["sp-1", 0, 1, {}],
      ["sp-1", 1, 1, { failureNoticeSentAt: now, hardStopAt: H }],
    ]);
    expect(stored()).toMatchObject({ status: "retry", failureNoticeStage: 1, failureNoticeSentAt: now, hardStopAt: H });
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("aviso atrasado (recusa hard, sweep parado) → E3 hard sem retentativas; H = aviso + 15 min de folga + 7 dias", async () => {
    const row = rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 });
    seed(row);
    const now = L("2027-06-29", 13);
    const newH = L("2027-07-06", 13, 15);
    await sweep(now);
    expect(h.mail.sendBalanceFailed).toHaveBeenCalledWith(expect.objectContaining({
      variant: "hard", nextRetryAt: null, retryAts: null, hardStopAt: newH, link: expectedLink(row, newH),
    }));
    expect(h.sms.sendBalanceFailedSms).toHaveBeenCalledWith(expect.objectContaining({ hardStopAt: newH }));
    expect(stored()).toMatchObject({ status: "needs_action", failureNoticeStage: 1, failureNoticeSentAt: now, hardStopAt: newH });
    // Os 7 dias contados do envio real cabem sempre antes do H gravado.
    expect(noticePeriodComplete(stored(), newH)).toBe(true);
  });

  it("3DS pedido → variante auth", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "authentication_required", reminderStage: 2 }));
    await sweep(plus(C, 10 * MIN));
    expect(h.mail.sendBalanceFailed).toHaveBeenCalledWith(expect.objectContaining({ variant: "auth", nextRetryAt: null, retryAts: null }));
  });

  it("depois da 1.ª retentativa, o E3 só promete as retentativas que faltam", async () => {
    seed(rowN(1, { status: "retry", attempts: 2, nextAttemptAt: R2, lastDeclineCode: "insufficient_funds", reminderStage: 2 }));
    await sweep(plus(R1, 10 * MIN));
    expect(h.mail.sendBalanceFailed).toHaveBeenCalledWith(expect.objectContaining({ nextRetryAt: R2, retryAts: [R2] }));
  });

  it("email NÃO entregue → volta ao estágio 0, sem failure_notice_sent_at nem H novo; a passagem seguinte tenta outra vez", async () => {
    const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", reminderStage: 2 });
    seed(row);
    h.mail.sendBalanceFailed.mockImplementationOnce(async () => false);
    const t1 = plus(C, 10 * MIN);
    const r1 = await sweep(t1);
    expect(r1.notices).toBe(0);
    expect(stored()).toMatchObject({ status: "retry", failureNoticeStage: 0, failureNoticeSentAt: null, hardStopAt: H });
    expect(h.sms.sendBalanceFailedSms).not.toHaveBeenCalled();
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();

    const t2 = plus(t1, 10 * MIN);
    const r2 = await sweep(t2);
    expect(r2.notices).toBe(1);
    expect(h.mail.sendBalanceFailed).toHaveBeenCalledTimes(2);
    expect(stored()).toMatchObject({ failureNoticeStage: 1, failureNoticeSentAt: t2, hardStopAt: H });
  });

  it.each([
    ["sem email", { email: null }, false],
    ["sem link (segredo em falta)", {}, true],
  ])("%s → needs_review e alerta, nunca um aviso que não saiu", async (_label, over, breakLink) => {
    seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", reminderStage: 2, ...over }));
    if (breakLink) {
      h.links.balanceLinkUrl.mockImplementation(() => {
        throw new Error("BALANCE_LINK_SECRET (ou JWT_SECRET) em falta");
      });
    }
    await sweep(plus(C, 10 * MIN));
    expect(h.mail.sendBalanceFailed).not.toHaveBeenCalled();
    expect(h.sms.sendBalanceFailedSms).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({
      status: "needs_review",
      reviewReason: "aviso de falha impossivel (sem email ou sem link)",
      reviewDueAt: H,
      failureNoticeStage: 0,
      failureNoticeSentAt: null,
    });
    expect(alertSubjects()).toEqual([expect.stringContaining("aviso de falha por enviar — GY-1")]);
  });

  it("aviso tão atrasado que os 7 dias passam D − 1 → enviado, H = D − 1, alerta; a linha NÃO vai para revisão e as retentativas seguem", async () => {
    seed(rowN(1, { status: "retry", attempts: 2, nextAttemptAt: L("2027-07-02", 10), lastDeclineCode: "insufficient_funds", reminderStage: 2 }));
    const now = L("2027-07-01", 15);
    await sweep(now);
    expect(h.mail.sendBalanceFailed).toHaveBeenCalledWith(expect.objectContaining({ hardStopAt: D_MINUS_1 }));
    expect(stored()).toMatchObject({ status: "retry", failureNoticeStage: 1, failureNoticeSentAt: now, hardStopAt: D_MINUS_1, reviewReason: null });
    expect(alertSubjects()).toEqual([expect.stringContaining("decisão humana antes de 2027-07-08 — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][1]).toContain("a reserva NÃO é cancelada sozinha");

    // A retentativa marcada ainda corre (e cobra).
    const report = await sweep(L("2027-07-02", 10, 5));
    expect(report.charged).toEqual({ succeeded: 1 });
  });

  it("…e se não pagar, em H (D − 1) vai para decisão humana: nunca cancela sem os 7 dias", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 }));
    await sweep(L("2027-07-01", 15));
    expect(stored().hardStopAt).toEqual(D_MINUS_1);
    await sweep(plus(D_MINUS_1, MIN));
    // H já é D − 1 às 12:00: o prazo da decisão é D (nunca um prazo já vencido).
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "prazo H sem 7 dias de aviso cumpridos", reviewDueAt: D });
    expect(alertSubjects().at(-1)).toContain("prazo atingido sem aviso completo — GY-1");
    expect(h.mail.sendOpsAlert.mock.calls.at(-1)![1][0]).toContain("os 7 dias do aviso escrito (enviado a");
    expect(h.mail.sendOpsAlert.mock.calls.at(-1)![1][0]).not.toContain("servidor parado");
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
  });

  it("a folga de 15 min decide a fronteira: 11:45 do dia D − 8 ainda cabe, 11:46 já não", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 }));
    await sweep(L("2027-06-30", 11, 45));
    expect(stored().hardStopAt).toEqual(D_MINUS_1);
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();

    h.reset();
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 }));
    await sweep(L("2027-06-30", 11, 46));
    expect(stored().hardStopAt).toEqual(D_MINUS_1);
    expect(alertSubjects()).toEqual([expect.stringContaining("decisão humana antes de 2027-07-08")]);
  });
});

describe("sweep: último aviso (E3b + S2 + alerta) na véspera de H às 10:00", () => {
  const lastCall = L("2027-07-04", 10);
  const notified = (over: Partial<Row> = {}) =>
    rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2, failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), ...over });

  it("nada antes das 10:00 da véspera; às 10:00 uma vez só; nunca repetido", async () => {
    const row = notified();
    seed(row);

    await sweep(plus(lastCall, -MIN));
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(stored().failureNoticeStage).toBe(1);

    const r = await sweep(lastCall);
    expect(r.notices).toBe(1);
    expect(h.mail.sendBalanceLastCall).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalanceLastCall).toHaveBeenCalledWith({
      email: "ana@example.com",
      locale: "pt",
      guestFirstName: "Ana",
      propertyName: "Villa Aura",
      checkIn: "2027-07-15",
      amountCents: 500_000,
      hardStopAt: H,
      link: expectedLink(row, H),
      now: lastCall,
    });
    expect(h.sms.sendBalanceLastCallSms).toHaveBeenCalledWith({
      phone: "+351912345678", locale: "pt", propertyName: "Villa Aura", link: expectedLink(row, H), hardStopAt: H, now: lastCall,
    });
    expect(alertSubjects()).toEqual([expect.stringContaining("cancela amanhã às 12:00 — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toContain("Amanhã às 12:00 (Lisboa)");
    expect(stored().failureNoticeStage).toBe(2);

    await sweep(plus(lastCall, 10 * MIN));
    await sweep(plus(lastCall, 6 * HOUR));
    expect(h.mail.sendBalanceLastCall).toHaveBeenCalledTimes(1);
    expect(h.sms.sendBalanceLastCallSms).toHaveBeenCalledTimes(1);
  });

  it("o alerta diz a hora real de H (aviso atrasado: 13:15)", async () => {
    const hLate = L("2027-07-06", 13, 15);
    seed(notified({ hardStopAt: hLate }));
    await sweep(L("2027-07-05", 10));
    expect(alertSubjects()).toEqual([expect.stringContaining("cancela amanhã às 13:15 — GY-1")]);
    expect(h.mail.sendBalanceLastCall).toHaveBeenCalledWith(expect.objectContaining({ hardStopAt: hLate }));
  });

  it("E3b não aceite → volta ao estágio 1, sem SMS nem alerta; a passagem seguinte (ainda na véspera) envia", async () => {
    seed(notified());
    h.mail.sendBalanceLastCall.mockImplementationOnce(async () => false);
    const r1 = await sweep(lastCall);
    expect(r1.notices).toBe(0);
    expect(stored().failureNoticeStage).toBe(1);
    expect(h.sms.sendBalanceLastCallSms).not.toHaveBeenCalled();
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();

    const r2 = await sweep(plus(lastCall, 10 * MIN));
    expect(r2.notices).toBe(1);
    expect(h.mail.sendBalanceLastCall).toHaveBeenCalledTimes(2);
    expect(h.sms.sendBalanceLastCallSms).toHaveBeenCalledTimes(1);
    expect(stored().failureNoticeStage).toBe(2);
  });

  it("sem email do hóspede → SMS e alerta na mesma (a dizer que o email não saiu); véspera fechada SEM E3b (estágio 3)", async () => {
    seed(notified({ email: null }));
    const r = await sweep(lastCall);
    expect(r.notices).toBe(1);
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(h.sms.sendBalanceLastCallSms).toHaveBeenCalledTimes(1);
    expect(alertSubjects()).toEqual([expect.stringContaining("cancela amanhã às 12:00")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1].join(" ")).toContain("O último aviso por email NÃO saiu (sem email do hóspede)");
    // Regressão C21: o estágio 2 quer dizer "E3b enviado"; sem email é o 3.
    expect(stored()).toMatchObject({ failureNoticeStage: 3, smsStage: 2 });
  });

  it("depois de H já não há último aviso (aplica-se a paragem dura)", async () => {
    seed(notified());
    await sweep(plus(H, MIN));
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelled_unpaid");
  });
});

/**
 * Regressão (era BUG): o último aviso só verificava `lastCallAt(H) <= now < H`;
 * de volta no próprio dia de H, o ops recebia "cancela amanhã às 12:00" e o
 * hóspede nada. Agora: no dia de H, alerta "cancela HOJE" e nenhum email.
 */
describe("último aviso atrasado para o próprio dia de H", () => {
  it("sweep parado na véspera e de volta no dia de H às 11:00 → 'cancela HOJE às 12:00' ao ops, nada ao hóspede, uma vez", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2, failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN) }));
    const r = await sweep(L("2027-07-05", 11));
    expect(alertSubjects()).toEqual([expect.stringContaining("cancela HOJE às 12:00 — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][1]).toContain("Hoje às 12:00 (Lisboa)");
    expect(alertSubjects().filter((s) => s.includes("amanhã"))).toEqual([]);
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(h.sms.sendBalanceLastCallSms).not.toHaveBeenCalled();
    expect(r.notices).toBe(0);
    // Regressão C21: véspera perdida = estágio 3 (nunca "E3b enviado").
    expect(stored().failureNoticeStage).toBe(3);

    await sweep(L("2027-07-05", 11, 10));
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
  });
});

describe("sweep: paragem dura (H)", () => {
  it("servidor acorda depois de H com a linha nunca cobrada → não cobra; needs_review até D − 1 (sem 7 dias de aviso)", async () => {
    seed(rowN(1, { reminderStage: 2 }));
    const report = await sweep(plus(H, MIN));
    expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    expect(report.hardStops).toBe(0);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "prazo H sem 7 dias de aviso cumpridos", reviewDueAt: D_MINUS_1 });
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(alertSubjects()).toEqual([expect.stringContaining("prazo atingido sem aviso completo — GY-1")]);
  });

  it("E3 nunca entregue (estágio 0) e H passou → needs_review, nada cancelado", async () => {
    seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", reminderStage: 2 }));
    h.mail.sendBalanceFailed.mockImplementation(async () => false);
    await sweep(plus(H, MIN));
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "prazo H sem 7 dias de aviso cumpridos", reviewDueAt: D_MINUS_1 });
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
    expect(h.stripe.cancelOpenPaymentIntent).not.toHaveBeenCalled();
  });

  it("H passou com os 7 dias de aviso cumpridos → cancela, reembolsa e fecha cancelled_unpaid", async () => {
    const row = rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2, failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), balancePaymentIntentId: "pi_last" });
    seed(row);
    seedPi("pi_last", "requires_payment_method", row);
    const now = plus(H, MIN);
    const report = await sweep(now);
    expect(report.hardStops).toBe(1);
    expect(h.db.claimScheduledPaymentForCancel).toHaveBeenCalledWith("sp-1", ["retry", "needs_action"], { hardStopNow: now, reason: "cancel:unpaid" });
    expect(stored()).toMatchObject({
      status: "cancelled_unpaid", guestyCancelledAt: now, refundStatus: "succeeded", cancelledAt: now, reviewReason: "cancel:unpaid",
    });
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledTimes(1);
  });

  it("hóspede a pagar (agiu na página na última hora) → a paragem dura espera", async () => {
    const row = rowN(1, {
      status: "needs_action", attempts: 2, lastDeclineCode: "expired_card", reminderStage: 2, failureNoticeStage: 2,
      failureNoticeSentAt: plus(C, 10 * MIN), guestActiveAt: plus(H, -10 * MIN),
    });
    seed(row);
    await sweep(plus(H, MIN));
    expect(stored().status).toBe("needs_action");
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();

    await sweep(plus(H, 51 * MIN)); // última ação do hóspede há mais de 60 min
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("em needs_review nunca é cancelada sozinha", async () => {
    seed(rowN(1, { status: "needs_review", reviewReason: "Preciso de ajuda", failureNoticeSentAt: plus(C, 10 * MIN), failureNoticeStage: 2 }));
    await sweep(plus(H, DAY));
    expect(stored().status).toBe("needs_review");
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
  });
});

describe("sweep: lembretes E1 e E2", () => {
  it("E1 a C − 7 às 09:00, com link até H + 3 dias; o estágio consome-se uma vez", async () => {
    const row = rowN(1);
    seed(row);
    const r = await sweep(E1);
    expect(r.reminders).toBe(1);
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledWith({
      stage: 1,
      email: "ana@example.com",
      locale: "pt",
      guestFirstName: "Ana",
      propertyName: "Villa Aura",
      checkIn: "2027-07-15",
      checkOut: "2027-07-22",
      amountCents: 500_000,
      chargeAt: C,
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpiresBeforeCharge: false,
      link: expectedLink(row, H),
      now: E1,
    });
    expect(stored().reminderStage).toBe(1);

    await sweep(plus(E1, 10 * MIN));
    await sweep(plus(E1, DAY));
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(1);

    await sweep(E2);
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(2);
    expect(h.mail.sendBalanceReminder).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 2, now: E2 }));
    expect(stored().reminderStage).toBe(2);
    await sweep(plus(E2, 10 * MIN));
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(2);
  });

  it("cartão que expira antes de C → o E1 pede para o atualizar", async () => {
    seed(rowN(1, { cardExpMonth: 5, cardExpYear: 2027 }));
    await sweep(E1);
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledWith(expect.objectContaining({ cardExpiresBeforeCharge: true }));
  });

  it("confirmação com menos de 48 h em C − 7 → E1 saltado, só o E2", async () => {
    seed(rowN(1, { createdAt: plus(E1, -47 * HOUR) }));
    await sweep(E1);
    expect(h.mail.sendBalanceReminder).not.toHaveBeenCalled();
    expect(stored().reminderStage).toBe(1);
    await sweep(E2);
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledWith(expect.objectContaining({ stage: 2 }));
  });

  it("os dois atrasados → só o E2", async () => {
    seed(rowN(1));
    await sweep(plus(E2, 2 * HOUR));
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledWith(expect.objectContaining({ stage: 2 }));
    expect(stored().reminderStage).toBe(2);
  });

  it("sem link (segredo em falta) → nada se consome; a passagem seguinte envia", async () => {
    seed(rowN(1));
    h.links.balanceLinkUrl.mockImplementationOnce(() => {
      throw new Error("BALANCE_LINK_SECRET em falta");
    });
    await sweep(E1);
    expect(h.mail.sendBalanceReminder).not.toHaveBeenCalled();
    expect(stored().reminderStage).toBe(0);
    await sweep(plus(E1, 10 * MIN));
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(1);
    expect(stored().reminderStage).toBe(1);
  });

  it("sem email → o estágio consome-se sem envio", async () => {
    seed(rowN(1, { email: null }));
    const r = await sweep(E1);
    expect(r.reminders).toBe(0);
    expect(h.mail.sendBalanceReminder).not.toHaveBeenCalled();
    expect(stored().reminderStage).toBe(1);
  });

  it("nunca para linhas que já não estão agendadas (retry)", async () => {
    seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, failureNoticeStage: 1 }));
    await sweep(E2);
    expect(h.mail.sendBalanceReminder).not.toHaveBeenCalled();
  });
});

describe("sweep: efeitos depois da cobrança (Guesty, nota, E4)", () => {
  const paid = (over: Partial<Row> = {}) =>
    rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, 2 * MIN), reminderStage: 2, ...over });
  const NOW = plus(C, 10 * MIN);

  it("regista a 2.ª parte no Guesty com o PI do saldo, escreve a nota e envia o E4, uma vez cada", async () => {
    seed(paid());
    const r1 = await sweep(NOW);
    expect(r1.effects).toBe(1);
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-1", 5000, "EUR", "pi_paid");
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledWith(
      "res-1",
      expect.stringContaining("2.a parte 5000.00 EUR cobrada pela plataforma (PI pi_paid)"),
    );
    expect(h.guestyPay.appendReservationNote.mock.calls[0][1]).toContain("NAO cobrar ao hospede");
    expect(h.mail.sendBalancePaid).toHaveBeenCalledWith({
      email: "ana@example.com",
      locale: "pt",
      guestFirstName: "Ana",
      propertyName: "Villa Aura",
      checkIn: "2027-07-15",
      checkOut: "2027-07-22",
      amountCents: 500_000,
      totalPaidCents: 1_100_000,
      cardLast4: "4242",
      confirmationCode: "GY-1",
    });
    expect(stored()).toMatchObject({ guestyBalanceRecordedAt: NOW, guestyBalanceClaimedAt: NOW, noteClaimedAt: NOW, emailPaidClaimedAt: NOW });

    const r2 = await sweep(plus(NOW, 10 * MIN));
    const r3 = await sweep(plus(NOW, 2 * HOUR));
    expect(r2.effects).toBe(0);
    expect(r3.effects).toBe(0);
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledTimes(1);
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(1);
  });

  it("registo no Guesty falhado → repete só depois de o claim expirar; nota e E4 nunca repetem", async () => {
    seed(paid());
    h.guestyPay.recordExternalPayment.mockImplementationOnce(async () => {
      throw new Error("balanceDue unreadable");
    });
    await sweep(NOW);
    expect(stored()).toMatchObject({ guestyBalanceRecordedAt: null, guestyBalanceClaimedAt: NOW });

    await sweep(plus(NOW, 10 * MIN));
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledTimes(1);

    const later = plus(NOW, 31 * MIN);
    await sweep(later);
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledTimes(2);
    expect(h.guestyPay.recordExternalPayment).toHaveBeenLastCalledWith("res-1", 5000, "EUR", "pi_paid");
    expect(stored().guestyBalanceRecordedAt).toEqual(later);
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(1);
  });

  it("linha paga sem PI gravado → efeitos adiados, nada registado", async () => {
    seed(paid({ balancePaymentIntentId: null }));
    await sweep(NOW);
    expect(h.guestyPay.recordExternalPayment).not.toHaveBeenCalled();
    expect(h.mail.sendBalancePaid).not.toHaveBeenCalled();
  });
});

/**
 * Regressão (era BUG): sem email, email_paid_claimed_at ficava NULL e a linha
 * aparecia para sempre em "pós-cobrança incompleto". Agora o claim fica e o
 * ops é avisado uma vez.
 */
describe("linha paga sem email: sai da lista de efeitos e o ops é avisado uma vez", () => {
  it("depois de registar no Guesty e escrever a nota, a linha sai da lista; alerta 'sem email' uma vez", async () => {
    seed(rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, 2 * MIN), email: null, reminderStage: 2 }));
    await sweep(plus(C, 10 * MIN));
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledTimes(1);
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalancePaid).not.toHaveBeenCalled();
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga, hóspede sem email — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toContain("+351912345678");
    const second = await sweep(plus(C, 20 * MIN));
    expect(second.effects).toBe(0);
    expect(await h.db.listPostChargeIncomplete(LIVE_SCOPE)).toEqual([]);
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
  });
});

describe("sweep: efeitos depois da cobrança — falhas e resultados do Guesty", () => {
  const paid = (over: Partial<Row> = {}) =>
    rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, 2 * MIN), reminderStage: 2, ...over });
  const NOW = plus(C, 10 * MIN);

  it("Guesty diz 'settled' (folio já a zero sem o nosso registo) → marcado e alerta de possível pagamento duplicado", async () => {
    seed(paid());
    h.guestyPay.recordExternalPayment.mockImplementationOnce(async () => "settled" as const);
    await sweep(NOW);
    expect(stored().guestyBalanceRecordedAt).toEqual(NOW);
    expect(alertSubjects()).toEqual([expect.stringContaining("verificar pagamento duplicado — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toContain("PI pi_paid");
  });

  it("'already-recorded' → marcado, sem alerta", async () => {
    seed(paid());
    h.guestyPay.recordExternalPayment.mockImplementationOnce(async () => "already-recorded" as const);
    await sweep(NOW);
    expect(stored().guestyBalanceRecordedAt).toEqual(NOW);
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("nota recusada pelo Guesty → claim libertado; a passagem seguinte escreve-a (uma vez)", async () => {
    seed(paid());
    h.guestyPay.appendReservationNote.mockImplementationOnce(async () => false);
    await sweep(NOW);
    expect(h.db.releaseEffect).toHaveBeenCalledWith("sp-1", "noteClaimedAt");
    expect(stored().noteClaimedAt).toBeNull();
    await sweep(plus(NOW, 10 * MIN));
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledTimes(2);
    expect(stored().noteClaimedAt).toEqual(plus(NOW, 10 * MIN));
    await sweep(plus(NOW, 20 * MIN));
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledTimes(2);
  });

  it("nota que lança → tratada como recusada (claim libertado)", async () => {
    seed(paid());
    h.guestyPay.appendReservationNote.mockImplementationOnce(async () => {
      throw new Error("Guesty 500");
    });
    await sweep(NOW);
    expect(stored().noteClaimedAt).toBeNull();
  });

  it("E4 não aceite → claim libertado; a passagem seguinte envia (uma vez)", async () => {
    seed(paid());
    h.mail.sendBalancePaid.mockImplementationOnce(async () => false);
    await sweep(NOW);
    expect(h.db.releaseEffect).toHaveBeenCalledWith("sp-1", "emailPaidClaimedAt");
    expect(stored().emailPaidClaimedAt).toBeNull();
    await sweep(plus(NOW, 10 * MIN));
    await sweep(plus(NOW, 20 * MIN));
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(2);
    expect(stored().emailPaidClaimedAt).toEqual(plus(NOW, 10 * MIN));
  });

  it("saldo pago pelo hóspede na página → efeitos com o PI dele", async () => {
    seed(paid({ balancePaymentIntentId: null, guestPaymentIntentId: "pi_g" }));
    await sweep(NOW);
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-1", 5000, "EUR", "pi_g");
  });
});

describe("sweep: reconciliação com o Guesty", () => {
  const NOW = L("2027-06-10", 12); // 18 dias antes de C: nenhum lembrete nem cobrança em jogo

  it("leitura válida grava a fotografia e last_reconciled_at", async () => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, withForeign(row, foreignPayment(30_000, "PENDING")));
    const r = await sweep(NOW);
    expect(r.reconciled).toBe(1);
    expect(stored()).toMatchObject({
      status: "scheduled",
      guestyStatus: "confirmed",
      guestyCheckIn: "2027-07-15",
      guestyCheckOut: "2027-07-22",
      guestyListingId: "lst-1",
      guestyTotalCents: 1_100_000,
      guestyTotalPaidCents: 530_000,
      guestyPendingForeignCents: 30_000,
      lastReconciledAt: NOW,
      lastReconcileError: null,
    });
  });

  it.each(["canceled", "cancelled"])("reserva %s no Guesty → needs_review até D e alerta; nunca reembolso automático", async (status) => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, snapshotFor(row, { status }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "reserva cancelada no Guesty", reviewDueAt: D, guestyStatus: status });
    expect(alertSubjects()).toEqual([expect.stringContaining("reserva cancelada no Guesty — GY-1")]);
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
  });

  it("reserva cancelada no Guesty com a cobrança devida agora → a reconciliação corre antes e nada é cobrado", async () => {
    const row = rowN(1, { reminderStage: 2 });
    seed(row);
    setSnapshot(row, snapshotFor(row, { status: "canceled" }));
    await sweep(plus(C, MIN));
    expect(stored().status).toBe("needs_review");
    expect(h.db.claimScheduledPaymentForCharge).not.toHaveBeenCalled();
    expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
  });

  it.each([
    ["check-in", { checkIn: "2027-07-16" }],
    ["check-out", { checkOut: "2027-07-23" }],
    ["casa", { listingId: "lst-2" }],
  ])("%s alterado no Guesty → needs_review até C e alerta", async (_label, change) => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, snapshotFor(row, change));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "datas ou casa alteradas no Guesty", reviewDueAt: C });
    expect(alertSubjects()).toEqual([expect.stringContaining("reserva alterada no Guesty — GY-1")]);
  });

  it("total do Guesty alterado face à fotografia anterior (> 1 €) → needs_review", async () => {
    const row = rowN(1, { guestyTotalCents: 1_100_000, guestyStatus: "confirmed", lastReconciledAt: plus(NOW, -2 * DAY) });
    seed(row);
    setSnapshot(row, snapshotFor(row, { totalCents: 1_150_000 }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "total alterado no Guesty", reviewDueAt: C, guestyTotalCents: 1_150_000 });
  });

  it("diferença de total até 1 € (arredondamentos) → nada", async () => {
    const row = rowN(1, { guestyTotalCents: 1_100_000, lastReconciledAt: plus(NOW, -2 * DAY) });
    seed(row);
    setSnapshot(row, snapshotFor(row, { totalCents: 1_100_100 }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "scheduled", guestyTotalCents: 1_100_100 });
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("primeira leitura (sem fotografia anterior) grava o total de referência sem alarmar", async () => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, snapshotFor(row, { totalCents: 1_234_500 }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "scheduled", guestyTotalCents: 1_234_500 });
  });

  it("pagamento de terceiros com o saldo → paid_externally e alerta; a cobrança em C já não a apanha", async () => {
    const row = rowN(1, { reminderStage: 2 });
    seed(row);
    setSnapshot(row, withForeign(row, foreignPayment(500_000)));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "paid_externally", paidExternallyRef: "guesty:5000.00 EUR" });
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga por fora — GY-1")]);
    await sweep(plus(C, MIN));
    expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
  });

  it("pagamento parcial de terceiros → needs_review até C", async () => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, withForeign(row, foreignPayment(200_000)));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "pagamento parcial por fora (2000.00 EUR)", reviewDueAt: C });
  });

  it("leitura inválida → só o erro; a última fotografia válida e last_reconciled_at ficam", async () => {
    const before = plus(NOW, -2 * DAY);
    const row = rowN(1, { guestyTotalCents: 1_100_000, guestyStatus: "confirmed", lastReconciledAt: before });
    seed(row);
    setSnapshot(row, null);
    const r = await sweep(NOW);
    expect(r.reconciled).toBe(0);
    expect(stored()).toMatchObject({ status: "scheduled", lastReconcileError: "leitura invalida", lastReconciledAt: before, guestyTotalCents: 1_100_000, guestyStatus: "confirmed" });
  });

  it("linha já em needs_review: grava a fotografia mas não mexe no estado nem alerta", async () => {
    const row = rowN(1, { status: "needs_review", reviewReason: "Preciso de ajuda", reviewDueAt: plus(NOW, DAY) });
    seed(row);
    setSnapshot(row, snapshotFor(row, { status: "canceled" }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "Preciso de ajuda", guestyStatus: "canceled" });
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("reconciliada há menos de um dia e sem ação nas próximas 24 h → não é relida", async () => {
    seed(rowN(1, { lastReconciledAt: plus(NOW, -2 * HOUR), guestyTotalCents: 1_100_000 }));
    const r = await sweep(NOW);
    expect(r.reconciled).toBe(0);
    expect(h.guesty.readReservationSnapshot).not.toHaveBeenCalled();
  });
});

describe("sweep: verificações antes do cancelamento irreversível em H", () => {
  const NOW = plus(H, MIN);
  /** Linha falhada com os 7 dias de aviso cumpridos: em H cancela, salvo o que estas verificações apanharem. */
  function due(over: Partial<Row> = {}): Row {
    const row = rowN(1, {
      status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2,
      failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), balancePaymentIntentId: "pi_last",
      ...over,
    });
    seed(row);
    seedPi("pi_last", "requires_payment_method", row);
    return row;
  }
  /** A reconciliação (passo 2) não vê nada: a mudança chega depois dela. */
  const reconciliationMisses = () => h.db.listForReconciliation.mockImplementation(async () => []);

  it("PI do hóspede pago entretanto → marcado pago, nada cancelado", async () => {
    const row = due({ guestPaymentIntentId: "pi_g" });
    seedPi("pi_g", "succeeded", row, { attempt: 1, source: "guest" }, plus(NOW, -30 * MIN));
    const report = await sweep(NOW);
    expect(report.hardStops).toBe(0);
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_g", succeededAt: NOW });
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
  });

  it.each([
    ["em processing", "processing", 3 * HOUR],
    ["a meio do 3DS (PI com 20 min)", "requires_action", 20 * MIN],
    ["por confirmar no browser (PI com 50 min)", "requires_confirmation", 50 * MIN],
  ])("PI do hóspede %s → espera (próxima passagem decide)", async (_label, status, age) => {
    const row = due({ guestPaymentIntentId: "pi_g" });
    seedPi("pi_g", status, row, { attempt: 1, source: "guest" }, plus(NOW, -age));
    const report = await sweep(NOW);
    expect(report.hardStops).toBe(0);
    expect(stored().status).toBe("needs_action");
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
  });

  it("PI do hóspede abandonado há mais de 1 h → cancela, e fecha também esse PI", async () => {
    const row = due({ guestPaymentIntentId: "pi_g" });
    seedPi("pi_g", "requires_action", row, { attempt: 1, source: "guest" }, plus(NOW, -2 * HOUR));
    const report = await sweep(NOW);
    expect(report.hardStops).toBe(1);
    expect(piStatus("pi_g")).toBe("canceled");
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("PI do hóspede ilegível na Stripe → espera", async () => {
    const row = due({ guestPaymentIntentId: "pi_g" });
    seedPi("pi_g", "requires_action", row);
    h.stripeState.failRetrieve = (id) => id === "pi_g";
    await sweep(NOW);
    expect(stored().status).toBe("needs_action");
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
  });

  it("Guesty ilegível no momento → espera, sem revisão nem cancelamento; o ops sabe (um alerta a cada 6 h, com D)", async () => {
    const row = due();
    setSnapshot(row, null);
    await sweep(NOW);
    expect(stored().status).toBe("needs_action");
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
    expect(alertSubjects()).toEqual([expect.stringContaining("cancelamento automático adiado — GY-1")]);
    await sweep(plus(NOW, 10 * MIN));
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["cancelada no Guesty", { status: "canceled" }],
    ["datas alteradas", { checkIn: "2027-07-16" }],
    ["casa alterada", { listingId: "lst-2" }],
  ])("%s depois da reconciliação → needs_review (sem prazo) e alerta, nada cancelado", async (_label, change) => {
    const row = due();
    reconciliationMisses();
    setSnapshot(row, snapshotFor(row, change as Partial<ReservationSnapshot>));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "reserva alterada no Guesty no prazo H", reviewDueAt: null });
    expect(alertSubjects()).toEqual([expect.stringContaining("prazo H com a reserva alterada no Guesty — GY-1")]);
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
  });

  it("saldo pago por fora → paid_externally, nada cancelado", async () => {
    const row = due();
    reconciliationMisses();
    setSnapshot(row, withForeign(row, foreignPayment(500_000)));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "paid_externally", paidExternallyRef: "guesty:5000.00 EUR" });
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga por fora no prazo H — GY-1")]);
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
  });

  it.each([
    ["parcial", foreignPayment(100_000)],
    ["pendente (payment link)", foreignPayment(500_000, "PENDING")],
  ])("pagamento por fora %s → needs_review e alerta, nada cancelado", async (_label, payment) => {
    const row = due();
    reconciliationMisses();
    setSnapshot(row, withForeign(row, payment));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "pagamento por fora (parcial ou pendente) no prazo H", reviewDueAt: null });
    expect(alertSubjects()).toEqual([expect.stringContaining("prazo H com pagamento por fora — GY-1")]);
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
  });

  it("tudo limpo → claim com hardStopNow e reason cancel:unpaid, e o cancelamento corre com a mesma hora", async () => {
    due();
    reconciliationMisses();
    const report = await sweep(NOW);
    expect(report.hardStops).toBe(1);
    expect(h.db.claimScheduledPaymentForCancel).toHaveBeenCalledWith("sp-1", ["retry", "needs_action"], { hardStopNow: NOW, reason: "cancel:unpaid" });
    expect(stored()).toMatchObject({ status: "cancelled_unpaid", cancelledAt: NOW, reviewReason: "cancel:unpaid" });
  });
});

describe("sweep: lembretes só com a reserva confirmada no Guesty", () => {
  // Reconciliada há 1 h e sem ação nas próximas 24 h: o passo 2 não a relê,
  // por isso só a leitura própria do lembrete pode apanhar a mudança.
  const fresh = (over: Partial<Row> = {}) => rowN(1, { lastReconciledAt: plus(E1, -HOUR), guestyTotalCents: 1_100_000, ...over });

  it.each([
    ["cancelada no Guesty", { status: "canceled" }],
    ["noutras datas", { checkIn: "2027-07-16" }],
    ["noutra data de saída", { checkOut: "2027-07-23" }],
  ])("reserva %s → sem lembrete e sem consumir o estágio", async (_label, change) => {
    const row = fresh();
    seed(row);
    setSnapshot(row, snapshotFor(row, change as Partial<ReservationSnapshot>));
    await sweep(E1);
    expect(h.mail.sendBalanceReminder).not.toHaveBeenCalled();
    expect(stored().reminderStage).toBe(0);
  });

  it("Guesty ilegível → tenta na passagem seguinte, sem consumir; com leitura boa envia", async () => {
    const row = fresh();
    seed(row);
    setSnapshot(row, null);
    await sweep(E1);
    expect(h.mail.sendBalanceReminder).not.toHaveBeenCalled();
    expect(stored().reminderStage).toBe(0);
    setSnapshot(row, snapshotFor(row));
    await sweep(plus(E1, 10 * MIN));
    expect(h.mail.sendBalanceReminder).toHaveBeenCalledTimes(1);
    expect(stored().reminderStage).toBe(1);
  });

  it("E1 saltado (confirmação com menos de 48 h) não precisa do Guesty: consome-se sem leitura", async () => {
    const row = fresh({ createdAt: plus(E1, -47 * HOUR) });
    seed(row);
    setSnapshot(row, null);
    await sweep(E1);
    expect(h.guesty.readReservationSnapshot).not.toHaveBeenCalled();
    expect(stored().reminderStage).toBe(1);
  });
});

describe("sweep: reconciliação — referência do total e pagamentos por fora", () => {
  const NOW = L("2027-06-10", 12);

  it.each([
    ["sem a 1.ª parte registada no Guesty (settle a meio)", { guestyDepositRecordedAt: null, lastReconciledAt: plus(NOW, -2 * DAY) }],
    ["fotografia anterior tirada antes do registo da 1.ª parte", { guestyDepositRecordedAt: plus(NOW, -DAY), lastReconciledAt: plus(NOW, -2 * DAY) }],
    ["sem fotografia anterior", { lastReconciledAt: null }],
  ])("total diferente %s → não conta como alteração (a fee do settle mexe no folio)", async (_label, over) => {
    const row = rowN(1, { guestyTotalCents: 1_000_000, ...over });
    seed(row);
    setSnapshot(row, snapshotFor(row, { totalCents: 1_100_000 }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "scheduled", guestyTotalCents: 1_100_000 });
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("com a referência pronta (reconciliada depois do registo da 1.ª parte) → total alterado vai para revisão", async () => {
    const row = rowN(1, { guestyTotalCents: 1_000_000, guestyDepositRecordedAt: plus(NOW, -3 * DAY), lastReconciledAt: plus(NOW, -2 * DAY) });
    seed(row);
    setSnapshot(row, snapshotFor(row, { totalCents: 1_100_000 }));
    await sweep(NOW);
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "total alterado no Guesty" });
  });

  it("pagamento parcial por fora → needs_review e alerta", async () => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, withForeign(row, foreignPayment(200_000)));
    await sweep(NOW);
    expect(alertSubjects()).toEqual([expect.stringContaining("pagamento parcial por fora — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toContain("2000.00 EUR");
  });

  it("pagamento PENDENTE por fora a aparecer → alerta uma vez (apagar o link); a linha fica agendada", async () => {
    const row = rowN(1);
    seed(row);
    setSnapshot(row, withForeign(row, foreignPayment(500_000, "PENDING")));
    await sweep(NOW);
    expect(alertSubjects()).toEqual([expect.stringContaining("pagamento pendente no Guesty — GY-1")]);
    expect(stored()).toMatchObject({ status: "scheduled", guestyPendingForeignCents: 500_000 });
    // No dia seguinte o pendente continua: sem novo alerta.
    await sweep(plus(NOW, DAY + MIN));
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
  });

  it("…e a cobrança em C não avança por cima dele", async () => {
    const row = rowN(1, { reminderStage: 2 });
    seed(row);
    setSnapshot(row, withForeign(row, foreignPayment(500_000, "PENDING")));
    await sweep(plus(C, MIN));
    expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "pagamento pendente no Guesty (payment link?)" });
  });
});

describe("sweep: pulso (heartbeat) e saúde", () => {
  const NOW = plus(C, 5 * MIN);

  it.each([
    ["cobranças", "listDueScheduledPayments", "cobrancas: BD em baixo"],
    ["paragem dura", "listHardStopDue", "paragem: BD em baixo"],
  ] as const)("um passo de %s que rebenta → sem heartbeat (o monitor tem de ficar vermelho)", async (_label, fn, msg) => {
    seed(rowN(1, { reminderStage: 2 }));
    (h.db[fn] as Mock).mockImplementation(async () => {
      throw new Error("BD em baixo");
    });
    const report = await sweep(NOW);
    expect(report.errors).toContain(msg);
    expect(h.db.setBalanceHeartbeat).not.toHaveBeenCalled();
  });

  it.each([
    ["presas", "listStuckCharging"],
    ["reconciliação", "listForReconciliation"],
    ["lembretes", "listScheduledForReminders"],
    ["efeitos", "listPostChargeIncomplete"],
    ["avisos", "listFailureNoticeCandidates"],
    ["cancelamentos", "listCancelling"],
  ] as const)("um passo de %s que rebenta → o heartbeat bate na mesma", async (_label, fn) => {
    (h.db[fn] as Mock).mockImplementation(async () => {
      throw new Error("timeout");
    });
    const report = await sweep(NOW);
    expect(report.errors).toHaveLength(1);
    expect(h.db.setBalanceHeartbeat).toHaveBeenCalledWith(NOW, LIVE_SCOPE);
  });

  it("saúde: heartbeat fresco mas uma cobrança atrasada mais de 1 h → não ok", async () => {
    const now = plus(C, 2 * HOUR);
    await runBalanceSweep(plus(now, -5 * MIN), { ...PROD_ENV });
    // Uma linha devida há 61 min que o sweep não cobrou (ex.: pausa de claim, erro por linha).
    seed(rowN(1, { reminderStage: 2, nextAttemptAt: plus(now, -61 * MIN) }));
    expect(await balanceHealth(now, PROD_ENV)).toMatchObject({ ok: false, enabled: true, ageMinutes: 5 });
    h.store.get("sp-1")!.nextAttemptAt = plus(now, -59 * MIN);
    expect(await balanceHealth(now, PROD_ENV)).toMatchObject({ ok: true, ageMinutes: 5 });
  });
});

/**
 * Regressão: as exceções de cada cobrança entram no relatório como
 * "cobranca <id>: …". Quando todas as linhas da passagem rebentam, o motor
 * está tão parado como quando o passo inteiro falha: sem heartbeat. Uma linha
 * má no meio de outras boas não segura o pulso (o teste das cobranças
 * atrasadas em balanceHealth apanha-a ao fim de 1 h).
 */
describe("heartbeat: cobranças que rebentam linha a linha", () => {
  it("todas as cobranças da passagem rebentam → sem heartbeat", async () => {
    seed(rowN(1, { reminderStage: 2 }), rowN(2, { reminderStage: 2 }));
    h.db.claimScheduledPaymentForCharge.mockImplementation(async () => {
      throw new Error("Unknown column 'claim_source'");
    });
    const report = await sweep(plus(C, 5 * MIN));
    expect(report.charged).toEqual({ released: 2 });
    expect(report.errors).toHaveLength(2);
    expect(h.db.setBalanceHeartbeat).not.toHaveBeenCalled();
  });

  it("uma linha rebenta e outra corre → heartbeat bate", async () => {
    seed(rowN(1, { reminderStage: 2 }), rowN(2, { reminderStage: 2 }));
    const real = h.db.claimScheduledPaymentForCharge.getMockImplementation()!;
    h.db.claimScheduledPaymentForCharge.mockImplementation(async (...a: any[]) => {
      if (a[0] === "sp-1") throw new Error("Unknown column 'claim_source'");
      return (real as any)(...a);
    });
    const report = await sweep(plus(C, 5 * MIN));
    expect(report.errors).toHaveLength(1);
    expect(h.db.setBalanceHeartbeat).toHaveBeenCalledTimes(1);
  });
});

/* ════════════════════════════════════════════════════════════════
   5. handleBalancePaymentSucceeded (webhook)
   ════════════════════════════════════════════════════════════════ */

describe("handleBalancePaymentSucceeded", () => {
  const NOW = plus(C, 3 * MIN);
  const event = (id: string, metadata: Record<string, string> | null = { scheduledPaymentId: "sp-1", intentId: "int-1" }) => ({ id, amount: 500_000, metadata });

  it("encontrada pelo PI do saldo → marked", async () => {
    seed(rowN(1, { status: "charging", attempts: 1, claimedAt: C, claimSource: "sweep", balancePaymentIntentId: "pi_w" }));
    expect(await handleBalancePaymentSucceeded(event("pi_w"), NOW)).toBe("marked");
    expect(stored()).toMatchObject({ status: "succeeded", succeededAt: NOW, balancePaymentIntentId: "pi_w" });
    expect(h.db.getScheduledPaymentById).not.toHaveBeenCalled();
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("encontrada pelo PI do hóspede → marked", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, guestPaymentIntentId: "pi_g", balancePaymentIntentId: "pi_b" }));
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("marked");
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_g" });
  });

  it("PI de uma tentativa anterior → encontrada pela metadata.scheduledPaymentId e marked; o PI aberto mais recente é cancelado", async () => {
    const row = rowN(1, { status: "needs_action", attempts: 2, balancePaymentIntentId: "pi_new" });
    seed(row);
    seedPi("pi_new", "requires_payment_method", row);
    expect(await handleBalancePaymentSucceeded(event("pi_old"), NOW)).toBe("marked");
    expect(h.db.getScheduledPaymentById).toHaveBeenCalledWith("sp-1");
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_old" });
    expect(h.stripe.cancelOpenPaymentIntent).toHaveBeenCalledWith("pi_new");
    expect(piStatus("pi_new")).toBe("canceled");
  });

  it("hóspede pagou pela página → marked e o PI do sweep que ficou aberto deixa de poder cobrar", async () => {
    const row = rowN(1, { status: "needs_action", attempts: 1, balancePaymentIntentId: "pi_b", guestPaymentIntentId: "pi_g", claimSource: "guest", claimedAt: NOW });
    seed(row);
    seedPi("pi_b", "requires_payment_method", row);
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("marked");
    expect(h.stripe.cancelOpenPaymentIntent.mock.calls.map((c) => c[0])).toEqual(["pi_b"]);
    expect(piStatus("pi_b")).toBe("canceled");
  });

  it("segundo PI pago numa linha já paga por outro → reembolso imediato desse PI e alerta (duplicate)", async () => {
    seed(rowN(1, { status: "succeeded", balancePaymentIntentId: "pi_a", succeededAt: C }));
    h.stripeState.refund = () => ({ refundId: "re_dup", refundCents: 500_000, status: "succeeded" });
    expect(await handleBalancePaymentSucceeded(event("pi_b"), NOW)).toBe("duplicate");
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith({
      paymentIntentId: "pi_b", intentId: "int-1", scheduledPaymentId: "sp-1-dup", reason: "two_parts_duplicate",
    });
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte cobrada duas vezes — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][1]).toContain("succeeded (5000.00 EUR)");
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_a" });
  });

  it("reembolso do duplicado falhado → o alerta pede o reembolso à mão", async () => {
    seed(rowN(1, { status: "succeeded", balancePaymentIntentId: "pi_a", succeededAt: C }));
    h.stripeState.refund = () => {
      throw new Error("Stripe 500");
    };
    expect(await handleBalancePaymentSucceeded(event("pi_b"), NOW)).toBe("duplicate");
    expect(h.mail.sendOpsAlert.mock.calls[0][1][1]).toContain("Reembolsar à mão no Stripe AGORA");
  });

  it.each([
    ["sem metadata", null],
    ["metadata com uma linha que não existe", { scheduledPaymentId: "sp-404", intentId: "int-9" }],
  ])("órfão (%s) → alerta ao ops", async (_label, metadata) => {
    seed(rowN(1));
    expect(await handleBalancePaymentSucceeded(event("pi_zzz", metadata), NOW)).toBe("orphan");
    expect(alertSubjects()).toEqual(["DUAS PARTES: pagamento da 2.ª parte sem linha — pi_zzz"]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toContain("5000.00 EUR");
    expect(stored().status).toBe("scheduled");
  });

  it("já marcada → already, sem alerta", async () => {
    seed(rowN(1, { status: "succeeded", balancePaymentIntentId: "pi_w", succeededAt: C }));
    expect(await handleBalancePaymentSucceeded(event("pi_w"), NOW)).toBe("already");
    expect(h.db.markScheduledPaymentSucceeded).not.toHaveBeenCalled();
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("linha em cancelling sem nada irreversível → markCancellingAsSucceeded", async () => {
    seed(rowN(1, { status: "cancelling", balancePaymentIntentId: "pi_w", cancelPisClaimedAt: plus(H, MIN) }));
    expect(await handleBalancePaymentSucceeded(event("pi_w"), plus(H, 2 * MIN))).toBe("marked");
    expect(h.db.markCancellingAsSucceeded).toHaveBeenCalledWith("sp-1", "pi_w", plus(H, 2 * MIN));
    expect(stored()).toMatchObject({ status: "succeeded", cancelPisClaimedAt: null });
  });

  it("linha em cancelling já com o Guesty reclamado → terminal e alerta (dinheiro a devolver)", async () => {
    seed(rowN(1, { status: "cancelling", balancePaymentIntentId: "pi_w", cancelPisClaimedAt: plus(H, MIN), guestyCancelClaimedAt: plus(H, MIN) }));
    expect(await handleBalancePaymentSucceeded(event("pi_w"), plus(H, 2 * MIN))).toBe("terminal");
    expect(stored().status).toBe("cancelling");
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga numa reserva cancelling — GY-1")]);
  });

  it.each(["cancelled_unpaid", "cancelled_by_guest", "paid_externally"] as const)(
    "linha %s → terminal; o alerta só sai depois de reler a linha",
    async (status) => {
      seed(rowN(1, { status, balancePaymentIntentId: "pi_w" }));
      expect(await handleBalancePaymentSucceeded(event("pi_w"), NOW)).toBe("terminal");
      expectOrder(["getScheduledPaymentByBalancePi", "markScheduledPaymentSucceeded", "getScheduledPaymentById", "sendOpsAlert"]);
      expect(alertSubjects()).toEqual([expect.stringContaining(`2.ª parte paga numa reserva ${status} — GY-1`)]);
      expect(h.mail.sendOpsAlert.mock.calls[0][1].join(" ")).toContain("tem de ser devolvido");
      expect(stored().status).toBe(status);
    },
  );

  it("leitura desatualizada (o sweep marcou-a entretanto) → a releitura evita um alarme falso", async () => {
    seed(rowN(1, { status: "succeeded", balancePaymentIntentId: "pi_w", succeededAt: C }));
    h.db.getScheduledPaymentByBalancePi.mockImplementationOnce(async () => ({ ...stored(), status: "charging" as const }));
    expect(await handleBalancePaymentSucceeded(event("pi_w"), NOW)).toBe("already");
    expect(h.db.getScheduledPaymentById).toHaveBeenCalledWith("sp-1");
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════
   6. Saúde e digest
   ════════════════════════════════════════════════════════════════ */

describe("balanceHealth e sendDailyBalanceDigest", () => {
  const NOW = plus(C, HOUR);

  it("desligado → ok sem ler a BD", async () => {
    expect(await balanceHealth(NOW, LIVE)).toEqual({ ok: true, enabled: false, lastRunAt: null, ageMinutes: null });
    expect(h.db.getBalanceHeartbeat).not.toHaveBeenCalled();
  });

  it("ligado: heartbeat do sweep com até 30 min → ok; mais → falha; nunca correu → falha", async () => {
    expect(await balanceHealth(NOW, PROD_ENV)).toEqual({ ok: false, enabled: true, lastRunAt: null, ageMinutes: null });

    await runBalanceSweep(plus(NOW, -10 * MIN), PROD_ENV);
    expect(await balanceHealth(NOW, PROD_ENV)).toEqual({
      ok: true, enabled: true, lastRunAt: plus(NOW, -10 * MIN).toISOString(), ageMinutes: 10,
    });
    expect(await balanceHealth(plus(NOW, 21 * MIN), PROD_ENV)).toMatchObject({ ok: false, ageMinutes: 31 });
  });

  it("digest: desligado não envia; ligado envia com o scope e o heartbeat", async () => {
    expect(await sendDailyBalanceDigest(NOW, LIVE)).toBe(false);
    expect(h.mail.sendBalanceDigest).not.toHaveBeenCalled();

    await runBalanceSweep(plus(NOW, -5 * MIN), PROD_ENV);
    expect(await sendDailyBalanceDigest(NOW, PROD_ENV)).toBe(true);
    expect(h.db.listBalanceDigest).toHaveBeenCalledWith(LIVE_SCOPE, NOW);
    expect(h.mail.sendBalanceDigest).toHaveBeenCalledWith(expect.objectContaining({
      generatedAt: NOW,
      livemode: true,
      siteOrigin: ORIGIN,
      heartbeatAt: plus(NOW, -5 * MIN),
      chargesEnabled: true,
    }));
  });
});

/* ════════════════════════════════════════════════════════════════
   7. Fase 2b: página do saldo (link com token)
   ════════════════════════════════════════════════════════════════ */

describe("Fase 2b: página do saldo", () => {
  /** Antes de C: a linha está agendada e o cancelamento gratuito aberto. */
  const NOW_G = L("2027-06-20", 15);
  const tok = (exp: Date = plus(H, 3 * DAY), intentId = "int-1") => balanceLinkToken(intentId, exp);

  beforeEach(() => {
    // rowForLink lê o scope e o segredo do link do process.env.
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    vi.stubEnv("SITE_URL", `https://${ORIGIN}`);
    vi.stubEnv("BALANCE_LINK_SECRET", "segredo-de-teste-do-link");
    h.stripeState.clockMs = NOW_G.getTime();
  });

  describe("acesso pelo link", () => {
    it.each([
      ["token com o MAC errado", () => `${Math.floor(plus(H, 3 * DAY).getTime() / 1000)}.${"0".repeat(32)}`],
      ["lixo", () => "isto-nao-e-um-token"],
      ["token verdadeiro de outra reserva", () => tok(plus(H, 3 * DAY), "int-2")],
      ["token falso com prazo passado (não pode passar por expirado)", () => `${Math.floor(plus(NOW_G, -DAY).getTime() / 1000)}.${"a".repeat(32)}`],
    ])("%s → not_found, sem pistas", async (_label, token) => {
      seed(rowN(1));
      expect(await guestBalanceView("int-1", token(), NOW_G)).toEqual({ kind: "not_found" });
    });

    it("token verdadeiro mas fora de prazo → expired, com o email mascarado", async () => {
      seed(rowN(1));
      expect(await guestBalanceView("int-1", tok(plus(NOW_G, -MIN)), NOW_G)).toEqual({ kind: "expired", emailMasked: "a••@example.com" });
    });

    it("intent sem agendamento → not_found", async () => {
      expect(await guestBalanceView("int-404", tok(plus(H, 3 * DAY), "int-404"), NOW_G)).toEqual({ kind: "not_found" });
    });

    it("linha de outro ambiente (teste num site de produção) → not_found mesmo com token válido", async () => {
      seed(rowN(1, { livemode: false }));
      expect(await guestBalanceView("int-1", tok(), NOW_G)).toEqual({ kind: "not_found" });
      expect(await prepareGuestPayment("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "not_payable" });
    });
  });

  describe("guestBalanceView", () => {
    it("agendada, antes de C: pode pagar, trocar de cartão, cancelar grátis e pedir ajuda; texto do mandato presente", async () => {
      seed(rowN(1));
      seedDeposit({ boughtAt: plus(NOW_G, -3 * DAY) });
      const v = await guestBalanceView("int-1", tok(), NOW_G);
      const mandate = (await import("./two-parts-mandate")).renderCardChangeMandate("pt", {
        amountLaterCents: 500_000, chargeAt: C, freeCancelDeadlineAt: D, now: NOW_G,
      });
      expect(v).toEqual({
        kind: "ok",
        status: "scheduled",
        propertyName: "Villa Aura",
        checkIn: "2027-07-15",
        checkOut: "2027-07-22",
        locale: "pt",
        amountLaterCents: 500_000,
        amountPaidCents: 600_000,
        currency: "EUR",
        chargeAt: C.toISOString(),
        hardStopAt: H.toISOString(),
        freeCancelDeadlineAt: D.toISOString(),
        cardBrand: "visa",
        cardLast4: "4242",
        lastDeclineKind: null,
        nextAttemptAt: null,
        canPayNow: true,
        canConfirmSameCard: false,
        canChangeCard: true,
        canCancelFree: true,
        // Flex comprado há 3 dias: ainda é devolvido.
        refundIfCancelCents: 600_000,
        canRequestHelp: true,
        helpPausedUntil: null,
        cancelledAt: null,
        refundCents: null,
        succeededAt: null,
        // O cartão do pagamento da 1.ª parte (para onde vai um reembolso), não o da 2.ª (4242).
        refundCardsLast4: ["1881"],
        cardChangeConsent: { text: mandate.text, version: CARD_CHANGE_MANDATE_VERSION, renderedAt: NOW_G.toISOString() },
      });
      expect(v.kind === "ok" && v.cardChangeConsent!.text).toBeTruthy();
    });

    it("Flex comprado há mais de 14 dias → o valor a devolver já o desconta", async () => {
      seed(rowN(1));
      seedDeposit({ boughtAt: CREATED });
      expect(await guestBalanceView("int-1", tok(), NOW_G)).toMatchObject({ kind: "ok", refundIfCancelCents: 570_000 });
    });

    it("1.ª parte ilegível na Stripe → mostra a página sem valor de reembolso", async () => {
      seed(rowN(1));
      expect(await guestBalanceView("int-1", tok(), NOW_G)).toMatchObject({ kind: "ok", canCancelFree: true, refundIfCancelCents: null });
    });

    it("3DS pedido (needs_action) → pode confirmar com o mesmo cartão", async () => {
      seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "authentication_required" }));
      expect(await guestBalanceView("int-1", tok(), plus(C, HOUR))).toMatchObject({
        kind: "ok", lastDeclineKind: "auth", canConfirmSameCard: true, canPayNow: true, canChangeCard: true, nextAttemptAt: null,
      });
    });

    it("recusa soft (retry) → mostra a próxima tentativa; recusa hard não oferece o mesmo cartão", async () => {
      seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds" }));
      expect(await guestBalanceView("int-1", tok(), plus(C, HOUR))).toMatchObject({
        kind: "ok", lastDeclineKind: "soft", canConfirmSameCard: false, nextAttemptAt: R1.toISOString(),
      });
      h.store.get("sp-1")!.lastDeclineCode = "expired_card";
      expect(await guestBalanceView("int-1", tok(), plus(C, HOUR))).toMatchObject({ kind: "ok", lastDeclineKind: "hard", canConfirmSameCard: false });
    });

    it("paga na totalidade, antes de D → só cancelar (devolve as duas partes); sem pagar, trocar de cartão nem mandato", async () => {
      const row = rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN) });
      seed(row);
      seedPi("pi_paid", "succeeded", row);
      seedDeposit({ boughtAt: plus(NOW_G, -3 * DAY) });
      expect(await guestBalanceView("int-1", tok(), plus(C, HOUR))).toMatchObject({
        kind: "ok", status: "succeeded", canPayNow: false, canChangeCard: false, canConfirmSameCard: false, canRequestHelp: false,
        canCancelFree: true, refundIfCancelCents: 1_100_000, cardChangeConsent: null, succeededAt: plus(C, MIN).toISOString(),
      });
    });

    it("por pagar depois de H → já não paga nem troca de cartão; cancelamento gratuito ainda aberto até D", async () => {
      seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card" }));
      expect(await guestBalanceView("int-1", tok(), plus(H, HOUR))).toMatchObject({
        kind: "ok", canPayNow: false, canChangeCard: false, cardChangeConsent: null, canCancelFree: true, canRequestHelp: true,
      });
    });

    it("depois de D → cancelamento gratuito fechado e sem valor de reembolso", async () => {
      seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card" }));
      // (Token com prazo para lá de D: o link normal, H + 3 dias, expira a D às 12:00.)
      expect(await guestBalanceView("int-1", tok(plus(D, DAY)), plus(D, MIN))).toMatchObject({ kind: "ok", canCancelFree: false, refundIfCancelCents: null });
      expect(h.klarna.getPaymentIntent).not.toHaveBeenCalled();
    });

    it("cancelada (cancelled_unpaid) → tudo fechado, com a data e o valor devolvido", async () => {
      seed(rowN(1, { status: "cancelled_unpaid", cancelledAt: plus(H, MIN), refundCents: 600_000, refundStatus: "succeeded" }));
      expect(await guestBalanceView("int-1", tok(), plus(H, HOUR))).toMatchObject({
        kind: "ok", canPayNow: false, canChangeCard: false, canCancelFree: false, canRequestHelp: false, cardChangeConsent: null,
        cancelledAt: plus(H, MIN).toISOString(), refundCents: 600_000,
      });
    });

    it("em pausa de ajuda (needs_review) → sem ações, mostra até quando", async () => {
      seed(rowN(1, { status: "needs_review", helpPausedUntil: plus(NOW_G, 5 * DAY), reviewReason: "hospede pediu ajuda" }));
      expect(await guestBalanceView("int-1", tok(), NOW_G)).toMatchObject({
        kind: "ok", canPayNow: false, canChangeCard: false, canCancelFree: false, canRequestHelp: false, helpPausedUntil: plus(NOW_G, 5 * DAY).toISOString(),
      });
    });
  });

  describe("prepareGuestPayment (Pagar agora)", () => {
    it("cria o PI do hóspede (sem confirmar), grava-o com claim do hóspede e devolve o client secret", async () => {
      seed(rowN(1));
      const r = await prepareGuestPayment("int-1", tok(), NOW_G);
      expect(r).toEqual({ ok: true, clientSecret: "pi_bal_1_secret_x", paymentMethodId: "pm_1", amountCents: 500_000 });
      expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledWith({
        scheduledPaymentId: "sp-1",
        attempt: Math.floor(NOW_G.getTime() / 60_000),
        source: "guest",
        // Sem PI anterior do hóspede: "first" (C13).
        keyNonce: "first",
        amountCents: 500_000,
        customer: "cus_1",
        paymentMethod: "pm_1",
        description: "Estadia Villa Aura 2027-07-15: 2.a parte",
        metadata: { intentId: "int-1", scheduledPaymentId: "sp-1", reservationId: "res-1", confirmationCode: "GY-1" },
      });
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
      // A linha não muda de estado, mas fica marcada como reclamada pelo hóspede.
      expect(stored()).toMatchObject({ status: "scheduled", guestPaymentIntentId: "pi_bal_1", claimSource: "guest", claimedAt: NOW_G, attempts: 0 });
    });

    it("duplo clique → o mesmo PI (reutilizado), sem criar outro", async () => {
      seed(rowN(1));
      const a = await prepareGuestPayment("int-1", tok(), NOW_G);
      const b = await prepareGuestPayment("int-1", tok(), plus(NOW_G, 20_000));
      expect(b).toEqual(a);
      expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
    });

    it("PI do hóspede com outro cartão (trocou de cartão entretanto) → cancelado e um novo criado", async () => {
      const row = rowN(1, { guestPaymentIntentId: "pi_old_g", paymentMethodId: "pm_new" });
      seed(row);
      seedPi("pi_old_g", "requires_action", rowN(1)); // payment_method pm_1
      const r = await prepareGuestPayment("int-1", tok(), NOW_G);
      expect(r).toMatchObject({ ok: true, paymentMethodId: "pm_new", clientSecret: "pi_bal_1_secret_x" });
      expect(piStatus("pi_old_g")).toBe("canceled");
    });

    it("PI do sweep aberto → cancelado antes de criar o do hóspede", async () => {
      const row = rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "authentication_required", balancePaymentIntentId: "pi_sw" });
      seed(row);
      seedPi("pi_sw", "requires_action", row);
      const r = await prepareGuestPayment("int-1", tok(), plus(C, HOUR));
      expect(r).toMatchObject({ ok: true });
      expect(piStatus("pi_sw")).toBe("canceled");
      // O Guesty lê-se antes de mexer em qualquer PI (C0/C8).
      expectOrder(["retrieveBalancePaymentIntent", "readReservationSnapshot", "cancelOpenPaymentIntent", "createBalancePaymentIntent", "setGuestPaymentIntent"]);
    });

    it("um PI anterior já pagou → marca a linha paga e responde 'paid'", async () => {
      const row = rowN(1, { status: "needs_action", attempts: 1, balancePaymentIntentId: "pi_sw" });
      seed(row);
      seedPi("pi_sw", "succeeded", row);
      expect(await prepareGuestPayment("int-1", tok(), plus(C, HOUR))).toEqual({ ok: false, reason: "paid" });
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_sw" });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("um PI anterior em processing → 'processing', nada criado", async () => {
      const row = rowN(1, { guestPaymentIntentId: "pi_g" });
      seed(row);
      seedPi("pi_g", "processing", row);
      expect(await prepareGuestPayment("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "processing" });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it.each([
      ["ilegível", null],
      ["cancelada", "canceled"],
      ["com pagamento por fora", "foreign"],
      ["com pagamento pendente por fora (payment link)", "pending"],
      ["com datas mudadas", "dates"],
      ["com outra casa", "listing"],
    ])("Guesty %s → 'guesty', nada criado", async (_label, kind) => {
      const row = rowN(1);
      seed(row);
      setSnapshot(
        row,
        kind === null ? null
          : kind === "foreign" ? withForeign(row, foreignPayment(100_000))
          : kind === "pending" ? withForeign(row, foreignPayment(500_000, "PENDING"))
          : kind === "dates" ? snapshotFor(row, { checkOut: "2027-07-23" })
          : kind === "listing" ? snapshotFor(row, { listingId: "lst-outra" })
          : snapshotFor(row, { status: kind }),
      );
      expect(await prepareGuestPayment("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "guesty" });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("a linha muda entre a criação e a gravação (o sweep reclamou-a) → PI cancelado, 'not_payable'", async () => {
      seed(rowN(1));
      h.stripeState.onCreate = () => {
        h.store.get("sp-1")!.status = "charging";
      };
      expect(await prepareGuestPayment("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "not_payable" });
      expect(h.db.setGuestPaymentIntent).toHaveBeenCalledWith("sp-1", "pi_bal_1", NOW_G);
      expect(piStatus("pi_bal_1")).toBe("canceled");
      expect(stored().guestPaymentIntentId).toBeNull();
    });

    it("Stripe a falhar → 'error'", async () => {
      seed(rowN(1));
      h.stripeState.createError = new Error("Stripe 500");
      expect(await prepareGuestPayment("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "error" });
    });

    it.each([
      ["paga", { status: "succeeded" as const }, "paid"],
      ["paga por fora", { status: "paid_externally" as const }, "paid"],
      ["em revisão", { status: "needs_review" as const }, "not_payable"],
      ["a cancelar", { status: "cancelling" as const }, "not_payable"],
    ])("linha %s → %s sem tocar na Stripe", async (_label, over, reason) => {
      seed(rowN(1, over));
      expect(await prepareGuestPayment("int-1", tok(), NOW_G)).toEqual({ ok: false, reason });
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });

    it("depois de H → 'not_payable'; token expirado → 'expired'", async () => {
      seed(rowN(1, { status: "needs_action", attempts: 1 }));
      expect(await prepareGuestPayment("int-1", tok(), H)).toEqual({ ok: false, reason: "not_payable" });
      expect(await prepareGuestPayment("int-1", tok(plus(NOW_G, -MIN)), NOW_G)).toEqual({ ok: false, reason: "expired" });
    });

    it("o sweep vê o PI do hóspede: espera por ele enquanto tem menos de 1 h", async () => {
      seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, failureNoticeStage: 1, reminderStage: 2 }));
      h.stripeState.clockMs = plus(R1, -20 * MIN).getTime();
      expect(await prepareGuestPayment("int-1", tok(), plus(R1, -20 * MIN))).toMatchObject({ ok: true });
      const report = await sweep(plus(R1, MIN));
      expect(report.charged).toEqual({ released: 1 });
      expect(h.stripe.confirmBalanceOffSession).not.toHaveBeenCalled();
    });
  });

  describe("troca de cartão", () => {
    function confirmedSetupIntent(over: Partial<{ status: string; customer: string; scheduledPaymentId: string; withPm: boolean }> = {}) {
      h.stripeState.setupIntents.set("seti_ok", {
        id: "seti_ok",
        status: over.status ?? "succeeded",
        customer: over.customer ?? "cus_1",
        client_secret: "seti_ok_secret",
        metadata: { flow: "card_v2_card_change", intentId: "int-1", scheduledPaymentId: over.scheduledPaymentId ?? "sp-1" },
        payment_method: over.withPm === false ? null : { id: "pm_new", card: { brand: "mastercard", last4: "5555", exp_month: 9, exp_year: 2031 } },
      });
    }

    it("startCardChange: SetupIntent no Customer da plataforma", async () => {
      seed(rowN(1));
      expect(await startCardChange("int-1", tok(), NOW_G)).toEqual({ ok: true, clientSecret: "seti_1_secret_x" });
      expect(h.stripe.createCardChangeSetupIntent).toHaveBeenCalledWith({ scheduledPaymentId: "sp-1", intentId: "int-1", customer: "cus_1", now: NOW_G });
    });

    it.each([
      ["depois de H", { status: "needs_action" as const }, H, "not_changeable"],
      ["paga", { status: "succeeded" as const }, NOW_G, "not_changeable"],
    ])("startCardChange %s → %s", async (_label, over, at, reason) => {
      seed(rowN(1, over));
      expect(await startCardChange("int-1", tok(), at)).toEqual({ ok: false, reason });
      expect(h.stripe.createCardChangeSetupIntent).not.toHaveBeenCalled();
    });

    it("finishCardChange sem consentimento → recusa antes de ler o que quer que seja", async () => {
      seed(rowN(1));
      expect(await finishCardChange("int-1", tok(), { setupIntentId: "seti_ok", consent: false, ip: "1.2.3.4" }, NOW_G)).toEqual({ ok: false, reason: "consent" });
      expect(h.stripe.retrieveCardChangeSetupIntent).not.toHaveBeenCalled();
    });

    it.each([
      ["SetupIntent por confirmar", { status: "requires_action" }],
      ["de outro Customer", { customer: "cus_other" }],
      ["de outra linha", { scheduledPaymentId: "sp-9" }],
      ["sem cartão", { withPm: false }],
    ])("finishCardChange com %s → setup_mismatch, nada muda", async (_label, over) => {
      seed(rowN(1));
      confirmedSetupIntent(over);
      expect(await finishCardChange("int-1", tok(), { setupIntentId: "seti_ok", consent: true, ip: "1.2.3.4" }, NOW_G)).toEqual({ ok: false, reason: "setup_mismatch" });
      expect(h.db.updateScheduledPaymentCard).not.toHaveBeenCalled();
      expect(h.db.insertCardMandate).not.toHaveBeenCalled();
      expect(stored().paymentMethodId).toBe("pm_1");
    });

    it("linha agendada: cartão trocado, novo mandato (card_change + setup_intent_id), o anterior substituído, E6 com a data de C", async () => {
      seed(rowN(1));
      h.mandates.push({ id: "m-old", intentId: "int-1", scheduledPaymentId: "sp-1", paymentMethodId: "pm_1", paymentIntentId: "pi_dep_1", source: "checkout", supersededAt: null });
      confirmedSetupIntent();
      const r = await finishCardChange("int-1", tok(), { setupIntentId: "seti_ok", consent: true, ip: "1.2.3.4" }, NOW_G);
      expect(r).toEqual({ ok: true, cardLast4: "5555", cardBrand: "mastercard" });
      expect(stored()).toMatchObject({ status: "scheduled", paymentMethodId: "pm_new", cardBrand: "mastercard", cardLast4: "5555", cardExpMonth: 9, cardExpYear: 2031, nextAttemptAt: C });
      const mandate = (await import("./two-parts-mandate")).renderCardChangeMandate("pt", { amountLaterCents: 500_000, chargeAt: C, freeCancelDeadlineAt: D, now: NOW_G });
      expect(h.mandates.at(-1)).toMatchObject({
        intentId: "int-1",
        paymentIntentId: null,
        setupIntentId: "seti_ok",
        scheduledPaymentId: "sp-1",
        paymentMethodId: "pm_new",
        cardLast4: "5555",
        mandateVersion: CARD_CHANGE_MANDATE_VERSION,
        mandateLang: "pt",
        mandateTextHash: mandate.hash,
        amountLaterCents: 500_000,
        chargeAt: C,
        acceptedAt: NOW_G,
        acceptedIp: "1.2.3.4",
        source: "card_change",
        supersededAt: null,
      });
      expect(h.mandates.find((m) => m.id === "m-old")!.supersededAt).toEqual(NOW_G);
      expect(h.stripe.allowRedisplay).toHaveBeenCalledWith("pm_new");
      expect(h.db.requeueAfterCardChange).not.toHaveBeenCalled();
      expect(h.mail.sendBalanceCardUpdated).toHaveBeenCalledWith({
        email: "ana@example.com", locale: "pt", guestFirstName: "Ana", propertyName: "Villa Aura", checkIn: "2027-07-15", checkOut: "2027-07-22",
        amountCents: 500_000, chargeAt: C, cardBrand: "mastercard", cardLast4: "5555", link: expectedLink(rowN(1), H),
      });
    });

    it.each(["retry", "needs_action"] as const)("linha em %s: volta à cobrança automática daqui a 5 min, no cartão novo; o E6 diz essa data", async (status) => {
      const now = plus(R1, 3 * HOUR);
      seed(rowN(1, { status, attempts: 2, nextAttemptAt: R2, lastDeclineCode: "insufficient_funds", lastError: "recusado", failureNoticeStage: 1 }));
      confirmedSetupIntent();
      expect(await finishCardChange("int-1", tok(), { setupIntentId: "seti_ok", consent: true, ip: null }, now)).toMatchObject({ ok: true });
      expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: plus(now, 5 * MIN), lastDeclineCode: null, lastError: null, paymentMethodId: "pm_new" });
      expect(h.mail.sendBalanceCardUpdated).toHaveBeenCalledWith(expect.objectContaining({ chargeAt: plus(now, 5 * MIN) }));

      // E o sweep cobra-a no cartão novo.
      const report = await sweep(plus(now, 6 * MIN));
      expect(report.charged).toEqual({ succeeded: 1 });
      expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "pm_new" }));
    });

    it("linha paga entretanto → not_changeable", async () => {
      seed(rowN(1, { status: "succeeded" }));
      confirmedSetupIntent();
      expect(await finishCardChange("int-1", tok(), { setupIntentId: "seti_ok", consent: true, ip: null }, NOW_G)).toEqual({ ok: false, reason: "not_changeable" });
      expect(h.stripe.retrieveCardChangeSetupIntent).not.toHaveBeenCalled();
    });
  });

  describe("guestCancel", () => {
    it("dentro do prazo, linha agendada → claim com cancel:guest, cancela no Guesty, devolve e fecha cancelled_by_guest", async () => {
      seed(rowN(1));
      seedDeposit({ boughtAt: plus(NOW_G, -3 * DAY) });
      expect(await guestCancel("int-1", tok(), NOW_G)).toEqual({ ok: true, refundCents: 600_000 });
      expect(h.db.claimScheduledPaymentForCancel).toHaveBeenCalledWith("sp-1", ["scheduled", "retry", "needs_action", "succeeded"], { reason: "cancel:guest" });
      expect(stored()).toMatchObject({ status: "cancelled_by_guest", reviewReason: "cancel:guest", refundCents: 600_000 });
      expect(h.guesty.cancelGuestyReservation).toHaveBeenCalledWith("res-1", expect.objectContaining({ canceledBy: "GUEST" }));
    });

    it("reserva já paga na totalidade → devolve as duas partes", async () => {
      const row = rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN), guestyBalanceRecordedAt: plus(C, 5 * MIN), noteClaimedAt: plus(C, 5 * MIN), emailPaidClaimedAt: plus(C, 5 * MIN) });
      seed(row);
      seedPi("pi_paid", "succeeded", row);
      seedDeposit({ boughtAt: CREATED, flexCents: 0 });
      h.stripeState.refund = (p: { paymentIntentId: string }) =>
        p.paymentIntentId === "pi_dep_1"
          ? { refundId: "re_dep", refundCents: 600_000, status: "succeeded" }
          : { refundId: "re_bal", refundCents: 500_000, status: "succeeded" };
      expect(await guestCancel("int-1", tok(), plus(C, 2 * DAY))).toEqual({ ok: true, refundCents: 1_100_000 });
      expect(h.stripe.refundRemaining.mock.calls.map((c) => c[0].paymentIntentId)).toEqual(["pi_dep_1", "pi_paid"]);
      expect(stored().status).toBe("cancelled_by_guest");
    });

    it("um pagamento acabado de chegar ('paid') → not_cancellable, a reserva segue paga", async () => {
      const row = rowN(1, { guestPaymentIntentId: "pi_g" });
      seed(row);
      seedPi("pi_g", "succeeded", row);
      expect(await guestCancel("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "not_cancellable" });
      expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_g" });
      expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    });

    it("Guesty a recusar → pedido registado (ok), linha fica em cancelling para o sweep acabar", async () => {
      seed(rowN(1));
      h.guestyState.cancelResult = "refused";
      expect(await guestCancel("int-1", tok(), NOW_G)).toEqual({ ok: true, refundCents: 0 });
      expect(stored()).toMatchObject({ status: "cancelling", reviewReason: "cancel:guest" });
      expect(h.stripe.refundRemaining).not.toHaveBeenCalled();
    });

    it("depois de D → 'late', nada muda", async () => {
      seed(rowN(1, { status: "needs_action", attempts: 1 }));
      expect(await guestCancel("int-1", tok(plus(D, DAY)), plus(D, MIN))).toEqual({ ok: false, reason: "late" });
      expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
    });

    it.each([
      ["em revisão", "needs_review"],
      ["já cancelada", "cancelled_unpaid"],
      ["a cobrar agora", "charging"],
      ["paga por fora", "paid_externally"],
    ] as const)("linha %s → not_cancellable", async (_label, status) => {
      seed(rowN(1, { status }));
      expect(await guestCancel("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "not_cancellable" });
      expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    });

    it("claim perdido (outro pedido ganhou) → not_cancellable", async () => {
      seed(rowN(1));
      h.db.claimScheduledPaymentForCancel.mockImplementationOnce(async () => false);
      expect(await guestCancel("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "not_cancellable" });
      expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
    });

    it("token expirado → 'expired'; token falso → 'not_cancellable'", async () => {
      seed(rowN(1));
      expect(await guestCancel("int-1", tok(plus(NOW_G, -MIN)), NOW_G)).toEqual({ ok: false, reason: "expired" });
      expect(await guestCancel("int-1", "1.2", NOW_G)).toEqual({ ok: false, reason: "not_cancellable" });
    });

    it("erro inesperado a meio → 'error'", async () => {
      seed(rowN(1));
      h.db.markGuestyCancelled.mockImplementationOnce(async () => {
        throw new Error("BD em baixo");
      });
      expect(await guestCancel("int-1", tok(), NOW_G)).toEqual({ ok: false, reason: "error" });
    });
  });

  describe("guestHelp (Preciso de ajuda)", () => {
    it("pausa a automação 5 dias, alerta escapado com a mensagem do hóspede", async () => {
      seed(rowN(1, { propertyName: "Casa & Mar <1>" }));
      const r = await guestHelp("int-1", tok(), { message: '<script>alert("x")</script>\n\n  Olá   mundo ' }, NOW_G);
      const until = plus(NOW_G, 5 * DAY);
      expect(r).toEqual({ ok: true, pausedUntil: until.toISOString() });
      expect(stored()).toMatchObject({ status: "needs_review", helpPausedUntil: until, reviewReason: "hospede pediu ajuda", reviewDueAt: until });
      const [subject, lines] = h.mail.sendOpsAlert.mock.calls[0];
      expect(subject).toBe("DUAS PARTES: o hóspede pede ajuda — GY-1 · Casa &amp; Mar &lt;1&gt; · 2027-07-15");
      expect(lines[0]).toBe("Mensagem: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Olá mundo");
      expect(lines[1]).toContain(`pausadas até ${until.toISOString()}`);
      expect(lines.join(" ")).not.toMatch(/<script>/);
    });

    it("perto de D → a pausa nunca passa do fim do cancelamento gratuito", async () => {
      seed(rowN(1, { status: "needs_action", attempts: 1 }));
      const now = plus(D, -2 * DAY);
      expect(await guestHelp("int-1", tok(), { message: "ajuda" }, now)).toEqual({ ok: true, pausedUntil: D.toISOString() });
      expect(stored()).toMatchObject({ helpPausedUntil: D, reviewDueAt: D });
    });

    it("mensagem enorme → cortada a 1000 caracteres", async () => {
      seed(rowN(1));
      await guestHelp("int-1", tok(), { message: "x".repeat(5000) }, NOW_G);
      expect(h.mail.sendOpsAlert.mock.calls[0][1][0]).toBe(`Mensagem: ${"x".repeat(1000)}`);
    });

    it("linha já paga → não pausa nada, mas o ops recebe a mensagem", async () => {
      seed(rowN(1, { status: "succeeded", balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN) }));
      expect(await guestHelp("int-1", tok(), { message: "" }, plus(C, HOUR))).toEqual({ ok: true, pausedUntil: null });
      expect(h.db.pauseForHelp).not.toHaveBeenCalled();
      const lines = h.mail.sendOpsAlert.mock.calls[0][1];
      expect(lines[0]).toBe("Mensagem: (sem mensagem)");
      expect(lines[1]).toBe("Linha em &quot;succeeded&quot;: nada foi pausado. Responder ao hóspede.");
    });

    it("token falso → not_found; expirado → expired; nada pausado", async () => {
      seed(rowN(1));
      expect(await guestHelp("int-1", "0.0", { message: "x" }, NOW_G)).toEqual({ ok: false, reason: "not_found" });
      expect(await guestHelp("int-1", tok(plus(NOW_G, -MIN)), { message: "x" }, NOW_G)).toEqual({ ok: false, reason: "expired" });
      expect(h.db.pauseForHelp).not.toHaveBeenCalled();
    });

    it("a pausa tira a linha das cobranças automáticas e da paragem dura", async () => {
      seed(rowN(1, { reminderStage: 2 }));
      await guestHelp("int-1", tok(), { message: "ajuda" }, plus(C, -HOUR));
      const report = await sweep(plus(C, MIN));
      expect(report.charged).toEqual({});
      expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe("resendBalanceLink (Enviar novo link)", () => {
    it("envia para o email da reserva, com o link até H + 3 dias; responde sent", async () => {
      seed(rowN(1));
      expect(await resendBalanceLink("int-1", NOW_G)).toEqual({ ok: true, sent: true });
      expect(h.mail.sendBalanceLinkEmail).toHaveBeenCalledWith({
        email: "ana@example.com", locale: "pt", guestFirstName: "Ana", propertyName: "Villa Aura", link: expectedLink(rowN(1), H),
      });
    });

    it("no máximo 1 a cada 10 min por reserva (as outras reservas não são afetadas)", async () => {
      seed(rowN(1), rowN(2));
      await resendBalanceLink("int-1", NOW_G);
      expect(await resendBalanceLink("int-1", plus(NOW_G, 9 * MIN))).toEqual({ ok: true, sent: false });
      expect(await resendBalanceLink("int-2", plus(NOW_G, 9 * MIN))).toEqual({ ok: true, sent: true });
      expect(await resendBalanceLink("int-1", plus(NOW_G, 10 * MIN))).toEqual({ ok: true, sent: true });
      expect(h.mail.sendBalanceLinkEmail.mock.calls.map((c) => c[0].email)).toEqual(["ana@example.com", "ana@example.com", "ana@example.com"]);
      expect(h.mail.sendBalanceLinkEmail).toHaveBeenCalledTimes(3);
    });

    it("envio não aceite → sent: false", async () => {
      seed(rowN(1));
      h.mail.sendBalanceLinkEmail.mockImplementationOnce(async () => false);
      expect(await resendBalanceLink("int-1", NOW_G)).toEqual({ ok: true, sent: false });
    });

    it.each([
      ["sem agendamento", null],
      ["sem email", rowN(1, { email: null })],
      ["de outro ambiente", rowN(1, { livemode: false })],
    ])("%s → ok sem enviar (nunca diz se a reserva existe)", async (_label, row) => {
      if (row) seed(row);
      const r = await resendBalanceLink("int-1", NOW_G);
      expect(r.ok).toBe(true);
      expect(r.sent).not.toBe(true);
      expect(h.mail.sendBalanceLinkEmail).not.toHaveBeenCalled();
    });
  });
});

/**
 * Regressão: startCardChange recusa depois de H e finishCardChange também.
 * Quem abriu a troca antes de H e a acaba depois não fica com um cartão novo,
 * um mandato a prometer "cobrar hoje" nem um E6 com uma data já passada.
 */
describe("troca de cartão concluída depois de H", () => {
  it("finishCardChange depois de H → not_changeable, sem mexer no cartão nem enviar E6", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    vi.stubEnv("SITE_URL", `https://${ORIGIN}`);
    vi.stubEnv("BALANCE_LINK_SECRET", "segredo-de-teste-do-link");
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN) }));
    h.stripeState.setupIntents.set("seti_ok", {
      id: "seti_ok", status: "succeeded", customer: "cus_1", client_secret: "x",
      metadata: { flow: "card_v2_card_change", intentId: "int-1", scheduledPaymentId: "sp-1" },
      payment_method: { id: "pm_new", card: { brand: "mastercard", last4: "5555", exp_month: 9, exp_year: 2031 } },
    });
    const after = plus(H, 20 * MIN);
    const r = await finishCardChange("int-1", balanceLinkToken("int-1", plus(H, 3 * DAY)), { setupIntentId: "seti_ok", consent: true, ip: null }, after);
    expect(r).toEqual({ ok: false, reason: "not_changeable" });
    expect(stored().paymentMethodId).toBe("pm_1");
    expect(h.mail.sendBalanceCardUpdated).not.toHaveBeenCalled();
  });
});

/**
 * Regressão: o link da página vale até max(H, D) + 3 dias. Com H = D − 3 às
 * 12:00, um prazo só por H fechava a página a D às 12:00, ainda dentro do
 * cancelamento gratuito, e uma reserva paga deixava de se poder cancelar lá.
 */
describe("prazo do link da página", () => {
  it("reserva paga: um link novo pedido a D − 6 h tem de abrir até D", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    vi.stubEnv("SITE_URL", `https://${ORIGIN}`);
    seed(rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN) }));
    const at = plus(D, -6 * HOUR); // 8 jul às 17:59, ainda dentro do cancelamento gratuito
    expect(await resendBalanceLink("int-1", at)).toEqual({ ok: true, sent: true });
    const link = String(h.mail.sendBalanceLinkEmail.mock.calls[0][0].link);
    const expMs = Number(/[?#&]t=(\d+)\./.exec(link)![1]) * 1000;
    expect(expMs).toBeGreaterThanOrEqual(D.getTime());
  });
});

/* ════════════════════════════════════════════════════════════════
   8. Ronda 2 da revisão da Fase 2 (C0…C33): regressões
   ════════════════════════════════════════════════════════════════ */

/** O ambiente da página do saldo (rowForLink lê o scope e o segredo do link). */
function stubLinkEnv(): void {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
  vi.stubEnv("SITE_URL", `https://${ORIGIN}`);
  vi.stubEnv("BALANCE_LINK_SECRET", "segredo-de-teste-do-link");
}
/** Token do link com prazo para lá de D (vale em todos os instantes destes testes). */
const linkTok = (intentId = "int-1") => balanceLinkToken(intentId, plus(D, 3 * DAY));
/** Linha por pagar com o E3 enviado em C (os 7 dias cabem antes de H). */
const failedNotified = (over: Partial<Row> = {}) =>
  rowN(1, {
    status: "needs_action", attempts: 1, lastDeclineCode: "authentication_required", reminderStage: 2,
    failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), ...over,
  });

describe("guestIsActive: o escudo 'o hóspede está a pagar' (60 min desde a última ação na página)", () => {
  const NOW = plus(C, HOUR);
  it("sem guest_active_at não há escudo; com menos de 60 min há; aos 60 min já não", () => {
    expect(guestIsActive({ guestActiveAt: null }, NOW)).toBe(false);
    expect(guestIsActive({ guestActiveAt: plus(NOW, -59 * MIN) }, NOW)).toBe(true);
    expect(guestIsActive({ guestActiveAt: plus(NOW, -60 * MIN) }, NOW)).toBe(false);
  });
});

/**
 * Regressão C0/C8: "Pagar agora" reutilizava o PI do hóspede sem refrescar
 * nada nem ler o Guesty. Os dois escudos da paragem dura (claimed_at na lista
 * e o created do PI no motor) ficavam com a hora do primeiro clique, e o
 * cancelamento automático corria debaixo do 3DS do hóspede.
 */
describe("Regressão C0/C8: PI do hóspede reutilizado", () => {
  beforeEach(() => stubLinkEnv());

  it("clique a H − 3 h, outro a H − 5 min (reutiliza), 3DS aberto → a paragem dura a H + 2 min espera; abandonado, cancela 1 h depois da última ação", async () => {
    seed(failedNotified());
    h.stripeState.clockMs = plus(H, -3 * HOUR).getTime();
    const first = await prepareGuestPayment("int-1", linkTok(), plus(H, -3 * HOUR));
    expect(first).toMatchObject({ ok: true, clientSecret: "pi_bal_1_secret_x" });
    const again = await prepareGuestPayment("int-1", linkTok(), plus(H, -5 * MIN));
    expect(again).toEqual(first);
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
    // A reutilização refresca o escudo (setGuestPaymentIntent com o PI que já existia).
    expect(h.db.setGuestPaymentIntent).toHaveBeenLastCalledWith("sp-1", "pi_bal_1", plus(H, -5 * MIN));
    expect(stored().guestActiveAt).toEqual(plus(H, -5 * MIN));
    h.stripeState.pis.get("pi_bal_1")!.status = "requires_action"; // o banco abriu o 3DS

    await sweep(plus(H, 2 * MIN));
    expect(stored().status).toBe("needs_action");
    expect(piStatus("pi_bal_1")).toBe("requires_action");
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();

    // O hóspede não voltou: 61 min depois da última ação, a paragem dura corre.
    await sweep(plus(H, 56 * MIN));
    expect(stored().status).toBe("cancelled_unpaid");
    expect(piStatus("pi_bal_1")).toBe("canceled");
  });

  it("o sweep também espera pela última ação do hóspede: PI com 3 h, reutilizado há 10 min", async () => {
    const row = rowN(1, {
      status: "retry", attempts: 1, nextAttemptAt: R1, failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN),
      lastDeclineCode: "insufficient_funds", reminderStage: 2, guestPaymentIntentId: "pi_g", guestActiveAt: plus(R1, -10 * MIN),
    });
    seed(row);
    seedPi("pi_g", "requires_action", row, { attempt: 1, source: "guest" }, plus(R1, -3 * HOUR));
    expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("released");
    expect(piStatus("pi_g")).toBe("requires_action");
    expect(h.stripe.createBalancePaymentIntent).not.toHaveBeenCalled();
  });

  it("reutilizar também passa pelo Guesty: reserva cancelada entretanto → 'guesty', sem client secret", async () => {
    const row = rowN(1);
    seed(row);
    const at = L("2027-06-20", 15);
    expect(await prepareGuestPayment("int-1", linkTok(), at)).toMatchObject({ ok: true });
    setSnapshot(row, snapshotFor(row, { status: "canceled" }));
    expect(await prepareGuestPayment("int-1", linkTok(), plus(at, 20_000))).toEqual({ ok: false, reason: "guesty" });
    setSnapshot(row, withForeign(row, foreignPayment(500_000, "PENDING")));
    expect(await prepareGuestPayment("int-1", linkTok(), plus(at, 40_000))).toEqual({ ok: false, reason: "guesty" });
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);
  });

  it("reutilizar numa linha que deixou de estar por pagar entre a leitura e a gravação → not_payable", async () => {
    seed(rowN(1));
    const at = L("2027-06-20", 15);
    await prepareGuestPayment("int-1", linkTok(), at);
    h.db.setGuestPaymentIntent.mockImplementationOnce(async () => false);
    expect(await prepareGuestPayment("int-1", linkTok(), plus(at, 20_000))).toEqual({ ok: false, reason: "not_payable" });
  });

  it("startCardChange grava guest_active_at: a paragem dura não cancela debaixo do formulário do cartão novo", async () => {
    seed(failedNotified());
    expect(await startCardChange("int-1", linkTok(), plus(H, -10 * MIN))).toMatchObject({ ok: true });
    expect(stored().guestActiveAt).toEqual(plus(H, -10 * MIN));
    await sweep(plus(H, MIN));
    expect(stored().status).toBe("needs_action");
    expect(h.db.claimScheduledPaymentForCancel).not.toHaveBeenCalled();
  });

  it("um claim do sweep ou do admin nunca refresca o escudo (claimed_at muda, guest_active_at não)", async () => {
    seed(rowN(1));
    await chargeScheduledPayment(stored(), "sweep", plus(C, MIN));
    expect(stored()).toMatchObject({ claimSource: "sweep", guestActiveAt: null });
  });
});

/**
 * Regressão C1: markCancellingAsSucceeded aceitava linhas já pagas. Um
 * webhook atrasado do pagamento da 2.ª parte desfazia o cancelamento pedido
 * pelo hóspede (e, com outro PI, escondia um pagamento duplicado).
 */
describe("Regressão C1: webhook atrasado numa linha paga a cancelar", () => {
  const now = L("2027-06-30", 15); // depois de C, antes de D
  const paid = (over: Partial<Row> = {}) => rowN(1, {
    status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN),
    guestyBalanceRecordedAt: plus(C, 5 * MIN), noteClaimedAt: plus(C, 5 * MIN), emailPaidClaimedAt: plus(C, 5 * MIN),
    reminderStage: 2, ...over,
  });
  const event = (id: string) => ({ id, amount: 500_000, metadata: { scheduledPaymentId: "sp-1", intentId: "int-1" } });
  beforeEach(() => stubLinkEnv());

  it("o mesmo PI → already; o cancelamento do hóspede segue até ao fim (E7, as duas partes devolvidas)", async () => {
    const row = paid({ guestPaymentIntentId: "pi_g" });
    seed(row);
    seedPi("pi_paid", "succeeded", row);
    seedPi("pi_g", "requires_confirmation", row);
    seedDeposit({ boughtAt: plus(now, -3 * DAY) });
    // Passo 1: a Stripe falha ao fechar o PI antigo do hóspede → pending, linha em cancelling.
    h.stripeState.cancelFailures = 1;
    expect(await guestCancel("int-1", linkTok(), now)).toEqual({ ok: true, refundCents: 0 });
    expect(stored().status).toBe("cancelling");

    expect(await handleBalancePaymentSucceeded(event("pi_paid"), plus(now, MIN))).toBe("already");
    expect(h.db.markCancellingAsSucceeded).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "cancelling", balancePaymentIntentId: "pi_paid" });

    await sweep(plus(now, 10 * MIN));
    expect(stored().status).toBe("cancelled_by_guest");
    expect(h.stripe.refundRemaining.mock.calls.map((c) => c[0].paymentIntentId)).toEqual(["pi_dep_1", "pi_paid"]);
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ kind: "guest" }));
  });

  it("outro PI pago (o do hóspede) → duplicado devolvido na hora; o PI gravado não muda", async () => {
    const row = paid({ status: "cancelling", reviewReason: "cancel:guest", guestPaymentIntentId: "pi_g" });
    seed(row);
    seedPi("pi_g", "succeeded", row, { attempt: 1, source: "guest" });
    h.stripeState.refund = () => ({ refundId: "re_dup", refundCents: 500_000, status: "succeeded" });
    expect(await handleBalancePaymentSucceeded(event("pi_g"), now)).toBe("duplicate");
    expect(h.stripe.refundRemaining).toHaveBeenCalledWith(expect.objectContaining({ paymentIntentId: "pi_g", scheduledPaymentId: "sp-1-dup" }));
    expect(stored()).toMatchObject({ status: "cancelling", balancePaymentIntentId: "pi_paid" });
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte cobrada duas vezes — GY-1")]);
  });

  it("cancelamento já fechado: o webhook atrasado do PI pago (já devolvido) → already, sem alerta falso", async () => {
    seed(paid({ status: "cancelled_by_guest", reviewReason: "cancel:guest", cancelledAt: plus(now, -HOUR), refundStatus: "succeeded" }));
    expect(await handleBalancePaymentSucceeded(event("pi_paid"), now)).toBe("already");
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("uma linha por pagar a cancelar continua a voltar a paga (o pagamento chegou antes de nada irreversível)", async () => {
    seed(rowN(1, { status: "cancelling", reviewReason: "cancel:unpaid", balancePaymentIntentId: "pi_w" }));
    expect(await handleBalancePaymentSucceeded(event("pi_w"), plus(H, MIN))).toBe("marked");
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_w" });
  });
});

/** Regressão C2: depois de H, uma leitura que falha sempre adiava em silêncio até depois de D. */
describe("Regressão C2: paragem dura adiada por leitura falhada avisa o ops", () => {
  it("PI do hóspede ilegível na Stripe → espera e um alerta com o fim do cancelamento gratuito (no máximo um a cada 6 h)", async () => {
    const row = failedNotified({ guestPaymentIntentId: "pi_g" });
    seed(row);
    seedPi("pi_g", "requires_action", row);
    h.stripeState.failRetrieve = (id) => id === "pi_g";
    await sweep(plus(H, MIN));
    await sweep(plus(H, 11 * MIN));
    expect(stored().status).toBe("needs_action");
    expect(alertSubjects()).toEqual([expect.stringContaining("cancelamento automático adiado — GY-1")]);
    const lines = h.mail.sendOpsAlert.mock.calls[0][1].join(" ");
    expect(lines).toContain("não se lê na Stripe");
    expect(lines).toContain(D.toISOString());
  });

  it("Guesty e PI do hóspede ilegíveis em passagens diferentes → um alerta de cada (chaves próprias)", async () => {
    const row = failedNotified({ guestPaymentIntentId: "pi_g" });
    seed(row);
    seedPi("pi_g", "requires_payment_method", row);
    h.stripeState.failRetrieve = (id) => id === "pi_g";
    await sweep(plus(H, MIN));
    h.stripeState.failRetrieve = () => false;
    setSnapshot(row, null);
    await sweep(plus(H, 11 * MIN));
    expect(alertSubjects()).toHaveLength(2);
    expect(h.mail.sendOpsAlert.mock.calls[1][1][0]).toContain("não se lê no Guesty");
  });
});

/**
 * Regressão C3: um erro técnico em cada tentativa (create a falhar, PI
 * anterior ilegível, confirm sem resposta) libertava de hora a hora até H,
 * sem alerta, sem E3 e com o monitor verde.
 */
describe("Regressão C3: cobrança adiada por erro técnico chama um humano ao fim de 6 h", () => {
  it("criar o PI a falhar desde C: sem alerta nas primeiras 6 h; depois um (travão de 6 h); a linha fica agendada e sem E3", async () => {
    seed(rowN(1, { reminderStage: 2 }));
    h.stripeState.createError = new Error("No such customer: 'cus_1'");
    for (let k = 0; k <= 5; k++) await sweep(plus(C, k * HOUR + MIN));
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
    await sweep(plus(C, 6 * HOUR + MIN));
    await sweep(plus(C, 7 * HOUR + MIN));
    expect(alertSubjects()).toEqual([expect.stringContaining("cobrança adiada por erro técnico — GY-1")]);
    const lines = h.mail.sendOpsAlert.mock.calls[0][1].join(" ");
    expect(lines).toContain("Último erro: criar PI: No such customer");
    expect(lines).toContain(C.toISOString());
    expect(stored()).toMatchObject({ status: "scheduled", failureNoticeStage: 0 });
    expect(h.mail.sendBalanceFailed).not.toHaveBeenCalled();
  });

  it("confirm sem resposta (PI por confirmar) mais de 6 h depois de C → alerta", async () => {
    seed(rowN(1, { reminderStage: 2, nextAttemptAt: plus(C, 7 * HOUR) }));
    h.stripeState.confirmPlan.push("lost");
    expect(await chargeScheduledPayment(stored(), "sweep", plus(C, 7 * HOUR))).toBe("released");
    expect(alertSubjects()).toEqual([expect.stringContaining("cobrança adiada por erro técnico — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1][1]).toContain("Último erro: confirmar: Request timed out");
  });

  it("PI anterior ilegível na Stripe (retentativa, mais de 6 h depois de C) → alerta", async () => {
    const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, balancePaymentIntentId: "pi_prev", failureNoticeStage: 1, lastDeclineCode: "insufficient_funds" });
    seed(row);
    seedPi("pi_prev", "requires_payment_method", row);
    h.stripeState.failRetrieve = (id) => id === "pi_prev";
    expect(await chargeScheduledPayment(stored(), "sweep", plus(R1, MIN))).toBe("released");
    expect(alertSubjects()).toEqual([expect.stringContaining("cobrança adiada por erro técnico — GY-1")]);
  });

  it("uma recusa do banco não é erro técnico: nenhum alerta destes", async () => {
    seed(rowN(1, { nextAttemptAt: plus(C, 7 * HOUR) }));
    h.stripeState.confirmPlan.push("soft");
    expect(await chargeScheduledPayment(stored(), "sweep", plus(C, 7 * HOUR))).toBe("retry");
    expect(alertSubjects().filter((s) => s.includes("erro técnico"))).toEqual([]);
  });
});

/**
 * Regressão C4/C33: a libertação de uma tentativa presa mandava qualquer
 * claim do admin para needs_action (o comentário assumia que vinha de lá).
 * Uma cobrança antecipada a pedido do hóspede perdia a cobrança em C e
 * recebia um E3 "o banco recusou" sem recusa nenhuma.
 */
describe("Regressão C4/C33: tentativa presa volta ao estado de onde veio (claim_prev_status)", () => {
  it("o claim grava o estado de origem", async () => {
    seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1 }));
    h.stripeState.confirmPlan.push("processing");
    expect(await chargeScheduledPayment(stored(), "admin", plus(C, 3 * HOUR))).toBe("processing");
    expect(stored()).toMatchObject({ status: "charging", claimSource: "admin", claimPrevStatus: "retry" });
  });

  it("admin numa linha agendada (antes de C): presa → scheduled com a cobrança em C, sem E3; em C cobra", async () => {
    const before = plus(C, -2 * DAY);
    seed(rowN(1, { reminderStage: 2 }));
    h.stripeState.confirmPlan.push("lost");
    h.stripeState.failRetrieve = (id) => id === "pi_bal_1"; // confirm e releitura perdidos
    expect(await chargeScheduledPayment(stored(), "admin", before)).toBe("processing");
    expect(stored()).toMatchObject({ status: "charging", claimPrevStatus: "scheduled" });
    h.stripeState.failRetrieve = () => false;

    await sweep(plus(before, 40 * MIN));
    expect(stored()).toMatchObject({ status: "scheduled", nextAttemptAt: C, attempts: 0, failureNoticeStage: 0 });
    expect(piStatus("pi_bal_1")).toBe("canceled");
    await sweep(plus(before, 50 * MIN));
    expect(h.mail.sendBalanceFailed).not.toHaveBeenCalled();
    expect(h.stripe.createBalancePaymentIntent).toHaveBeenCalledTimes(1);

    expect((await sweep(plus(C, MIN))).charged).toEqual({ succeeded: 1 });
  });

  it("admin numa linha em retry (o E3 prometeu C+1 e C+3): presa → retry com a retentativa de C+1 intacta", async () => {
    seed(rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2 }));
    const at = plus(C, 3 * HOUR);
    h.stripeState.confirmPlan.push("lost");
    h.stripeState.failRetrieve = (id) => id === "pi_bal_1";
    expect(await chargeScheduledPayment(stored(), "admin", at)).toBe("processing");
    h.stripeState.failRetrieve = () => false;
    await sweep(plus(at, 40 * MIN));
    expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: R1, attempts: 1, failureNoticeStage: 1 });
    expect((await sweep(plus(R1, MIN))).charged).toEqual({ succeeded: 1 });
  });

  it("admin a partir de needs_action: presa → needs_action (só o hóspede resolve)", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2 }));
    const at = plus(C, 3 * HOUR);
    h.stripeState.confirmPlan.push("processing");
    expect(await chargeScheduledPayment(stored(), "admin", at)).toBe("processing");
    h.stripeState.pis.get("pi_bal_1")!.status = "requires_confirmation"; // o banco desistiu, PI por confirmar
    await sweep(plus(at, 40 * MIN));
    expect(stored()).toMatchObject({ status: "needs_action", attempts: 1 });
  });
});

/**
 * Regressão C5: um claim do E5/E7 nas mãos de outra passagem contava como
 * "hóspede avisado": a linha fechava, o ops lia "Email enviado" e, se esse
 * envio falhasse, o email nunca mais saía.
 */
describe("Regressão C5: email de cancelamento ainda a sair noutra passagem", () => {
  const NOW_H = plus(H, 5 * MIN);
  const refunded = (over: Partial<Row> = {}) => {
    const row = rowN(1, {
      status: "cancelling", reviewReason: "cancel:unpaid", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2,
      failureNoticeStage: 2, failureNoticeSentAt: plus(C, 10 * MIN), balancePaymentIntentId: "pi_last",
      guestyCancelClaimedAt: plus(NOW_H, -40 * MIN), guestyCancelledAt: plus(NOW_H, -40 * MIN),
      refundClaimedAt: plus(NOW_H, -40 * MIN), refundId: "re_9", refundCents: 600_000, refundStatus: "succeeded", ...over,
    });
    seed(row);
    seedPi("pi_last", "canceled", row);
    return row;
  };

  it("claim do E5 com 5 min na leitura → pending: não fecha, não diz 'Email enviado'; liberto o claim, a passagem seguinte envia e fecha", async () => {
    refunded({ emailCancelClaimedAt: plus(NOW_H, -5 * MIN) });
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(stored().status).toBe("cancelling");
    expect(h.db.markCancelledUnpaid).not.toHaveBeenCalled();
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();

    // O outro envio falhou e libertou o claim.
    h.store.get("sp-1")!.emailCancelClaimedAt = null;
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("done");
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledTimes(1);
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("corrida: um runCancellation a meio do envio (que falha) do outro → os dois ficam em pending e o E5 volta a sair", async () => {
    refunded();
    let inner: string | null = null;
    h.mail.sendBalanceCancelled.mockImplementationOnce(async () => {
      inner = await runCancellation(stored(), "unpaid", NOW_H);
      return false;
    });
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("pending");
    expect(inner).toBe("pending");
    expect(stored()).toMatchObject({ status: "cancelling", emailCancelClaimedAt: null });
    expect(alertSubjects().filter((s) => s.includes("reserva cancelada"))).toEqual([]);
    expect(await runCancellation(stored(), "unpaid", plus(NOW_H, 10 * MIN))).toBe("done");
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledTimes(2);
  });

  it("claim com mais de 30 min (a passagem morreu depois de enviar) → fecha como antes", async () => {
    refunded({ emailCancelClaimedAt: plus(NOW_H, -31 * MIN) });
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelled_unpaid");
  });

  it("C26: reembolso falhado resolvido à mão ('manual') → fecha sem o email automático ('para o cartão' seria falso) e o ops sabe", async () => {
    refunded({ refundStatus: "manual" });
    expect(await runCancellation(stored(), "unpaid", NOW_H)).toBe("done");
    expect(h.mail.sendBalanceCancelled).not.toHaveBeenCalled();
    expect(stored().status).toBe("cancelled_unpaid");
    expect(h.mail.sendOpsAlert.mock.calls.at(-1)![1][0]).toContain("Reembolso resolvido à mão (fora da Stripe): o email automático de cancelamento NÃO foi enviado");
  });
});

/** Regressão C6/C9/C15/C24/C29: os cartões do reembolso e o email da equipa. */
describe("refundCardsFor: para onde vai o dinheiro de um reembolso", () => {
  const paidRow = () => rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN) });
  function seedBalanceCard(last4: string | null): void {
    h.stripeState.deposits.set("pi_paid", {
      id: "pi_paid", amount_received: 500_000, latest_charge: { amount_refunded: 0 }, metadata: {},
      created: Math.floor(plus(C, MIN).getTime() / 1000),
      payment_method: last4 ? { id: "pm_new", card: { last4 } } : null,
    });
  }

  it("por pagar: só o cartão da 1.ª parte (nunca o cartão atual da linha)", async () => {
    seed(rowN(1));
    seedDeposit();
    expect(await refundCardsFor(stored())).toEqual(["1881"]);
  });

  it("paga noutro cartão: os dois, pela ordem 1.ª parte, 2.ª parte; no mesmo cartão: um só", async () => {
    seed(paidRow());
    seedDeposit();
    seedBalanceCard("5555");
    expect(await refundCardsFor(stored())).toEqual(["1881", "5555"]);
    resetBalanceAlertThrottle(); // limpa a cache
    seedBalanceCard("1881");
    expect(await refundCardsFor(stored())).toEqual(["1881"]);
  });

  it("um cartão ilegível → lista vazia (o texto diz 'o cartão com que pagou', nunca um número errado)", async () => {
    seed(paidRow());
    seedDeposit();
    seedBalanceCard(null);
    expect(await refundCardsFor(stored())).toEqual([]);
    resetBalanceAlertThrottle();
    h.stripeState.deposits.clear();
    expect(await refundCardsFor(stored())).toEqual([]);
  });

  it("guardado 10 min por linha (a página faz polling); a 2.ª parte paga entretanto lê outra vez", async () => {
    seed(rowN(1));
    seedDeposit();
    await refundCardsFor(stored());
    await refundCardsFor(stored());
    expect(h.klarna.getPaymentIntent).toHaveBeenCalledTimes(1);
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 10 * MIN + 1);
    await refundCardsFor(stored());
    expect(h.klarna.getPaymentIntent).toHaveBeenCalledTimes(2);
    seedBalanceCard("5555");
    expect(await refundCardsFor({ ...stored(), status: "succeeded", balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN) })).toEqual(["1881", "5555"]);
  });

  it("E7 de uma reserva paga noutro cartão leva os dois cartões", async () => {
    stubLinkEnv();
    seed(paidRow());
    seedPi("pi_paid", "succeeded", paidRow());
    seedDeposit({ boughtAt: CREATED, flexCents: 0 });
    seedBalanceCard("5555");
    expect(await guestCancel("int-1", linkTok(), L("2027-06-30", 15))).toMatchObject({ ok: true });
    expect(h.mail.sendBalanceCancelled).toHaveBeenCalledWith(expect.objectContaining({ kind: "guest", refundCardsLast4: ["1881", "5555"] }));
  });

  it("a vista do hóspede leva os cartões só quando fala de um reembolso", async () => {
    stubLinkEnv();
    seed(rowN(1));
    seedDeposit();
    expect(await guestBalanceView("int-1", linkTok(), L("2027-06-20", 15))).toMatchObject({ kind: "ok", canCancelFree: true, refundCardsLast4: ["1881"] });
    // Depois de D, ainda por cancelar: nada a devolver, nada lido.
    resetBalanceAlertThrottle();
    h.klarna.getPaymentIntent.mockClear();
    h.store.get("sp-1")!.status = "needs_action";
    expect(await guestBalanceView("int-1", linkTok(), plus(D, MIN))).toMatchObject({ kind: "ok", canCancelFree: false, refundCardsLast4: [] });
    expect(h.klarna.getPaymentIntent).not.toHaveBeenCalled();
    // Cancelada: mostra para onde foi.
    h.store.get("sp-1")!.status = "cancelled_unpaid";
    expect(await guestBalanceView("int-1", linkTok(), plus(D, MIN))).toMatchObject({ kind: "ok", refundCardsLast4: ["1881"] });
  });

  it("reembolso falhado na Stripe ou resolvido à mão: a vista não diz que o dinheiro voltou ao cartão", async () => {
    stubLinkEnv();
    seed(rowN(1, { status: "cancelled_unpaid", cancelledAt: plus(D, -DAY), refundCents: 100_000, refundStatus: "failed" }));
    seedDeposit();
    for (const refundStatus of ["failed", "manual", "requires_action"]) {
      resetBalanceAlertThrottle();
      h.klarna.getPaymentIntent.mockClear();
      h.store.get("sp-1")!.refundStatus = refundStatus;
      // Sem valor nem cartões, a página diz só "cancelada a …, nada a pagar".
      expect(await guestBalanceView("int-1", linkTok(), plus(D, MIN))).toMatchObject({ kind: "ok", refundCents: null, refundCardsLast4: [] });
      expect(h.klarna.getPaymentIntent).not.toHaveBeenCalled();
    }
    // Feito (ou a caminho): valor e cartão, como antes.
    for (const refundStatus of ["succeeded", "pending"]) {
      resetBalanceAlertThrottle();
      h.store.get("sp-1")!.refundStatus = refundStatus;
      expect(await guestBalanceView("int-1", linkTok(), plus(D, MIN))).toMatchObject({ kind: "ok", refundCents: 100_000, refundCardsLast4: ["1881"] });
    }
  });
});

describe("adminRefundPreview: os números do ecrã Saldos são os do reembolso real", () => {
  const now = L("2027-06-30", 15);

  it("reserva paga, Flex comprado há mais de 14 dias: policy retém o Flex, full devolve tudo; com os dois cartões", async () => {
    const row = rowN(1, { status: "succeeded", attempts: 1, balancePaymentIntentId: "pi_paid", succeededAt: plus(C, MIN) });
    seed(row);
    seedDeposit({ boughtAt: CREATED });
    h.stripeState.deposits.set("pi_paid", {
      id: "pi_paid", amount_received: 500_000, latest_charge: { amount_refunded: 0 }, metadata: {},
      created: Math.floor(plus(C, MIN).getTime() / 1000), payment_method: { id: "pm_new", card: { last4: "5555" } },
    });
    expect(await adminRefundPreview(stored(), now)).toEqual({
      policy: { totalCents: 570_000 + 500_000, flexCents: 30_000, flexWithheldCents: 30_000 },
      full: { totalCents: 1_100_000 },
      refundCardsLast4: ["1881", "5555"],
    });
  });

  it("sem Flex: flexCents 0; dentro dos 14 dias nada retido", async () => {
    seed(rowN(1));
    seedDeposit({ boughtAt: plus(now, -3 * DAY), flexCents: 0 });
    expect(await adminRefundPreview(stored(), now)).toEqual({
      policy: { totalCents: 600_000, flexCents: 0, flexWithheldCents: 0 },
      full: { totalCents: 600_000 },
      refundCardsLast4: ["1881"],
    });
  });

  it("Stripe ilegível → lança (o admin mostra 'sem pré-visualização')", async () => {
    seed(rowN(1));
    await expect(adminRefundPreview(stored(), now)).rejects.toThrow();
  });
});

/** Regressão C10/C32: o reenvio do link e os pedidos de ajuda não podem inundar ninguém. */
describe("Regressão C10/C32: travões do reenvio do link e do 'Preciso de ajuda'", () => {
  const NOW = L("2027-06-20", 15);
  beforeEach(() => stubLinkEnv());

  it("uma linha sem email (ou que não existe) nunca arma o travão; um envio não aceite também não", async () => {
    seed(rowN(1, { email: null }));
    expect(await resendBalanceLink("int-1", NOW)).toEqual({ ok: true });
    expect(await resendBalanceLink("int-404", NOW)).toEqual({ ok: true });
    h.store.get("sp-1")!.email = "ana@example.com";
    h.mail.sendBalanceLinkEmail.mockImplementationOnce(async () => false);
    expect(await resendBalanceLink("int-1", plus(NOW, MIN))).toEqual({ ok: true, sent: false });
    expect(await resendBalanceLink("int-1", plus(NOW, 2 * MIN))).toEqual({ ok: true, sent: true });
    // Agora sim, armado.
    expect(await resendBalanceLink("int-1", plus(NOW, 3 * MIN))).toEqual({ ok: true, sent: false });
  });

  it("force (só o admin) ignora o travão de 10 min e diz se saiu", async () => {
    seed(rowN(1));
    expect(await resendBalanceLink("int-1", NOW)).toEqual({ ok: true, sent: true });
    expect(await resendBalanceLink("int-1", plus(NOW, MIN), { force: true })).toEqual({ ok: true, sent: true });
    h.mail.sendBalanceLinkEmail.mockImplementationOnce(async () => false);
    expect(await resendBalanceLink("int-1", plus(NOW, 2 * MIN), { force: true })).toEqual({ ok: true, sent: false });
    expect(h.mail.sendBalanceLinkEmail).toHaveBeenCalledTimes(3);
  });

  it("dois pedidos ao mesmo tempo → um só email", async () => {
    seed(rowN(1));
    const [a, b] = await Promise.all([resendBalanceLink("int-1", NOW), resendBalanceLink("int-1", NOW)]);
    expect([a.sent, b.sent].sort()).toEqual([false, true]);
    expect(h.mail.sendBalanceLinkEmail).toHaveBeenCalledTimes(1);
  });

  it("'Preciso de ajuda' repetido: um alerta por linha a cada 15 min; a pausa aplica-se na mesma; o log não leva a mensagem", async () => {
    seed(rowN(1), rowN(2));
    expect(await guestHelp("int-1", linkTok(), { message: "primeira" }, NOW)).toMatchObject({ ok: true, pausedUntil: plus(NOW, 5 * DAY).toISOString() });
    for (let i = 0; i < 5; i++) await guestHelp("int-1", linkTok(), { message: "segredo do hóspede" }, plus(NOW, i * MIN));
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
    const info = (console.info as unknown as Mock).mock.calls.map((c) => String(c[0]));
    expect(info.some((l) => l.includes("sp-1"))).toBe(true);
    expect(info.join(" ")).not.toContain("segredo");
    // Outra linha tem o seu próprio travão, e a pausa dela aplica-se.
    expect(await guestHelp("int-2", linkTok("int-2"), { message: "ajuda" }, NOW)).toMatchObject({ ok: true, pausedUntil: plus(NOW, 5 * DAY).toISOString() });
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(2);
    // Passados 15 min (relógio real), a mesma linha volta a avisar.
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 15 * MIN + 1);
    await guestHelp("int-1", linkTok(), { message: "outra vez" }, plus(NOW, 16 * MIN));
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(3);
  });
});

/** Regressão C12: o Flex contava 14 dias desde a criação do PI da 1.ª parte, que o checkout reutiliza. */
describe("Regressão C12: os 14 dias do Flex contam do pagamento da 1.ª parte", () => {
  const now = L("2027-06-20", 15);

  it("PI criado há 20 dias (o hóspede voltou pelo funil) e pago há 11 → o Flex ainda volta", async () => {
    seed(rowN(1));
    seedDeposit({ boughtAt: plus(now, -20 * DAY) });
    h.stripeState.deposits.get("pi_dep_1")!.latest_charge = { amount_refunded: 0, created: Math.floor(plus(now, -11 * DAY).getTime() / 1000) };
    expect(await guestRefundPlan(stored(), now)).toMatchObject({ depositWithholdCents: 0, totalCents: 600_000, flexCents: 30_000 });
  });

  it("pago há 15 dias → retido; sem a data da cobrança (latest_charge por expandir) conta da criação do PI", async () => {
    seed(rowN(1));
    seedDeposit({ boughtAt: plus(now, -20 * DAY) });
    h.stripeState.deposits.get("pi_dep_1")!.latest_charge = { amount_refunded: 0, created: Math.floor(plus(now, -15 * DAY).getTime() / 1000) };
    expect((await guestRefundPlan(stored(), now)).depositWithholdCents).toBe(30_000);
    h.stripeState.deposits.get("pi_dep_1")!.latest_charge = "ch_1";
    expect((await guestRefundPlan(stored(), now)).depositWithholdCents).toBe(30_000);
  });
});

/** Regressão C13: a key do PI do hóspede só mudava ao minuto; uma nova tentativa recebia o PI cancelado. */
describe("Regressão C13: nova tentativa no mesmo minuto depois de um 3DS falhado", () => {
  beforeEach(() => stubLinkEnv());

  it("10:15:05 cria; 3DS fechado; 10:15:40 → um PI NOVO (a key leva o PI anterior do hóspede)", async () => {
    seed(rowN(1));
    const t0 = L("2027-06-20", 10, 15);
    h.stripeState.clockMs = t0.getTime();
    expect(await prepareGuestPayment("int-1", linkTok(), plus(t0, 5_000))).toMatchObject({ ok: true, clientSecret: "pi_bal_1_secret_x" });
    // O 3DS falhou: o PI volta a requires_payment_method e sem cartão.
    Object.assign(h.stripeState.pis.get("pi_bal_1")!, { status: "requires_payment_method", payment_method: null });
    expect(await prepareGuestPayment("int-1", linkTok(), plus(t0, 40_000))).toMatchObject({ ok: true, clientSecret: "pi_bal_2_secret_x" });
    expect(piStatus("pi_bal_1")).toBe("canceled");
    expect(piStatus("pi_bal_2")).toBe("requires_confirmation");
    const minute = Math.floor(t0.getTime() / 60_000);
    expect(h.stripe.createBalancePaymentIntent.mock.calls.map((c) => [c[0].attempt, c[0].keyNonce])).toEqual([[minute, "first"], [minute, "pi_bal_1"]]);
    expect(stored().guestPaymentIntentId).toBe("pi_bal_2");
  });
});

/** Regressão C14: o hash gravado era o de um texto renderizado outra vez com a hora do envio. */
describe("Regressão C14: a autorização gravada é a do texto que o hóspede viu", () => {
  beforeEach(() => stubLinkEnv());
  function confirmedSetup(): void {
    h.stripeState.setupIntents.set("seti_ok", {
      id: "seti_ok", status: "succeeded", customer: "cus_1", client_secret: "x",
      metadata: { flow: "card_v2_card_change", intentId: "int-1", scheduledPaymentId: "sp-1" },
      payment_method: { id: "pm_new", card: { brand: "mastercard", last4: "5555", exp_month: 9, exp_year: 2031 } },
    });
  }
  const mandateAt = (now: Date) => renderCardChangeMandate("pt", { amountLaterCents: 500_000, chargeAt: C, freeCancelDeadlineAt: D, now });

  it("página às 09:57 ('a 28 de junho'), envio às 10:03 ('hoje') → grava o hash do texto das 09:57; aceite às 10:03", async () => {
    seed(rowN(1));
    const shown = plus(C, -3 * MIN);
    const submit = plus(C, 3 * MIN);
    const v = await guestBalanceView("int-1", linkTok(), shown);
    const consent = v.kind === "ok" ? v.cardChangeConsent! : null;
    expect(consent).toMatchObject({ text: mandateAt(shown).text, renderedAt: shown.toISOString() });
    expect(mandateAt(shown).hash).not.toBe(mandateAt(submit).hash); // o texto muda com a hora
    confirmedSetup();
    expect(await finishCardChange("int-1", linkTok(), { setupIntentId: "seti_ok", consent: true, ip: null, consentRenderedAt: consent!.renderedAt }, submit)).toMatchObject({ ok: true });
    expect(h.mandates.at(-1)).toMatchObject({ mandateTextHash: mandateAt(shown).hash, acceptedAt: submit });
  });

  it.each([
    ["ausente", undefined],
    ["que não é ISO", "28/06/2027 09:57"],
    ["no futuro", plus(C, HOUR).toISOString()],
    ["com mais de 6 h", plus(C, -7 * HOUR).toISOString()],
  ])("consentRenderedAt %s → o texto renderizado com a hora do envio", async (_label, renderedAt) => {
    seed(rowN(1));
    confirmedSetup();
    const submit = plus(C, 3 * MIN);
    await finishCardChange("int-1", linkTok(), { setupIntentId: "seti_ok", consent: true, ip: null, consentRenderedAt: renderedAt }, submit);
    expect(h.mandates.at(-1)!.mandateTextHash).toBe(mandateAt(submit).hash);
  });
});

/** Regressão C16: "Cobrar agora" com recusa soft apagava as retentativas que o E3 prometeu. */
describe("Regressão C16: recusa soft numa cobrança do admin", () => {
  it("linha em retry entre C e C+1: → retry em C+1, a retentativa que o E3 prometeu (não salta para C+3), e o sweep cobra nela", async () => {
    const row = rowN(1, { status: "retry", attempts: 1, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2, balancePaymentIntentId: "pi_c" });
    seed(row);
    seedPi("pi_c", "requires_payment_method", row, { attempt: 1, source: "sweep", keyNonce: "first" });
    h.stripeState.confirmPlan.push("soft");
    expect(await chargeScheduledPayment(stored(), "admin", plus(C, 5 * HOUR))).toBe("retry");
    expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: R1, attempts: 2, lastDeclineCode: "insufficient_funds" });
    expect(h.db.markScheduledPaymentNeedsAction).not.toHaveBeenCalled();
    expect((await sweep(plus(R1, MIN))).charged).toEqual({ succeeded: 1 });
  });

  it("linha em retry depois de falhar C+1: → retry em C+3 (não needs_action), e o sweep cobra nela", async () => {
    const row = rowN(1, { status: "retry", attempts: 2, nextAttemptAt: R2, lastDeclineCode: "insufficient_funds", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2, balancePaymentIntentId: "pi_r1" });
    seed(row);
    seedPi("pi_r1", "requires_payment_method", row, { attempt: 2, source: "sweep", keyNonce: "pi_c" });
    h.stripeState.confirmPlan.push("soft");
    expect(await chargeScheduledPayment(stored(), "admin", plus(R1, DAY))).toBe("retry");
    expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: R2, attempts: 3 });
    expect(h.db.markScheduledPaymentNeedsAction).not.toHaveBeenCalled();
    expect((await sweep(plus(R2, MIN))).charged).toEqual({ succeeded: 1 });
  });

  it("depois de um 'Cobrar agora' pelo meio, a recusa do sweep em C+1 ainda marca C+3", async () => {
    // attempts 2 = C (sweep) + admin; o sweep de C+1 faz a 3.ª: a contagem
    // sozinha dava "acabaram as retentativas".
    const row = rowN(1, { status: "retry", attempts: 2, nextAttemptAt: R1, lastDeclineCode: "insufficient_funds", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2, balancePaymentIntentId: "pi_adm" });
    seed(row);
    seedPi("pi_adm", "requires_payment_method", row, { attempt: 2, source: "admin", keyNonce: "pi_c" });
    h.stripeState.confirmPlan.push("soft");
    await sweep(plus(R1, MIN));
    expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: R2, attempts: 3 });
  });

  it("linha agendada (cobrança antecipada a pedido do hóspede): → retry em C+1", async () => {
    seed(rowN(1, { reminderStage: 2 }));
    h.stripeState.confirmPlan.push("soft");
    expect(await chargeScheduledPayment(stored(), "admin", plus(C, -DAY))).toBe("retry");
    expect(stored()).toMatchObject({ status: "retry", nextAttemptAt: R1, attempts: 1 });
  });

  it("a partir de needs_action (recusa hard antes): → needs_action, sem retentativas", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", failureNoticeStage: 1 }));
    h.stripeState.confirmPlan.push("soft");
    expect(await chargeScheduledPayment(stored(), "admin", plus(C, 5 * HOUR))).toBe("needs_action");
    expect(h.db.markScheduledPaymentRetry).not.toHaveBeenCalled();
  });
});

/** Regressão (3.ª revisão): depois de trocar de cartão, um PI antigo do
 *  hóspede no cartão anterior adiava a cobrança no cartão novo até H. */
describe("Regressão: PI do hóspede no cartão antigo depois de trocar de cartão", () => {
  const AT = plus(H, -35 * MIN);
  const before = () => rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "insufficient_funds", failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN), reminderStage: 2, guestPaymentIntentId: "pi_g_old" });

  it("o sweep fecha o PI antigo e cobra no cartão novo, mesmo com guest_active_at de há 10 min", async () => {
    const old = before();
    seedPi("pi_g_old", "requires_action", old, undefined, plus(C, 3 * HOUR));
    seed({ ...old, status: "retry", paymentMethodId: "pm_new", nextAttemptAt: AT, guestActiveAt: plus(AT, -10 * MIN) });
    expect((await sweep(AT)).charged).toEqual({ succeeded: 1 });
    expect(piStatus("pi_g_old")).toBe("canceled");
    expect(stored().status).toBe("succeeded");
  });

  it("com o PI do hóspede no cartão atual, o escudo de 60 min mantém-se", async () => {
    const row = { ...before(), status: "retry" as const, nextAttemptAt: AT, guestActiveAt: plus(AT, -10 * MIN) };
    seedPi("pi_g_old", "requires_action", row, undefined, plus(C, 3 * HOUR));
    seed(row);
    await sweep(AT);
    expect(piStatus("pi_g_old")).toBe("requires_action");
    expect(stored().status).toBe("retry");
  });
});

/** Regressão C17: um pagamento do hóspede numa linha em revisão nunca ficava registado. */
describe("Regressão C17: pagamento que sucede com a linha em revisão", () => {
  const NOW = plus(C, -DAY);
  const event = (id: string, scheduledPaymentId = "sp-1") => ({ id, amount: 500_000, metadata: { scheduledPaymentId, intentId: "int-1" } });

  it("PI do hóspede pago com a linha em pausa → succeeded, alerta 'pago durante a revisão', o PI do sweep fecha e o sweep faz os efeitos", async () => {
    seed(rowN(1, {
      status: "needs_review", reviewReason: "pausa pedida no ecrã Saldos", helpPausedUntil: plus(C, 2 * DAY),
      guestPaymentIntentId: "pi_g", balancePaymentIntentId: "pi_b",
    }));
    seedPi("pi_b", "requires_payment_method", rowN(1));
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("marked");
    expect(h.db.markReviewAsSucceeded).toHaveBeenCalledWith("sp-1", "pi_g", NOW);
    expect(stored()).toMatchObject({ status: "succeeded", balancePaymentIntentId: "pi_g", succeededAt: NOW });
    expect(piStatus("pi_b")).toBe("canceled");
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga durante a revisão — GY-1")]);
    expect(h.mail.sendOpsAlert.mock.calls[0][1].join(" ")).toContain("possível duplicado");

    await sweep(plus(NOW, 10 * MIN));
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-1", 5000, "EUR", "pi_g");
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(1);
  });

  it("em revisão pelo Guesty (reserva cancelada) → o pagamento fica gravado, a linha continua a rever; nada no Guesty nem E4", async () => {
    seed(rowN(1, { status: "needs_review", reviewReason: "reserva cancelada no Guesty", guestPaymentIntentId: "pi_g", balancePaymentIntentId: "pi_b" }));
    seedPi("pi_b", "requires_payment_method", rowN(1));
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("review");
    expect(h.db.markReviewAsSucceeded).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ status: "needs_review", balancePaymentIntentId: "pi_g", succeededAt: NOW });
    expect(piStatus("pi_b")).toBe("canceled");
    expect(alertSubjects()).toEqual([expect.stringContaining("2.ª parte paga com a reserva a rever — GY-1")]);
    const body = h.mail.sendOpsAlert.mock.calls.at(-1)![1].join(" ");
    expect(body).toContain("reserva cancelada no Guesty");
    expect(body).toContain("Retomar");
    expect(body).toContain("Devolver tudo");
    await sweep(plus(NOW, 10 * MIN));
    expect(h.guestyPay.recordExternalPayment).not.toHaveBeenCalled();
    expect(h.mail.sendBalancePaid).not.toHaveBeenCalled();
    expect(stored().status).toBe("needs_review");
  });

  it("a mesma entrega repetida → already, sem segundo alerta; outro PI pago → devolvido como duplicado", async () => {
    seed(rowN(1, { status: "needs_review", reviewReason: "pagamento parcial por fora (500,00 €)", guestPaymentIntentId: "pi_g" }));
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("review");
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("already");
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
    seedPi("pi_outro", "succeeded", rowN(1));
    expect(await handleBalancePaymentSucceeded(event("pi_outro"), NOW)).toBe("duplicate");
    expect(stored()).toMatchObject({ status: "needs_review", balancePaymentIntentId: "pi_g" });
  });

  it("paga durante a revisão e cancelada pela equipa → devolve a 1.ª e a 2.ª parte", async () => {
    const r = rowN(1, { status: "needs_review", reviewReason: "reserva cancelada no Guesty", guestPaymentIntentId: "pi_g" });
    seed(r);
    seedPi("pi_g", "succeeded", r);
    expect(await handleBalancePaymentSucceeded(event("pi_g"), NOW)).toBe("review");
    const row = stored();
    h.store.get("sp-1")!.status = "cancelling";
    h.store.get("sp-1")!.reviewReason = "cancel:admin";
    await runCancellation({ ...row, status: "cancelling", reviewReason: "cancel:admin" }, "admin", plus(NOW, MIN));
    const refunded = h.stripe.refundRemaining.mock.calls.map((c: any[]) => c[0].paymentIntentId);
    expect(refunded).toEqual([row.depositPaymentIntentId, "pi_g"]);
    expect(h.db.markCancellingAsSucceeded).not.toHaveBeenCalled();
  });

  it("um PI que não é desta linha → terminal e alerta; a linha fica em revisão", async () => {
    seed(rowN(1, { status: "needs_review", reviewReason: "x", guestPaymentIntentId: "pi_g" }));
    h.db.getScheduledPaymentByBalancePi.mockImplementationOnce(async () => stored());
    expect(await handleBalancePaymentSucceeded(event("pi_alheio", "sp-9"), NOW)).toBe("terminal");
    expect(h.db.markReviewAsSucceeded).not.toHaveBeenCalled();
    expect(stored().status).toBe("needs_review");
  });
});

/**
 * Regressão C21/C28: o estágio 2 dizia "E3b enviado" também quando a véspera
 * se perdeu ou não havia email/link, e a véspera de um aviso de 7 dias
 * incompleto dizia ao hóspede "cancelamos e devolvemos" e ao ops "cancela
 * amanhã", quando em H a linha vai para um humano.
 */
describe("Regressão C21/C28: véspera de H fechada sem E3b (estágio 3)", () => {
  it("aviso incompleto (H preso em D − 1, o E3 já pediu a decisão): na véspera nada sai; estágio 3; em H vai para revisão com prazo D", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 }));
    await sweep(L("2027-07-01", 15)); // E3 tarde: H = D − 1 às 12:00, alerta "decisão humana"
    expect(stored()).toMatchObject({ hardStopAt: D_MINUS_1, failureNoticeStage: 1 });
    expect(alertSubjects()).toEqual([expect.stringContaining("decisão humana antes de 2027-07-08")]);
    h.mail.sendOpsAlert.mockClear();

    await sweep(L("2027-07-06", 10)); // véspera de H
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(h.sms.sendBalanceLastCallSms).not.toHaveBeenCalled();
    expect(h.mail.sendOpsAlert).not.toHaveBeenCalled();
    expect(stored().failureNoticeStage).toBe(3);

    await sweep(plus(D_MINUS_1, MIN));
    expect(stored()).toMatchObject({ status: "needs_review", reviewReason: "prazo H sem 7 dias de aviso cumpridos", reviewDueAt: D });
    expect(h.guesty.cancelGuestyReservation).not.toHaveBeenCalled();
  });

  it("aviso que deixou de caber depois do E3 (H antes de D − 1): na véspera, só o alerta 'não cancela sozinha', sem E3b", async () => {
    seed(rowN(1, {
      status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2,
      failureNoticeStage: 1, failureNoticeSentAt: plus(H, -7 * DAY + HOUR),
    }));
    await sweep(L("2027-07-04", 10));
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(alertSubjects()).toEqual([expect.stringContaining("não cancela sozinha, decidir antes de 2027-07-08 — GY-1")]);
    expect(alertSubjects().filter((s) => s.includes("cancela amanhã"))).toEqual([]);
    expect(stored().failureNoticeStage).toBe(3);
    await sweep(L("2027-07-04", 10, 10));
    expect(h.mail.sendOpsAlert).toHaveBeenCalledTimes(1);
  });

  it("sem link (segredo em falta) na véspera → sem E3b nem SMS, estágio 3, o ops sabe que o email não saiu", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2, failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN) }));
    h.links.balanceLinkUrl.mockImplementation(() => {
      throw new Error("BALANCE_LINK_SECRET (ou JWT_SECRET) em falta");
    });
    await sweep(L("2027-07-04", 10));
    expect(h.mail.sendBalanceLastCall).not.toHaveBeenCalled();
    expect(h.sms.sendBalanceLastCallSms).not.toHaveBeenCalled();
    expect(stored().failureNoticeStage).toBe(3);
    expect(h.mail.sendOpsAlert.mock.calls[0][1].join(" ")).toContain("O último aviso por email NÃO saiu (link indisponível)");
  });

  it("E3b enviado → estágio 2 (o único que quer dizer 'enviado')", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2, failureNoticeStage: 1, failureNoticeSentAt: plus(C, 10 * MIN) }));
    await sweep(L("2027-07-04", 10));
    expect(h.mail.sendBalanceLastCall).toHaveBeenCalledTimes(1);
    expect(stored().failureNoticeStage).toBe(2);
  });
});

/** Regressão C22: sms_stage ficava sempre a 0 (o digest e o admin diziam "SMS 0"). */
describe("Regressão C22: sms_stage com os SMS que saíram", () => {
  it("1 depois do S1 aceite, 2 depois do S2", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 }));
    await sweep(plus(C, 10 * MIN));
    expect(stored()).toMatchObject({ failureNoticeStage: 1, smsStage: 1 });
    await sweep(L("2027-07-04", 10));
    expect(stored()).toMatchObject({ failureNoticeStage: 2, smsStage: 2 });
  });

  it("SMS não aceite (ou que rebenta) → o estágio não sobe; o email segue", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, lastDeclineCode: "expired_card", reminderStage: 2 }));
    h.sms.sendBalanceFailedSms.mockImplementationOnce(async () => false);
    await sweep(plus(C, 10 * MIN));
    expect(stored()).toMatchObject({ failureNoticeStage: 1, smsStage: 0 });
    h.sms.sendBalanceLastCallSms.mockImplementationOnce(async () => {
      throw new Error("Twilio 500");
    });
    await sweep(L("2027-07-04", 10));
    expect(stored()).toMatchObject({ failureNoticeStage: 2, smsStage: 0 });
    expect(alertSubjects().at(-1)).toContain("cancela amanhã às 12:00");
  });
});

/**
 * Regressão C25: com CHECKOUT_BALANCE desligado no serviço de produção (o
 * interruptor de emergência), a página continua a aceitar pagamentos, mas os
 * efeitos só corriam no sweep (desligado) e o digest nunca era enviado.
 */
describe("Regressão C25: motor desligado no serviço de produção", () => {
  const OFF: NodeJS.ProcessEnv = { ...PROD_ENV, CHECKOUT_BALANCE: "false" };
  const NOW = plus(C, HOUR);
  const event = { id: "pi_g", amount: 500_000, metadata: { scheduledPaymentId: "sp-1", intentId: "int-1" } };

  it("isBalanceProductionService: as condições do motor sem a flag", () => {
    expect(isBalanceProductionService(OFF)).toBe(true);
    expect(canRunBalanceEngine(OFF)).toBe(false);
    expect(isBalanceProductionService(PROD_ENV)).toBe(true);
    expect(isBalanceProductionService({ ...OFF, NODE_ENV: "development" })).toBe(false);
    expect(isBalanceProductionService({ ...OFF, RENDER_SERVICE_ID: "" })).toBe(false);
    expect(isBalanceProductionService(LIVE)).toBe(false);
  });

  it("pagamento do hóspede marcado pelo webhook → os efeitos correm logo (Guesty, nota 'NAO cobrar', E4)", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, guestPaymentIntentId: "pi_g" }));
    expect(await handleBalancePaymentSucceeded(event, NOW, OFF)).toBe("marked");
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-1", 5000, "EUR", "pi_g");
    expect(h.guestyPay.appendReservationNote).toHaveBeenCalledWith("res-1", expect.stringContaining("NAO cobrar"));
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(1);
    expect(stored()).toMatchObject({ status: "succeeded", guestyBalanceRecordedAt: NOW });
  });

  it("com o motor ligado (ou fora de produção) os efeitos ficam para o sweep", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, guestPaymentIntentId: "pi_g" }));
    expect(await handleBalancePaymentSucceeded(event, NOW, PROD_ENV)).toBe("marked");
    h.store.get("sp-1")!.status = "needs_action";
    expect(await handleBalancePaymentSucceeded(event, NOW, LIVE)).toBe("marked");
    expect(h.guestyPay.recordExternalPayment).not.toHaveBeenCalled();
    expect(h.mail.sendBalancePaid).not.toHaveBeenCalled();
  });

  it("linha já marcada paga por outro caminho (Pagar agora leu o PI pago) → o webhook 'already' corre os efeitos em falta", async () => {
    // prepareGuestPayment encontrou o PI pago e marcou a linha antes do
    // webhook: sem sweep, esta entrega é a única ocasião para o E4 e o Guesty.
    seed(rowN(1, { status: "succeeded", succeededAt: NOW, balancePaymentIntentId: "pi_g", guestPaymentIntentId: "pi_g" }));
    expect(await handleBalancePaymentSucceeded(event, NOW, OFF)).toBe("already");
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledWith("res-1", 5000, "EUR", "pi_g");
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(1);
    // Uma reentrega não repete nada (cada efeito tem o seu claim).
    expect(await handleBalancePaymentSucceeded(event, NOW, OFF)).toBe("already");
    expect(h.guestyPay.recordExternalPayment).toHaveBeenCalledTimes(1);
    expect(h.mail.sendBalancePaid).toHaveBeenCalledTimes(1);
  });

  it("com o motor ligado, 'already' continua a deixar os efeitos para o sweep", async () => {
    seed(rowN(1, { status: "succeeded", succeededAt: NOW, balancePaymentIntentId: "pi_g", guestPaymentIntentId: "pi_g" }));
    expect(await handleBalancePaymentSucceeded(event, NOW, PROD_ENV)).toBe("already");
    expect(h.guestyPay.recordExternalPayment).not.toHaveBeenCalled();
    expect(h.mail.sendBalancePaid).not.toHaveBeenCalled();
  });

  it("efeitos que rebentam nunca estragam a resposta do webhook", async () => {
    seed(rowN(1, { status: "needs_action", attempts: 1, guestPaymentIntentId: "pi_g" }));
    h.db.getScheduledPaymentById.mockImplementationOnce(async () => {
      throw new Error("BD em baixo");
    });
    expect(await handleBalancePaymentSucceeded(event, NOW, OFF)).toBe("marked");
  });

  it("o digest diário sai na mesma com linhas abertas, com chargesEnabled false; fora do serviço de produção não sai", async () => {
    h.db.listBalanceDigest.mockResolvedValueOnce({
      counts: { retry: 1 }, upcoming7d: [], failing: [], review: [], cancelled24h: [],
      postChargeIncomplete: [], stuckCharging: [], stuckCancelling: [], refundFailures: [],
    } as any);
    expect(await sendDailyBalanceDigest(NOW, OFF)).toBe(true);
    expect(h.mail.sendBalanceDigest).toHaveBeenCalledWith(expect.objectContaining({ chargesEnabled: false, livemode: true, siteOrigin: ORIGIN }));
    expect(await sendDailyBalanceDigest(NOW, { ...OFF, NODE_ENV: "development" })).toBe(false);
    expect(h.mail.sendBalanceDigest).toHaveBeenCalledTimes(1);
  });

  it("motor desligado sem nada aberto (antes do lançamento): nenhum email vazio todos os dias", async () => {
    expect(await sendDailyBalanceDigest(NOW, OFF)).toBe(false);
    expect(h.mail.sendBalanceDigest).not.toHaveBeenCalled();
  });

  it("motor ligado sem nada aberto: sai na mesma (a prova de que o sweep corre)", async () => {
    expect(await sendDailyBalanceDigest(NOW, PROD_ENV)).toBe(true);
    expect(h.mail.sendBalanceDigest).toHaveBeenCalledWith(expect.objectContaining({ chargesEnabled: true }));
  });
});
