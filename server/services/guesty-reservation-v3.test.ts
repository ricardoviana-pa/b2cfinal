import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return { ...actual, guestyClient: { request: vi.fn() } };
});

import { guestyClient, GuestyClientError } from "../lib/guesty";
import {
  createGuestPaymentMethod,
  hasOverlappingReservation,
  legacyShapeFromV3,
  readReservation,
  recordReservationPayment,
  writeReservationOtherNote,
} from "./guesty-reservation-v3";
import { parseGuestyWebhook } from "./guesty-webhook";

const request = vi.mocked(guestyClient.request);
const RES = "6b09df242780d2fe5104ea9d";

/** Forma vista em produção a 28 nov 2026 (GET /v1/reservations-v3?reservationIds[]=). */
const v3 = (over: Record<string, unknown> = {}) => ({
  _id: RES,
  status: "confirmed",
  confirmationCode: "GY-abc12345",
  bookerId: "guest-1",
  guests: [{ id: "guest-1", type: "main" }],
  stay: [
    {
      unitId: "listing-1",
      unitTypeId: "listing-1",
      ratePlanId: "rp-1",
      checkInDateLocalized: "2027-02-12",
      checkOutDateLocalized: "2027-02-26",
    },
  ],
  notes: { other: "nota antiga", cleaning: "", guest: "", specialRequests: "", keyCode: "1234" },
  ...over,
});

/** Forma vista em produção a 28 nov 2026 (GET /v1/payments?reservationId=). */
const payments = {
  balanceDue: 1608.44,
  totalPaid: 1565,
  totalRefunded: 0,
  currency: "EUR",
  hostPayout: 3173.44,
  isFullyPaid: false,
  payments: [{ _id: "pay-1", status: "SUCCEEDED", amount: 1565, note: "Stripe external payment (EUR) — PaymentIntent: pi_1" }],
};

const ambiguous = () =>
  new GuestyClientError({ message: "timeout", status: 504, method: "POST", endpoint: "/x", details: { outcome: "unknown" } });
const refused = (status = 400) => new GuestyClientError({ message: "bad", status, method: "POST", endpoint: "/x" });

beforeEach(() => {
  request.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("readReservation (reservations-v3 + /payments)", () => {
  it("pede o id como array e devolve a reserva no formato antigo, com o dinheiro", async () => {
    request.mockImplementation(async (_m: string, endpoint: string) => {
      if (endpoint === "/v1/reservations-v3") return [v3()];
      if (endpoint === "/v1/payments") return payments;
      throw new Error("inesperado " + endpoint);
    });
    const r = await readReservation(RES, { money: true });
    expect(request).toHaveBeenCalledWith("GET", "/v1/reservations-v3", { query: { "reservationIds[]": RES } });
    expect(request).toHaveBeenCalledWith("GET", "/v1/payments", { query: { reservationId: RES } });
    expect(r).toMatchObject({
      _id: RES,
      status: "confirmed",
      confirmationCode: "GY-abc12345",
      listingId: "listing-1",
      guestId: "guest-1",
      ratePlanId: "rp-1",
      checkInDateLocalized: "2027-02-12",
      checkOutDateLocalized: "2027-02-26",
      notes: { other: "nota antiga" },
      money: { balanceDue: 1608.44, totalPaid: 1565, currency: "EUR", payments: payments.payments },
    });
    expect(r.money.totalPrice).toBeUndefined();
  });

  it("sem money não pede os pagamentos", async () => {
    request.mockResolvedValueOnce([v3()]);
    const r = await readReservation(RES);
    expect(request).toHaveBeenCalledTimes(1);
    expect(r.money).toBeUndefined();
  });

  it("estadias encadeadas: entrada da primeira, saída da última", () => {
    const r = legacyShapeFromV3(
      v3({
        stay: [
          { unitId: "l-a", checkInDateLocalized: "2027-01-01", checkOutDateLocalized: "2027-01-03" },
          { unitId: "l-b", checkInDateLocalized: "2027-01-03", checkOutDateLocalized: "2027-01-07" },
        ],
      }),
    );
    expect(r).toMatchObject({ listingId: "l-a", checkInDateLocalized: "2027-01-01", checkOutDateLocalized: "2027-01-07" });
  });

  it("antes de 1 mar 2027, se a v3 falhar lê pelo endpoint antigo", async () => {
    request
      .mockRejectedValueOnce(refused(500))
      .mockResolvedValueOnce({ _id: RES, status: "confirmed", money: { balanceDue: 0 } });
    const r = await readReservation(RES);
    expect(request).toHaveBeenLastCalledWith("GET", `/v1/reservations/${RES}`);
    expect(r.money.balanceDue).toBe(0);
  });

  it("a v3 sem esta reserva conta como falha e vai ao antigo", async () => {
    request.mockResolvedValueOnce([]).mockResolvedValueOnce({ _id: RES, status: "confirmed" });
    await readReservation(RES);
    expect(request).toHaveBeenLastCalledWith("GET", `/v1/reservations/${RES}`);
  });

  it("depois de 1 mar 2027 não há recurso: a falha sobe", async () => {
    vi.setSystemTime(new Date("2027-03-01T00:00:01Z"));
    request.mockRejectedValueOnce(refused(500));
    await expect(readReservation(RES)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("recordReservationPayment (POST /v1/payments/record)", () => {
  const input = { reservationId: RES, amount: 1565, note: "Stripe external payment (EUR) — PaymentIntent: pi_1", confirmationCode: "GY-abc12345" };

  it("regista como OTHER, sem data (fica SUCCEEDED), com a nota do PI, e não se repete às cegas", async () => {
    request.mockResolvedValueOnce({ _id: "pay-2", status: "SUCCEEDED" });
    await recordReservationPayment(input);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("POST", "/v1/payments/record", {
      body: { reservationId: RES, amount: 1565, paymentMethod: { method: "OTHER" }, note: input.note, confirmationCode: "GY-abc12345" },
      nonIdempotent: true,
    });
  });

  it("4xx (nada criado): regista pelo endpoint antigo, uma vez", async () => {
    request.mockRejectedValueOnce(refused(422)).mockResolvedValueOnce({});
    await recordReservationPayment(input);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toBe(`/v1/reservations/${RES}/payments`);
    expect((request.mock.calls[1][2] as any).nonIdempotent).toBe(true);
  });

  it("falha ambígua: não tenta o antigo (podia ficar em dobro)", async () => {
    request.mockRejectedValueOnce(ambiguous());
    await expect(recordReservationPayment(input)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("5xx também não tenta o antigo", async () => {
    request.mockRejectedValueOnce(refused(503));
    await expect(recordReservationPayment(input)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("writeReservationOtherNote (PUT /v1/reservations-v3/{id}/notes)", () => {
  it("grava o other e reenvia os outros campos que lá estavam (o PUT pode substituir tudo)", async () => {
    request.mockResolvedValueOnce({ reservationId: RES, notes: {} });
    await writeReservationOtherNote(RES, v3().notes, "nota antiga\n\nnota nova");
    expect(request).toHaveBeenCalledWith("PUT", `/v1/reservations-v3/${RES}/notes`, {
      body: { notes: { keyCode: "1234", other: "nota antiga\n\nnota nova" } },
    });
  });

  it("4xx: grava pelo endpoint antigo", async () => {
    request.mockRejectedValueOnce(refused(400)).mockResolvedValueOnce({});
    await writeReservationOtherNote(RES, {}, "x");
    expect(request).toHaveBeenLastCalledWith("PUT", `/v1/reservations/${RES}`, { body: { notes: { other: "x" } } });
  });
});

describe("createGuestPaymentMethod (POST /v1/payment-methods)", () => {
  const input = { guestId: "guest-1", paymentMethodId: "pm_1", paymentProviderId: "prov-1", reservationId: RES, confirmationCode: "GY-abc12345" };

  it("liga o cartão pela reserva via confirmationCode", async () => {
    request.mockResolvedValueOnce({ _id: "m1", status: "ACTIVE" });
    await createGuestPaymentMethod(input);
    expect(request).toHaveBeenCalledWith("POST", "/v1/payment-methods", {
      body: { guestId: "guest-1", paymentProviderId: "prov-1", confirmationCode: "GY-abc12345", stripeCardToken: "pm_1", reuse: true },
    });
  });

  it("4xx: vai pelo endpoint antigo com o skipSetupIntent de sempre", async () => {
    request.mockRejectedValueOnce(refused(400)).mockResolvedValueOnce({});
    await createGuestPaymentMethod(input);
    expect(request).toHaveBeenLastCalledWith("POST", "/v1/guests/guest-1/payment-methods", {
      body: { stripeCardToken: "pm_1", paymentProviderId: "prov-1", reservationId: RES, reuse: true, skipSetupIntent: true },
    });
  });

  it("sem código de confirmação usa o antigo enquanto existe", async () => {
    request.mockResolvedValueOnce({});
    await createGuestPaymentMethod({ ...input, confirmationCode: null });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toBe("/v1/guests/guest-1/payment-methods");
  });
});

describe("hasOverlappingReservation (GET /v1/reservations-v3/search)", () => {
  it("filtra casa, datas que se cruzam e estado", async () => {
    request.mockResolvedValueOnce({ results: [], pagination: { hasMore: false } });
    await expect(hasOverlappingReservation("listing-1", "2027-01-10", "2027-01-15")).resolves.toBe(false);
    expect(request).toHaveBeenCalledWith("GET", "/v1/reservations-v3/search", {
      query: {
        "filter[listingId]": "listing-1",
        "filter[checkIn][lt]": "2027-01-15",
        "filter[checkOut][gt]": "2027-01-10",
        "filter[status]": "confirmed,reserved",
        limit: 1,
        skip: 0,
      },
    });
  });

  it("uma reserva que se cruza conta", async () => {
    request.mockResolvedValueOnce({ results: [{ reservationId: "r" }] });
    await expect(hasOverlappingReservation("listing-1", "2027-01-10", "2027-01-15")).resolves.toBe(true);
  });

  it("resposta sem results: pesquisa pelo antigo", async () => {
    request.mockResolvedValueOnce({}).mockResolvedValueOnce({ results: [] });
    await expect(hasOverlappingReservation("listing-1", "2027-01-10", "2027-01-15")).resolves.toBe(false);
    expect(request.mock.calls[1][1]).toBe("/v1/reservations");
  });
});

describe("parseGuestyWebhook", () => {
  it("v2: id, estado e casa vêm do data magro; o nome perde o .v2", () => {
    expect(
      parseGuestyWebhook({
        event: "reservation.updated.v2",
        data: { reservationId: RES, status: "canceled", unitId: "listing-1", stay: [{ unitId: "listing-1" }] },
        meta: { subType: "CANCELED", changedFields: ["status"] },
      }),
    ).toMatchObject({ eventType: "reservation.updated", reservationId: RES, listingId: "listing-1", guestyStatus: "canceled" });
  });

  it("v2 created passa a reservation.created", () => {
    expect(parseGuestyWebhook({ event: "reservation.created.v2", data: { reservationId: RES, lastStayListingId: "l-2" } }))
      .toMatchObject({ eventType: "reservation.created", listingId: "l-2", reservationId: RES });
  });

  it("antigo: reservation.new conta como reservation.created e lê a reserva inteira", () => {
    expect(
      parseGuestyWebhook({ event: "reservation.new", data: { reservation: { _id: RES, listingId: "listing-1", status: "Confirmed" } } }),
    ).toMatchObject({ eventType: "reservation.created", reservationId: RES, listingId: "listing-1", guestyStatus: "confirmed" });
  });

  it("antigo updated mantém o nome", () => {
    expect(parseGuestyWebhook({ event: "reservation.updated", data: { reservation: { _id: RES, listingId: "l" } } }).eventType)
      .toBe("reservation.updated");
  });
});
