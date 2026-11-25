/**
 * Settle do cartão (checkout 2.0) contra um Guesty simulado COM estado: o
 * folio, os pagamentos e as notas mudam com cada POST, como no Guesty real.
 * Reproduz os incidentes que a Fase 0 do pagamento em duas partes fecha:
 *   - GY-Huf4Lp8L: 2.º passe depois de um priceGap lançava uma service fee
 *     fantasma e registava o pagamento outra vez;
 *   - 5xx depois de o Guesty gravar o pagamento: o retry registava outra vez.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Payment = { _id: string; amount: number; status: string; note: string };
const guesty = {
  folioTotal: 0,
  payments: [] as Payment[],
  invoiceItems: [] as number[],
  notes: "",
  /** Grava o próximo POST de pagamento e depois responde 500 (resultado ambíguo). */
  failNextPaymentAfterPersist: false,
  /** Próximo POST de fee: "lost" = 502 sem gravar; "persisted" = grava e responde 502. */
  failNextFee: null as null | "lost" | "persisted",
  /** Leituras do saldo que ainda mostram o folio antigo (consistência eventual). */
  staleReadsLeft: 0,
  staleFolioTotal: 0,
  /** Leituras com o folio ainda por precificar (money sem balanceDue). */
  unpricedReadsLeft: 0,
  /**
   * POST /v1/reservations-v3: o folio com que a reserva nasce. "apply" = o
   * Guesty aplica o cupão (folio com desconto); "reject" = 400 a nomear o
   * cupão; "ignore" = aceita o pedido e precifica sem desconto.
   */
  reservation: {
    fullFolio: 0,
    discountedFolio: 0,
    couponMode: "apply" as "apply" | "reject" | "ignore",
    bodies: [] as any[],
  },
};
const paid = () => guesty.payments.reduce((a, p) => a + p.amount, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyClient: {
      request: vi.fn(async (method: string, endpoint: string, opts?: any) => {
        if (method === "GET" && /^\/v1\/reservations\/[^/]+$/.test(endpoint)) {
          if (opts?.query?.fields === "money status") {
            if (guesty.unpricedReadsLeft > 0) {
              guesty.unpricedReadsLeft -= 1;
              return { money: {} };
            }
            const total = guesty.staleReadsLeft > 0 ? guesty.staleFolioTotal : guesty.folioTotal;
            if (guesty.staleReadsLeft > 0) guesty.staleReadsLeft -= 1;
            return {
              money: {
                balanceDue: round2(total - paid()),
                totalPaid: round2(paid()),
                payments: guesty.payments,
              },
            };
          }
          return { notes: { other: guesty.notes }, guestId: "guest-1" };
        }
        if (method === "PUT" && /^\/v1\/reservations\/[^/]+$/.test(endpoint)) {
          guesty.notes = opts.body.notes.other;
          return {};
        }
        if (method === "POST" && endpoint.startsWith("/v1/invoice-items/reservation/")) {
          const mode = guesty.failNextFee;
          guesty.failNextFee = null;
          const ambiguous = () =>
            new actual.GuestyClientError({
              message: "Guesty request failed (502, outcome unknown: not retried)",
              status: 502,
              method: "POST",
              endpoint,
              details: { outcome: "unknown" },
            });
          if (mode === "lost") throw ambiguous();
          const before = guesty.folioTotal;
          guesty.invoiceItems.push(opts.body.amount);
          guesty.folioTotal = round2(guesty.folioTotal + opts.body.amount);
          if (mode === "persisted") {
            guesty.staleReadsLeft = 1;
            guesty.staleFolioTotal = before;
            throw ambiguous();
          }
          return {};
        }
        if (method === "POST" && /\/v1\/reservations\/[^/]+\/payments$/.test(endpoint)) {
          guesty.payments.push({
            _id: `pay-${guesty.payments.length + 1}`,
            amount: opts.body.amount,
            status: "SUCCEEDED",
            note: opts.body.note,
          });
          if (guesty.failNextPaymentAfterPersist) {
            guesty.failNextPaymentAfterPersist = false;
            throw new actual.GuestyClientError({
              message: "Guesty request failed (500, outcome unknown: not retried)",
              status: 500,
              method: "POST",
              endpoint,
              details: { outcome: "unknown" },
            });
          }
          return {};
        }
        if (method === "POST" && endpoint === "/v1/reservations-v3") {
          const r = guesty.reservation;
          r.bodies.push(structuredClone(opts.body));
          if (opts.body.couponCode && r.couponMode === "reject") {
            throw new actual.GuestyClientError({
              message: "Guesty request failed (400)",
              status: 400,
              method: "POST",
              endpoint,
              details: { error: { message: `Coupon ${opts.body.couponCode} does not exist` } },
            });
          }
          guesty.folioTotal = opts.body.couponCode && r.couponMode === "apply" ? r.discountedFolio : r.fullFolio;
          return { reservationId: "res-1", confirmationCode: "GY-TEST", status: "confirmed" };
        }
        if (method === "GET" && endpoint === "/v1/payment-providers/provider-by-listing") return { _id: "prov-1" };
        if (method === "POST" && endpoint.startsWith("/v1/guests/")) return {};
        throw new Error(`fake Guesty: rota inesperada ${method} ${endpoint}`);
      }),
    },
  };
});

const pi = {
  id: "pi_test_settle",
  status: "succeeded",
  currency: "eur",
  amount: 252407,
  created: 1_790_000_000,
  payment_method: "pm_test",
  metadata: {} as Record<string, string>,
};
vi.mock("./stripe-klarna", () => ({
  getPaymentIntent: vi.fn(async () => ({ ...pi, metadata: { ...pi.metadata } })),
  updatePaymentIntentMetadata: vi.fn(async (_id: string, patch: Record<string, string>) => {
    Object.assign(pi.metadata, patch);
  }),
  findSucceededPaymentIntentByIntentId: vi.fn(),
  createPartialRefund: vi.fn(),
}));

const intent = {
  id: "11111111-1111-4111-8111-111111111111",
  listingId: "listing-aura",
  checkIn: "2026-11-20",
  checkOut: "2026-11-26",
  guests: 4,
  email: "guest@example.com",
  guestFirstName: "Daniel",
  guestLastName: "Garcia",
  guestPhone: "+351 912 345 678",
  quote: { total: 2524.07, totalNights: 2421, nights: 6, currency: "EUR" },
  reception: { type: "self" },
  extras: [],
  flex: false,
  paymentIntentId: "pi_test_settle",
  reservationId: null as string | null,
  confirmationCode: null as string | null,
};
vi.mock("../db", () => ({
  getBookingIntent: vi.fn(async () => ({ ...intent })),
  updateBookingIntent: vi.fn(async () => true),
}));
vi.mock("./checkout-confirmation", () => ({ completeCheckoutIntent: vi.fn(async () => {}) }));
vi.mock("../routers/checkout", () => ({ listingFacts: vi.fn(async () => ({ bedrooms: null })) }));

/** A quote do Guesty relida no settle (só no passe que cria a reserva). */
const supplier = { reservationCouponCode: undefined as string | undefined };
vi.mock("./trusted-checkout-quote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./trusted-checkout-quote")>();
  return {
    ...actual,
    trustedStayQuote: vi.fn(async () => ({
      ratePlanId: "rp-flex",
      expiresAt: new Date(Date.now() + 3600_000),
      couponReference: supplier.reservationCouponCode ? "BlackFirday 2026 General Host" : undefined,
      reservationCouponCode: supplier.reservationCouponCode,
      quote: { ...intent.quote },
    })),
  };
});

const mail = vi.hoisted(() => ({ sent: [] as Array<{ subject: string; lines: string[] }> }));
vi.mock("./transactional-email", () => ({
  sendOpsAlert: vi.fn(async (subject: string, lines: string[]) => {
    mail.sent.push({ subject, lines });
    return true;
  }),
  emailDeliveryConfigured: vi.fn(() => true),
}));

import { settleCardCharge } from "./checkout-card-charge";
import { trustedStayQuote } from "./trusted-checkout-quote";

function resetWorld(opts: { folioTotal: number; metadata?: Record<string, string>; payments?: Payment[] }) {
  guesty.folioTotal = opts.folioTotal;
  guesty.payments = opts.payments ? [...opts.payments] : [];
  guesty.invoiceItems = [];
  guesty.notes = "";
  guesty.failNextPaymentAfterPersist = false;
  guesty.failNextFee = null;
  guesty.staleReadsLeft = 0;
  guesty.unpricedReadsLeft = 0;
  guesty.reservation = { fullFolio: 0, discountedFolio: 0, couponMode: "apply", bodies: [] };
  supplier.reservationCouponCode = undefined;
  mail.sent = [];
  pi.metadata = {
    flow: "card_v2",
    intentId: intent.id,
    // A reserva já existe: o teste começa depois da criação.
    guestyReservationId: "res-1",
    guestyConfirmationCode: "GY-TEST",
    // O cartão em carteira não é o que se testa aqui (e esperaria 15 s pelo saldo).
    cardOnFile: "1",
    ...(opts.metadata ?? {}),
  };
}

describe("settleCardCharge — idempotência do registo no Guesty", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("GY-Huf4Lp8L: o 2.º passe depois de um priceGap não lança fee nem regista outra vez", async () => {
    // Estado deixado pelo 1.º passe do código antigo: pagamento registado,
    // 242,10 EUR de saldo por divergência de preço, e SEM o carimbo feeAdjusted.
    resetWorld({
      folioTotal: 2766.17,
      metadata: { priceGap: "242.10", splitNoteAdded: "1" },
      payments: [
        {
          _id: "pay-1",
          amount: 2524.07,
          status: "SUCCEEDED",
          note: "Stripe external payment (EUR) — PaymentIntent: pi_test_settle",
        },
      ],
    });

    await settleCardCharge(intent.id, pi.id);

    expect(guesty.invoiceItems).toEqual([]);
    expect(guesty.payments).toHaveLength(1);
    expect(pi.metadata.feeAdjusted).toBe("1");
    expect(pi.metadata.guestyPaymentRecorded).toBe("1");
  });

  it("Guesty acima do site: um registo, nota com o aviso, e um 2.º passe não faz nada", async () => {
    resetWorld({ folioTotal: 2766.17 });

    await settleCardCharge(intent.id, pi.id);
    await settleCardCharge(intent.id, pi.id);

    expect(guesty.invoiceItems).toEqual([]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([2524.07]);
    expect(pi.metadata).toMatchObject({ feeAdjusted: "1", priceGap: "242.10", guestyPaymentRecorded: "1" });
    expect(guesty.notes).toContain("NAO e divida do hospede");
  });

  it("Guesty abaixo do site: uma fee com a diferença e um registo pelo total da estadia", async () => {
    resetWorld({ folioTotal: 2300 });

    await settleCardCharge(intent.id, pi.id);
    await settleCardCharge(intent.id, pi.id);

    expect(guesty.invoiceItems).toEqual([224.07]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([2524.07]);
    expect(round2(guesty.folioTotal - paid())).toBe(0);
  });

  it("um 500 depois de o Guesty gravar o pagamento não vira dois registos", async () => {
    resetWorld({ folioTotal: 2300 });
    guesty.failNextPaymentAfterPersist = true;

    // O registo relê o folio depois do 500, encontra a nota com o PI e fecha
    // no mesmo passe, sem segundo POST.
    await settleCardCharge(intent.id, pi.id);
    // E um passe a seguir (webhook, finalize ou sweep) também não volta a registar
    // nem a lançar a fee.
    await settleCardCharge(intent.id, pi.id);

    expect(guesty.invoiceItems).toEqual([224.07]);
    expect(guesty.payments).toHaveLength(1);
    expect(pi.metadata.guestyPaymentRecorded).toBe("1");
  });

  it("valores iguais: nenhuma fee, um registo, carimbo nos três ramos", async () => {
    resetWorld({ folioTotal: 2524.07 });

    await settleCardCharge(intent.id, pi.id);

    expect(guesty.invoiceItems).toEqual([]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([2524.07]);
    expect(pi.metadata.feeAdjusted).toBe("1");
  });
  it("fee com 502 que não gravou: não regista capado; o retry lança a fee e regista o total", async () => {
    resetWorld({ folioTotal: 2300 });
    guesty.failNextFee = "lost";
    vi.useFakeTimers();
    try {
      const first = settleCardCharge(intent.id, pi.id).then(() => null, (e) => e);
      await vi.runAllTimersAsync();
      expect(String(await first)).toMatch(/resultado desconhecido/);
    } finally {
      vi.useRealTimers();
    }
    expect(guesty.payments).toHaveLength(0);

    await settleCardCharge(intent.id, pi.id);
    expect(guesty.invoiceItems).toEqual([224.07]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([2524.07]);
    expect(round2(guesty.folioTotal - paid())).toBe(0);
  });

  it("fee com 502 que gravou e leitura atrasada: espera pelo saldo e regista o total, sem segunda fee", async () => {
    resetWorld({ folioTotal: 2300 });
    guesty.failNextFee = "persisted";
    vi.useFakeTimers();
    try {
      const run = settleCardCharge(intent.id, pi.id);
      await vi.runAllTimersAsync();
      await run;
    } finally {
      vi.useRealTimers();
    }
    expect(guesty.invoiceItems).toEqual([224.07]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([2524.07]);
    expect(pi.metadata.feeAdjusted).toBe("1");
  });

  it("folio ilegível: não decide nem regista; o retry faz tudo certo", async () => {
    resetWorld({ folioTotal: 2766.17 });
    guesty.unpricedReadsLeft = 8; // esgota as 8 leituras do primeiro passe
    vi.useFakeTimers();
    try {
      const first = settleCardCharge(intent.id, pi.id).then(() => null, (e) => e);
      await vi.runAllTimersAsync();
      expect(String(await first)).toMatch(/folio ilegivel/);
    } finally {
      vi.useRealTimers();
    }
    expect(guesty.payments).toHaveLength(0);

    await settleCardCharge(intent.id, pi.id);
    expect(guesty.payments.map((p) => p.amount)).toEqual([2524.07]);
    expect(pi.metadata.priceGap).toBe("242.10");
    expect(guesty.notes).toContain("NAO e divida do hospede");
  });
});

/**
 * Black Friday 2026 (PABF15GERAL26 / PABF15VIP26, 15% nas noites): a reserva
 * nascia sem o cupão e o folio ficava 15% das noites acima do pago
 * (GY-K8buDVJW: pago 5.074,37, folio 5.872,75). Aqui a reserva é criada neste
 * passe, como no primeiro settle de um pagamento novo.
 */
describe("settleCardCharge — cupão do site na criação da reserva", () => {
  // Tarifa de alojamento 2.000 EUR: 15% = 300 EUR. O site cobrou a estadia
  // já com o desconto (2.524,07); o Guesty sem cupão pede 2.824,07.
  const PAID_STAY = 2524.07;
  const FULL_FOLIO = 2824.07;

  function newBooking(opts: { coupon?: string; couponMode?: "apply" | "reject" | "ignore" }) {
    resetWorld({ folioTotal: 0 });
    // Pagamento acabado de capturar: a reserva ainda não existe.
    delete pi.metadata.guestyReservationId;
    delete pi.metadata.guestyConfirmationCode;
    supplier.reservationCouponCode = opts.coupon;
    guesty.reservation = {
      fullFolio: FULL_FOLIO,
      discountedFolio: PAID_STAY,
      couponMode: opts.couponMode ?? "apply",
      bodies: [],
    };
  }
  /** O alerta não é esperado pelo settle (lock do intent): dá-lhe tempo de sair. */
  const flushAlerts = () => new Promise((r) => setTimeout(r, 20));

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(trustedStayQuote).mockClear();
  });

  it("o Guesty aplica o cupão: folio igual ao pago, saldo 0, sem nota de divergência nem alerta", async () => {
    newBooking({ coupon: "PABF15GERAL26" });

    const r = await settleCardCharge(intent.id, pi.id);
    await flushAlerts();

    expect(r).toEqual({ reservationId: "res-1", confirmationCode: "GY-TEST" });
    expect(trustedStayQuote).toHaveBeenCalledOnce();
    expect(guesty.reservation.bodies).toHaveLength(1);
    expect(guesty.reservation.bodies[0]).toMatchObject({ couponCode: "PABF15GERAL26", applyPromotions: false });
    expect(guesty.folioTotal).toBe(PAID_STAY);
    expect(guesty.payments.map((p) => p.amount)).toEqual([PAID_STAY]);
    expect(round2(guesty.folioTotal - paid())).toBe(0);
    expect(guesty.invoiceItems).toEqual([]);
    expect(pi.metadata.priceGap).toBeUndefined();
    expect(pi.metadata).toMatchObject({ guestyCoupon: "PABF15GERAL26", guestyCouponStatus: "sent", feeAdjusted: "1" });
    expect(guesty.notes).toContain("Checkout 2.0: pagamento unico");
    expect(guesty.notes).not.toContain("NAO e divida do hospede");
    expect(guesty.notes).not.toContain("Accommodation fare");
    expect(mail.sent).toEqual([]);
  });

  it("o Guesty recusa o cupão: a reserva nasce sem ele, o settle fecha e o CS recebe o acerto exato", async () => {
    newBooking({ coupon: "PABF15VIP26", couponMode: "reject" });

    const r = await settleCardCharge(intent.id, pi.id);
    await flushAlerts();

    expect(r.reservationId).toBe("res-1");
    // Um pedido com o código (recusado) e um sem ele: uma só reserva.
    expect(guesty.reservation.bodies.map((b) => b.couponCode)).toEqual(["PABF15VIP26", undefined]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([PAID_STAY]);
    expect(guesty.invoiceItems).toEqual([]);
    expect(pi.metadata).toMatchObject({ guestyCoupon: "PABF15VIP26", guestyCouponStatus: "rejected", priceGap: "300.00" });
    expect(pi.metadata.guestyCouponError).toMatch(/Coupon PABF15VIP26 does not exist/);
    // A nota da reserva diz que não é dívida e qual é o acerto.
    expect(guesty.notes).toContain("NAO e divida do hospede");
    expect(guesty.notes).toContain("Cupao PABF15VIP26 recusado pelo Guesty");
    expect(guesty.notes).toContain("Accommodation fare, menos 300.00 EUR");
    expect(mail.sent).toHaveLength(1);
    const alert = mail.sent[0];
    expect(alert.subject).toContain("PABF15VIP26");
    expect(alert.subject).toContain("GY-TEST");
    const text = alert.lines.join("\n");
    expect(text).toContain("Guest folio → Adjust line item → Accommodation fare → menos 300.00 EUR");
    expect(text).toContain("2524.07");
    expect(text).toContain("2824.07");
    expect(text).toContain("não lhe pedir pagamento");
    expect(text).toContain("Coupon PABF15VIP26 does not exist");
  });

  it("o Guesty aceita o código mas não baixa o folio: alerta manda ver a linha de desconto antes de acertar", async () => {
    newBooking({ coupon: "PABF15GERAL26", couponMode: "ignore" });

    await settleCardCharge(intent.id, pi.id);
    await flushAlerts();

    expect(guesty.reservation.bodies).toHaveLength(1);
    expect(pi.metadata).toMatchObject({ guestyCouponStatus: "sent", priceGap: "300.00" });
    expect(guesty.notes).toContain("Cupao PABF15GERAL26 enviado ao Guesty mas sem desconto no folio");
    expect(mail.sent).toHaveLength(1);
    const text = mail.sent[0].lines.join("\n");
    expect(text).toContain("enviado ao Guesty sem erro");
    expect(text).toContain("Se não houver linha de desconto do cupão PABF15GERAL26");
    expect(text).toContain("menos 300.00 EUR");
  });

  it("sem cupão na quote do Guesty: o pedido não leva código e a divergência não gera alerta de cupão", async () => {
    newBooking({});

    await settleCardCharge(intent.id, pi.id);
    await flushAlerts();

    expect(guesty.reservation.bodies[0]).not.toHaveProperty("couponCode");
    expect(pi.metadata.priceGap).toBe("300.00");
    expect(pi.metadata.guestyCoupon).toBeUndefined();
    expect(guesty.notes).toContain("NAO e divida do hospede");
    expect(guesty.notes).not.toContain("Cupao");
    expect(mail.sent).toEqual([]);
  });

  it("settle retomado depois da criação: o cupão vem do carimbo no PI e o alerta sai uma vez", async () => {
    // O 1.º passe criou a reserva (código recusado) e morreu antes do acerto.
    resetWorld({
      folioTotal: FULL_FOLIO,
      metadata: {
        guestyCoupon: "PABF15GERAL26",
        guestyCouponStatus: "rejected",
        guestyCouponError: "Guesty request failed (400) · Coupon PABF15GERAL26 does not exist",
      },
    });

    await settleCardCharge(intent.id, pi.id);
    await settleCardCharge(intent.id, pi.id);
    await flushAlerts();

    expect(trustedStayQuote).not.toHaveBeenCalled();
    expect(guesty.reservation.bodies).toEqual([]);
    expect(guesty.payments.map((p) => p.amount)).toEqual([PAID_STAY]);
    expect(guesty.notes).toContain("Accommodation fare, menos 300.00 EUR");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].lines.join("\n")).toContain("Coupon PABF15GERAL26 does not exist");
  });
});
