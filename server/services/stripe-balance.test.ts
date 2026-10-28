/**
 * Duas partes, Fase 2a: o que o motor da 2.ª parte pede à Stripe
 * (docs/pagamento_duas_partes.md 2.4, 5.1, 5.9). O SDK está mockado, mas os
 * erros são as classes verdadeiras do SDK instalado (StripeCardError põe
 * decline_code="" quando o emissor não dá código, por exemplo), para os
 * testes verem o mesmo objeto que produção vê.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  create: vi.fn(),
  confirm: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  refundsCreate: vi.fn(),
  refundsList: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    paymentIntents: { create: h.create, confirm: h.confirm, retrieve: h.retrieve, cancel: h.cancel, list: h.list },
    refunds: { create: h.refundsCreate, list: h.refundsList },
  })),
}));

import {
  classifyDecline,
  createBalancePaymentIntent,
  confirmBalanceOffSession,
  retrieveBalancePaymentIntent,
  listBalancePaymentIntentsForLine,
  cancelOpenPaymentIntent,
  refundRemaining,
  isAmbiguousStripeError,
} from "./stripe-balance";

type RealStripe = typeof import("stripe").default;
let errors: RealStripe["errors"];

const SP = "6f1c2d3e-0000-4000-8000-000000000001";
const INTENT = "12345678-1234-4234-8234-123456789abc";

beforeEach(async () => {
  for (const fn of Object.values(h)) fn.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";
  const actual = await vi.importActual<{ default: RealStripe }>("stripe");
  errors = actual.default.errors;
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

function cardError(raw: { code?: string; decline_code?: string; message?: string; payment_intent?: any }) {
  return new errors.StripeCardError({ statusCode: 402, type: "card_error", message: "Your card was declined.", ...raw } as any);
}

function balancePi(over: Record<string, any> = {}) {
  return {
    id: "pi_balance_1",
    object: "payment_intent",
    status: "requires_payment_method",
    amount: 250000,
    amount_received: 0,
    metadata: { flow: "card_v2_balance", part: "balance", intentId: INTENT, scheduledPaymentId: SP },
    ...over,
  };
}

const createParams = (over: Record<string, any> = {}) => ({
  scheduledPaymentId: SP,
  attempt: 2,
  source: "sweep" as const,
  amountCents: 250000,
  customer: "cus_platform_1",
  paymentMethod: "pm_card_1",
  description: "Estadia Villa Aura 2027-07-15: 2.a parte",
  metadata: { intentId: INTENT, reservationId: "res_1", confirmationCode: "GY-ABC" },
  ...over,
});

/* ════════════════════════════════════════════════════════════════ */

describe("classifyDecline (spec 2.4)", () => {
  it.each([
    "insufficient_funds",
    "try_again_later",
    "generic_decline",
    "do_not_honor",
    "processing_error",
    "card_velocity_exceeded",
  ])("%s é soft (nova tentativa automática)", (code) => {
    expect(classifyDecline(code, "card_declined")).toBe("soft");
  });

  it("códigos desconhecidos ou ausentes são soft", () => {
    expect(classifyDecline("some_new_code_2027", null)).toBe("soft");
    expect(classifyDecline(null, null)).toBe("soft");
    expect(classifyDecline(undefined, undefined)).toBe("soft");
    expect(classifyDecline("", "")).toBe("soft");
    expect(classifyDecline(null, "card_declined")).toBe("soft");
  });

  it("authentication_required é auth, venha como decline_code ou como code", () => {
    expect(classifyDecline("authentication_required", null)).toBe("auth");
    expect(classifyDecline(null, "authentication_required")).toBe("auth");
    expect(classifyDecline("authentication_required", "authentication_required")).toBe("auth");
  });

  it.each([
    "expired_card",
    "lost_card",
    "stolen_card",
    "pickup_card",
    "fraudulent",
    "card_not_supported",
    "incorrect_number",
    "invalid_account",
    "restricted_card",
    "currency_not_supported",
  ])("%s é hard (outro cartão), como decline_code ou como code", (code) => {
    expect(classifyDecline(code, "card_declined")).toBe("hard");
    expect(classifyDecline(null, code)).toBe("hard");
  });

  it.each(["do_not_try_again", "revocation_of_all_authorizations", "revocation_of_authorization", "stop_payment_order"])(
    "%s (as redes proíbem repetir) é hard",
    (code) => {
      expect(classifyDecline(code, "card_declined")).toBe("hard");
    },
  );

  it("hard ganha a auth e a soft: repetir uma recusa definitiva é o erro caro", () => {
    expect(classifyDecline("authentication_required", "expired_card")).toBe("hard");
    expect(classifyDecline("insufficient_funds", "expired_card")).toBe("hard");
    expect(classifyDecline("generic_decline", "authentication_required")).toBe("auth");
  });

  it("ignora maiúsculas e espaços", () => {
    expect(classifyDecline("  Expired_Card ", null)).toBe("hard");
    expect(classifyDecline(null, "AUTHENTICATION_REQUIRED")).toBe("auth");
  });

  it("aceita o próprio kind gravado na linha quando a Stripe não deu código", () => {
    expect(classifyDecline("hard", null)).toBe("hard");
    expect(classifyDecline("auth", null)).toBe("auth");
    expect(classifyDecline("soft", null)).toBe("soft");
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("createBalancePaymentIntent (spec 5.1, passo 1)", () => {
  it("cria sem confirmar, com o corpo e a idempotency key do contrato", async () => {
    h.create.mockResolvedValueOnce(balancePi());
    const pi = await createBalancePaymentIntent(createParams());
    expect(pi.id).toBe("pi_balance_1");
    expect(h.create).toHaveBeenCalledTimes(1);
    const [body, opts] = h.create.mock.calls[0];
    expect(body).toEqual({
      amount: 250000,
      currency: "eur",
      customer: "cus_platform_1",
      payment_method: "pm_card_1",
      confirm: false,
      payment_method_types: ["card"],
      statement_descriptor_suffix: "PART 2/2",
      description: "Estadia Villa Aura 2027-07-15: 2.a parte",
      metadata: {
        intentId: INTENT,
        reservationId: "res_1",
        confirmationCode: "GY-ABC",
        flow: "card_v2_balance",
        part: "balance",
        scheduledPaymentId: SP,
        attempt: "2",
        source: "sweep",
      },
    });
    expect(opts).toEqual({ idempotencyKey: `checkout-balance-${SP}-a2-sweep-create` });
    // O mandato já existe desde a 1.ª parte: nada de novo setup nem off_session no create.
    expect(body).not.toHaveProperty("setup_future_usage");
    expect(body).not.toHaveProperty("off_session");
  });

  it("flow/part/scheduledPaymentId do chamador nunca substituem os do saldo", async () => {
    h.create.mockResolvedValueOnce(balancePi());
    await createBalancePaymentIntent(
      createParams({ metadata: { intentId: INTENT, flow: "card_v2", part: "deposit", scheduledPaymentId: "other" } }),
    );
    const [body] = h.create.mock.calls[0];
    expect(body.metadata.flow).toBe("card_v2_balance");
    expect(body.metadata.part).toBe("balance");
    expect(body.metadata.scheduledPaymentId).toBe(SP);
  });

  it("hóspede sem cartão escolhido: sem payment_method e key própria da origem", async () => {
    h.create.mockResolvedValueOnce(balancePi());
    await createBalancePaymentIntent(createParams({ source: "guest", attempt: 1, paymentMethod: undefined }));
    const [body, opts] = h.create.mock.calls[0];
    expect(body).not.toHaveProperty("payment_method");
    expect(body.metadata.source).toBe("guest");
    expect(opts).toEqual({ idempotencyKey: `checkout-balance-${SP}-a1-guest-create` });
  });

  it.each([
    ["valor zero", { amountCents: 0 }],
    ["valor negativo", { amountCents: -100 }],
    ["valor fracionário", { amountCents: 2500.5 }],
    ["valor NaN", { amountCents: Number.NaN }],
    ["sem Customer", { customer: "" }],
    ["Customer que não é cus_", { customer: "pm_card_1" }],
    ["sweep sem cartão", { paymentMethod: undefined }],
    ["admin sem cartão", { source: "admin", paymentMethod: undefined }],
    ["sem intentId na metadata", { metadata: { reservationId: "res_1" } }],
    ["tentativa 0", { attempt: 0 }],
    ["origem desconhecida", { source: "webhook" }],
    ["sem descrição", { description: " " }],
    ["sem linha", { scheduledPaymentId: "" }],
  ])("recusa %s antes de falar com a Stripe", async (_label, over) => {
    await expect(createBalancePaymentIntent(createParams(over as any))).rejects.toThrow(/stripe-balance/);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("sem STRIPE_SECRET_KEY lança e não cria nada", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(createBalancePaymentIntent(createParams())).rejects.toThrow(/STRIPE_SECRET_KEY/);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("um erro da Stripe sobe tal e qual (o chamador solta o claim)", async () => {
    h.create.mockRejectedValueOnce(new errors.StripeInvalidRequestError({ statusCode: 400, message: "No such customer" } as any));
    await expect(createBalancePaymentIntent(createParams())).rejects.toThrow(/No such customer/);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("confirmBalanceOffSession (spec 5.1, passo 3)", () => {
  const ctx = { scheduledPaymentId: SP, attempt: 2, source: "sweep" };

  it("confirma off-session com a key da tentativa", async () => {
    h.confirm.mockResolvedValueOnce(balancePi({ status: "succeeded", amount_received: 250000 }));
    const r = await confirmBalanceOffSession("pi_balance_1", ctx);
    expect(r.outcome).toBe("succeeded");
    expect(h.confirm).toHaveBeenCalledWith(
      "pi_balance_1",
      { off_session: true },
      { idempotencyKey: `checkout-balance-${SP}-a2-sweep-confirm` },
    );
  });

  it.each(["processing", "requires_action"] as const)("%s → outcome %s com o PI", async (status) => {
    h.confirm.mockResolvedValueOnce(balancePi({ status }));
    const r = await confirmBalanceOffSession("pi_balance_1", ctx);
    expect(r.outcome).toBe(status);
    expect((r as any).pi.status).toBe(status);
  });

  it("402 insufficient_funds → declined soft, com o PI do erro", async () => {
    const pi = balancePi({ status: "requires_payment_method" });
    h.confirm.mockRejectedValueOnce(
      cardError({ code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds.", payment_intent: pi }),
    );
    const r = await confirmBalanceOffSession("pi_balance_1", ctx);
    expect(r).toEqual({
      outcome: "declined",
      kind: "soft",
      declineCode: "insufficient_funds",
      message: "Your card has insufficient funds.",
      pi,
    });
  });

  it("402 authentication_required → declined auth", async () => {
    h.confirm.mockRejectedValueOnce(cardError({ code: "authentication_required", decline_code: "authentication_required" }));
    const r = await confirmBalanceOffSession("pi_balance_1", ctx);
    expect(r).toMatchObject({ outcome: "declined", kind: "auth", declineCode: "authentication_required" });
  });

  it("402 expired_card sem decline_code (o SDK põe \"\") → hard, código do erro", async () => {
    const err = cardError({ code: "expired_card", message: "Your card has expired." });
    expect(err.decline_code).toBe("");
    h.confirm.mockRejectedValueOnce(err);
    const r = await confirmBalanceOffSession("pi_balance_1", ctx);
    expect(r).toMatchObject({ outcome: "declined", kind: "hard", declineCode: "expired_card" });
    expect(r).not.toHaveProperty("pi");
  });

  it("402 lost_card → hard (a mensagem ao hóspede é genérica, decide o email)", async () => {
    h.confirm.mockRejectedValueOnce(cardError({ code: "card_declined", decline_code: "lost_card" }));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "declined", kind: "hard", declineCode: "lost_card" });
  });

  it("erro de ligação → error ambíguo (pode ter cobrado)", async () => {
    h.confirm.mockRejectedValueOnce(new errors.StripeConnectionError({ message: "socket hang up" } as any));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "error", ambiguous: true });
  });

  it("5xx → error ambíguo", async () => {
    h.confirm.mockRejectedValueOnce(new errors.StripeAPIError({ statusCode: 500, message: "boom" } as any));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "error", ambiguous: true, message: "boom" });
  });

  it("409 (pedido concorrente com a mesma key) → error ambíguo", async () => {
    h.confirm.mockRejectedValueOnce(new errors.StripeAPIError({ statusCode: 409, message: "in progress" } as any));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "error", ambiguous: true });
  });

  it("idempotency_error → error ambíguo (o original pode ter cobrado)", async () => {
    h.confirm.mockRejectedValueOnce(new errors.StripeIdempotencyError({ statusCode: 400, type: "idempotency_error", message: "key reused" } as any));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "error", ambiguous: true });
  });

  it("payment_intent_unexpected_state → error ambíguo (o PI mudou: relê-se)", async () => {
    h.confirm.mockRejectedValueOnce(
      new errors.StripeInvalidRequestError({ statusCode: 400, code: "payment_intent_unexpected_state", message: "already succeeded" } as any),
    );
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({
      outcome: "error",
      ambiguous: true,
      code: "payment_intent_unexpected_state",
    });
  });

  it("400 de pedido inválido → error definitivo", async () => {
    h.confirm.mockRejectedValueOnce(new errors.StripeInvalidRequestError({ statusCode: 400, code: "resource_missing", message: "No such payment_intent" } as any));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "error", ambiguous: false, code: "resource_missing" });
  });

  it("PI devolvido recusado (sem 402) → declined pela last_payment_error", async () => {
    h.confirm.mockResolvedValueOnce(
      balancePi({ status: "requires_payment_method", last_payment_error: { code: "card_declined", decline_code: "do_not_honor", message: "Declined" } }),
    );
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "declined", kind: "soft", declineCode: "do_not_honor" });
  });

  it.each(["canceled", "requires_confirmation", "requires_capture"])("estado inesperado %s → error ambíguo", async (status) => {
    h.confirm.mockResolvedValueOnce(balancePi({ status }));
    expect(await confirmBalanceOffSession("pi_balance_1", ctx)).toMatchObject({ outcome: "error", ambiguous: true });
  });

  it("nunca lança: argumentos inválidos → error definitivo sem chamar a Stripe", async () => {
    expect(await confirmBalanceOffSession("", ctx)).toMatchObject({ outcome: "error", ambiguous: false });
    expect(await confirmBalanceOffSession("pi_1", { ...ctx, attempt: 0 })).toMatchObject({ outcome: "error", ambiguous: false });
    delete process.env.STRIPE_SECRET_KEY;
    expect(await confirmBalanceOffSession("pi_1", ctx)).toMatchObject({ outcome: "error", ambiguous: false });
    expect(h.confirm).not.toHaveBeenCalled();
  });
});

describe("isAmbiguousStripeError", () => {
  it("só os 4xx de rejeição e o 402 são definitivos", () => {
    expect(isAmbiguousStripeError(new Error("TypeError fora da Stripe"))).toBe(true);
    expect(isAmbiguousStripeError({ statusCode: 502 })).toBe(true);
    expect(isAmbiguousStripeError({ statusCode: 409 })).toBe(true);
    expect(isAmbiguousStripeError({ statusCode: 400 })).toBe(false);
    expect(isAmbiguousStripeError({ statusCode: 401 })).toBe(false);
    expect(isAmbiguousStripeError({ statusCode: 402 })).toBe(false);
    expect(isAmbiguousStripeError({ statusCode: 403 })).toBe(false);
    expect(isAmbiguousStripeError({ statusCode: 404 })).toBe(false);
    expect(isAmbiguousStripeError({ statusCode: 429 })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("retrieveBalancePaymentIntent e rede secundária", () => {
  it("relê com o charge expandido", async () => {
    h.retrieve.mockResolvedValueOnce(balancePi());
    await retrieveBalancePaymentIntent("pi_balance_1");
    expect(h.retrieve).toHaveBeenCalledWith("pi_balance_1", { expand: ["latest_charge"] });
  });

  it("lista pelo Customer (nunca search) e filtra pela linha e pela parte", async () => {
    h.list.mockResolvedValueOnce({
      data: [
        balancePi({ id: "pi_a" }),
        balancePi({ id: "pi_other_line", metadata: { part: "balance", scheduledPaymentId: "other" } }),
        balancePi({ id: "pi_deposit", metadata: { part: "deposit", scheduledPaymentId: SP } }),
      ],
      has_more: false,
    });
    const found = await listBalancePaymentIntentsForLine("cus_platform_1", SP);
    expect(h.list).toHaveBeenCalledWith({ customer: "cus_platform_1", limit: 20 });
    expect(found.map((p) => p.id)).toEqual(["pi_a"]);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("cancelOpenPaymentIntent (spec 5.1, cancelar PIs abertos)", () => {
  it.each(["requires_payment_method", "requires_confirmation", "requires_action"])("%s → cancela", async (status) => {
    h.retrieve.mockResolvedValueOnce(balancePi({ status }));
    h.cancel.mockResolvedValueOnce(balancePi({ status: "canceled" }));
    expect(await cancelOpenPaymentIntent("pi_balance_1")).toBe("canceled");
    expect(h.cancel).toHaveBeenCalledWith("pi_balance_1");
  });

  it("succeeded → \"succeeded\" e não cancela nada", async () => {
    h.retrieve.mockResolvedValueOnce(balancePi({ status: "succeeded" }));
    expect(await cancelOpenPaymentIntent("pi_balance_1")).toBe("succeeded");
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("canceled → \"already-final\"", async () => {
    h.retrieve.mockResolvedValueOnce(balancePi({ status: "canceled" }));
    expect(await cancelOpenPaymentIntent("pi_balance_1")).toBe("already-final");
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it.each(["processing", "requires_capture"])("%s → lança: o banco ainda pode aprovar", async (status) => {
    h.retrieve.mockResolvedValueOnce(balancePi({ status }));
    await expect(cancelOpenPaymentIntent("pi_balance_1")).rejects.toThrow(/não cancelável/);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("recusa cancelar um PI que não é da 2.ª parte", async () => {
    h.retrieve.mockResolvedValueOnce(balancePi({ status: "requires_payment_method", metadata: { flow: "card_v2", part: "deposit", intentId: INTENT } }));
    await expect(cancelOpenPaymentIntent("pi_deposit")).rejects.toThrow(/não é um PI da 2.ª parte/);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("corrida com o hóspede: o cancel falha porque o PI acabou de ser pago → \"succeeded\"", async () => {
    h.retrieve
      .mockResolvedValueOnce(balancePi({ status: "requires_payment_method" }))
      .mockResolvedValueOnce(balancePi({ status: "succeeded" }));
    h.cancel.mockRejectedValueOnce(
      new errors.StripeInvalidRequestError({ statusCode: 400, code: "payment_intent_unexpected_state", message: "cannot cancel" } as any),
    );
    expect(await cancelOpenPaymentIntent("pi_balance_1")).toBe("succeeded");
  });

  it("cancel falha e o PI continua aberto → o erro sobe (nunca \"already-final\" às cegas)", async () => {
    h.retrieve
      .mockResolvedValueOnce(balancePi({ status: "requires_payment_method" }))
      .mockResolvedValueOnce(balancePi({ status: "requires_payment_method" }));
    h.cancel.mockRejectedValueOnce(new errors.StripeConnectionError({ message: "socket hang up" } as any));
    await expect(cancelOpenPaymentIntent("pi_balance_1")).rejects.toThrow(/socket hang up/);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("refundRemaining (spec 5.1 \"Reembolso\" e 5.9)", () => {
  const depositPi = (over: Record<string, any> = {}) => ({
    id: "pi_deposit_1",
    status: "succeeded",
    amount: 260000,
    amount_received: 260000,
    metadata: { flow: "card_v2", part: "deposit", intentId: INTENT },
    latest_charge: { id: "ch_1", amount_captured: 260000, amount_refunded: 15000 },
    ...over,
  });
  const params = { paymentIntentId: "pi_deposit_1", intentId: INTENT, scheduledPaymentId: SP, reason: "two_parts_unpaid" };

  it("devolve amount_received − amount_refunded, com a key e a metadata do contrato", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi());
    h.refundsList.mockResolvedValueOnce({ data: [], has_more: false });
    h.refundsCreate.mockResolvedValueOnce({ id: "re_1", amount: 245000, status: "pending" });
    const r = await refundRemaining(params);
    expect(r).toEqual({ refundId: "re_1", refundCents: 245000, status: "pending" });
    expect(h.retrieve).toHaveBeenCalledWith("pi_deposit_1", { expand: ["latest_charge"] });
    expect(h.refundsList).toHaveBeenCalledWith({ payment_intent: "pi_deposit_1", limit: 100 });
    expect(h.refundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: "pi_deposit_1",
        amount: 245000,
        reason: "requested_by_customer",
        metadata: { flow: "checkout_v2_two_parts_cancel", intentId: INTENT, scheduledPaymentId: SP, cancelReason: "two_parts_unpaid" },
      },
      { idempotencyKey: `checkout-two-parts-cancel-${SP}-pi_deposit_1` },
    );
  });

  it("remanescente 0 (reembolsos por linha já devolveram tudo) → \"nothing\" sem refund", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ latest_charge: { id: "ch_1", amount_captured: 260000, amount_refunded: 260000 } }));
    h.refundsList.mockResolvedValueOnce({ data: [{ id: "re_line", amount: 260000, status: "succeeded", metadata: { flow: "checkout_v2_line_refund" } }], has_more: false });
    expect(await refundRemaining(params)).toEqual({ refundId: null, refundCents: 0, status: "nothing" });
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("retoma depois de um refund nosso cuja gravação na BD falhou: devolve esse refund, não \"nothing\"", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ latest_charge: { id: "ch_1", amount_captured: 260000, amount_refunded: 260000 } }));
    h.refundsList.mockResolvedValueOnce({
      data: [
        { id: "re_line", amount: 15000, status: "succeeded", metadata: { flow: "checkout_v2_line_refund" } },
        { id: "re_ours", amount: 245000, status: "succeeded", metadata: { flow: "checkout_v2_two_parts_cancel", scheduledPaymentId: SP } },
      ],
      has_more: false,
    });
    expect(await refundRemaining(params)).toEqual({ refundId: "re_ours", refundCents: 245000, status: "succeeded" });
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("um refund nosso falhado volta tal e qual: nunca se cria outro às cegas", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi());
    h.refundsList.mockResolvedValueOnce({
      data: [{ id: "re_ours", amount: 245000, status: "failed", metadata: { flow: "checkout_v2_two_parts_cancel", scheduledPaymentId: SP } }],
      has_more: false,
    });
    expect(await refundRemaining(params)).toEqual({ refundId: "re_ours", refundCents: 245000, status: "failed" });
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("procura o refund nosso em todas as páginas", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi());
    h.refundsList
      .mockResolvedValueOnce({ data: [{ id: "re_a", amount: 1, status: "succeeded", metadata: {} }], has_more: true })
      .mockResolvedValueOnce({
        data: [{ id: "re_ours", amount: 245000, status: "pending", metadata: { flow: "checkout_v2_two_parts_cancel", scheduledPaymentId: SP } }],
        has_more: false,
      });
    expect(await refundRemaining(params)).toMatchObject({ refundId: "re_ours" });
    expect(h.refundsList).toHaveBeenLastCalledWith({ payment_intent: "pi_deposit_1", limit: 100, starting_after: "re_a" });
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("um refund de OUTRA linha no mesmo PI não conta como nosso", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi());
    h.refundsList.mockResolvedValueOnce({
      data: [{ id: "re_x", amount: 15000, status: "succeeded", metadata: { flow: "checkout_v2_two_parts_cancel", scheduledPaymentId: "outra" } }],
      has_more: false,
    });
    h.refundsCreate.mockResolvedValueOnce({ id: "re_1", amount: 245000, status: "succeeded" });
    expect(await refundRemaining(params)).toMatchObject({ refundId: "re_1", refundCents: 245000 });
  });

  it("PI de outra reserva → lança e não reembolsa", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ metadata: { flow: "card_v2", intentId: "outro-intent" } }));
    await expect(refundRemaining(params)).rejects.toThrow(/pertence a outro-intent/);
    expect(h.refundsList).not.toHaveBeenCalled();
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("PI sem intentId na metadata → lança", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ metadata: {} }));
    await expect(refundRemaining(params)).rejects.toThrow(/pertence a/);
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("latest_charge não expandido → lança (remanescente desconhecido)", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ latest_charge: "ch_1" }));
    h.refundsList.mockResolvedValueOnce({ data: [], has_more: false });
    await expect(refundRemaining(params)).rejects.toThrow(/latest_charge/);
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("charge que não bate com o recebido → lança", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ latest_charge: { id: "ch_2", amount_captured: 100000, amount_refunded: 0 } }));
    h.refundsList.mockResolvedValueOnce({ data: [], has_more: false });
    await expect(refundRemaining(params)).rejects.toThrow(/capturou/);
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("PI ainda em processing → lança (decide-se na passagem seguinte)", async () => {
    h.retrieve.mockResolvedValueOnce(depositPi({ status: "processing", amount_received: 0, latest_charge: null }));
    await expect(refundRemaining(params)).rejects.toThrow(/processing/);
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("PI sem nada recebido (2.ª parte cancelada) → \"nothing\"", async () => {
    h.retrieve.mockResolvedValueOnce(
      depositPi({ id: "pi_balance_1", status: "canceled", amount_received: 0, latest_charge: null, metadata: { part: "balance", intentId: INTENT } }),
    );
    h.refundsList.mockResolvedValueOnce({ data: [], has_more: false });
    expect(await refundRemaining({ ...params, paymentIntentId: "pi_balance_1" })).toEqual({ refundId: null, refundCents: 0, status: "nothing" });
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("argumentos em falta → lança sem falar com a Stripe", async () => {
    await expect(refundRemaining({ ...params, intentId: "" })).rejects.toThrow(/intentId/);
    expect(h.retrieve).not.toHaveBeenCalled();
  });
});
