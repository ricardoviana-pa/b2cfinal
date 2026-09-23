import { describe, expect, it } from "vitest";
import { describeGuestyError, isRequestOnlyError } from "./guesty";

describe("Guesty quote errors", () => {
  it("never logs [object Object]", () => {
    const err = { message: { code: "LISTING_NOT_BOOKABLE" }, status: 400, details: { reason: "no rate plan" } };
    const out = describeGuestyError(err);
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("HTTP 400");
    expect(out).toContain("no rate plan");
  });

  it("keeps plain messages readable", () => {
    expect(describeGuestyError(new Error("be_quote_timeout"))).toBe("be_quote_timeout");
  });

  it("recognises request-to-book listings", () => {
    expect(isRequestOnlyError("This property is only available by request for the selected dates.")).toBe(true);
    expect(isRequestOnlyError("This property is not available for the selected dates.")).toBe(false);
  });
});
