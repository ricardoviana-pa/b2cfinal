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

import { settleCardCharge } from "./checkout-card-charge";

function resetWorld(opts: { folioTotal: number; metadata?: Record<string, string>; payments?: Payment[] }) {
  guesty.folioTotal = opts.folioTotal;
  guesty.payments = opts.payments ? [...opts.payments] : [];
  guesty.invoiceItems = [];
  guesty.notes = "";
  guesty.failNextPaymentAfterPersist = false;
  guesty.failNextFee = null;
  guesty.staleReadsLeft = 0;
  guesty.unpricedReadsLeft = 0;
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
