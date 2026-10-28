import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  record: vi.fn(),
  processed: vi.fn(async () => {}),
  failed: vi.fn(async () => {}),
  getIntent: vi.fn(),
  updateIntent: vi.fn(async () => true),
  settle: vi.fn(),
  alert: vi.fn(async () => {}),
  emails: vi.fn(async () => {}),
  balance: vi.fn(async () => "marked"),
  markRefundFailed: vi.fn(async (): Promise<"marked" | "unchanged" | "missing" | "conflict"> => "marked"),
  opsAlert: vi.fn(async () => true),
}));

vi.mock("stripe", () => ({ default: vi.fn(() => ({ webhooks: { constructEvent: h.constructEvent } })) }));
vi.mock("../db", () => ({
  recordStripeWebhookEvent: h.record,
  markStripeWebhookEventProcessed: h.processed,
  markStripeWebhookEventFailed: h.failed,
  getBookingIntent: h.getIntent,
  updateBookingIntent: h.updateIntent,
  markRefundFailed: h.markRefundFailed,
}));
vi.mock("../services/transactional-email", () => ({ sendOpsAlert: h.opsAlert }));
vi.mock("../services/checkout-card-charge", () => ({ settleCardCharge: h.settle, alertFailedSettle: h.alert }));
vi.mock("../routers/checkout", () => ({ fireCheckoutPaidEmails: h.emails }));
vi.mock("../services/checkout-balance", () => ({ handleBalancePaymentSucceeded: h.balance }));
vi.mock("../services/stripe-card-webhook-setup", () => ({ cardWebhookSecretFromSetup: () => null }));

import { registerStripeCardWebhookRoute } from "./stripe-card-webhook";

const intentId = "12345678-1234-4234-8234-123456789abc";
const succeeded = (metadata: Record<string, string>, id = "evt_synthetic_1") => ({
  id,
  type: "payment_intent.succeeded",
  livemode: false,
  data: { object: { id: "pi_synthetic_1", metadata } },
});
const cardEvent = (id?: string) => succeeded({ flow: "card_v2", intentId }, id);

// O handler é chamado diretamente (sem servidor HTTP): express.raw e a rede
// não interessam aqui, só o que acontece depois de a assinatura ser válida.
function routeHandler() {
  let handler: any;
  const app = {
    post: (path: string, ...handlers: any[]) => {
      expect(path).toBe("/api/webhooks/stripe-card");
      handler = handlers[handlers.length - 1];
    },
  };
  registerStripeCardWebhookRoute(app as any);
  return handler;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
  };
}

async function deliver(event: unknown) {
  h.constructEvent.mockReturnValueOnce(event);
  const res = fakeRes();
  await routeHandler()({ headers: { "stripe-signature": "t=1,v1=synthetic" }, body: Buffer.from("{}") }, res);
  return res;
}

/** Corre o setTimeout de 15 s do settle diferido e espera que o callback acabe. */
async function runDeferredSettle(until: () => void) {
  await vi.advanceTimersByTimeAsync(15_000);
  await vi.waitFor(until);
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(h).forEach((fn) => fn.mockClear());
  h.record.mockReset();
  h.getIntent.mockReset();
  h.settle.mockReset();
  h.constructEvent.mockReset();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_not_a_real_key");
  vi.stubEnv("STRIPE_CARD_WEBHOOK_SECRET", "whsec_synthetic_not_a_real_secret");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("stripe card webhook: dedup em stripe_webhook_events", () => {
  it("um evento já processado não volta a correr o settle", async () => {
    h.record.mockResolvedValueOnce({ fresh: false, processed: true });
    const res = await deliver(cardEvent());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.getIntent).not.toHaveBeenCalled();
    expect(h.processed).not.toHaveBeenCalled();
  });

  it("um evento novo é registado, responde já e só fica processado depois do settle", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    h.getIntent.mockResolvedValueOnce({ id: intentId, status: "pending" })
      .mockResolvedValueOnce({ id: intentId, status: "pending", email: "guest@example.invalid" });
    h.settle.mockResolvedValueOnce({ reservationId: "res_synthetic", confirmationCode: "SYN-1" });
    const res = await deliver(cardEvent());
    expect(h.record).toHaveBeenCalledWith({ eventId: "evt_synthetic_1", type: "payment_intent.succeeded", livemode: false });
    expect(res.body).toEqual({ received: true });
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.processed).not.toHaveBeenCalled();
    await runDeferredSettle(() => expect(h.processed).toHaveBeenCalledWith("evt_synthetic_1"));
    expect(h.settle).toHaveBeenCalledWith(intentId, "pi_synthetic_1");
    expect(h.updateIntent).toHaveBeenCalledWith(intentId, { status: "paid" });
    expect(h.emails).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid", reservationId: "res_synthetic", confirmationCode: "SYN-1" }),
      intentId,
    );
    expect(h.failed).not.toHaveBeenCalled();
  });

  it("um evento recebido mas por processar (reentrega) volta a correr o settle", async () => {
    h.record.mockResolvedValueOnce({ fresh: false, processed: false });
    h.getIntent.mockResolvedValue({ id: intentId, status: "pending" });
    h.settle.mockResolvedValueOnce({ reservationId: "res_synthetic", confirmationCode: "SYN-1" });
    expect((await deliver(cardEvent())).body).toEqual({ received: true });
    await runDeferredSettle(() => expect(h.processed).toHaveBeenCalledWith("evt_synthetic_1"));
    expect(h.settle).toHaveBeenCalledTimes(1);
  });

  it("intent já pago pelo cliente: marca processado sem settle", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    h.getIntent.mockResolvedValueOnce({ id: intentId, status: "paid" });
    await deliver(cardEvent());
    await runDeferredSettle(() => expect(h.processed).toHaveBeenCalledWith("evt_synthetic_1"));
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.updateIntent).not.toHaveBeenCalled();
  });

  it("settle falhado: marca failed com o erro e mantém o alerta", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    h.getIntent.mockResolvedValueOnce({ id: intentId, status: "pending" });
    h.settle.mockRejectedValueOnce(new Error("guesty reservation failed: 500"));
    await deliver(cardEvent());
    await runDeferredSettle(() => expect(h.alert).toHaveBeenCalled());
    expect(h.failed).toHaveBeenCalledWith("evt_synthetic_1", "guesty reservation failed: 500");
    expect(h.alert).toHaveBeenCalledWith(intentId, "pi_synthetic_1", "guesty reservation failed: 500", "webhook-card");
    expect(h.processed).not.toHaveBeenCalled();
  });

  it.each([
    ["devolve null", () => h.record.mockResolvedValueOnce(null)],
    ["lança", () => h.record.mockRejectedValueOnce(new Error("connect ECONNREFUSED"))],
  ])("BD em baixo (o registo %s) não impede o settle", async (_label, setup) => {
    setup();
    h.getIntent.mockResolvedValue({ id: intentId, status: "pending" });
    h.settle.mockResolvedValueOnce({ reservationId: "res_synthetic", confirmationCode: "SYN-1" });
    const res = await deliver(cardEvent());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    await runDeferredSettle(() => expect(h.settle).toHaveBeenCalledWith(intentId, "pi_synthetic_1"));
    await vi.waitFor(() => expect(h.processed).toHaveBeenCalled());
  });

  it("BD lenta: passados 3 s responde e segue como BD em baixo", async () => {
    h.record.mockReturnValueOnce(new Promise(() => {}));
    h.getIntent.mockResolvedValue({ id: intentId, status: "pending" });
    h.settle.mockResolvedValueOnce({ reservationId: "res_synthetic", confirmationCode: "SYN-1" });
    h.constructEvent.mockReturnValueOnce(cardEvent());
    const res = fakeRes();
    const pending = routeHandler()({ headers: { "stripe-signature": "t=1,v1=synthetic" }, body: Buffer.from("{}") }, res);
    await vi.waitFor(() => expect(h.record).toHaveBeenCalled());
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(3_000);
    await pending;
    expect(res.body).toEqual({ received: true });
    await runDeferredSettle(() => expect(h.settle).toHaveBeenCalledTimes(1));
  });
});

describe("stripe card webhook: eventos fora do settle da 1.ª parte", () => {
  it("tipos não tratados respondem 200 e ficam processados", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    const res = await deliver({ id: "evt_refund", type: "charge.refunded", livemode: true, data: { object: {} } });
    expect(res.body).toEqual({ received: true });
    expect(h.record).toHaveBeenCalledWith({ eventId: "evt_refund", type: "charge.refunded", livemode: true });
    await vi.waitFor(() => expect(h.processed).toHaveBeenCalledWith("evt_refund"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["saldo (Fase 2)", { flow: "card_v2_balance", part: "balance", intentId }],
    ["part=balance mesmo com flow card_v2", { flow: "card_v2", part: "balance", intentId }],
  ])("%s: vai ao motor da 2.ª parte, nunca ao settle da reserva", async (_label, metadata) => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    const res = await deliver(succeeded(metadata as Record<string, string>, "evt_balance"));
    expect(res.body).toEqual({ received: true });
    expect(h.balance).toHaveBeenCalledWith(expect.objectContaining({ id: "pi_synthetic_1" }));
    await vi.waitFor(() => expect(h.processed).toHaveBeenCalledWith("evt_balance"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.settle).not.toHaveBeenCalled();
  });

  it("saldo: se o motor falhar, responde 500 para a Stripe reentregar e não marca processado", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    h.balance.mockRejectedValueOnce(new Error("db down"));
    const res = await deliver(succeeded({ flow: "card_v2_balance", part: "balance", intentId }, "evt_balance_fail"));
    expect(res.statusCode).toBe(500);
    await vi.waitFor(() => expect(h.failed).toHaveBeenCalledWith("evt_balance_fail", "db down"));
    expect(h.processed).not.toHaveBeenCalledWith("evt_balance_fail");
  });

  const dispute = { id: "evt_dispute", type: "charge.dispute.created", livemode: true, data: { object: { id: "dp_1", amount: 50000, reason: "fraudulent", payment_intent: "pi_x" } } };
  const refundFailed = { id: "evt_rf", type: "refund.failed", livemode: true, data: { object: { id: "re_1", amount: 25000, failure_reason: "expired_or_canceled_card", payment_intent: "pi_dep", metadata: { scheduledPaymentId: "sp-1" } } } };

  it("disputa: o alerta sai antes da resposta e fica processada", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    const res = await deliver(dispute);
    // Sem esperas: quando a Stripe recebe o 200, o alerta já saiu.
    expect(h.opsAlert).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    await vi.waitFor(() => expect(h.processed).toHaveBeenCalledWith("evt_dispute"));
    expect(h.failed).not.toHaveBeenCalled();
  });

  it.each([
    ["devolve false", () => h.opsAlert.mockResolvedValueOnce(false)],
    ["lança", () => h.opsAlert.mockRejectedValueOnce(new Error("resend 429"))],
  ])("disputa: alerta que não sai (%s) → 500 e failed, para a Stripe reenviar", async (_label, setup) => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    setup();
    const res = await deliver(dispute);
    expect(res.statusCode).toBe(500);
    await vi.waitFor(() => expect(h.failed).toHaveBeenCalledWith("evt_dispute", expect.any(String)));
    expect(h.processed).not.toHaveBeenCalled();
  });

  it("reembolso falhado do cancelamento: marca a linha e alerta antes de responder", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    const res = await deliver(refundFailed);
    expect(h.markRefundFailed).toHaveBeenCalledWith("sp-1", { refundId: "re_1", refundCents: 25000 });
    expect(h.opsAlert).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    await vi.waitFor(() => expect(h.processed).toHaveBeenCalledWith("evt_rf"));
    expect(h.failed).not.toHaveBeenCalled();
  });

  it.each([
    ["alerta devolve false", () => h.opsAlert.mockResolvedValueOnce(false)],
    ["alerta lança", () => h.opsAlert.mockRejectedValueOnce(new Error("resend down"))],
  ])("reembolso falhado: %s → 500 e failed", async (_label, setup) => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    setup();
    const res = await deliver(refundFailed);
    expect(res.statusCode).toBe(500);
    await vi.waitFor(() => expect(h.failed).toHaveBeenCalledWith("evt_rf", expect.stringContaining("alerta")));
    expect(h.processed).not.toHaveBeenCalled();
  });

  it("reembolso falhado: markRefundFailed lança → o alerta sai na mesma (a dizer que a linha não ficou marcada), 500 e failed", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    h.markRefundFailed.mockRejectedValueOnce(new Error("db down"));
    const res = await deliver(refundFailed);
    expect(res.statusCode).toBe(500);
    expect(h.opsAlert).toHaveBeenCalledTimes(1);
    expect(String((h.opsAlert.mock.calls[0] as any[])[1].join(" "))).toContain("NÃO ficou marcada");
    await vi.waitFor(() => expect(h.failed).toHaveBeenCalledWith("evt_rf", expect.stringContaining("db down")));
    expect(h.processed).not.toHaveBeenCalled();
  });

  it("reembolso falhado: a linha mudou durante a escrita (conflict) → 500 e failed, para a Stripe reenviar", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    h.markRefundFailed.mockResolvedValueOnce("conflict");
    const res = await deliver(refundFailed);
    expect(res.statusCode).toBe(500);
    await vi.waitFor(() => expect(h.failed).toHaveBeenCalledWith("evt_rf", expect.stringContaining("mudou")));
  });

  it("reembolso falhado repetido (unchanged) ou de uma linha que não existe (missing) → 200", async () => {
    for (const r of ["unchanged", "missing"] as const) {
      h.record.mockResolvedValueOnce({ fresh: true, processed: false });
      h.markRefundFailed.mockResolvedValueOnce(r);
      const res = await deliver(refundFailed);
      expect(res.statusCode).toBe(200);
    }
    expect(h.failed).not.toHaveBeenCalled();
  });

  it("reembolso falhado de uma 2.ª parte duplicada (-dup): alerta sem tocar no reembolso da linha", async () => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    const res = await deliver({ id: "evt_rf_dup", type: "refund.failed", livemode: true, data: { object: { id: "re_2", amount: 500000, failure_reason: "declined", payment_intent: "pi_dup", metadata: { scheduledPaymentId: "sp-1-dup" } } } });
    expect(res.body).toEqual({ received: true });
    expect(h.opsAlert).toHaveBeenCalledTimes(1);
    expect(h.markRefundFailed).not.toHaveBeenCalled();
    expect(String((h.opsAlert.mock.calls[0] as any[])[1].join(" "))).toContain("cobrada duas vezes");
  });

  it.each([
    ["Klarna", { flow: "klarna_v2", intentId }],
    ["card_v2 sem intentId", { flow: "card_v2" }],
  ])("%s: marca processado e nunca agenda o settle", async (_label, metadata) => {
    h.record.mockResolvedValueOnce({ fresh: true, processed: false });
    const res = await deliver(succeeded(metadata as Record<string, string>, "evt_other"));
    expect(res.body).toEqual({ received: true });
    await vi.waitFor(() => expect(h.processed).toHaveBeenCalledWith("evt_other"));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.settle).not.toHaveBeenCalled();
  });

  it("assinatura inválida: 400 e nada é registado", async () => {
    h.constructEvent.mockImplementationOnce(() => { throw new Error("No signatures found matching the expected signature"); });
    const res = fakeRes();
    await routeHandler()({ headers: { "stripe-signature": "t=1,v1=forged" }, body: Buffer.from("{}") }, res);
    expect(res.statusCode).toBe(400);
    expect(h.record).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
