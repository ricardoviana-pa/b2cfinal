/**
 * O pedido de uma casa parceira leva sempre o valor, ou o motivo de não o ter
 * (13 nov 2026). Antes o total vinha só do browser: datas para lá do que a
 * Tripwix publicou, uma casa sem calendário ou um pedido enviado com a
 * cotação ainda a chegar davam um email à equipa com "—" e mais nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "3bac86ea-0000-4000-8000-000000000001";
const home = { slug: "casa-de-caiz", name: "Casa de Caiz", bookingMode: "request", source: "tripwix", supplierUid: UID, maxGuests: 10, minNights: 2, cleaningFee: 0, securityDeposit: 0, priceFrom: 795 };
const saved: any[] = [];
const sent: any[] = [];
const quote = vi.fn();
const calendar = vi.fn();

vi.mock("./db", () => ({
  createLead: async (row: any) => { saved.push(row); return { id: saved.length }; },
  updateLead: async () => {},
  getLeadById: async () => undefined,
  getSettingsByKeys: async () => new Map(),
  upsertSetting: async () => {},
}));
vi.mock("./services/properties-store", () => ({ getPropertiesForSite: async () => [home] }));
vi.mock("./services/transactional-email", () => ({
  sendPartnerRequestEmail: async (lead: any, channel: string) => { sent.push({ channel, metadata: { ...lead.metadata } }); return "email-id"; },
}));
vi.mock("./services/tripwix", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/tripwix")>()),
  getPartnerQuote: (...a: any[]) => quote(...a),
  getPartnerCalendar: (...a: any[]) => calendar(...a),
}));

const priced = (over: Record<string, unknown> = {}) => ({
  available: true, nights: 7, perNight: [], accommodation: 8427, cleaningFee: 0, total: 8427, securityDeposit: 0,
  feesKnown: false, unavailable: [], currency: "EUR", ...over,
});
const request = (metadata: Record<string, string>) => ({
  name: "Ana Teste", email: "ana@example.com", source: "partner-home-request",
  metadata: { property: "casa-de-caiz", guests: "4", locale: "en", ...metadata },
});
const create = async (metadata: Record<string, string>) => {
  const { createPartnerRequest } = await import("./services/partner-requests");
  await createPartnerRequest(request(metadata));
  return saved.at(-1).metadata as Record<string, string>;
};

beforeEach(() => { saved.length = 0; sent.length = 0; quote.mockReset(); calendar.mockReset(); });

describe("partner request: the value is worked out on the server", () => {
  it("the browser sent no total (quote still loading): the server's total goes in, marked as not seen by the guest", async () => {
    quote.mockResolvedValue(priced());
    const m = await create({ checkin: "2027-01-10", checkout: "2027-01-17", total: "—", quoteStatus: "unknown" });
    expect(m).toMatchObject({ total: "8427", totalSource: "server", quoteStatus: "partial", nights: "7" });
    expect(m.priceNote).toBeUndefined();
    expect(quote).toHaveBeenCalledWith(UID, "2027-01-10", "2027-01-17", expect.objectContaining({ guests: 4, minNights: 2 }));
    expect(sent.find(s => s.channel === "team")!.metadata.total).toBe("8427");
  });

  it("the guest saw a total: that one stays, and the site's current one goes beside it when they differ", async () => {
    quote.mockResolvedValue(priced({ total: 8600 }));
    const m = await create({ checkin: "2027-01-10", checkout: "2027-01-17", total: "8427", quoteStatus: "partial" });
    expect(m).toMatchObject({ total: "8427", totalSource: "shown", serverTotal: "8600", quoteStatus: "partial" });
    quote.mockResolvedValue(priced());
    expect((await create({ checkin: "2027-01-10", checkout: "2027-01-17", total: "8427" })).serverTotal).toBeUndefined();
  });

  it("nights taken at Tripwix: the total still goes, with the taken nights named", async () => {
    quote.mockResolvedValue(priced({ available: false, unavailable: ["2027-01-12", "2027-01-13"] }));
    const m = await create({ checkin: "2027-01-10", checkout: "2027-01-17" });
    expect(m).toMatchObject({ total: "8427", quoteStatus: "unavailable" });
    expect(m.priceNote).toContain("12/01/2027, 13/01/2027");
  });
});

describe("partner request: no value, and the team is told why", () => {
  it("dates after the last day Tripwix published", async () => {
    quote.mockResolvedValue(null);
    calendar.mockResolvedValue([
      { date: "2027-03-03", status: "available", price: 900 }, { date: "2027-03-04", status: "unavailable" },
      { date: "2027-03-05", status: "unknown" }, { date: "2027-03-06", status: "unknown" },
    ]);
    const m = await create({ checkin: "2027-07-10", checkout: "2027-07-17", total: "—" });
    expect(m).toMatchObject({ total: "—", quoteStatus: "unknown", fromPrice: "795" });
    expect(m.priceNote).toBe("A Tripwix só tem preços publicados para esta casa até 04/03/2027; estas datas ficam depois.");
  });

  it("a home with no calendar at Tripwix", async () => {
    quote.mockResolvedValue(null);
    calendar.mockResolvedValue(null);
    const m = await create({ checkin: "2027-07-10", checkout: "2027-07-17" });
    expect(m.total).toBe("—");
    expect(m.priceNote).toContain("não tem calendário publicado");
  });

  it("a night inside the published calendar with no price", async () => {
    quote.mockResolvedValue(null);
    calendar.mockResolvedValue([{ date: "2027-12-01", status: "available", price: 900 }]);
    expect((await create({ checkin: "2027-07-10", checkout: "2027-07-17" })).priceNote).toContain("Falta o preço de pelo menos uma noite");
  });

  it("no dates chosen: says so, and never asks for a quote", async () => {
    const m = await create({ checkin: "—", checkout: "—" });
    expect(m).toMatchObject({ total: "—", priceNote: "O hóspede não escolheu datas." });
    expect(quote).not.toHaveBeenCalled();
  });

  it("the calendar read throws: the request is still saved, with the total the guest saw", async () => {
    quote.mockRejectedValue(new Error("db down"));
    const m = await create({ checkin: "2027-01-10", checkout: "2027-01-17", total: "8427", quoteStatus: "partial" });
    expect(m).toMatchObject({ total: "8427", totalSource: "shown", quoteStatus: "partial" });
    expect(saved).toHaveLength(1);
  });
});
