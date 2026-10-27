import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ intents: vi.fn(), leads: vi.fn() }));
vi.mock("../db", () => ({ listUnpaidIntentsForExport: fake.intents, listLeadsForExport: fake.leads }));
import { LEADS_EXPORT_PATH, parseSince, registerLeadsExportRoute, verifyExportToken } from "./leads-export";

const TOKEN = "synthetic-export-token-0123456789";
const intent = (patch: Record<string, unknown>) => ({
  id: "11111111-1111-4111-8111-111111111111",
  listingId: "synthetic-listing",
  propertyName: "Synthetic House",
  propertySlug: "synthetic-house",
  destination: "Viana do Castelo",
  guestyQuoteId: "q1",
  checkIn: "2026-11-10",
  checkOut: "2026-11-14",
  guests: 4,
  ratePlanId: "rp",
  ratePlanType: "flexible",
  email: "synthetic@example.test",
  guestFirstName: "Synthetic",
  guestLastName: "Guest",
  guestPhone: "+351 900 000 000",
  nif: "999999990",
  quote: { nightlyRate: 300, totalNights: 4, cleaningFee: 100, taxesAndFees: 0, total: 1300, nights: 4, currency: "EUR", quoteCreatedAt: null, ratePlanOptions: [] },
  extras: null,
  reception: null,
  flex: false,
  recoveryStage: 2,
  recoveryOptout: false,
  flexGiftUntil: null,
  conciergeAlerted: false,
  paymentIntentId: "pi_synthetic",
  status: "payment_pending",
  locale: "pt",
  reservationId: null,
  confirmationCode: null,
  createdAt: new Date("2026-09-24T09:00:00Z"),
  updatedAt: new Date("2026-09-24T09:30:00Z"),
  expiresAt: null,
  ...patch,
});
const lead = (patch: Record<string, unknown>) => ({
  id: 7,
  email: "form@example.test",
  name: "Form Guest",
  phone: "",
  message: "Do you have dates in November?",
  source: "contact-form",
  status: "new",
  metadata: { subject: "Reserva" },
  createdAt: new Date("2026-09-25T10:00:00Z"),
  updatedAt: new Date("2026-09-25T10:00:00Z"),
  ...patch,
});

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  registerLeadsExportRoute(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  process.env.SITE_EXPORT_TOKEN = TOKEN;
  fake.intents.mockResolvedValue([intent({}), intent({ id: "22222222-2222-4222-8222-222222222222", status: "paid" })]);
  fake.leads.mockResolvedValue([lead({}), lead({ id: 8, source: "newsletter" }), lead({ id: 9, source: "owners" })]);
});
afterEach(() => {
  delete process.env.SITE_EXPORT_TOKEN;
});
const request = (query = "", auth?: string) =>
  fetch(`${origin}${LEADS_EXPORT_PATH}${query}`, { headers: auth ? { Authorization: auth } : {} });

describe("GET /api/internal/leads-export", () => {
  it("answers 401 without a token, with a wrong token, and when the variable is not configured", async () => {
    expect((await request()).status).toBe(401);
    expect((await request("", `Bearer ${TOKEN.slice(0, -1)}x`)).status).toBe(401);
    expect((await request("", `Bearer ${TOKEN}extra`)).status).toBe(401);
    expect((await request("", TOKEN)).status).toBe(401);
    delete process.env.SITE_EXPORT_TOKEN;
    expect((await request("", `Bearer ${TOKEN}`)).status).toBe(401);
    expect(fake.intents).not.toHaveBeenCalled();
    expect(fake.leads).not.toHaveBeenCalled();
  });

  it("answers 200 with the token and only the fields the machine uses", async () => {
    const response = await request("?since=2026-09-12", `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.since).toBe("2026-09-12T00:00:00.000Z");
    expect(fake.intents).toHaveBeenCalledWith(new Date("2026-09-12T00:00:00Z"));
    expect(fake.leads).toHaveBeenCalledWith(new Date("2026-09-12T00:00:00Z"));
    expect(body.intents).toHaveLength(1);
    expect(Object.keys(body.intents[0]).sort()).toEqual([
      "checkIn", "checkOut", "conciergeAlerted", "createdAt", "email", "guestFirstName", "guestLastName",
      "guestPhone", "guests", "id", "listingId", "locale", "propertyName", "quote", "recoveryOptout",
      "recoveryStage", "reservationId", "status", "updatedAt",
    ]);
    expect(body.intents[0].quote).toEqual({ total: 1300 });
    expect(JSON.stringify(body)).not.toContain("999999990");
    expect(JSON.stringify(body)).not.toContain("pi_synthetic");
    expect(body.leads).toHaveLength(1);
    expect(body.leads[0]).toEqual({
      id: 7,
      email: "form@example.test",
      name: "Form Guest",
      phone: "",
      message: "Do you have dates in November?",
      source: "contact-form",
      status: "new",
      metadata: { subject: "Reserva" },
      createdAt: "2026-09-25T10:00:00.000Z",
    });
  });

  it("never returns a paid intent, a newsletter or an owners lead, even if the database did", async () => {
    fake.intents.mockResolvedValue([
      intent({ status: "paid" }),
      intent({ id: "33333333-3333-4333-8333-333333333333", status: "expired" }),
      intent({ id: "44444444-4444-4444-8444-444444444444", status: "contact_captured", email: null }),
    ]);
    fake.leads.mockResolvedValue([lead({ source: "newsletter" }), lead({ id: 8, source: "owners" }), lead({ id: 9, status: "archived" })]);
    const body = await (await request("", `Bearer ${TOKEN}`)).json();
    expect(body.intents).toEqual([]);
    expect(body.leads).toEqual([]);
  });

  it("defaults to the last 14 days and refuses a malformed since", async () => {
    const before = Date.now();
    const body = await (await request("", `Bearer ${TOKEN}`)).json();
    const since = new Date(body.since).getTime();
    expect(before - since).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000 - 1000);
    expect(before - since).toBeLessThan(14 * 24 * 60 * 60 * 1000 + 60_000);
    expect((await request("?since=yesterday", `Bearer ${TOKEN}`)).status).toBe(400);
    expect((await request("?since=2026-13-40", `Bearer ${TOKEN}`)).status).toBe(400);
  });
});

describe("helpers", () => {
  it("compares the token in constant time and refuses short or missing secrets", () => {
    expect(verifyExportToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(verifyExportToken(`bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(verifyExportToken(`Bearer ${TOKEN}`, "")).toBe(false);
    expect(verifyExportToken(`Bearer short`, "short")).toBe(false);
    expect(verifyExportToken(undefined, TOKEN)).toBe(false);
    expect(verifyExportToken(`Basic ${TOKEN}`, TOKEN)).toBe(false);
  });
  it("parses since as a UTC day", () => {
    expect(parseSince("2026-09-12")?.toISOString()).toBe("2026-09-12T00:00:00.000Z");
    expect(parseSince("")).toBeInstanceOf(Date);
    expect(parseSince("2026/09/12")).toBeNull();
    expect(parseSince(["2026-09-12"])).toBeNull();
  });
});
