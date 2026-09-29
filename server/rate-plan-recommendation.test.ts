import { describe, expect, it } from "vitest";
import { hasVerifiedRefundAdvantage } from "../client/src/lib/ratePlanRecommendation";

const plan = (id: string, code?: string) => ({
  ratePlanId: id,
  cancellationPolicy: code ? [code] : undefined,
});
const nr = plan("synthetic-non-refundable", "super_strict");
const flexible = plan("synthetic-flex", "flexible");
const moderate = plan("synthetic-moderate", "moderate");
const strict = plan("synthetic-strict", "strict");

describe("rate recommendations require a distinct verified refund benefit", () => {
  it("recommends a known open window against a known non-refundable alternative", () => {
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, nr],
        "2026-11-20",
        new Date("2026-09-28T10:00:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        nr,
        [moderate, nr],
        "2026-11-20",
        new Date("2026-09-28T10:00:00Z")
      )
    ).toBe(false);
  });

  it("does not endorse missing, unknown, conflicting or duplicate-only policies", () => {
    for (const unknown of [
      plan("u"),
      plan("u", "custom-flex"),
      { ratePlanId: "u", cancellationPolicy: ["moderate", "super_strict"] },
    ]) {
      expect(
        hasVerifiedRefundAdvantage(unknown, [unknown, nr], "2026-11-20")
      ).toBe(false);
      expect(
        hasVerifiedRefundAdvantage(moderate, [moderate, unknown], "2026-11-20")
      ).toBe(false);
    }
    expect(hasVerifiedRefundAdvantage(moderate, [moderate], "2026-11-20")).toBe(
      false
    );
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, plan("same-benefit", "moderate")],
        "2026-11-20"
      )
    ).toBe(false);
  });

  it("withholds a badge after expiry and throughout the ambiguous deadline day", () => {
    expect(
      hasVerifiedRefundAdvantage(
        strict,
        [strict, nr],
        "2026-11-20",
        new Date("2026-09-20T10:00:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        strict,
        [strict, nr],
        "2026-11-20",
        new Date("2026-09-21T00:00:00Z")
      )
    ).toBe(false);
    expect(
      hasVerifiedRefundAdvantage(
        strict,
        [strict, nr],
        "2026-11-20",
        new Date("2026-09-22T10:00:00Z")
      )
    ).toBe(false);
  });

  it("uses Lisbon calendar days across summer time and UTC midnight", () => {
    // The deadline is 2 July. It is already 2 July in Portugal at 23:30 UTC.
    expect(
      hasVerifiedRefundAdvantage(
        flexible,
        [flexible, nr],
        "2026-07-03",
        new Date("2026-07-01T22:30:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        flexible,
        [flexible, nr],
        "2026-07-03",
        new Date("2026-07-01T23:30:00Z")
      )
    ).toBe(false);
    // After the autumn clock change, subtracting a day remains a calendar operation.
    expect(
      hasVerifiedRefundAdvantage(
        flexible,
        [flexible, nr],
        "2026-10-27",
        new Date("2026-10-25T22:30:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        flexible,
        [flexible, nr],
        "2026-10-27",
        new Date("2026-10-26T00:00:00Z")
      )
    ).toBe(false);
  });

  it("rejects absent and invalid dates", () => {
    for (const date of [undefined, "", "2026-02-30", "not-a-date"]) {
      expect(hasVerifiedRefundAdvantage(moderate, [moderate, nr], date)).toBe(
        false
      );
    }
  });
});
