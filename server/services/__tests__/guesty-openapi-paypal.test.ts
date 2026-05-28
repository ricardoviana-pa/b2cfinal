import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/guesty", () => ({
  guestyClient: {
    request: vi.fn(),
  },
}));

import { guestyClient } from "../../lib/guesty";

describe("guesty-openapi-paypal service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createReservationViaOpenApi calls POST /v1/reservations-v3 and returns mapped result", async () => {
    (guestyClient.request as any).mockResolvedValueOnce({
      _id: "res_abc123",
      confirmationCode: "ABC-123",
      status: "confirmed",
    });

    const { createReservationViaOpenApi } = await import("../guesty-openapi-paypal");
    const result = await createReservationViaOpenApi({
      listingId: "listing123",
      checkIn: "2026-07-01",
      checkOut: "2026-07-08",
      guestFirstName: "John",
      guestLastName: "Doe",
      guestEmail: "john@example.com",
      numberOfAdults: 2,
      numberOfChildren: 0,
      numberOfInfants: 0,
      stripePaymentIntentId: "pi_test123",
    });

    expect(guestyClient.request).toHaveBeenCalledWith(
      "POST",
      "/v1/reservations-v3",
      expect.objectContaining({
        body: expect.objectContaining({ listingId: "listing123" }),
      })
    );
    expect(result.reservationId).toBe("res_abc123");
    expect(result.confirmationCode).toBe("ABC-123");
    expect(result.status).toBe("confirmed");
  });

  it("createReservationViaOpenApi includes guest phone when provided", async () => {
    (guestyClient.request as any).mockResolvedValueOnce({
      _id: "res_xyz",
      confirmationCode: "XYZ-456",
      status: "confirmed",
    });

    const { createReservationViaOpenApi } = await import("../guesty-openapi-paypal");
    await createReservationViaOpenApi({
      listingId: "listing456",
      checkIn: "2026-08-01",
      checkOut: "2026-08-07",
      guestFirstName: "Jane",
      guestLastName: "Smith",
      guestEmail: "jane@example.com",
      guestPhone: "+351912345678",
      numberOfAdults: 2,
      numberOfChildren: 1,
      numberOfInfants: 0,
      stripePaymentIntentId: "pi_test456",
    });

    expect(guestyClient.request).toHaveBeenCalledWith(
      "POST",
      "/v1/reservations-v3",
      expect.objectContaining({
        body: expect.objectContaining({
          guest: expect.objectContaining({
            phones: ["+351912345678"],
          }),
        }),
      })
    );
  });

  it("recordExternalPayment calls POST /v1/reservations/{id}/payments", async () => {
    (guestyClient.request as any).mockResolvedValueOnce({ _id: "payment_xyz" });

    const { recordExternalPayment } = await import("../guesty-openapi-paypal");
    await recordExternalPayment("res_abc123", 500.0, "EUR", "pi_test123");

    expect(guestyClient.request).toHaveBeenCalledWith(
      "POST",
      "/v1/reservations/res_abc123/payments",
      expect.objectContaining({
        body: expect.objectContaining({ amount: 500.0 }),
      })
    );
  });
});
