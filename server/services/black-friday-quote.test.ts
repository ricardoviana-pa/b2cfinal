import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  properties: vi.fn(),
  create: vi.fn(),
  apply: vi.fn(),
  hidden: vi.fn(() => false),
}));
vi.mock("./properties-store", () => ({
  getPropertiesForSite: h.properties, isHiddenFromCatalog: h.hidden,
}));
vi.mock("./guesty-booking", () => ({
  createBEQuote: h.create, applyCouponToBEQuote: h.apply,
}));
vi.mock("../../shared/partnerHome", () => ({ isPartnerHome: (p: any) => p.source === "partner" }));

import { blackFridayPublicQuote, eligibleBlackFridayListing } from "./black-friday-quote";

const stay = { listingId: "own", checkIn: "2027-05-03", checkOut: "2027-05-09", guests: 2 };
const quote = (total: number) => ({
  quoteId: "a".repeat(24), listingId: "own", checkIn: stay.checkIn, checkOut: stay.checkOut,
  nights: 6, currency: "EUR", ratePlanId: "flex", total,
  pricing: { nightlyRate: total / 6, totalNights: total, cleaningFee: 0, taxesAndFees: 0 },
  ratePlanOptions: [{ ratePlanId: "flex", total, nightlyRate: total / 6, cleaningFee: 0, taxesAndFees: 0 }],
});
describe("Black Friday direct Guesty quotes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    vi.stubEnv("BLACK_FRIDAY_2026_AUTO_COUPON", "true");
    h.properties.mockReset().mockResolvedValue([{ guestyId: "own", isActive: true, isPortfolio: false }]);
    h.create.mockReset().mockResolvedValue(quote(2000));
    h.apply.mockReset().mockResolvedValue({ ...quote(1700), coupons: [{ code: "PABF15GERAL26" }] });
    h.hidden.mockReturnValue(false);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("rejects partner, portfolio, hidden and disabled homes", () => {
    expect(eligibleBlackFridayListing({ guestyId: "own", source: "partner" }, "own")).toBe(false);
    expect(eligibleBlackFridayListing({ guestyId: "own", isPortfolio: true }, "own")).toBe(false);
    expect(eligibleBlackFridayListing({ guestyId: "own", isActive: false }, "own")).toBe(false);
    h.hidden.mockReturnValue(true);
    expect(eligibleBlackFridayListing({ guestyId: "own" }, "own")).toBe(false);
  });

  // Aplicação automática desligada a 24 nov 2026 (o hóspede escreve o código).
  it.skip("creates a private quote and applies Guesty's price, not browser arithmetic", async () => {
    const result = await blackFridayPublicQuote(stay);
    expect(result?.couponCode).toBe("PABF15GERAL26");
    expect(result?.pricing.total).toBe(1700);
    expect(h.create).toHaveBeenCalledWith({ ...stay, fresh: true });
    expect(h.apply).toHaveBeenCalledWith({ ...stay, quoteId: "a".repeat(24), coupons: ["PABF15GERAL26"] });
  });

  it("never applies the public code on its own, even with the old env on", async () => {
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    expect(await blackFridayPublicQuote(stay)).toBeNull();
    expect(h.apply).not.toHaveBeenCalled();
  });

  it("does not touch Guesty before the public launch", async () => {
    vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
    expect(await blackFridayPublicQuote(stay)).toBeNull();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("does not offer campaign pricing for partner inventory", async () => {
    h.properties.mockResolvedValue([{ guestyId: "own", source: "partner" }]);
    expect(await blackFridayPublicQuote(stay)).toBeNull();
    expect(h.create).not.toHaveBeenCalled();
  });

  // Aplicação automática desligada a 24 nov 2026 (o hóspede escreve o código).
  it.skip("fails closed when Guesty does not confirm the coupon", async () => {
    h.apply.mockResolvedValue({ ...quote(2000), coupons: [] });
    await expect(blackFridayPublicQuote(stay)).rejects.toThrow(/could not be confirmed/);
  });

  // Aplicação automática desligada a 24 nov 2026 (o hóspede escreve o código).
  it.skip("fails closed if an unrelated cheaper tariff masks an unchanged chosen tariff", async () => {
    h.apply.mockResolvedValue({
      ...quote(2000), coupons: [{ code: "PABF15GERAL26" }],
      ratePlanOptions: [
        { ...quote(2000).ratePlanOptions[0], total: 2000 },
        { ...quote(1600).ratePlanOptions[0], ratePlanId: "nonrefundable" },
      ],
    });
    await expect(blackFridayPublicQuote(stay)).rejects.toThrow(/could not be confirmed/);
  });
});
