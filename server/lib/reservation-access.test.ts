import { describe, expect, it } from "vitest";
import { reservationAccessToken, hasReservationAccess } from "./reservation-access";
const secret = "synthetic-receipt-signing-secret-only-32";
describe("reservation access proof", () => {
  it("is scoped to one reservation and rejects a different signing key", () => {
    const token = reservationAccessToken("synthetic-reservation", secret);
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(hasReservationAccess("synthetic-reservation", token, secret)).toBe(true);
    expect(hasReservationAccess("another-reservation", token, secret)).toBe(false);
    expect(hasReservationAccess("synthetic-reservation", token, secret + "-rotated")).toBe(false);
  });
  it.each([undefined, "", "short", "x".repeat(43), ["x".repeat(43)]])("rejects missing or invalid proof %j", token => {
    expect(hasReservationAccess("synthetic-reservation", token, secret)).toBe(false);
  });
  it("fails closed without a configured signing key", () => {
    expect(reservationAccessToken("synthetic-reservation", "")).toBe("");
    expect(reservationAccessToken("synthetic-reservation", "short")).toBe("");
    expect(reservationAccessToken("../unexpected", secret)).toBe("");
  });
});
