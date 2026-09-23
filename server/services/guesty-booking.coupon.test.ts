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

beforeEach(() => request.mockReset());

describe("applyCouponToBEQuote", () => {
  it("uses the POST response when it already carries the quote", async () => {
    request.mockResolvedValueOnce(quote(1342.58, [{ code: "PA2027", type: "percentage", adjustment: -10 }]));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["PA2027"] });
    expect(r.total).toBeCloseTo(1342.58, 2);
    expect(r.coupons).toEqual([{ code: "PA2027", type: "percentage", adjustment: -10 }]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("POST");
  });

  it("reads the quote back when the POST response has no rate plans (the production bug)", async () => {
    request
      .mockResolvedValueOnce({ coupons: [{ code: "REPETIR27", type: "percentage", adjustment: -10 }] })
      .mockResolvedValueOnce(quote(1342.58));
    const r = await applyCouponToBEQuote({ ...input, coupons: ["REPETIR27"] });
    expect(request.mock.calls[1]).toEqual(["GET", `/api/reservations/quotes/${QUOTE_ID}`]);
    expect(r.total).toBeCloseTo(1342.58, 2);
    expect(r.coupons.map((c) => c.code)).toEqual(["REPETIR27"]);
  });

  it("unwraps a quote nested in the POST response", async () => {
    request.mockResolvedValueOnce({ quote: quote(1342.58) });
    const r = await applyCouponToBEQuote({ ...input, coupons: ["PA2027"] });
    expect(r.total).toBeCloseTo(1342.58, 2);
    expect(request).toHaveBeenCalledTimes(1);
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
});
