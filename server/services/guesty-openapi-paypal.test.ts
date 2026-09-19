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
