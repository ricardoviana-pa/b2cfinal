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

  it("createReservationViaOpenApi calls POST /v1/reservations-v3 and extracts reservationId", async () => {
    // Real Guesty /v1/reservations-v3 response shape: { reservationId, quoteId, confirmationCode, status }
    (guestyClient.request as any).mockResolvedValueOnce({
      reservationId: "667bc9e0319654c49fde9aff",
      quoteId: "667bc383b119a5cd5f3bfbf6",
      confirmationCode: "GY-aJ3WEcJU",
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
    expect(result.reservationId).toBe("667bc9e0319654c49fde9aff");
    expect(result.confirmationCode).toBe("GY-aJ3WEcJU");
    expect(result.status).toBe("confirmed");
  });

  it("createReservationViaOpenApi falls back to _id when reservationId is absent", async () => {
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

    expect(result.reservationId).toBe("res_abc123");
  });

  it("createReservationViaOpenApi throws (never returns undefined id) when no id field present", async () => {
    (guestyClient.request as any).mockResolvedValueOnce({
      confirmationCode: "NO-ID",
      status: "confirmed",
    });

    const { createReservationViaOpenApi } = await import("../guesty-openapi-paypal");
    await expect(
      createReservationViaOpenApi({
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
      })
    ).rejects.toThrow(/reservation ID/i);
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

  it("recordExternalPayment reads balanceDue then POSTs the payment", async () => {
    (guestyClient.request as any)
      .mockResolvedValueOnce({ money: { balanceDue: 500.0 } }) // GET reservation
      .mockResolvedValueOnce({ _id: "payment_xyz" }); // POST payment

    const { recordExternalPayment } = await import("../guesty-openapi-paypal");
    await recordExternalPayment("res_abc123", 500.0, "EUR", "pi_test123");

    expect(guestyClient.request).toHaveBeenCalledWith(
      "POST",
      "/v1/reservations/res_abc123/payments",
      expect.objectContaining({
        body: expect.objectContaining({
          amount: 500.0,
          paymentMethod: { method: "OTHER" },
          // paidAt marks the payment as already collected so Guesty settles the balance
          paidAt: expect.any(String),
        }),
      })
    );
  });

  it("recordExternalPayment caps the recorded amount at the reservation balanceDue", async () => {
    // Guesty re-priced the reservation lower (€238.40) than what we charged (€260)
    (guestyClient.request as any)
      .mockResolvedValueOnce({ money: { balanceDue: 238.4 } }) // GET reservation
      .mockResolvedValueOnce({ _id: "payment_capped" }); // POST payment

    const { recordExternalPayment } = await import("../guesty-openapi-paypal");
    await recordExternalPayment("res_klarna", 260.0, "EUR", "pi_klarna");

    expect(guestyClient.request).toHaveBeenLastCalledWith(
      "POST",
      "/v1/reservations/res_klarna/payments",
      expect.objectContaining({ body: expect.objectContaining({ amount: 238.4 }) })
    );
  });

  it("recordExternalPayment skips POST when the balance is already settled", async () => {
    (guestyClient.request as any).mockResolvedValueOnce({ money: { balanceDue: 0 } }); // GET reservation

    const { recordExternalPayment } = await import("../guesty-openapi-paypal");
    await recordExternalPayment("res_paid", 260.0, "EUR", "pi_dup");

    // Only the GET happened — no payment POST
    expect(guestyClient.request).toHaveBeenCalledTimes(1);
    expect(guestyClient.request).not.toHaveBeenCalledWith(
      "POST",
      expect.stringContaining("/payments"),
      expect.anything()
    );
  });
});
