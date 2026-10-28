import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyClient: {
      request: vi.fn(),
    },
  };
});

import {
  readReservationSnapshot,
  foreignPayments,
  cancelGuestyReservation,
  isGuestyCanceledStatus,
  type ReservationSnapshot,
} from "./guesty-balance";
import { paymentRecordsIntent } from "./guesty-openapi-paypal";
import { guestyClient, GuestyClientError } from "../lib/guesty";

const request = vi.mocked(guestyClient.request);
const RES = "res_abc123";
const DEPOSIT_PI = "pi_deposit_111";
const BALANCE_PI = "pi_balance_222";

function reservation(overrides: Record<string, unknown> = {}, money: Record<string, unknown> = {}) {
  return {
    _id: RES,
    status: "confirmed",
    listingId: "listing_9",
    checkInDateLocalized: "2027-07-15",
    checkOutDateLocalized: "2027-07-22",
    money: {
      totalPrice: 5000.5,
      totalPaid: 2500.25,
      balanceDue: 2500.25,
      hostPayout: 3900,
      payments: [
        {
          _id: "gp_1",
          amount: 2500.25,
          status: "SUCCEEDED",
          note: `Stripe external payment (EUR) — PaymentIntent: ${DEPOSIT_PI}`,
          paymentMethod: { method: "OTHER" },
        },
      ],
      ...money,
    },
    ...overrides,
  };
}

function guestyError(status: number, details?: unknown) {
  return new GuestyClientError({
    message: `Guesty request failed (${status})`,
    status,
    method: "PUT",
    endpoint: `/v1/reservations-v3/${RES}/status`,
    details,
  });
}

function ambiguousError() {
  return new GuestyClientError({
    message: "Guesty request failed (502, outcome unknown: not retried)",
    status: 502,
    method: "PUT",
    endpoint: `/v1/reservations-v3/${RES}/status`,
    details: { outcome: "unknown", response: null },
  });
}

function snap(payments: ReservationSnapshot["payments"]): ReservationSnapshot {
  return {
    status: "confirmed",
    checkIn: "2027-07-15",
    checkOut: "2027-07-22",
    listingId: "listing_9",
    totalCents: 500050,
    totalPaidCents: 250025,
    payments,
  };
}

function pay(amountCents: number, status: string, note = "", raw: unknown = undefined) {
  return { id: null, amountCents, status, note, method: null, raw };
}

beforeEach(() => {
  request.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("readReservationSnapshot", () => {
  it("lê estado, datas locais, casa, total, total pago e pagamentos numa só leitura sem filtro de campos", async () => {
    request.mockResolvedValueOnce(reservation());
    const s = await readReservationSnapshot(RES);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("GET", `/v1/reservations/${RES}`);
    expect(s).toMatchObject({
      status: "confirmed",
      checkIn: "2027-07-15",
      checkOut: "2027-07-22",
      listingId: "listing_9",
      totalCents: 500050,
      totalPaidCents: 250025,
    });
    expect(s!.payments).toHaveLength(1);
    expect(s!.payments[0]).toMatchObject({
      id: "gp_1",
      amountCents: 250025,
      status: "SUCCEEDED",
      method: "OTHER",
    });
    expect(s!.payments[0].note).toContain(DEPOSIT_PI);
  });

  it("total: totalPrice primeiro, depois total e totalAmount; hostPayout nunca", async () => {
    request.mockResolvedValueOnce(reservation({}, { totalPrice: 100, total: 200, totalAmount: 300 }));
    expect((await readReservationSnapshot(RES))!.totalCents).toBe(10000);

    request.mockResolvedValueOnce(reservation({}, { totalPrice: undefined, total: 200, totalAmount: 300 }));
    expect((await readReservationSnapshot(RES))!.totalCents).toBe(20000);

    request.mockResolvedValueOnce(reservation({}, { totalPrice: undefined, total: undefined, totalAmount: 300 }));
    expect((await readReservationSnapshot(RES))!.totalCents).toBe(30000);

    request.mockResolvedValueOnce(reservation({}, { totalPrice: undefined, hostPayout: 3900 }));
    expect((await readReservationSnapshot(RES))!.totalCents).toBeNull();
  });

  it("sem totalPaid nem payments: 0 e lista vazia (reserva sem pagamentos)", async () => {
    request.mockResolvedValueOnce(reservation({}, { totalPaid: undefined, payments: undefined }));
    const s = await readReservationSnapshot(RES);
    expect(s!.totalPaidCents).toBe(0);
    expect(s!.payments).toEqual([]);
  });

  it("sem data local, usa o instante convertido para o dia de Lisboa", async () => {
    request.mockResolvedValueOnce(
      reservation({
        checkInDateLocalized: undefined,
        checkOutDateLocalized: undefined,
        // 23:30 UTC de 14 jul = 00:30 de 15 jul em Lisboa (verão, UTC+1)
        checkIn: "2027-07-14T23:30:00.000Z",
        checkOut: "2027-07-22T10:00:00.000Z",
      }),
    );
    const s = await readReservationSnapshot(RES);
    expect(s!.checkIn).toBe("2027-07-15");
    expect(s!.checkOut).toBe("2027-07-22");
  });

  it("casa pelo objeto listing quando listingId não vem", async () => {
    request.mockResolvedValueOnce(reservation({ listingId: undefined, listing: { _id: "listing_from_obj" } }));
    expect((await readReservationSnapshot(RES))!.listingId).toBe("listing_from_obj");
  });

  it.each([
    ["o pedido falha", () => request.mockRejectedValueOnce(new Error("boom"))],
    ["a resposta é vazia", () => request.mockResolvedValueOnce(null)],
    ["falta o estado", () => request.mockResolvedValueOnce(reservation({ status: undefined }))],
    ["o estado é vazio", () => request.mockResolvedValueOnce(reservation({ status: "  " }))],
    ["falta o money", () => request.mockResolvedValueOnce(reservation({ money: undefined }))],
    ["o folio não está precificado (sem balanceDue)", () => request.mockResolvedValueOnce(reservation({}, { balanceDue: undefined }))],
    ["payments não é lista", () => request.mockResolvedValueOnce(reservation({}, { payments: { a: 1 } }))],
    ["totalPaid não é número", () => request.mockResolvedValueOnce(reservation({}, { totalPaid: "2500" }))],
    [
      "um pagamento válido vem sem valor",
      () => request.mockResolvedValueOnce(reservation({}, { payments: [{ _id: "x", status: "SUCCEEDED", note: "transfer" }] })),
    ],
    ["a resposta é de outra reserva", () => request.mockResolvedValueOnce(reservation({ _id: "res_other" }))],
  ])("devolve null quando %s (nunca decidir com leitura inválida)", async (_label, arrange) => {
    arrange();
    expect(await readReservationSnapshot(RES)).toBeNull();
  });

  it("um pagamento anulado sem valor não invalida a leitura", async () => {
    request.mockResolvedValueOnce(
      reservation({}, {
        payments: [
          { _id: "gp_1", amount: 2500.25, status: "SUCCEEDED", note: DEPOSIT_PI },
          { _id: "gp_2", status: "FAILED", note: "card declined" },
        ],
      }),
    );
    const s = await readReservationSnapshot(RES);
    expect(s!.payments).toHaveLength(2);
    expect(s!.payments[1]).toMatchObject({ id: "gp_2", amountCents: 0, status: "FAILED" });
  });

  it("uma reserva cancelada lê-se mesmo sem balanceDue (decide-se pelo estado)", async () => {
    request.mockResolvedValueOnce(reservation({ status: "canceled" }, { balanceDue: undefined }));
    const s = await readReservationSnapshot(RES);
    expect(s).not.toBeNull();
    expect(s!.status).toBe("canceled");
  });

  it("sem reservationId não chama o Guesty", async () => {
    expect(await readReservationSnapshot("")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("foreignPayments", () => {
  it("exclui os nossos registos (nota com o PI) e separa terceiros recebidos de pendentes", () => {
    const s = snap([
      pay(250025, "SUCCEEDED", `Stripe external payment (EUR) — PaymentIntent: ${DEPOSIT_PI}`),
      pay(250025, "SUCCEEDED", `Stripe external payment (EUR) — PaymentIntent: ${BALANCE_PI}`),
      pay(100000, "SUCCEEDED", "Transferencia bancaria"),
      pay(50000, "PENDING", "Payment link"),
    ]);
    expect(foreignPayments(s, [DEPOSIT_PI, BALANCE_PI])).toEqual({ succeededCents: 100000, pendingCents: 50000 });
  });

  it("reconhece o nosso PI em qualquer campo do objeto original, não só na nota", () => {
    const s = snap([pay(250025, "SUCCEEDED", "", { description: `ref ${DEPOSIT_PI}` })]);
    expect(foreignPayments(s, [DEPOSIT_PI])).toEqual({ succeededCents: 0, pendingCents: 0 });
  });

  it("um registo que não é nosso conta como terceiros", () => {
    const s = snap([pay(250025, "SUCCEEDED", `PaymentIntent: ${DEPOSIT_PI}`)]);
    expect(foreignPayments(s, [BALANCE_PI])).toEqual({ succeededCents: 250025, pendingCents: 0 });
  });

  it.each(["FAILED", "CANCELLED", "CANCELED", "VOIDED", "DECLINED", "REVERSED"])(
    "ignora pagamentos anulados (%s), sejam nossos ou de terceiros",
    (status) => {
      const s = snap([pay(100000, status, "Transferencia"), pay(250025, status, DEPOSIT_PI)]);
      expect(foreignPayments(s, [DEPOSIT_PI])).toEqual({ succeededCents: 0, pendingCents: 0 });
    },
  );

  it.each(["PENDING", "SCHEDULED", "AWAITING_PAYMENT", "PROCESSING", "AUTHORIZED", "UNPAID", "OVERDUE"])(
    "%s conta como pendente",
    (status) => {
      expect(foreignPayments(snap([pay(70000, status)]), [DEPOSIT_PI])).toEqual({ succeededCents: 0, pendingCents: 70000 });
    },
  );

  it.each(["SUCCEEDED", "PAID", "COMPLETED", "CAPTURED", "REFUNDED", "SOMETHING_NEW", ""])(
    "%s conta como recebido (desconhecido ou reembolsado também: o motor pára e um humano decide)",
    (status) => {
      expect(foreignPayments(snap([pay(70000, status)]), [DEPOSIT_PI])).toEqual({ succeededCents: 70000, pendingCents: 0 });
    },
  );

  it("ids vazios na lista dos nossos não escondem pagamentos de terceiros", () => {
    const s = snap([pay(100000, "SUCCEEDED", "Transferencia")]);
    expect(foreignPayments(s, ["", "  "])).toEqual({ succeededCents: 100000, pendingCents: 0 });
  });

  it("nunca devolve valores negativos", () => {
    const s = snap([pay(-30000, "SUCCEEDED", "estorno"), pay(-1000, "PENDING", "x")]);
    expect(foreignPayments(s, [DEPOSIT_PI])).toEqual({ succeededCents: 0, pendingCents: 0 });
  });

  it("a regra dos anulados é a mesma de paymentRecordsIntent (não divergem)", () => {
    const statuses = [
      "SUCCEEDED", "PENDING", "FAILED", "CANCELLED", "CANCELED", "VOIDED", "DECLINED", "REVERSED",
      "REFUNDED", "PAID", "PAYMENT_FAILED", "AUTH_REVERSAL", "",
    ];
    for (const status of statuses) {
      const recordedByRule = paymentRecordsIntent(
        { id: null, amount: 1, status: status || null, note: DEPOSIT_PI, raw: {} },
        DEPOSIT_PI,
      );
      // Se paymentRecordsIntent considera o registo anulado, foreignPayments
      // também o ignora; se não, conta-o como nosso (excluído) — em ambos os
      // casos 0 de terceiros. A diferença aparece com um id que NÃO é nosso.
      const foreign = foreignPayments(snap([pay(100, status, DEPOSIT_PI)]), [BALANCE_PI]);
      const ignoredAsVoid = foreign.succeededCents === 0 && foreign.pendingCents === 0;
      expect({ status, ignoredAsVoid }).toEqual({ status, ignoredAsVoid: !recordedByRule });
    }
  });
});

describe("isGuestyCanceledStatus", () => {
  it("aceita canceled e cancelled, rejeita o resto", () => {
    expect(isGuestyCanceledStatus("canceled")).toBe(true);
    expect(isGuestyCanceledStatus(" Cancelled ")).toBe(true);
    expect(isGuestyCanceledStatus("confirmed")).toBe(false);
    expect(isGuestyCanceledStatus("cancel")).toBe(false);
    expect(isGuestyCanceledStatus(null)).toBe(false);
    expect(isGuestyCanceledStatus(undefined)).toBe(false);
  });
});

describe("cancelGuestyReservation", () => {
  const params = { reason: "PAYMENT_NOT_RECEIVED", note: "2.a parte nao paga ate H; cancelada pela plataforma" };

  function putCalls() {
    return request.mock.calls.filter((c) => c[0] === "PUT");
  }

  async function run(p = params) {
    vi.useFakeTimers();
    const pending = cancelGuestyReservation(RES, p);
    await vi.runAllTimersAsync();
    return pending;
  }

  it("envia o PUT documentado, sem repetição às cegas, e devolve canceled com 200", async () => {
    request.mockResolvedValueOnce({ reservationId: RES, status: "canceled" });
    expect(await run()).toBe("canceled");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("PUT", `/v1/reservations-v3/${RES}/status`, {
      body: {
        status: "canceled",
        canceledBy: "HOST",
        cancellationReason: params.reason,
        cancellationNote: params.note,
      },
      nonIdempotent: true,
    });
  });

  it("corta a nota a 1000 caracteres", async () => {
    request.mockResolvedValueOnce({ reservationId: RES, status: "canceled" });
    await run({ reason: "X", note: "a".repeat(5000) });
    const body = (putCalls()[0][2] as any).body;
    expect(body.cancellationNote).toHaveLength(1000);
  });

  it("200 sem o estado esperado: confirma no GET", async () => {
    request.mockResolvedValueOnce({ reservationId: RES }).mockResolvedValueOnce({ _id: RES, status: "canceled" });
    expect(await run()).toBe("canceled");

    request.mockReset();
    request.mockResolvedValueOnce({ reservationId: RES }).mockResolvedValueOnce({ _id: RES, status: "confirmed" });
    expect(await run()).toBe("unknown");
    expect(putCalls()).toHaveLength(1);
  });

  it("falha ambígua (5xx/rede) e a releitura mostra cancelada → canceled (foi o nosso PUT)", async () => {
    request.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ _id: RES, status: "canceled" });
    expect(await run()).toBe("canceled");
    expect(putCalls()).toHaveLength(1);
    expect(request).toHaveBeenLastCalledWith("GET", `/v1/reservations/${RES}`);
  });

  it("falha ambígua e a releitura mostra ativa → unknown (nunca refused, pode estar a propagar)", async () => {
    request.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ _id: RES, status: "confirmed" });
    expect(await run()).toBe("unknown");
    expect(putCalls()).toHaveLength(1);
  });

  it("falha ambígua e a releitura falha → unknown", async () => {
    request.mockRejectedValueOnce(ambiguousError()).mockRejectedValueOnce(new Error("down"));
    expect(await run()).toBe("unknown");
  });

  it("erro fora do cliente (ex.: 200 com corpo inválido) conta como talvez nosso", async () => {
    request.mockRejectedValueOnce(new SyntaxError("Unexpected token")).mockResolvedValueOnce({ _id: RES, status: "canceled" });
    expect(await run()).toBe("canceled");
  });

  it("422 e a releitura mostra cancelada → already-canceled", async () => {
    request
      .mockRejectedValueOnce(guestyError(422, { message: "Reservation already canceled" }))
      .mockResolvedValueOnce({ _id: RES, status: "canceled" });
    expect(await run()).toBe("already-canceled");
    expect(putCalls()).toHaveLength(1);
  });

  it.each([400, 403, 404, 409, 422])("%i e a releitura mostra ativa → refused", async (status) => {
    request.mockRejectedValueOnce(guestyError(status, { message: "nope" })).mockResolvedValueOnce({ _id: RES, status: "confirmed" });
    expect(await run()).toBe("refused");
    expect(putCalls()).toHaveLength(1);
  });

  it("422 e a releitura falha → unknown (não se sabe se já estava cancelada)", async () => {
    request.mockRejectedValueOnce(guestyError(422)).mockRejectedValueOnce(new Error("down"));
    expect(await run()).toBe("unknown");
  });

  it.each([401, 408, 429])("%i não é recusa: com a reserva ativa → unknown", async (status) => {
    request.mockRejectedValueOnce(guestyError(status)).mockResolvedValueOnce({ _id: RES, status: "confirmed" });
    expect(await run()).toBe("unknown");
  });

  it("429 e a releitura mostra cancelada → already-canceled", async () => {
    request.mockRejectedValueOnce(guestyError(429)).mockResolvedValueOnce({ _id: RES, status: "canceled" });
    expect(await run()).toBe("already-canceled");
  });

  it("releitura que devolve outra reserva não confirma nada", async () => {
    request.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ _id: "res_other", status: "canceled" });
    expect(await run()).toBe("unknown");
  });

  it("sem reservationId não envia nada", async () => {
    expect(await cancelGuestyReservation("", params)).toBe("refused");
    expect(request).not.toHaveBeenCalled();
  });
});
