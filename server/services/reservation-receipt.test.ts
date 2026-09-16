import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ find: vi.fn(), payment: vi.fn() }));
vi.mock("../db", () => ({ getPaidBookingIntentByReservationId: fake.find }));
vi.mock("./stripe-klarna", () => ({ getPaymentIntent: fake.payment }));
import { readReservationPaidCents } from "./reservation-receipt";
import { reservationTotalCents, reservationPaidCents, reservationBreakdown } from "../lib/reservation-money";

const money = { total: 2888.87, totalPaid: 2888.87, hostPayout: 2120, currency: "EUR",
  fareAccommodation: 2541.60, fareCleaning: 347.27 };
const payment = { id: "pi_synthetic_receipt", status: "succeeded", currency: "eur",
  amount_received: 305887, metadata: { intentId: "synthetic-intent" } };
beforeEach(() => {
  vi.clearAllMocks();
  fake.find.mockResolvedValue({ id: "synthetic-intent", paymentIntentId: payment.id });
  fake.payment.mockResolvedValue(structuredClone(payment));
});

describe("reservation receipt amounts", () => {
  it("keeps the reservation price separate from owner proceeds and collected funds", () => {
    expect(reservationTotalCents(money)).toBe(288887);
    expect(reservationPaidCents({ ...money, totalPaid: 1000.01 })).toBe(100001);
    expect(reservationTotalCents({ hostPayout: 2120 })).toBeNull();
    expect(reservationPaidCents({ total: 2888.87, hostPayout: 2120 })).toBeNull();
  });
  it("reads the verified payment including services outside the Guesty folio", async () => {
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBe(305887);
    expect(fake.payment).toHaveBeenCalledWith("pi_synthetic_receipt", { timeout: 3000, maxNetworkRetries: 0 });
  });
  it("uses Guesty's collected amount for reservations without a website payment", async () => {
    fake.find.mockResolvedValue(null);
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBe(288887);
    expect(fake.payment).not.toHaveBeenCalled();
  });
  it.each([
    { ...payment, metadata: { intentId: "another-intent" } },
    { ...payment, id: "another-payment" },
    { ...payment, status: "processing" },
    { ...payment, currency: "usd" },
    { ...payment, amount_received: -1 },
    { ...payment, amount_received: 1.1 },
    { ...payment, amount_received: undefined },
  ])("does not label an unverified amount as paid (%j)", async value => {
    fake.payment.mockResolvedValue(value);
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBeNull();
  });
  it("accepts a provider reservation binding for an older wallet payment", async () => {
    fake.payment.mockResolvedValue({ ...payment, metadata: { guestyReservationId: "synthetic-reservation" } });
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBe(305887);
  });
  it("does not replace a missing website payment with the folio", async () => {
    fake.find.mockResolvedValue({ id: "synthetic-intent", paymentIntentId: null });
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBeNull();
    fake.find.mockRejectedValue(new Error("Ambiguous receipt payment"));
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBeNull();
    fake.find.mockResolvedValue({ id: "synthetic-intent", paymentIntentId: payment.id });
    fake.payment.mockRejectedValue(new Error("Unavailable"));
    expect(await readReservationPaidCents("synthetic-reservation", money)).toBeNull();
  });
  it("only presents a breakdown when its rows add up to the amount shown", () => {
    expect(reservationBreakdown(money, 288887)).toEqual({ accommodationCents: 254160, cleaningFeeCents: 34727 });
    expect(reservationBreakdown(money, 305887)).toEqual({ accommodationCents: null, cleaningFeeCents: null });
    expect(reservationBreakdown(money, null)).toEqual({ accommodationCents: null, cleaningFeeCents: null });
  });
  it.each([undefined, null, "", "invalid", -10, Infinity, NaN])("does not invent money from %s", value => {
    expect(reservationTotalCents({ total: value })).toBeNull();
    expect(reservationPaidCents({ totalPaid: value })).toBeNull();
  });
});
