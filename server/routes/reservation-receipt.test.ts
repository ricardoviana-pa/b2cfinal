import express from "express";
import { createServer, type Server } from "node:http";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ reservation: vi.fn(), paid: vi.fn(), listing: vi.fn() }));
vi.mock("../lib/guesty", () => ({
  guestyClient: { getReservation: fake.reservation, getListing: fake.listing },
  GuestyClientError: class extends Error {}, resetGuestyRateLimitCooldowns: vi.fn(),
}));
vi.mock("../db", () => ({ updateTripStatusByReservationId: vi.fn() }));
vi.mock("../services/properties-store", () => ({ getPropertiesForSite: vi.fn(async () => []) }));
vi.mock("../services/transactional-email", () => ({ sendBookingFailureAlert: vi.fn() }));
vi.mock("../services/reservation-receipt", () => ({ readReservationPaidCents: fake.paid }));
import { registerBookingRoutes } from "./booking";

let server: Server, origin: string;
beforeAll(async () => {
  const app = express(); registerBookingRoutes(app); server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  fake.reservation.mockResolvedValue({ _id: "synthetic-receipt", confirmationCode: "TEST-ONLY",
    checkInDateLocalized: "2099-11-10", checkOutDateLocalized: "2099-11-18",
    status: "confirmed", money: { total: 2888.87, totalPaid: 2888.87, hostPayout: 2000,
      fareAccommodation: 2541.60, fareCleaning: 347.27, currency: "EUR" } });
  fake.paid.mockResolvedValue(288887);
  // As notas de entrada do Guesty podem ter códigos de porta: nunca saem.
  fake.listing.mockResolvedValue({ _id: "synthetic-listing", title: "Synthetic Villa",
    checkInInstructions: { primaryCheckIn: "lockbox", notes: "Key safe code 4321" } });
});

it("returns exact reservation and paid amounts with non-cacheable headers", async () => {
  const response = await fetch(`${origin}/api/reservations/synthetic-receipt`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(await response.json()).toMatchObject({ totalCents: 288887, totalPaidCents: 288887,
    accommodationCents: 254160, cleaningFeeCents: 34727, nights: 8 });
});
it("does not substitute an owner payout or a folio total when collection is unknown", async () => {
  fake.paid.mockResolvedValue(null);
  const response = await fetch(`${origin}/api/reservations/synthetic-receipt`);
  expect(await response.json()).toMatchObject({ totalCents: 288887, totalPaidCents: null,
    accommodationCents: null, cleaningFeeCents: null });
});
it("also prevents caching of the calendar download", async () => {
  const response = await fetch(`${origin}/api/reservations/synthetic-receipt/ics`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).toContain("DTSTART;VALUE=DATE:20991110");
});
it("never returns the listing's check-in instructions and masks the guest's contacts", async () => {
  fake.reservation.mockResolvedValue({ _id: "synthetic-receipt", listingId: "synthetic-listing",
    checkInDateLocalized: "2099-11-10", checkOutDateLocalized: "2099-11-18", status: "confirmed",
    guest: { firstName: "Ana", lastName: "Silva", email: "ana.silva@example.com", phone: "+351 912 345 678" },
    money: { total: 100, currency: "EUR" } });
  const response = await fetch(`${origin}/api/reservations/synthetic-receipt`);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain("4321");
  expect(body).not.toHaveProperty("checkInInstructions");
  expect(body).toMatchObject({ listingName: "Synthetic Villa", guestName: "Ana Silva",
    guestEmail: "a•••@example.com", guestPhone: "••• 678" });
});
it("the public listing route never returns check-in instructions", async () => {
  const response = await fetch(`${origin}/api/listings/synthetic-listing`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain("4321");
  expect(body).not.toHaveProperty("checkInInstructions");
  expect(body).toMatchObject({ id: "synthetic-listing", name: "Synthetic Villa" });
});
it("the public calendar route refuses spans over 400 days or reversed ranges (memory)", async () => {
  const long = await fetch(`${origin}/api/listings/synthetic-listing/calendar?from=2027-01-01&to=2029-01-01`);
  expect(long.status).toBe(400);
  const reversed = await fetch(`${origin}/api/listings/synthetic-listing/calendar?from=2027-02-01&to=2027-01-01`);
  expect(reversed.status).toBe(400);
});
