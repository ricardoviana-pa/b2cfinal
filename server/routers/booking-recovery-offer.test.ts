import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  intent: vi.fn(), quote: vi.fn(), coupon: vi.fn(), ordinaryQuote: vi.fn(),
  save: vi.fn(), trusted: vi.fn(),
}));
vi.mock("../db", async (load) => ({
  ...await load<typeof import("../db")>(), getBookingIntent: mock.intent, updateBookingIntent: mock.save,
}));
vi.mock("../services/guesty", async (load) => ({
  ...await load<typeof import("../services/guesty")>(), getQuoteWithDeadline: mock.ordinaryQuote,
}));
vi.mock("../services/guesty-booking", async (load) => ({
  ...await load<typeof import("../services/guesty-booking")>(),
  createBEQuote: mock.quote, applyCouponToBEQuote: mock.coupon,
}));
vi.mock("../services/trusted-checkout-quote", async (load) => ({
  ...await load<typeof import("../services/trusted-checkout-quote")>(), trustedStayQuote: mock.trusted,
}));
import { bookingRouter } from "./booking";
import { checkoutRouter } from "./checkout";
import { recoveryQuoteProof, verifiesRecoveryQuoteProof } from "../services/recovery-funnel";

const caller = () => bookingRouter.createCaller({ req: { headers: {} }, user: null } as any);
const stay = { listingId: "listing-1", checkIn: "2099-11-10", checkOut: "2099-11-18", guests: 2 };
const id = "23111111-1111-4111-8111-111111111111";
const hour = 3_600_000;

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("recovery offer price refresh", () => {
  it("at hour 30 it reprices the original stay and reapplies the discount without exposing its code", async () => {
    const until = new Date(Date.now() + 18 * hour);
    vi.stubEnv("RECOVERY_DISCOUNT_COUPON", "PORTUGALACTIVE5");
    mock.intent.mockResolvedValue({
      ...stay, id, status: "contact_captured", ratePlanId: "flex",
      expiresAt: new Date(Date.now() - 7 * hour),
      discountGiftUntil: until,
    });
    const quote = {
      ...stay, quoteId: "111111111111111111111111", ratePlanId: "flex", total: 1500,
      pricing: { nightlyRate: 180, totalNights: 1440, cleaningFee: 60, taxesAndFees: 0 },
      ratePlanOptions: [{ ratePlanId: "flex", total: 1500 }],
    };
    mock.quote.mockResolvedValue(quote);
    mock.coupon.mockResolvedValue({
      ...quote, total: 1425, coupons: [{ code: "PORTUGALACTIVE5", supplierReference: "Portugal Active 5%" }],
      ratePlanOptions: [{ ratePlanId: "flex", total: 1425 }],
    });
    const refreshed = await caller().getQuote({ ...stay, recoveryIntentId: id });
    expect(mock.quote).toHaveBeenCalledWith(expect.objectContaining({ fresh: true }));
    expect(mock.coupon).toHaveBeenCalledWith(expect.objectContaining({ coupons: ["PORTUGALACTIVE5"] }));
    expect(refreshed.pricing.total).toBe(1425);
    expect(refreshed).not.toHaveProperty("coupons");
    const proof = "recoveryProof" in refreshed ? refreshed.recoveryProof : undefined;
    expect(verifiesRecoveryQuoteProof(proof, id, quote.quoteId, until, "Portugal Active 5%")).toBe(true);
    expect(verifiesRecoveryQuoteProof(proof, id, "222222222222222222222222", until, "Portugal Active 5%")).toBe(false);
  });

  it.each(["expired", "different stay"])("uses the ordinary quote when the offer is %s", async (mode) => {
    vi.stubEnv("RECOVERY_DISCOUNT_COUPON", "PORTUGALACTIVE5");
    mock.intent.mockResolvedValue({
      ...stay, status: "contact_captured", guests: mode === "expired" ? 2 : 3,
      discountGiftUntil: new Date(Date.now() + (mode === "expired" ? -hour : hour)),
    });
    mock.ordinaryQuote.mockResolvedValue({ pricing: { total: 1500 } });
    expect((await caller().getQuote({ ...stay, recoveryIntentId: id })).pricing.total).toBe(1500);
    expect(mock.coupon).not.toHaveBeenCalled();
  });

  it("still accepts the shared code as a manual promo without issuing a recovery proof", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("RECOVERY_DISCOUNT_COUPON", "PORTUGALACTIVE5");
    mock.coupon.mockResolvedValue({ quoteId: "111111111111111111111111", coupons: [{ code: "PORTUGALACTIVE5" }], total: 1425 });
    const manual = await caller().applyCoupon({ ...stay, quoteId: "111111111111111111111111", coupon: "PORTUGALACTIVE5" });
    expect(manual).toMatchObject({ ok: true, total: 1425 });
    expect(manual).not.toHaveProperty("recoveryProof");
    expect(mock.coupon).toHaveBeenCalledWith(expect.objectContaining({ coupons: ["PORTUGALACTIVE5"] }));
  });
});

describe("checkout attribution with a shared Guesty coupon", () => {
  it.each(["manual", "recovery", "expired"])("stores the correct attribution for a %s quote", async (origin) => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("RECOVERY_DISCOUNT_COUPON", "PORTUGALACTIVE5");
    const quoteId = "222222222222222222222222";
    const until = new Date(Date.now() + (origin === "expired" ? -hour : hour));
    const supplierExpiry = new Date(Date.now() + 23 * hour);
    mock.intent.mockResolvedValue({
      ...stay, id, status: "contact_captured", guestyQuoteId: "111111111111111111111111",
      discountGiftUntil: until, quote: { couponCode: "PORTUGALACTIVE5", recoveryDiscountApplied: true },
    });
    mock.trusted.mockResolvedValue({
      expiresAt: supplierExpiry, ratePlanId: "flex", quote: { couponCode: "Portugal Active 5%", total: 1425 },
    });
    mock.save.mockResolvedValue(true);
    const checkout = checkoutRouter.createCaller({ req: { headers: {} }, res: {} as any, user: null } as any);
    const update = checkout.updateIntent({
      intentId: id, patch: {
        guestyQuoteId: quoteId,
        ...(origin !== "manual" ? { recoveryProof: recoveryQuoteProof(id, quoteId, until, "Portugal Active 5%") } : {}),
      },
    });
    if (origin === "expired") {
      await expect(update).rejects.toThrow("The recovery offer has expired");
      expect(mock.save).not.toHaveBeenCalled();
      return;
    }
    await expect(update).resolves.toEqual({ ok: true });
    const saved = mock.save.mock.calls[0][1];
    expect(saved).not.toHaveProperty("recoveryProof");
    expect(saved.expiresAt).toEqual(origin === "recovery" ? until : supplierExpiry);
    expect(saved.quote.couponCode).toBe("PORTUGALACTIVE5");
    expect(saved.quote.recoveryDiscountApplied).toBe(origin === "recovery" ? true : undefined);
  });
});
