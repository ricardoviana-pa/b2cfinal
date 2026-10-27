import { describe, expect, it } from "vitest";
import { hasVerifiedRefundAdvantage } from "../client/src/lib/ratePlanRecommendation";

const plan = (id: string, code?: string) => ({
  ratePlanId: id,
  cancellationPolicy: code ? [code] : undefined,
});
// Guesty's codes (shared/cancellationPolicy.ts): MODERATE free until 7 days
// before arrival, STRICT until 30, STRICT_60 until 60, 100 % after.
const nr = plan("synthetic-non-refundable", "super_strict");
const moderate = plan("synthetic-moderate", "moderate");
const strict = plan("synthetic-strict", "STRICT");
const strict60 = plan("synthetic-strict-60", "STRICT_60");

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
      // "flexible" is not a code our direct rates use: no rule is assumed
      plan("u", "flexible"),
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
    // Every refundable code refunds 100 % while open — no badge between them
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, strict],
        "2026-11-20",
        new Date("2026-09-28T10:00:00Z")
      )
    ).toBe(false);
  });

  it("withholds a badge after expiry and throughout the ambiguous deadline day", () => {
    // STRICT_60: last free day 21 Sep for a 20 Nov arrival
    expect(
      hasVerifiedRefundAdvantage(
        strict60,
        [strict60, nr],
        "2026-11-20",
        new Date("2026-09-20T10:00:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        strict60,
        [strict60, nr],
        "2026-11-20",
        new Date("2026-09-21T00:00:00Z")
      )
    ).toBe(false);
    expect(
      hasVerifiedRefundAdvantage(
        strict60,
        [strict60, nr],
        "2026-11-20",
        new Date("2026-09-22T10:00:00Z")
      )
    ).toBe(false);
    // STRICT: last free day 21 Oct for the same arrival
    expect(
      hasVerifiedRefundAdvantage(
        strict,
        [strict, nr],
        "2026-11-20",
        new Date("2026-10-20T10:00:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        strict,
        [strict, nr],
        "2026-11-20",
        new Date("2026-10-22T10:00:00Z")
      )
    ).toBe(false);
  });

  it("uses Lisbon calendar days across summer time and UTC midnight", () => {
    // MODERATE, arrival 9 July: the deadline is 2 July. It is already 2 July
    // in Portugal at 23:30 UTC.
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, nr],
        "2026-07-09",
        new Date("2026-07-01T22:30:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, nr],
        "2026-07-09",
        new Date("2026-07-01T23:30:00Z")
      )
    ).toBe(false);
    // After the autumn clock change, subtracting days remains a calendar operation.
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, nr],
        "2026-11-02",
        new Date("2026-10-25T22:30:00Z")
      )
    ).toBe(true);
    expect(
      hasVerifiedRefundAdvantage(
        moderate,
        [moderate, nr],
        "2026-11-02",
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
