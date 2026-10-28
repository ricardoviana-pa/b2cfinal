/**
 * Pagamento em duas partes, Fase 2c: ecrã "Saldos" do CS
 * (server/routers/balance-admin.ts; docs/pagamento_duas_partes.md 3.4 e 5.12).
 *
 * O router corre com o motor, a Stripe, o Guesty e a BD simulados, para
 * provar o que importa ao dinheiro: só admins entram, cada ação fica
 * registada ANTES de correr (sem registo não corre), as ações que mexem no
 * dinheiro exigem a palavra de confirmação, cada ação chama o que deve e
 * nada mais, e o browser nunca recebe ids de customer nem de cartão.
 *
 * No fim, os helpers novos de server/db.ts (subsecção "Fase 2c") correm com
 * o drizzle verdadeiro sobre um cliente mysql2 falso: o SQL é o de produção.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { checkoutScheduledPayments, type CheckoutScheduledPayment } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { balanceAdminAvailability, balanceAdminRouter } from "./balance-admin";

const m = vi.hoisted(() => ({
  // BD
  getScheduledPaymentById: vi.fn(),
  listScheduledPaymentsForAdmin: vi.fn(),
  countScheduledPaymentsForAdmin: vi.fn(),
  insertAdminAction: vi.fn(),
  setAdminActionResult: vi.fn(),
  listAdminActions: vi.fn(),
  getBookingIntent: vi.fn(),
  markPaidExternally: vi.fn(),
  markScheduledPaymentSucceeded: vi.fn(),
  adminPause: vi.fn(),
  adminResume: vi.fn(),
  claimScheduledPaymentForCancel: vi.fn(),
  markCreditNote: vi.fn(),
  markRefundManual: vi.fn(),
  // motor
  balanceScope: vi.fn(),
  canRunBalanceEngine: vi.fn(),
  chargeScheduledPayment: vi.fn(),
  runPostChargeEffects: vi.fn(),
  runCancellation: vi.fn(),
  resendBalanceLink: vi.fn(),
  adminRefundPreview: vi.fn(),
  // Stripe e Guesty
  cancelOpenPaymentIntent: vi.fn(),
  appendReservationNote: vi.fn(),
  // MySQL falso para os helpers verdadeiros
  query: vi.fn(),
  preview: vi.fn(() => false),
}));

vi.mock("../lib/preview-isolation", () => ({ isPreviewDeployment: m.preview }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: () => actual.drizzle({ client: { query: m.query } as any }) };
});
vi.mock("../db", () => ({
  getScheduledPaymentById: m.getScheduledPaymentById,
  listScheduledPaymentsForAdmin: m.listScheduledPaymentsForAdmin,
  countScheduledPaymentsForAdmin: m.countScheduledPaymentsForAdmin,
  insertAdminAction: m.insertAdminAction,
  setAdminActionResult: m.setAdminActionResult,
  listAdminActions: m.listAdminActions,
  getBookingIntent: m.getBookingIntent,
  markPaidExternally: m.markPaidExternally,
  markScheduledPaymentSucceeded: m.markScheduledPaymentSucceeded,
  adminPause: m.adminPause,
  adminResume: m.adminResume,
  claimScheduledPaymentForCancel: m.claimScheduledPaymentForCancel,
  markCreditNote: m.markCreditNote,
  markRefundManual: m.markRefundManual,
}));
vi.mock("../services/checkout-balance", () => ({
  balanceScope: m.balanceScope,
  canRunBalanceEngine: m.canRunBalanceEngine,
  chargeScheduledPayment: m.chargeScheduledPayment,
  runPostChargeEffects: m.runPostChargeEffects,
  runCancellation: m.runCancellation,
  resendBalanceLink: m.resendBalanceLink,
  adminRefundPreview: m.adminRefundPreview,
  // A mesma regra do motor: o hóspede agiu na página (guest_active_at) há
  // menos de 60 minutos.
  guestIsActive: (row: any, now: Date) =>
    row.guestActiveAt != null && now.getTime() - new Date(row.guestActiveAt).getTime() < 60 * 60_000,
  // A mesma leitura do motor (quem pediu o cancelamento, gravado no claim).
  cancellationKindFromReason: (r: string | null | undefined) => (r === "cancel:guest" ? "guest" : r === "cancel:admin" ? "admin" : "unpaid"),
  // O mesmo cálculo do motor (último dia do mês de validade).
  cardExpiresBefore: (row: any, at: Date) => {
    const mm = Number(row.cardExpMonth);
    const yy = Number(row.cardExpYear);
    return !!mm && !!yy && Date.UTC(yy, mm, 1) - 1 < at.getTime();
  },
}));
vi.mock("../services/stripe-balance", async (importOriginal) => {
  // classifyDecline verdadeiro: a regra hard/auth/soft é a do motor.
  const actual = await importOriginal<typeof import("../services/stripe-balance")>();
  return { ...actual, cancelOpenPaymentIntent: m.cancelOpenPaymentIntent };
});
vi.mock("../services/guesty-openapi-paypal", () => ({ appendReservationNote: m.appendReservationNote }));

/* ════════════════════════════════════════════════════════════════
   Dados
   ════════════════════════════════════════════════════════════════ */

const SCOPE = { livemode: true, siteOrigin: "https://www.portugalactive.com" };
const SECRET_CUSTOMER = "cus_SECRET123";
const SECRET_PM = "pm_SECRET456";
const INTENT = "11111111-2222-4333-8444-555555555555";

type Row = CheckoutScheduledPayment;

/** Linha moderate: check-in 15/07/2027, D 08/07 23:59, C 28/06 10:00, H 05/07 12:00 (Lisboa). */
function row(over: Partial<Row> = {}): Row {
  const blank = Object.fromEntries(Object.keys(getTableColumns(checkoutScheduledPayments)).map((k) => [k, null]));
  return {
    ...blank,
    id: "sp-1",
    intentId: INTENT,
    livemode: true,
    siteOrigin: SCOPE.siteOrigin,
    reservationId: "res-1",
    confirmationCode: "GY-ABC123",
    listingId: "lst-1",
    propertyName: "Villa Aura",
    checkIn: "2027-07-15",
    checkOut: "2027-07-22",
    email: "guest@example.com",
    phone: "+351900000000",
    locale: "pt",
    currency: "EUR",
    depositPaymentIntentId: "pi_dep",
    depositCents: 126_200,
    depositStayCents: 120_000,
    balanceCents: 120_000,
    stripeCustomerId: SECRET_CUSTOMER,
    paymentMethodId: SECRET_PM,
    cardBrand: "visa",
    cardLast4: "4242",
    cardExpMonth: 12,
    cardExpYear: 2030,
    policyCode: "moderate",
    freeCancelDeadline: new Date("2027-07-08T22:59:00Z"),
    chargeAt: new Date("2027-06-28T09:00:00Z"),
    hardStopAt: new Date("2027-07-05T11:00:00Z"),
    nextAttemptAt: new Date("2027-06-28T09:00:00Z"),
    status: "scheduled",
    attempts: 0,
    failureNoticeStage: 0,
    reminderStage: 0,
    smsStage: 0,
    creditNoteDue: false,
    createdAt: new Date("2026-10-24T10:00:00Z"),
    updatedAt: new Date("2026-10-24T10:00:00Z"),
    ...over,
  } as Row;
}

const BEFORE_C = new Date("2027-06-20T10:00:00Z");
const AFTER_C = new Date("2027-06-30T10:00:00Z");
const AFTER_H = new Date("2027-07-06T10:00:00Z");
const AFTER_D = new Date("2027-07-10T10:00:00Z");

function ctx(role: "admin" | "user" | null, headers: Record<string, string> = {}): TrpcContext {
  const user = role
    ? {
        id: role === "admin" ? 1 : 2,
        openId: `${role}-open-id`,
        email: role === "admin" ? "booking@portugalactive.com" : "user@example.com",
        name: role === "admin" ? "Booking PA" : "Someone",
        loginMethod: "password",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    : null;
  return {
    user,
    req: { protocol: "https", headers } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const admin = () => balanceAdminRouter.createCaller(ctx("admin"));

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (err: any) {
    return err?.code ?? "unknown";
  }
}

/** Todos os mocks da BD, do motor, da Stripe e do Guesty (para "nada foi chamado"). */
const SIDE_EFFECTS = () => [
  m.insertAdminAction, m.markPaidExternally, m.markScheduledPaymentSucceeded, m.adminPause, m.adminResume,
  m.claimScheduledPaymentForCancel, m.markCreditNote, m.markRefundManual, m.chargeScheduledPayment, m.runPostChargeEffects,
  m.runCancellation, m.resendBalanceLink, m.cancelOpenPaymentIntent, m.appendReservationNote,
];

function expectNothingDone() {
  for (const fn of SIDE_EFFECTS()) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const fn of Object.values(m)) (fn as any).mockReset?.();
  m.preview.mockReturnValue(false);
  m.balanceScope.mockReturnValue(SCOPE);
  m.canRunBalanceEngine.mockReturnValue(true);
  m.getScheduledPaymentById.mockResolvedValue(row());
  m.insertAdminAction.mockResolvedValue(undefined);
  m.setAdminActionResult.mockResolvedValue(true);
  m.listAdminActions.mockResolvedValue([]);
  m.getBookingIntent.mockResolvedValue({ guestFirstName: "Ana", guestLastName: "Silva", stripeCustomerId: SECRET_CUSTOMER });
  m.countScheduledPaymentsForAdmin.mockResolvedValue({ scheduled: 1 });
  m.listScheduledPaymentsForAdmin.mockResolvedValue([row()]);
  m.resendBalanceLink.mockResolvedValue({ ok: true, sent: true });
  m.adminRefundPreview.mockResolvedValue({
    policy: { totalCents: 126_200, flexCents: 0, flexWithheldCents: 0 },
    full: { totalCents: 126_200 },
    refundCardsLast4: ["1111"],
  });
  m.appendReservationNote.mockResolvedValue(true);
  m.runPostChargeEffects.mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BEFORE_C);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   Autorização
   ════════════════════════════════════════════════════════════════ */

const CALLS: Array<[string, (c: ReturnType<typeof admin>) => Promise<unknown>]> = [
  ["list", (c) => c.list()],
  ["detail", (c) => c.detail({ id: "sp-1" })],
  ["resendLink", (c) => c.resendLink({ id: "sp-1" })],
  ["chargeNow", (c) => c.chargeNow({ id: "sp-1", confirm: "COBRAR", guestRequested: true })],
  ["markPaidExternally", (c) => c.markPaidExternally({ id: "sp-1", ref: "TRF-1", amountCents: 120_000, paidOn: "2027-06-19", confirm: "PAGO" })],
  ["pause", (c) => c.pause({ id: "sp-1", until: "2027-06-25" })],
  ["resume", (c) => c.resume({ id: "sp-1" })],
  ["cancelAndRefund", (c) => c.cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" })],
  ["continueCancellation", (c) => c.continueCancellation({ id: "sp-1", confirm: "CANCELAR" })],
  ["markCreditNote", (c) => c.markCreditNote({ id: "sp-1", ref: "NC 2027/1" })],
  ["markRefundResolved", (c) => c.markRefundResolved({ id: "sp-1", ref: "transferência 12/11", confirm: "RESOLVIDO" })],
];

describe("autorização: só utilizadores com papel admin", () => {
  it.each(CALLS)("%s sem sessão → FORBIDDEN, sem tocar em nada", async (_name, call) => {
    const anon = balanceAdminRouter.createCaller(ctx(null));
    expect(await codeOf(call(anon as any))).toBe("FORBIDDEN");
    expectNothingDone();
    expect(m.getScheduledPaymentById).not.toHaveBeenCalled();
    expect(m.listScheduledPaymentsForAdmin).not.toHaveBeenCalled();
  });

  it.each(CALLS)("%s com papel user → FORBIDDEN", async (_name, call) => {
    const user = balanceAdminRouter.createCaller(ctx("user"));
    expect(await codeOf(call(user as any))).toBe("FORBIDDEN");
    expectNothingDone();
  });

  it("a x-admin-key partilhada não abre nada (a autenticação é por utilizador)", async () => {
    const keyOnly = balanceAdminRouter.createCaller(ctx(null, { "x-admin-key": "the-shared-key" }));
    expect(await codeOf(keyOnly.list())).toBe("FORBIDDEN");
    expect(await codeOf(keyOnly.chargeNow({ id: "sp-1", confirm: "COBRAR", guestRequested: true }))).toBe("FORBIDDEN");
    expectNothingDone();
  });
});

/* ════════════════════════════════════════════════════════════════
   Leitura: lista e detalhe
   ════════════════════════════════════════════════════════════════ */

describe("list", () => {
  it("lista do scope deste processo, com contagens, sem customer nem cartão da Stripe", async () => {
    const out = await admin().list({ statuses: ["needs_review", "needs_action"], limit: 50 });
    expect(m.listScheduledPaymentsForAdmin).toHaveBeenCalledWith(SCOPE, { statuses: ["needs_review", "needs_action"], limit: 50 });
    expect(m.countScheduledPaymentsForAdmin).toHaveBeenCalledWith(SCOPE);
    expect(out.counts).toEqual({ scheduled: 1 });
    expect(out).toMatchObject({ livemode: true, siteOrigin: SCOPE.siteOrigin, chargesEnabled: true });
    expect(out.rows[0]).toMatchObject({
      id: "sp-1", status: "scheduled", cardBrand: "visa", cardLast4: "4242", balanceCents: 120_000,
      chargeAt: "2027-06-28T09:00:00.000Z", hardStopAt: "2027-07-05T11:00:00.000Z", freeCancelDeadlineAt: "2027-07-08T22:59:00.000Z",
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain(SECRET_CUSTOMER);
    expect(json).not.toContain(SECRET_PM);
    expect(out.rows[0]).not.toHaveProperty("stripeCustomerId");
    expect(out.rows[0]).not.toHaveProperty("paymentMethodId");
    // Do cartão só a marca e os 4 dígitos: a validade não sai.
    expect(out.rows[0]).not.toHaveProperty("cardExpMonth");
    expect(out.rows[0]).not.toHaveProperty("cardExpYear");
    expectNothingDone();
  });

  it("recusa um estado que não existe (o filtro nunca deixa de filtrar em silêncio)", async () => {
    expect(await codeOf(admin().list({ statuses: ["paid" as any] }))).toBe("BAD_REQUEST");
    expect(m.listScheduledPaymentsForAdmin).not.toHaveBeenCalled();
  });
});

describe("detail", () => {
  it("linha de outro ambiente (teste vs produção) é NOT_FOUND", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ livemode: false }));
    expect(await codeOf(admin().detail({ id: "sp-1" }))).toBe("NOT_FOUND");
    m.getScheduledPaymentById.mockResolvedValue(row({ siteOrigin: "https://dev.portugalactive.com" }));
    expect(await codeOf(admin().detail({ id: "sp-1" }))).toBe("NOT_FOUND");
    m.getScheduledPaymentById.mockResolvedValue(null);
    expect(await codeOf(admin().detail({ id: "sp-1" }))).toBe("NOT_FOUND");
  });

  it("valores, Guesty gravado, o que o hóspede vê e o histórico, sem ids secretos (nem dentro de erros)", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({
      status: "needs_action",
      attempts: 1,
      lastDeclineCode: "expired_card",
      lastError: `No such PaymentMethod: '${SECRET_PM}' on customer ${SECRET_CUSTOMER}`,
      guestyStatus: "confirmed",
      guestyCheckIn: "2027-07-16",
      guestyCheckOut: "2027-07-22",
      guestyTotalCents: 252_400,
      lastReconciledAt: new Date("2027-06-29T09:00:00Z"),
      failureNoticeStage: 1,
      failureNoticeSentAt: new Date("2027-06-28T09:20:00Z"),
    }));
    m.listAdminActions.mockResolvedValue([{
      id: "a-1", scheduledPaymentId: "sp-1", userId: 1, userEmail: "booking@portugalactive.com", action: "pause",
      details: { input: { reason: `cartao ${SECRET_PM}` } }, createdAt: new Date("2027-06-29T10:00:00Z"),
    }]);
    vi.setSystemTime(AFTER_C);
    const out = await admin().detail({ id: "sp-1" });
    expect(out.guestName).toBe("Ana Silva");
    expect(out.row).toMatchObject({ status: "needs_action", lastDeclineKind: "hard", servicesCents: 6_200 });
    expect(out.guesty).toMatchObject({ status: "confirmed", totalCents: 252_400, datesDiffer: true, listingDiffers: false });
    expect(out.notices).toMatchObject({ failureNoticeStage: 1, failureNoticeSentAt: "2027-06-28T09:20:00.000Z" });
    expect(out.guestView).toMatchObject({ canPayNow: true, canChangeCard: true, canConfirmSameCard: false, canCancelFree: true });
    expect(out.actions).toHaveLength(1);
    // Recusa hard: cobrar daqui só a pedido do hóspede.
    expect(out.gates.chargeNow.allowed).toBe(true);
    expect(out.chargeNeedsGuestRequest).toMatch(/definitiva/);
    const json = JSON.stringify(out);
    expect(json).not.toContain(SECRET_CUSTOMER);
    expect(json).not.toContain(SECRET_PM);
    expectNothingDone();
  });
});

describe("detail: pré-visualização do reembolso (C9/C18/C19)", () => {
  it("pede ao motor o que o cancelamento devolveria agora (valores e cartões), com a linha e o instante", async () => {
    m.adminRefundPreview.mockResolvedValue({
      policy: { totalCents: 120_000, flexCents: 6_200, flexWithheldCents: 6_200 },
      full: { totalCents: 126_200 },
      refundCardsLast4: ["1111", "2222"],
    });
    const out = await admin().detail({ id: "sp-1" });
    expect(m.adminRefundPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "sp-1" }), BEFORE_C);
    expect(out.refundPreview).toEqual({
      policy: { totalCents: 120_000, flexCents: 6_200, flexWithheldCents: 6_200 },
      full: { totalCents: 126_200 },
      refundCardsLast4: ["1111", "2222"],
    });
    expectNothingDone();
  });

  it("Stripe ilegível → null (o detalhe abre na mesma)", async () => {
    m.adminRefundPreview.mockRejectedValue(new Error("Stripe 500"));
    const out = await admin().detail({ id: "sp-1" });
    expect(out.refundPreview).toBeNull();
    expect(out.row.id).toBe("sp-1");
  });

  it("sem cancelamento possível (linha cancelada) não lê a Stripe", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelled_unpaid", refundStatus: "succeeded" }));
    const out = await admin().detail({ id: "sp-1" });
    expect(m.adminRefundPreview).not.toHaveBeenCalled();
    expect(out.refundPreview).toBeNull();
  });

  it("diz se o hóspede está a agir na página e se o reembolso falhou", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "retry", guestActiveAt: new Date(BEFORE_C.getTime() - 5 * 60_000) }));
    let out = await admin().detail({ id: "sp-1" });
    expect(out.row).toMatchObject({ guestActive: true, refundFailed: false });
    expect(out.gates.pause).toMatchObject({ allowed: false });
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelled_unpaid", refundStatus: "failed", refundId: "re_1" }));
    out = await admin().detail({ id: "sp-1" });
    expect(out.row).toMatchObject({ guestActive: false, refundFailed: true });
    expect(out.gates.markRefundResolved).toMatchObject({ allowed: true });
  });
});

describe("resendLink: o CS sabe se o email saiu (C20)", () => {
  it("envio não aceite → ok false, 'Não foi possível', registado not_sent", async () => {
    m.resendBalanceLink.mockResolvedValue({ ok: true, sent: false });
    const out = await admin().resendLink({ id: "sp-1" });
    expect(out).toMatchObject({ ok: false, outcome: "not_sent" });
    expect(out.message).toMatch(/Não foi possível enviar/);
    expect(m.setAdminActionResult.mock.calls[0][1].result).toEqual({ outcome: "not_sent" });
  });

  it("sem 'sent' (erro engolido pelo motor) ou o motor lança → not_sent", async () => {
    m.resendBalanceLink.mockResolvedValue({ ok: true });
    expect(await admin().resendLink({ id: "sp-1" })).toMatchObject({ ok: false, outcome: "not_sent" });
    m.resendBalanceLink.mockRejectedValue(new Error(`boom ${SECRET_PM}`));
    const out = await admin().resendLink({ id: "sp-1" });
    expect(out).toMatchObject({ ok: false, outcome: "not_sent" });
    const result = m.setAdminActionResult.mock.calls[1][1].result;
    expect(result.outcome).toBe("not_sent");
    expect(JSON.stringify(result)).not.toContain(SECRET_PM);
  });

  it("aceite → 'Enviado'", async () => {
    const out = await admin().resendLink({ id: "sp-1" });
    expect(out).toMatchObject({ ok: true, outcome: "sent" });
    expect(out.message).toMatch(/^Enviado para guest@example\.com/);
  });
});

/* ════════════════════════════════════════════════════════════════
   Registo antes de agir
   ════════════════════════════════════════════════════════════════ */

describe("registo em checkout_admin_actions", () => {
  it("resendLink: grava quem, o quê e a linha ANTES de pedir o envio; o resultado depois", async () => {
    const out = await admin().resendLink({ id: "sp-1" });
    expect(out.ok).toBe(true);
    expect(m.insertAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      scheduledPaymentId: "sp-1", userId: 1, userEmail: "booking@portugalactive.com", action: "resend_link",
    }));
    const inserted = m.insertAdminAction.mock.calls[0][0];
    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(inserted.createdAt).toBeInstanceOf(Date);
    expect(inserted.details).toMatchObject({ before: { status: "scheduled" }, actorName: "Booking PA" });
    // O CS passa por cima do travão de 10 minutos do hóspede.
    expect(m.resendBalanceLink).toHaveBeenCalledWith(INTENT, expect.any(Date), { force: true });
    expect(m.insertAdminAction.mock.invocationCallOrder[0]).toBeLessThan(m.resendBalanceLink.mock.invocationCallOrder[0]);
    expect(m.setAdminActionResult).toHaveBeenCalledWith(inserted.id, expect.objectContaining({ result: { outcome: "sent" } }));
  });

  const DESTRUCTIVE: Array<[string, () => void, (c: ReturnType<typeof admin>) => Promise<unknown>, () => any[]]> = [
    ["resendLink", () => {}, (c) => c.resendLink({ id: "sp-1" }), () => [m.resendBalanceLink]],
    ["chargeNow", () => vi.setSystemTime(AFTER_C), (c) => c.chargeNow({ id: "sp-1", confirm: "COBRAR" }), () => [m.chargeScheduledPayment]],
    ["markPaidExternally", () => {}, (c) => c.markPaidExternally({ id: "sp-1", ref: "TRF-1", amountCents: 120_000, paidOn: "2027-06-19", confirm: "PAGO" }), () => [m.markPaidExternally, m.cancelOpenPaymentIntent]],
    ["pause", () => {}, (c) => c.pause({ id: "sp-1", until: "2027-06-25" }), () => [m.adminPause]],
    ["cancelAndRefund", () => {}, (c) => c.cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" }), () => [m.claimScheduledPaymentForCancel, m.runCancellation]],
    ["markRefundResolved", () => m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelled_unpaid", refundStatus: "failed", refundId: "re_1", refundCents: 126_200 })),
      (c) => c.markRefundResolved({ id: "sp-1", ref: "transferência 12/11", confirm: "RESOLVIDO" }), () => [m.markRefundManual]],
  ];

  it.each(DESTRUCTIVE)("%s: sem registo gravado a ação não se faz", async (_name, setup, call, effects) => {
    setup();
    m.insertAdminAction.mockRejectedValue(new Error("Table 'pa.checkout_admin_actions' doesn't exist"));
    const err: any = await call(admin()).catch((e) => e);
    expect(err?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(err?.message).toMatch(/nada foi feito/);
    for (const fn of effects()) expect(fn).not.toHaveBeenCalled();
  });

  it("uma ação recusada pelas regras não chega a ser registada nem feita", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelled_unpaid" }));
    expect(await codeOf(admin().resendLink({ id: "sp-1" }))).toBe("PRECONDITION_FAILED");
    expectNothingDone();
  });
});

/* ════════════════════════════════════════════════════════════════
   Cobrar agora
   ════════════════════════════════════════════════════════════════ */

describe("chargeNow", () => {
  it("sem a palavra de confirmação exata não faz nada", async () => {
    vi.setSystemTime(AFTER_C);
    expect(await codeOf(admin().chargeNow({ id: "sp-1" } as any))).toBe("BAD_REQUEST");
    expect(await codeOf(admin().chargeNow({ id: "sp-1", confirm: "cobrar" } as any))).toBe("BAD_REQUEST");
    expect(await codeOf(admin().chargeNow({ id: "sp-1", confirm: "SIM" } as any))).toBe("BAD_REQUEST");
    expectNothingDone();
  });

  it("com as cobranças desligadas (CHECKOUT_BALANCE) recusa sem registar", async () => {
    vi.setSystemTime(AFTER_C);
    m.canRunBalanceEngine.mockReturnValue(false);
    const err: any = await admin().chargeNow({ id: "sp-1", confirm: "COBRAR" }).catch((e) => e);
    expect(err.code).toBe("PRECONDITION_FAILED");
    expect(err.message).toMatch(/CHECKOUT_BALANCE/);
    expectNothingDone();
  });

  it("antes da data autorizada (C) só com pedido do hóspede; com ele cobra pelo motor, source admin", async () => {
    expect(await codeOf(admin().chargeNow({ id: "sp-1", confirm: "COBRAR" }))).toBe("PRECONDITION_FAILED");
    expectNothingDone();

    m.chargeScheduledPayment.mockResolvedValue("succeeded");
    m.getScheduledPaymentById
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ status: "succeeded", succeededAt: BEFORE_C, balancePaymentIntentId: "pi_bal" }))
      .mockResolvedValue(row({ status: "succeeded", succeededAt: BEFORE_C, balancePaymentIntentId: "pi_bal" }));
    const out = await admin().chargeNow({ id: "sp-1", confirm: "COBRAR", guestRequested: true });
    expect(out).toMatchObject({ ok: true, outcome: "succeeded", status: "succeeded" });
    expect(m.chargeScheduledPayment).toHaveBeenCalledWith(expect.objectContaining({ id: "sp-1", status: "scheduled" }), "admin", BEFORE_C);
    expect(m.insertAdminAction.mock.calls[0][0]).toMatchObject({
      action: "charge_now",
      details: { input: { amountCents: 120_000, guestRequested: true } },
    });
    expect(m.insertAdminAction.mock.invocationCallOrder[0]).toBeLessThan(m.chargeScheduledPayment.mock.invocationCallOrder[0]);
    // Os efeitos (Guesty, nota, E4) correm já, sobre a linha paga relida.
    expect(m.runPostChargeEffects).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }), BEFORE_C);
    expect(m.setAdminActionResult.mock.calls[0][1]).toMatchObject({ result: { outcome: "succeeded", statusAfter: "succeeded" } });
  });

  it("depois de C, numa nova tentativa (recusa soft), cobra sem pedido do hóspede", async () => {
    vi.setSystemTime(AFTER_C);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "retry", attempts: 1, lastDeclineCode: "insufficient_funds" }));
    m.chargeScheduledPayment.mockResolvedValue("needs_action");
    const out = await admin().chargeNow({ id: "sp-1", confirm: "COBRAR" });
    expect(out).toMatchObject({ ok: false, outcome: "needs_action" });
    expect(out.message).toMatch(/Nada foi cobrado/);
    expect(m.chargeScheduledPayment).toHaveBeenCalledWith(expect.objectContaining({ status: "retry" }), "admin", AFTER_C);
    expect(m.runPostChargeEffects).not.toHaveBeenCalled();
  });

  it("recusa temporária numa nova tentativa: a mensagem diz que as retentativas se mantêm (C16)", async () => {
    vi.setSystemTime(AFTER_C);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "retry", attempts: 1, lastDeclineCode: "insufficient_funds" }));
    m.chargeScheduledPayment.mockResolvedValue("retry");
    const out = await admin().chargeNow({ id: "sp-1", confirm: "COBRAR" });
    expect(out).toMatchObject({ ok: false, outcome: "retry" });
    expect(out.message).toMatch(/novas tentativas automáticas mantêm-se/);
  });

  it("recusa hard ou 3DS: repetir o cartão só a pedido do hóspede", async () => {
    vi.setSystemTime(AFTER_C);
    for (const code of ["expired_card", "authentication_required"]) {
      m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_action", attempts: 1, lastDeclineCode: code }));
      expect(await codeOf(admin().chargeNow({ id: "sp-1", confirm: "COBRAR" }))).toBe("PRECONDITION_FAILED");
    }
    expect(m.chargeScheduledPayment).not.toHaveBeenCalled();
  });

  it("nunca em revisão, a cobrar, paga, nem depois de H", async () => {
    for (const [status, at] of [["needs_review", AFTER_C], ["charging", AFTER_C], ["succeeded", AFTER_C], ["scheduled", AFTER_H]] as const) {
      vi.setSystemTime(at);
      m.getScheduledPaymentById.mockResolvedValue(row({ status }));
      expect(await codeOf(admin().chargeNow({ id: "sp-1", confirm: "COBRAR", guestRequested: true })), status).toBe("PRECONDITION_FAILED");
    }
    expectNothingDone();
  });

  it("o estado que o CS viu mudou entretanto → CONFLICT, nada feito", async () => {
    vi.setSystemTime(AFTER_C);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "retry", attempts: 1 }));
    expect(await codeOf(admin().chargeNow({ id: "sp-1", confirm: "COBRAR", expectedStatus: "scheduled" }))).toBe("CONFLICT");
    expectNothingDone();
  });

  it("erro técnico do motor: registado, e o CS é avisado para não repetir", async () => {
    vi.setSystemTime(AFTER_C);
    m.chargeScheduledPayment.mockRejectedValue(new Error(`Stripe 500 for ${SECRET_PM}`));
    const err: any = await admin().chargeNow({ id: "sp-1", confirm: "COBRAR" }).catch((e) => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
    expect(err.message).toMatch(/Não repetir/);
    const result = m.setAdminActionResult.mock.calls[0][1].result;
    expect(result.outcome).toBe("error");
    expect(JSON.stringify(result)).not.toContain(SECRET_PM);
  });
});

/* ════════════════════════════════════════════════════════════════
   Marcar pago fora da plataforma
   ════════════════════════════════════════════════════════════════ */

describe("markPaidExternally", () => {
  const input = { id: "sp-1", ref: "TRF-123", amountCents: 120_000, paidOn: "2027-06-19", confirm: "PAGO" as const };

  it("exige a palavra PAGO", async () => {
    expect(await codeOf(admin().markPaidExternally({ ...input, confirm: "pago" } as any))).toBe("BAD_REQUEST");
    expectNothingDone();
  });

  it("fecha os PIs do saldo ainda abertos, marca com a referência e deixa nota no Guesty", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_action", balancePaymentIntentId: "pi_bal", guestPaymentIntentId: "pi_guest" }));
    m.cancelOpenPaymentIntent.mockResolvedValue("canceled");
    m.markPaidExternally.mockResolvedValue(true);
    const out = await admin().markPaidExternally(input);
    expect(out).toMatchObject({ ok: true, outcome: "marked" });
    expect(m.cancelOpenPaymentIntent.mock.calls.map((c) => c[0])).toEqual(["pi_bal", "pi_guest"]);
    expect(m.markPaidExternally).toHaveBeenCalledWith("sp-1", "admin 2027-06-19 1200.00 EUR TRF-123");
    expect(m.cancelOpenPaymentIntent.mock.invocationCallOrder[0]).toBeLessThan(m.markPaidExternally.mock.invocationCallOrder[0]);
    expect(m.insertAdminAction.mock.invocationCallOrder[0]).toBeLessThan(m.cancelOpenPaymentIntent.mock.invocationCallOrder[0]);
    expect(m.insertAdminAction.mock.calls[0][0]).toMatchObject({
      action: "mark_paid_externally",
      details: { input: { ref: "TRF-123", amountCents: 120_000, paidOn: "2027-06-19", shortfallCents: 0 } },
    });
    expect(m.appendReservationNote).toHaveBeenCalledWith("res-1", expect.stringContaining("PAGA FORA DA PLATAFORMA"));
    expect(m.markScheduledPaymentSucceeded).not.toHaveBeenCalled();
  });

  it("se um PI do saldo já tinha cobrado, a linha fica paga pela plataforma e NUNCA marcada pago fora", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_action", guestPaymentIntentId: "pi_guest" }));
    m.cancelOpenPaymentIntent.mockResolvedValue("succeeded");
    m.markScheduledPaymentSucceeded.mockResolvedValue(true);
    const out = await admin().markPaidExternally(input);
    expect(out).toMatchObject({ ok: false, outcome: "platform_paid" });
    expect(m.markScheduledPaymentSucceeded).toHaveBeenCalledWith("sp-1", "pi_guest", BEFORE_C);
    expect(m.markPaidExternally).not.toHaveBeenCalled();
    expect(m.appendReservationNote).not.toHaveBeenCalled();
  });

  it("PI já cobrado numa linha em revisão que não fica paga: nunca 'feito', aviso claro (C17)", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_review", guestPaymentIntentId: "pi_guest" }));
    m.cancelOpenPaymentIntent.mockResolvedValue("succeeded");
    m.markScheduledPaymentSucceeded.mockResolvedValue(false);
    const out = await admin().markPaidExternally(input);
    expect(out).toMatchObject({ ok: false, outcome: "platform_paid_unmarked", status: "needs_review" });
    expect(out.message).toMatch(/não ficou como paga/);
    expect(out.message).toMatch(/needs_review/);
    expect(m.markPaidExternally).not.toHaveBeenCalled();
    expect(m.runPostChargeEffects).not.toHaveBeenCalled();
    expect(m.setAdminActionResult.mock.calls[0][1].result).toMatchObject({ outcome: "platform_paid_unmarked", piId: "pi_guest" });
  });

  it("PI já cobrado e a linha já marcada paga por outro caminho (webhook): platform_paid", async () => {
    m.getScheduledPaymentById
      .mockResolvedValueOnce(row({ status: "needs_action", guestPaymentIntentId: "pi_guest" }))
      .mockResolvedValue(row({ status: "succeeded", succeededAt: BEFORE_C, guestPaymentIntentId: "pi_guest" }));
    m.cancelOpenPaymentIntent.mockResolvedValue("succeeded");
    m.markScheduledPaymentSucceeded.mockResolvedValue(false);
    const out = await admin().markPaidExternally(input);
    expect(out).toMatchObject({ ok: false, outcome: "platform_paid", status: "succeeded" });
  });

  it("um PI em processamento na Stripe impede a marca (o banco ainda está a decidir)", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "retry", balancePaymentIntentId: "pi_bal" }));
    m.cancelOpenPaymentIntent.mockRejectedValue(new Error("stripe-balance: PI pi_bal em processing, ainda não cancelável"));
    const out = await admin().markPaidExternally(input);
    expect(out).toMatchObject({ ok: false, outcome: "pi_open" });
    expect(m.markPaidExternally).not.toHaveBeenCalled();
  });

  it("valor abaixo do saldo (mais de 1 €) só com a diferença aceite; data no futuro recusada", async () => {
    expect(await codeOf(admin().markPaidExternally({ ...input, amountCents: 118_500 }))).toBe("PRECONDITION_FAILED");
    expect(await codeOf(admin().markPaidExternally({ ...input, paidOn: "2027-06-21" }))).toBe("BAD_REQUEST");
    expectNothingDone();
    m.markPaidExternally.mockResolvedValue(true);
    const out = await admin().markPaidExternally({ ...input, amountCents: 118_500, acceptShortfall: true });
    expect(out.outcome).toBe("marked");
    expect(m.insertAdminAction.mock.calls[0][0].details.input).toMatchObject({ shortfallCents: 1_500, acceptShortfall: true });
  });

  it("nunca numa linha já paga, paga fora ou cancelada", async () => {
    for (const status of ["succeeded", "paid_externally", "cancelled_by_guest", "cancelling", "charging"] as const) {
      m.getScheduledPaymentById.mockResolvedValue(row({ status }));
      expect(await codeOf(admin().markPaidExternally(input)), status).toBe("PRECONDITION_FAILED");
    }
    expectNothingDone();
  });
});

/* ════════════════════════════════════════════════════════════════
   Pausar e retomar
   ════════════════════════════════════════════════════════════════ */

describe("pause", () => {
  it("pausa até ao fim do dia (23:59 de Lisboa) e grava o motivo", async () => {
    m.adminPause.mockResolvedValue(true);
    const out = await admin().pause({ id: "sp-1", until: "2027-06-25", reason: "transferência prometida" });
    expect(out).toMatchObject({ ok: true, status: "needs_review" });
    // Junho: Lisboa em WEST (UTC+1).
    expect(m.adminPause).toHaveBeenCalledWith("sp-1", new Date("2027-06-25T22:59:00Z"), "CS: transferência prometida");
    expect(m.insertAdminAction.mock.calls[0][0]).toMatchObject({ action: "pause", details: { input: { until: "2027-06-25" } } });
  });

  it("nunca para lá do fim do cancelamento gratuito nem no passado", async () => {
    expect(await codeOf(admin().pause({ id: "sp-1", until: "2027-07-09" }))).toBe("PRECONDITION_FAILED");
    expect(await codeOf(admin().pause({ id: "sp-1", until: "2027-06-19" }))).toBe("BAD_REQUEST");
    expectNothingDone();
  });

  it("nunca com o hóspede a pagar na página (guest_active_at há menos de 1 h), mesmo que o claim seja do sweep", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({
      status: "retry", claimSource: "sweep", claimedAt: new Date(BEFORE_C.getTime() - 2 * 60_000),
      guestActiveAt: new Date(BEFORE_C.getTime() - 5 * 60_000),
    }));
    const err: any = await admin().pause({ id: "sp-1", until: "2027-06-25" }).catch((e) => e);
    expect(err.code).toBe("PRECONDITION_FAILED");
    expect(err.message).toMatch(/a pagar agora na página/);
    expectNothingDone();
  });

  it("a linha mudou entretanto (UPDATE condicional falhou) → CONFLICT, com o resultado registado", async () => {
    m.adminPause.mockResolvedValue(false);
    expect(await codeOf(admin().pause({ id: "sp-1", until: "2027-06-25" }))).toBe("CONFLICT");
    expect(m.setAdminActionResult.mock.calls[0][1].result).toEqual({ outcome: "not_changed" });
  });
});

describe("resume", () => {
  it("recusa hard: volta à espera do hóspede (nunca a cobrança automática do mesmo cartão)", async () => {
    vi.setSystemTime(AFTER_C);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_review", attempts: 1, lastDeclineCode: "stolen_card" }));
    m.adminResume.mockResolvedValue("needs_action");
    const out = await admin().resume({ id: "sp-1" });
    expect(m.adminResume).toHaveBeenCalledWith("sp-1", AFTER_C, { pastChargeStatus: "retry", holdForGuest: true });
    expect(out).toMatchObject({ ok: true, status: "needs_action" });
  });

  it("sem tentativas: volta a agendada; com recusa soft: nova tentativa", async () => {
    vi.setSystemTime(AFTER_C);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_review", attempts: 0 }));
    m.adminResume.mockResolvedValue("scheduled");
    await admin().resume({ id: "sp-1" });
    expect(m.adminResume).toHaveBeenLastCalledWith("sp-1", AFTER_C, { pastChargeStatus: "scheduled", holdForGuest: false });

    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_review", attempts: 2, lastDeclineCode: "insufficient_funds" }));
    m.adminResume.mockResolvedValue("retry");
    await admin().resume({ id: "sp-1" });
    expect(m.adminResume).toHaveBeenLastCalledWith("sp-1", AFTER_C, { pastChargeStatus: "retry", holdForGuest: false });
  });

  it("só em revisão e antes de H; um UPDATE sem efeito é CONFLICT", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "scheduled" }));
    expect(await codeOf(admin().resume({ id: "sp-1" }))).toBe("PRECONDITION_FAILED");
    vi.setSystemTime(AFTER_H);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_review" }));
    expect(await codeOf(admin().resume({ id: "sp-1" }))).toBe("PRECONDITION_FAILED");
    expect(m.adminResume).not.toHaveBeenCalled();
    vi.setSystemTime(AFTER_C);
    m.adminResume.mockResolvedValue(null);
    expect(await codeOf(admin().resume({ id: "sp-1" }))).toBe("CONFLICT");
  });
});

/* ════════════════════════════════════════════════════════════════
   Cancelar e devolver
   ════════════════════════════════════════════════════════════════ */

describe("cancelAndRefund", () => {
  it("exige a palavra CANCELAR", async () => {
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "full" } as any))).toBe("BAD_REQUEST");
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "cancelar" } as any))).toBe("BAD_REQUEST");
    expectNothingDone();
  });

  it("full: regista, reclama para cancelling com cancel:admin a partir do estado visto, e corre o motor (admin)", async () => {
    m.getScheduledPaymentById
      .mockResolvedValueOnce(row({ status: "needs_review" }))
      .mockResolvedValueOnce(row({ status: "cancelling", reviewReason: "cancel:admin" }))
      .mockResolvedValue(row({ status: "cancelled_unpaid", refundCents: 126_200, refundStatus: "succeeded", refundId: "re_1" }));
    m.claimScheduledPaymentForCancel.mockResolvedValue(true);
    m.runCancellation.mockResolvedValue("done");
    const out = await admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR", expectedStatus: "needs_review" });
    // "Devolver tudo" é a equipa a cancelar: nunca o E5 de "falta de pagamento".
    expect(m.claimScheduledPaymentForCancel).toHaveBeenCalledWith("sp-1", ["needs_review"], { reason: "cancel:admin" });
    expect(m.runCancellation).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelling" }), "admin", BEFORE_C);
    const order = [m.insertAdminAction, m.claimScheduledPaymentForCancel, m.runCancellation].map((f) => f.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(out).toMatchObject({ ok: true, outcome: "done", status: "cancelled_unpaid", refundCents: 126_200 });
    expect(out.message).toMatch(/1262\.00 EUR/);
    expect(m.setAdminActionResult.mock.calls[0][1].result).toMatchObject({ outcome: "done", refundCents: 126_200, refundStatus: "succeeded" });
  });

  it("policy: dentro do cancelamento gratuito, também numa linha já paga (cancel:guest, motor guest)", async () => {
    vi.setSystemTime(AFTER_C);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "succeeded", succeededAt: AFTER_C, balancePaymentIntentId: "pi_bal" }));
    m.claimScheduledPaymentForCancel.mockResolvedValue(true);
    m.runCancellation.mockResolvedValue("pending");
    const out = await admin().cancelAndRefund({ id: "sp-1", mode: "policy", confirm: "CANCELAR" });
    expect(m.claimScheduledPaymentForCancel).toHaveBeenCalledWith("sp-1", ["succeeded"], { reason: "cancel:guest" });
    expect(m.runCancellation).toHaveBeenCalledWith(expect.anything(), "guest", AFTER_C);
    expect(out).toMatchObject({ ok: false, outcome: "pending" });
  });

  it("full numa linha já paga é recusado (deixava a 2.ª parte por devolver); policy depois de D também", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "succeeded", succeededAt: BEFORE_C }));
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" }))).toBe("PRECONDITION_FAILED");
    vi.setSystemTime(AFTER_D);
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "needs_review" }));
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "policy", confirm: "CANCELAR" }))).toBe("PRECONDITION_FAILED");
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "paid_externally" }));
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" }))).toBe("PRECONDITION_FAILED");
    expectNothingDone();
  });

  it("nunca por cima de um hóspede que está a pagar na página (guest_active_at há menos de 1 h)", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({
      status: "needs_action", guestActiveAt: new Date(BEFORE_C.getTime() - 20 * 60_000), guestPaymentIntentId: "pi_guest",
    }));
    for (const mode of ["full", "policy"] as const) {
      const err: any = await admin().cancelAndRefund({ id: "sp-1", mode, confirm: "CANCELAR" }).catch((e) => e);
      expect(err.code).toBe("PRECONDITION_FAILED");
      expect(err.message).toMatch(/a pagar agora na página/);
    }
    expectNothingDone();
    // Passada a hora, já se pode decidir.
    m.getScheduledPaymentById.mockResolvedValue(row({
      status: "needs_action", guestActiveAt: new Date(BEFORE_C.getTime() - 61 * 60_000),
    }));
    m.claimScheduledPaymentForCancel.mockResolvedValue(true);
    m.runCancellation.mockResolvedValue("done");
    await expect(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" })).resolves.toMatchObject({ outcome: "done" });
  });

  it("o claim do sweep por cima não tira o escudo; um claim 'guest' sem guest_active_at não o dá (C17)", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({
      status: "retry", claimSource: "sweep", claimedAt: new Date(BEFORE_C.getTime() - 60_000),
      guestActiveAt: new Date(BEFORE_C.getTime() - 2 * 60_000), guestPaymentIntentId: "pi_guest",
    }));
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" }))).toBe("PRECONDITION_FAILED");
    expectNothingDone();

    m.getScheduledPaymentById.mockResolvedValue(row({
      status: "needs_action", claimSource: "guest", claimedAt: new Date(BEFORE_C.getTime() - 5 * 60_000), guestActiveAt: null,
    }));
    m.claimScheduledPaymentForCancel.mockResolvedValue(true);
    m.runCancellation.mockResolvedValue("done");
    await expect(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" })).resolves.toMatchObject({ outcome: "done" });
  });

  it("claim perdido (a linha mudou): CONFLICT e o motor não corre", async () => {
    m.claimScheduledPaymentForCancel.mockResolvedValue(false);
    expect(await codeOf(admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" }))).toBe("CONFLICT");
    expect(m.runCancellation).not.toHaveBeenCalled();
    expect(m.setAdminActionResult.mock.calls[0][1].result).toEqual({ outcome: "not_claimed" });
  });

  it("o motor rebenta a meio: a linha fica em cancelling e a resposta diz que está a meio", async () => {
    m.claimScheduledPaymentForCancel.mockResolvedValue(true);
    m.runCancellation.mockRejectedValue(new Error("Guesty 503"));
    const out = await admin().cancelAndRefund({ id: "sp-1", mode: "full", confirm: "CANCELAR" });
    expect(out).toMatchObject({ ok: false, outcome: "pending" });
    expect(out.message).toMatch(/Continuar cancelamento/);
  });
});

describe("continueCancellation e markCreditNote", () => {
  it("continua um cancelamento a meio com o tipo gravado no claim", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelling", reviewReason: "cancel:guest" }));
    m.runCancellation.mockResolvedValue("done");
    const out = await admin().continueCancellation({ id: "sp-1", confirm: "CANCELAR" });
    expect(m.runCancellation).toHaveBeenCalledWith(expect.objectContaining({ id: "sp-1" }), "guest", BEFORE_C);
    expect(out.outcome).toBe("done");
    expect(m.insertAdminAction.mock.calls[0][0].action).toBe("continue_cancellation");
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "scheduled" }));
    expect(await codeOf(admin().continueCancellation({ id: "sp-1", confirm: "CANCELAR" }))).toBe("PRECONDITION_FAILED");
  });

  it("nota de crédito só em linhas canceladas ou a cancelar", async () => {
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelled_unpaid", creditNoteRef: null }));
    m.markCreditNote.mockResolvedValue(true);
    const out = await admin().markCreditNote({ id: "sp-1", ref: "NC 2027/123" });
    expect(out.ok).toBe(true);
    expect(m.markCreditNote).toHaveBeenCalledWith("sp-1", "NC 2027/123");
    expect(m.insertAdminAction.mock.calls[0][0]).toMatchObject({ action: "mark_credit_note", details: { input: { ref: "NC 2027/123", previousRef: null } } });
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "scheduled" }));
    m.markCreditNote.mockClear();
    expect(await codeOf(admin().markCreditNote({ id: "sp-1", ref: "NC 2027/124" }))).toBe("PRECONDITION_FAILED");
    expect(m.markCreditNote).not.toHaveBeenCalled();
  });
});

describe("markRefundResolved (C26)", () => {
  const failedRow = () => row({ status: "cancelled_unpaid", refundStatus: "failed", refundId: "re_1", refundCents: 126_200 });
  const input = { id: "sp-1", ref: "transferência 12/11", confirm: "RESOLVIDO" as const };

  it("exige a palavra RESOLVIDO e uma referência", async () => {
    m.getScheduledPaymentById.mockResolvedValue(failedRow());
    expect(await codeOf(admin().markRefundResolved({ ...input, confirm: "resolvido" } as any))).toBe("BAD_REQUEST");
    expect(await codeOf(admin().markRefundResolved({ ...input, ref: " x " }))).toBe("BAD_REQUEST");
    expectNothingDone();
  });

  it("regista (com a referência e o reembolso falhado) ANTES de marcar manual", async () => {
    m.getScheduledPaymentById.mockResolvedValue(failedRow());
    m.markRefundManual.mockResolvedValue(true);
    const out = await admin().markRefundResolved(input);
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/resolvido à mão/);
    expect(m.markRefundManual).toHaveBeenCalledWith("sp-1");
    expect(m.insertAdminAction.mock.calls[0][0]).toMatchObject({
      action: "mark_refund_resolved",
      details: { input: { ref: "transferência 12/11", refundStatus: "failed", refundId: "re_1", refundCents: 126_200 } },
    });
    expect(m.insertAdminAction.mock.invocationCallOrder[0]).toBeLessThan(m.markRefundManual.mock.invocationCallOrder[0]);
    expect(m.setAdminActionResult.mock.calls[0][1].result).toEqual({ outcome: "marked" });
  });

  it("só com um reembolso falhado (qualquer estado da linha)", async () => {
    for (const refundStatus of [null, "succeeded", "pending", "nothing", "manual"]) {
      m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelled_unpaid", refundStatus }));
      expect(await codeOf(admin().markRefundResolved(input)), String(refundStatus)).toBe("PRECONDITION_FAILED");
    }
    expectNothingDone();
    m.getScheduledPaymentById.mockResolvedValue(row({ status: "cancelling", refundStatus: "canceled" }));
    m.markRefundManual.mockResolvedValue(true);
    await expect(admin().markRefundResolved(input)).resolves.toMatchObject({ ok: true });
  });

  it("o UPDATE não mudou nada → CONFLICT, com o resultado registado", async () => {
    m.getScheduledPaymentById.mockResolvedValue(failedRow());
    m.markRefundManual.mockResolvedValue(false);
    expect(await codeOf(admin().markRefundResolved(input))).toBe("CONFLICT");
    expect(m.setAdminActionResult.mock.calls[0][1].result).toEqual({ outcome: "not_changed" });
  });
});

describe("balanceAdminAvailability (regras partilhadas pela UI e pelas ações)", () => {
  it("o que se pode fazer muda com o estado e com as datas", () => {
    const sched = balanceAdminAvailability(row(), BEFORE_C, { chargesEnabled: true, declineKind: null });
    expect(sched.gates).toMatchObject({
      chargeNow: { allowed: true }, markPaidExternally: { allowed: true }, pause: { allowed: true },
      resume: { allowed: false }, cancelFull: { allowed: true }, cancelPolicy: { allowed: true },
      continueCancellation: { allowed: false }, markCreditNote: { allowed: false },
    });
    expect(sched.chargeNeedsGuestRequest).toMatch(/ainda não chegou/);

    const afterD = balanceAdminAvailability(row({ status: "needs_review" }), AFTER_D, { chargesEnabled: true, declineKind: null });
    expect(afterD.gates).toMatchObject({ resume: { allowed: false }, pause: { allowed: false }, cancelPolicy: { allowed: false }, cancelFull: { allowed: true } });
  });

  it("hóspede a agir na página: pausa e cancelamentos recusados; cobrar e marcar pago não", () => {
    const av = balanceAdminAvailability(row({ status: "needs_action" }), AFTER_C, { chargesEnabled: true, declineKind: "soft", guestActive: true });
    expect(av.gates).toMatchObject({
      pause: { allowed: false }, cancelFull: { allowed: false }, cancelPolicy: { allowed: false },
      markPaidExternally: { allowed: true }, chargeNow: { allowed: true },
    });
    expect(av.gates.pause.reason).toMatch(/a pagar agora/);
    const quiet = balanceAdminAvailability(row({ status: "needs_action" }), AFTER_C, { chargesEnabled: true, declineKind: "soft" });
    expect(quiet.gates).toMatchObject({ pause: { allowed: true }, cancelFull: { allowed: true } });
  });

  it("reembolso resolvido à mão só com refund_status de falha", () => {
    const gate = (refundStatus: string | null) =>
      balanceAdminAvailability(row({ status: "cancelled_by_guest", refundStatus }), AFTER_D, { chargesEnabled: true, declineKind: null }).gates.markRefundResolved.allowed;
    expect([null, "succeeded", "pending", "nothing", "manual"].map(gate)).toEqual([false, false, false, false, false]);
    expect(["failed", "canceled", "requires_action"].map(gate)).toEqual([true, true, true]);
  });
});

/* ════════════════════════════════════════════════════════════════
   Helpers de server/db.ts (Fase 2c), SQL verdadeiro do drizzle
   ════════════════════════════════════════════════════════════════ */

describe("helpers de BD da Fase 2c", () => {
  type Call = { sql: string; params: unknown[] };
  const calls = (): Call[] => m.query.mock.calls.map(([q, params]: any[]) => ({ sql: q.sql, params }));
  const ok = (affectedRows = 1) => [{ affectedRows, insertId: 0 }, undefined];
  const realDb = () => vi.importActual<typeof import("../db")>("../db");
  const NOW = new Date("2027-06-30T10:00:00Z");

  beforeEach(() => {
    vi.useRealTimers();
    vi.stubEnv("DATABASE_URL", "mysql://fake@localhost/pa");
    m.query.mockReset();
    m.preview.mockReturnValue(false);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("listScheduledPaymentsForAdmin: scope, filtro, os que esperam por alguém primeiro, limite", async () => {
    const D = await realDb();
    m.query.mockResolvedValue([[], []]);
    await D.listScheduledPaymentsForAdmin(SCOPE, { statuses: ["needs_review", "retry"], limit: 9999 });
    const [q] = calls();
    expect(q.sql).toContain(
      "where (`checkout_scheduled_payments`.`livemode` = ? and `checkout_scheduled_payments`.`site_origin` = ? " +
        "and `checkout_scheduled_payments`.`status` in (?, ?))",
    );
    expect(q.sql).toContain(
      "order by case when `checkout_scheduled_payments`.`status` in ('needs_review', 'needs_action') then 0 else 1 end, " +
        "`checkout_scheduled_payments`.`charge_at` asc limit ?",
    );
    expect(q.params).toEqual([true, SCOPE.siteOrigin, "needs_review", "retry", 500]);
    await expect(D.listScheduledPaymentsForAdmin(SCOPE, { statuses: ["paid"] })).rejects.toThrow(/desconhecido/);
    await expect(D.listScheduledPaymentsForAdmin({ livemode: "yes" as any, siteOrigin: "" })).rejects.toThrow(/BalanceScope/);
  });

  it("insertAdminAction: grava com o instante dado e lança sem BD ou com erro (sem registo não há ação)", async () => {
    const D = await realDb();
    m.query.mockResolvedValueOnce(ok(1));
    const at = new Date("2027-06-30T10:00:00Z");
    await D.insertAdminAction({
      id: "a-1", scheduledPaymentId: "sp-1", userId: 1, userEmail: "booking@portugalactive.com",
      action: "charge_now", details: { input: { amountCents: 120_000 } }, createdAt: at,
    });
    const [q] = calls();
    expect(q.sql).toMatch(/^insert into `checkout_admin_actions` \(`id`, `scheduled_payment_id`, `user_id`, `user_email`, `action`, `details`, `created_at`\)/);
    expect(q.params).toEqual(["a-1", "sp-1", 1, "booking@portugalactive.com", "charge_now", JSON.stringify({ input: { amountCents: 120_000 } }), "2027-06-30 10:00:00.000"]);

    m.query.mockRejectedValueOnce(new Error("Table 'pa.checkout_admin_actions' doesn't exist"));
    await expect(D.insertAdminAction({ id: "a-2", scheduledPaymentId: "sp-1", action: "pause" })).rejects.toThrow();
    await expect(D.insertAdminAction({ id: "a-3", scheduledPaymentId: "sp-1", action: "" })).rejects.toThrow(/Ação inválida/);
    m.preview.mockReturnValue(true);
    await expect(D.insertAdminAction({ id: "a-4", scheduledPaymentId: "sp-1", action: "pause" })).rejects.toThrow(/without database/);
  });

  it("setAdminActionResult nunca lança; listAdminActions lê por linha, o mais recente primeiro", async () => {
    const D = await realDb();
    m.query.mockRejectedValueOnce(new Error("boom"));
    await expect(D.setAdminActionResult("a-1", { result: { outcome: "done" } })).resolves.toBe(false);
    m.query.mockResolvedValueOnce([[], []]);
    await D.listAdminActions("sp-1");
    const q = calls()[1];
    expect(q.sql).toMatch(/where `checkout_admin_actions`.`scheduled_payment_id` = \? order by `checkout_admin_actions`.`created_at` desc limit \?$/);
    expect(q.params).toEqual(["sp-1", 200]);
  });

  it("adminResume: antes de C → scheduled em charge_at; depois de C → o estado pedido; H passado → null", async () => {
    const D = await realDb();
    m.query.mockResolvedValueOnce(ok(1));
    expect(await D.adminResume("sp-1", NOW)).toBe("scheduled");
    const [first] = calls();
    expect(first.sql).toBe(
      "update `checkout_scheduled_payments` set `next_attempt_at` = `checkout_scheduled_payments`.`charge_at`, `status` = ?, " +
        "`help_paused_until` = ?, `review_reason` = ?, `review_due_at` = ? where (`checkout_scheduled_payments`.`id` = ? and " +
        "`checkout_scheduled_payments`.`status` = ? and `checkout_scheduled_payments`.`charge_at` > ? and " +
        "`checkout_scheduled_payments`.`hard_stop_at` > ?)",
    );
    expect(first.params).toEqual(["scheduled", null, null, null, "sp-1", "needs_review", "2027-06-30 10:00:00.000", "2027-06-30 10:00:00.000"]);

    m.query.mockReset().mockResolvedValueOnce(ok(0)).mockResolvedValueOnce(ok(1));
    expect(await D.adminResume("sp-1", NOW, { pastChargeStatus: "retry" })).toBe("retry");
    const second = calls()[1];
    expect(second.sql).toContain("`checkout_scheduled_payments`.`charge_at` <= ? and `checkout_scheduled_payments`.`hard_stop_at` > ?");
    // O drizzle escreve o SET pela ordem do esquema: next_attempt_at, depois status.
    expect(second.sql).toMatch(/^update `checkout_scheduled_payments` set `next_attempt_at` = \?, `status` = \?/);
    expect(second.params.slice(0, 2)).toEqual(["2027-06-30 10:00:00.000", "retry"]);

    m.query.mockReset().mockResolvedValue(ok(0));
    expect(await D.adminResume("sp-1", NOW)).toBeNull();

    m.query.mockReset().mockResolvedValueOnce(ok(1));
    expect(await D.adminResume("sp-1", NOW, { holdForGuest: true })).toBe("needs_action");
    expect(calls()).toHaveLength(1);
    expect(calls()[0].params.slice(0, 2)).toEqual(["2027-06-30 10:00:00.000", "needs_action"]);
    expect(calls()[0].sql).toContain("`checkout_scheduled_payments`.`hard_stop_at` > ?");
    await expect(D.adminResume("sp-1", NOW, { pastChargeStatus: "succeeded" as any })).rejects.toThrow(/inválido/);
  });

  it("adminPause e markCreditNote: só a partir dos estados certos", async () => {
    const D = await realDb();
    m.query.mockResolvedValue(ok(1));
    expect(await D.adminPause("sp-1", new Date("2027-06-25T22:59:00Z"), "CS: transferência")).toBe(true);
    expect(calls()[0].sql).toContain("`checkout_scheduled_payments`.`status` in (?, ?, ?, ?)");
    expect(calls()[0].params).toEqual(expect.arrayContaining(["needs_review", "2027-06-25 22:59:00.000", "CS: transferência", "scheduled", "retry", "needs_action"]));
    expect(calls()[0].params).not.toContain("charging");

    expect(await D.markCreditNote("sp-1", "NC 2027/123")).toBe(true);
    expect(calls()[1].sql).toBe(
      "update `checkout_scheduled_payments` set `credit_note_ref` = ?, `credit_note_due` = ? where " +
        "(`checkout_scheduled_payments`.`id` = ? and `checkout_scheduled_payments`.`status` in (?, ?, ?))",
    );
    expect(calls()[1].params).toEqual(["NC 2027/123", false, "sp-1", "cancelling", "cancelled_unpaid", "cancelled_by_guest"]);
    await expect(D.markCreditNote("sp-1", "  ")).rejects.toThrow(/nota de crédito/);
  });

  it("countScheduledPaymentsForAdmin: todas as linhas do scope, por estado", async () => {
    const D = await realDb();
    m.query.mockResolvedValueOnce([[["needs_review", 2], ["scheduled", 5]], []]);
    const counts = await D.countScheduledPaymentsForAdmin(SCOPE);
    expect(counts).toMatchObject({ needs_review: 2, scheduled: 5, succeeded: 0 });
    expect(calls()[0].sql).toMatch(/group by `checkout_scheduled_payments`.`status`$/);
  });
});
