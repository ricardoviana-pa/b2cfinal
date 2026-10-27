import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyClient: {
      request: vi.fn(),
    },
  };
});

import { createReservationViaOpenApi } from "./guesty-openapi-paypal";
import { guestyClient } from "../lib/guesty";

const baseInput = {
  listingId: "listing-123",
  checkIn: "2026-11-02",
  checkOut: "2026-11-04",
  guestFirstName: "Diogo",
  guestLastName: "Boissel",
  guestEmail: "diogo@example.com",
  numberOfAdults: 2,
  numberOfChildren: 0,
  numberOfInfants: 0,
  stripePaymentIntentId: "pi_test_abc123",
};

describe("createReservationViaOpenApi — reservation ID extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("extracts reservationId from the real reservations-v3 response field", async () => {
    // Guesty POST /v1/reservations-v3 returns the id under `reservationId` (not `_id`)
    vi.mocked(guestyClient.request).mockResolvedValue({
      reservationId: "667bc9e0319654c49fde9aff",
      quoteId: "667bc383b119a5cd5f3bfbf6",
      confirmationCode: "GY-aJ3WEcJU",
      status: "confirmed",
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("667bc9e0319654c49fde9aff");
    expect(result.confirmationCode).toBe("GY-aJ3WEcJU");
  });

  it("extracts reservationId from flat _id field", async () => {
    vi.mocked(guestyClient.request).mockResolvedValue({
      _id: "res_flat_id_abc",
      confirmationCode: "PA-001",
      status: "confirmed",
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("res_flat_id_abc");
  });

  it("extracts reservationId from flat id field when _id is absent", async () => {
    // Guesty API may return `id` instead of `_id` in some response shapes
    vi.mocked(guestyClient.request).mockResolvedValue({
      id: "res_id_field_xyz",
      confirmationCode: "PA-002",
      status: "confirmed",
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("res_id_field_xyz");
  });

  it("extracts reservationId from nested reservation._id", async () => {
    // Some Guesty endpoints wrap the object under a `reservation` key
    vi.mocked(guestyClient.request).mockResolvedValue({
      reservation: {
        _id: "res_nested_id",
        confirmationCode: "PA-003",
        status: "confirmed",
      },
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("res_nested_id");
  });

  it("throws a clear error when no reservation ID is present in the response", async () => {
    vi.mocked(guestyClient.request).mockResolvedValue({
      confirmationCode: "PA-004",
      status: "confirmed",
      // no _id, id, or reservation field
    });

    await expect(createReservationViaOpenApi(baseInput)).rejects.toThrow(
      /reservation ID/i
    );
  });

  it("never returns undefined as the reservationId", async () => {
    vi.mocked(guestyClient.request).mockResolvedValue({
      confirmationCode: "PA-005",
      status: "confirmed",
    });

    await expect(createReservationViaOpenApi(baseInput)).rejects.toThrow();
  });
});

describe("appendReservationNote — acrescenta, nunca apaga", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
  });

  it("junta a nota nova às que já lá estão (a do pagamento sobrevive à dos serviços)", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    const pagamento = "Checkout 2.0: pagamento unico 3607.33 EUR na plataforma (estadia 3457.33 registada aqui; servicos 150.00 faturados pela Portugal Active).";
    const servicos = "SERVICOS DO CHECKOUT:\nRececao: self check-in\nFlex: nao\n- pet-fee x2 150 EUR";
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ notes: { other: pagamento } } as any) // GET
      .mockResolvedValueOnce({} as any); // PUT

    expect(await appendReservationNote("res-1", servicos)).toBe(true);

    const put = vi.mocked(guestyClient.request).mock.calls[1];
    expect(put[0]).toBe("PUT");
    const escrito = (put[2] as any).body.notes.other as string;
    expect(escrito).toContain(pagamento);
    expect(escrito).toContain("pet-fee x2 150 EUR");
    expect(escrito.indexOf(pagamento)).toBeLessThan(escrito.indexOf("SERVICOS DO CHECKOUT"));
  });

  it("não repete uma nota que já lá está (settle e webhook podem correr os dois)", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({ notes: { other: "nota A\n\nnota B" } } as any);

    expect(await appendReservationNote("res-1", "nota B")).toBe(true);
    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1); // só o GET, nenhum PUT
  });

  it("numa reserva sem notas escreve só a nova", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({} as any).mockResolvedValueOnce({} as any);

    await appendReservationNote("res-1", "primeira");
    expect((vi.mocked(guestyClient.request).mock.calls[1][2] as any).body.notes.other).toBe("primeira");
  });

  it("se o Guesty falhar devolve false e não rebenta o settle", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(new Error("503"));
    expect(await appendReservationNote("res-1", "x")).toBe(false);
  });
});

describe("recordExternalPayment — espera que o Guesty precifique a reserva", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
  });

  it("uma reserva acabada de criar ainda sem balanceDue não faz desistir (GY-tNwxeWRA)", async () => {
    vi.useFakeTimers();
    try {
      const { recordExternalPayment } = await import("./guesty-openapi-paypal");
      vi.mocked(guestyClient.request)
        .mockResolvedValueOnce({ money: {} } as any) // 200, folio ainda por precificar
        .mockResolvedValueOnce({ money: { balanceDue: 378.36 } } as any)
        .mockResolvedValueOnce({} as any); // POST payment

      const done = recordExternalPayment("res-1", 378.36, "EUR", "pi_klarna");
      await vi.runAllTimersAsync();
      await done;

      const post = vi.mocked(guestyClient.request).mock.calls[2];
      expect(post[0]).toBe("POST");
      expect((post[2] as any).body.amount).toBe(378.36);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("recordExternalPayment — idempotente pela nota com o id do PaymentIntent", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  const ourNote = "Stripe external payment (EUR) — PaymentIntent: pi_abc";

  it("não regista de novo quando o folio já tem um pagamento deste PI, mesmo com saldo por pagar", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({
      money: { balanceDue: 242.1, totalPaid: 2524.07, payments: [{ _id: "p1", amount: 2524.07, status: "SUCCEEDED", note: ourNote }] },
    } as any);

    await expect(recordExternalPayment("res-1", 2524.07, "EUR", "pi_abc")).resolves.toBe("already-recorded");
    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1); // só o GET
  });

  it("encontra o PI noutro campo do pagamento quando o nome do campo da nota muda", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({
      money: { balanceDue: 100, totalPaid: 900, payments: [{ _id: "p1", amount: 900, status: "SUCCEEDED", meta: { text: ourNote } }] },
    } as any);
    await expect(recordExternalPayment("res-1", 900, "EUR", "pi_abc")).resolves.toBe("already-recorded");
  });

  it("um registo anulado no Guesty não conta: volta a registar", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({
        money: { balanceDue: 500, totalPaid: 0, payments: [{ _id: "p1", amount: 500, status: "CANCELED", note: ourNote }] },
      } as any)
      .mockResolvedValueOnce({} as any);
    await expect(recordExternalPayment("res-1", 500, "EUR", "pi_abc")).resolves.toBe("recorded");
  });

  it("o POST do pagamento sai marcado como não repetível", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ money: { balanceDue: 500 } } as any)
      .mockResolvedValueOnce({} as any);
    await recordExternalPayment("res-1", 500, "EUR", "pi_abc");
    const post = vi.mocked(guestyClient.request).mock.calls[1];
    expect(post[0]).toBe("POST");
    expect((post[2] as any).nonIdempotent).toBe(true);
  });

  it("saldo a zero sem registo deste PI: não regista e diz que a reserva já estava liquidada", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({ money: { balanceDue: 0, totalPaid: 500, payments: [] } } as any);
    await expect(recordExternalPayment("res-1", 500, "EUR", "pi_abc")).resolves.toBe("settled");
    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1);
  });
});

describe("addReservationServiceFee — o invoice item não se repete às cegas", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("o POST sai marcado como não repetível e devolve 'added'", async () => {
    vi.mocked(guestyClient.request).mockResolvedValueOnce({} as any);
    const { addReservationServiceFee } = await import("./guesty-openapi-paypal");
    expect(await addReservationServiceFee("res-1", 224.07)).toBe("added");
    expect((vi.mocked(guestyClient.request).mock.calls[0][2] as any).nonIdempotent).toBe(true);
  });

  it("um 4xx é 'refused' e um 5xx sem repetição é 'unknown'", async () => {
    const { addReservationServiceFee } = await import("./guesty-openapi-paypal");
    const { GuestyClientError } = await import("../lib/guesty");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(
      new GuestyClientError({ message: "bad", status: 400, method: "POST", endpoint: "/x" }),
    );
    expect(await addReservationServiceFee("res-1", 1)).toBe("refused");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(
      new GuestyClientError({ message: "boom", status: 502, method: "POST", endpoint: "/x", details: { outcome: "unknown" } }),
    );
    expect(await addReservationServiceFee("res-1", 1)).toBe("unknown");
  });
});

describe("recordExternalPayment — repetição segura depois de um POST ambíguo", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  async function ambiguous() {
    const { GuestyClientError } = await import("../lib/guesty");
    return new GuestyClientError({ message: "502", status: 502, method: "POST", endpoint: "/x", details: { outcome: "unknown" } });
  }

  it("se o POST ambíguo ficou gravado, relê, encontra a nota e não envia segundo", async () => {
    vi.useFakeTimers();
    try {
      const { recordExternalPayment } = await import("./guesty-openapi-paypal");
      vi.mocked(guestyClient.request)
        .mockResolvedValueOnce({ money: { balanceDue: 500, totalPaid: 0, payments: [] } } as any)
        .mockRejectedValueOnce(await ambiguous())
        .mockResolvedValueOnce({
          money: { balanceDue: 0, totalPaid: 500, payments: [{ _id: "p1", amount: 500, status: "SUCCEEDED", note: "PaymentIntent: pi_k" }] },
        } as any);
      const run = recordExternalPayment("res-1", 500, "EUR", "pi_k");
      await vi.runAllTimersAsync();
      await expect(run).resolves.toBe("recorded");
      const posts = vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "POST");
      expect(posts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("se não ficou gravado, volta a enviar uma vez (Klarna e PayPal recuperam como antes)", async () => {
    vi.useFakeTimers();
    try {
      const { recordExternalPayment } = await import("./guesty-openapi-paypal");
      vi.mocked(guestyClient.request)
        .mockResolvedValueOnce({ money: { balanceDue: 500, totalPaid: 0, payments: [] } } as any)
        .mockRejectedValueOnce(await ambiguous())
        .mockResolvedValueOnce({ money: { balanceDue: 500, totalPaid: 0, payments: [] } } as any)
        .mockResolvedValueOnce({} as any);
      const run = recordExternalPayment("res-1", 500, "EUR", "pi_k");
      await vi.runAllTimersAsync();
      await expect(run).resolves.toBe("recorded");
      const posts = vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "POST");
      expect(posts).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("um 4xx não é repetido", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    const { GuestyClientError } = await import("../lib/guesty");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ money: { balanceDue: 500 } } as any)
      .mockRejectedValueOnce(new GuestyClientError({ message: "exceeds", status: 400, method: "POST", endpoint: "/x" }));
    await expect(recordExternalPayment("res-1", 500, "EUR", "pi_k")).rejects.toThrow();
    expect(vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "POST")).toHaveLength(1);
  });
});
