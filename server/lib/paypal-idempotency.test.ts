import { describe, it, expect, vi } from "vitest";

/** In-memory fake of the Stripe PaymentIntent metadata store (the cross-process idempotency store). */
function fakeStripePort(initial: Record<string, string> = {}) {
  const store: Record<string, Record<string, string>> = {};
  return {
    seed: (piId: string, meta: Record<string, string>) => {
      store[piId] = { ...meta };
    },
    read: (piId: string) => store[piId] ?? {},
    port: {
      getMetadata: async (piId: string) => ({ ...(store[piId] ?? initial) }),
      setMetadata: async (piId: string, partial: Record<string, string>) => {
        store[piId] = { ...(store[piId] ?? {}), ...partial };
      },
    },
  };
}

describe("claimOrAwaitReservation", () => {
  it("calls createFn exactly once when two callers use the same PI id", async () => {
    const { claimOrAwaitReservation } = await import("./paypal-idempotency");
    const piId = "pi_race_test_" + Date.now();

    const createFn = vi.fn().mockResolvedValue({
      reservationId: "res_abc",
      confirmationCode: "PA-001",
      status: "confirmed",
    });

    // Simulate webhook and confirmPayPalBooking firing concurrently
    const [r1, r2] = await Promise.all([
      claimOrAwaitReservation(piId, createFn),
      claimOrAwaitReservation(piId, createFn),
    ]);

    expect(createFn).toHaveBeenCalledTimes(1);
    expect(r1.reservationId).toBe("res_abc");
    expect(r2.reservationId).toBe("res_abc");
  });

  it("both callers get the same reservation result", async () => {
    const { claimOrAwaitReservation } = await import("./paypal-idempotency");
    const piId = "pi_same_result_" + Date.now();

    const createFn = vi.fn().mockResolvedValue({
      reservationId: "res_xyz",
      confirmationCode: "PA-002",
      status: "confirmed",
    });

    const r1 = await claimOrAwaitReservation(piId, createFn);
    const r2 = await claimOrAwaitReservation(piId, createFn);

    expect(r1).toEqual(r2);
    expect(createFn).toHaveBeenCalledTimes(1);
  });

  it("calls createFn independently for different PI ids", async () => {
    const { claimOrAwaitReservation } = await import("./paypal-idempotency");

    const createFn = vi.fn().mockResolvedValue({
      reservationId: "res_multi",
      confirmationCode: "PA-003",
      status: "confirmed",
    });

    await Promise.all([
      claimOrAwaitReservation("pi_a_" + Date.now(), createFn),
      claimOrAwaitReservation("pi_b_" + Date.now(), createFn),
    ]);

    expect(createFn).toHaveBeenCalledTimes(2);
  });
});

describe("getOrCreateReservation", () => {
  const reservation = { reservationId: "res_real", confirmationCode: "GY-001", status: "confirmed" };

  it("creates the reservation, stamps PI metadata, and records payment once", async () => {
    const { getOrCreateReservation } = await import("./paypal-idempotency");
    const stripe = fakeStripePort();
    const createReservation = vi.fn().mockResolvedValue(reservation);
    const recordPayment = vi.fn().mockResolvedValue(undefined);
    const piId = "pi_create_" + Date.now();

    const result = await getOrCreateReservation(piId, stripe.port, { createReservation, recordPayment });

    expect(result).toEqual(reservation);
    expect(createReservation).toHaveBeenCalledTimes(1);
    expect(recordPayment).toHaveBeenCalledTimes(1);
    expect(recordPayment).toHaveBeenCalledWith("res_real");
    expect(stripe.read(piId).guestyReservationId).toBe("res_real");
    expect(stripe.read(piId).guestyPaymentRecorded).toBe("true");
  });

  it("skips creation when the PI metadata already has a reservation (other path won)", async () => {
    const { getOrCreateReservation } = await import("./paypal-idempotency");
    const stripe = fakeStripePort();
    const piId = "pi_existing_" + Date.now();
    stripe.seed(piId, {
      guestyReservationId: "res_already",
      guestyConfirmationCode: "GY-already",
      guestyStatus: "confirmed",
      guestyPaymentRecorded: "true",
    });
    const createReservation = vi.fn();
    const recordPayment = vi.fn();

    const result = await getOrCreateReservation(piId, stripe.port, { createReservation, recordPayment });

    expect(result.reservationId).toBe("res_already");
    expect(createReservation).not.toHaveBeenCalled();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("records the payment if the reservation exists but payment was not yet recorded", async () => {
    const { getOrCreateReservation } = await import("./paypal-idempotency");
    const stripe = fakeStripePort();
    const piId = "pi_pay_only_" + Date.now();
    stripe.seed(piId, { guestyReservationId: "res_paylater", guestyConfirmationCode: "GY-x", guestyStatus: "confirmed" });
    const createReservation = vi.fn();
    const recordPayment = vi.fn().mockResolvedValue(undefined);

    await getOrCreateReservation(piId, stripe.port, { createReservation, recordPayment });

    expect(createReservation).not.toHaveBeenCalled();
    expect(recordPayment).toHaveBeenCalledWith("res_paylater");
    expect(stripe.read(piId).guestyPaymentRecorded).toBe("true");
  });

  it("resolves a 'listing not available' create conflict to the reservation a racing instance created", async () => {
    const { getOrCreateReservation } = await import("./paypal-idempotency");
    const stripe = fakeStripePort();
    const piId = "pi_conflict_" + Date.now();
    const createReservation = vi.fn().mockImplementation(async () => {
      // Simulate the racing instance stamping metadata just before our create is rejected.
      stripe.seed(piId, { guestyReservationId: "res_raced", guestyConfirmationCode: "GY-raced", guestyStatus: "confirmed" });
      const err: any = new Error("Guesty request failed (400)");
      err.status = 400;
      err.details = { error: { message: "Listing is not available or is not active" } };
      throw err;
    });
    const recordPayment = vi.fn().mockResolvedValue(undefined);

    const result = await getOrCreateReservation(piId, stripe.port, { createReservation, recordPayment });

    expect(result.reservationId).toBe("res_raced");
  });
});
