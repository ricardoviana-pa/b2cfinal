import { beforeEach, describe, expect, it, vi } from "vitest";

const guesty = vi.hoisted(() => ({
  getListingRatePlans: vi.fn(),
  request: vi.fn(),
}));
vi.mock("../lib/guesty", () => ({ guestyClient: guesty }));

import { reservationRatePlanPolicy, ratePlanPolicyFor } from "./rate-plan-policy";

// Shapes as Guesty returns them for our listings (synthetic ids).
const PLANS = {
  results: [
    { _id: "rp-nr", name: "Não-Reembolsável", cancellationPolicy: "super_strict", cancellationFee: 100 },
    { _id: "rp-mod", name: "Reembolsável Star Low 26/27", cancellationPolicy: "MODERATE", cancellationFee: 100 },
    { ratePlan: { _id: "rp-s60", name: "Reembolsável Premium High 26", cancellationPolicy: "STRICT_60" } },
    { _id: "rp-odd", name: "Reembolsável Especial" },
  ],
};

describe("the confirmation reads the policy from the booking's rate plan", () => {
  beforeEach(() => {
    guesty.getListingRatePlans.mockReset().mockResolvedValue(PLANS);
    guesty.request.mockReset();
  });

  it("uses ratePlanId from the reservation → the plan's Guesty code and name", async () => {
    const p = await reservationRatePlanPolicy("res-1", { ratePlanId: "rp-mod" }, "listing-a");
    expect(p).toEqual({ ratePlanId: "rp-mod", name: "Reembolsável Star Low 26/27", cancellationPolicy: ["MODERATE"] });
    expect(guesty.request).not.toHaveBeenCalled();
  });

  it("reads ratePlanId from the Open API reservation when the summary lacks it", async () => {
    guesty.request.mockResolvedValue({ ratePlanId: "rp-s60", listingId: "listing-b" });
    const p = await reservationRatePlanPolicy("res-2", {}, "");
    expect(guesty.request).toHaveBeenCalledWith("GET", "/v1/reservations/res-2", { query: { fields: "ratePlanId listingId" } });
    expect(p.cancellationPolicy).toEqual(["STRICT_60"]);
    expect(p.name).toBe("Reembolsável Premium High 26");
  });

  it("keeps a code the reservation already carries", async () => {
    const p = await reservationRatePlanPolicy("res-3", { cancellationPolicy: ["FIRM"], ratePlanId: "rp-mod" }, "listing-c");
    expect(p.cancellationPolicy).toEqual(["FIRM"]);
  });

  it("returns the name alone when the plan has no code — never a guessed rule", async () => {
    const p = await ratePlanPolicyFor("listing-d", "rp-odd");
    expect(p).toEqual({ ratePlanId: "rp-odd", name: "Reembolsável Especial", cancellationPolicy: [] });
  });

  it("returns nothing known when Guesty cannot answer", async () => {
    guesty.request.mockRejectedValue(new Error("404"));
    const p = await reservationRatePlanPolicy("res-4", {}, "listing-e");
    expect(p).toEqual({ ratePlanId: null, name: null, cancellationPolicy: [] });

    guesty.getListingRatePlans.mockRejectedValue(new Error("429"));
    const q = await reservationRatePlanPolicy("res-5", { ratePlanId: "rp-mod" }, "listing-f");
    expect(q).toEqual({ ratePlanId: "rp-mod", name: null, cancellationPolicy: [] });
  });
});
