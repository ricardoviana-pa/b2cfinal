import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../lib/guesty", () => ({ guestyBEClient: { request: (...args: unknown[]) => request(...args) } }));

import { applyCouponToBEQuote } from "./guesty-booking";

const QUOTE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const input = { quoteId: QUOTE_ID, listingId: "synthetic-home", checkIn: "2099-11-13", checkOut: "2099-11-16" };

// The shape the trusted checkout already reads with GET /api/reservations/quotes/{id}.
const quote = (subTotalPrice: number, coupons: unknown[] = []) => ({
  _id: QUOTE_ID,
  unitTypeId: "synthetic-home",
  coupons,
  rates: {
    ratePlans: [
      { ratePlan: { _id: "nonref", name: "Não Reembolsável", money: { currency: "EUR", subTotalPrice, fareCleaning: 457.7 } } },
    ],
  },
});
const pa2027 = { code: "PA2027", type: "percentage", adjustment: -10 };

beforeEach(() => request.mockReset());

describe("applyCouponToBEQuote", () => {
  it("reads the quote back when the POST response has no rate plans (the production bug)", async () => {
    request.mockResolvedValueOnce({ coupons: [pa2027] }).mockResolvedValueOnce(quote(1342.58, [pa2027]));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["PA2027"] });
    expect(request.mock.calls[0][0]).toBe("POST");
    expect(request.mock.calls[1]).toEqual(["GET", `/api/reservations/quotes/${QUOTE_ID}`]);
    expect(r.total).toBeCloseTo(1342.58, 2);
    expect(r.coupons).toEqual([pa2027]);
  });

  it("always prices from the re-read quote, even when the POST response carries rate plans", async () => {
    request.mockResolvedValueOnce(quote(9999, [pa2027])).mockResolvedValueOnce(quote(1342.58, [pa2027]));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["PA2027"] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(r.total).toBeCloseTo(1342.58, 2);
  });

  it("takes the applied codes only from the re-read quote", async () => {
    request.mockResolvedValueOnce({ coupons: [pa2027] }).mockResolvedValueOnce(quote(1440.9, []));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["PA2027"] });
    expect(r.coupons).toEqual([]);
    expect(r.total).toBeCloseTo(1440.9, 2);
  });

  it("keeps an unknown code as INVALID_COUPON, not a server error", async () => {
    request.mockRejectedValueOnce(Object.assign(new Error("Bad Request"), { status: 400, details: { message: "coupon not found" } }));
    await expect(applyCouponToBEQuote({ ...input, coupons: ["ZZTESTE99"] })).rejects.toThrow("INVALID_COUPON");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("removes the code with an empty list and returns the full price", async () => {
    request.mockResolvedValueOnce({}).mockResolvedValueOnce(quote(1440.9));
    const r = await applyCouponToBEQuote({ ...input, coupons: [] });
    expect(request.mock.calls[0][2]).toEqual({ body: { coupons: [] } });
    expect(r.total).toBeCloseTo(1440.9, 2);
    expect(r.coupons).toEqual([]);
  });

  it("fails cleanly when the quote cannot be read back", async () => {
    request.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error("Service Unavailable"), { status: 503 }));
    await expect(applyCouponToBEQuote({ ...input, coupons: ["PA2027"] })).rejects.toThrow("Unable to apply the promo code.");
  });

  it("reports the code the guest typed, not Guesty's internal coupon name", async () => {
    const named = { name: "PA2027 outras datas verao 2027", type: "percentage", adjustment: -10 };
    request.mockResolvedValueOnce({}).mockResolvedValueOnce(quote(1342.58, [named]));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["pa2027"] });
    expect(r.coupons).toEqual([{ code: "PA2027", type: "percentage", adjustment: -10 }]);
  });

  it("uses the typed code when the single coupon's name does not contain it", async () => {
    request.mockResolvedValueOnce({}).mockResolvedValueOnce(quote(1368.9, [{ name: "Portugal Active 5%", type: "percentage" }]));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["PORTUGALACTIVE5"] });
    expect(r.coupons.map((c) => c.code)).toEqual(["PORTUGALACTIVE5"]);
    expect(r.coupons[0].code).toMatch(/^[A-Za-z0-9_-]{0,40}$/);
  });
});
