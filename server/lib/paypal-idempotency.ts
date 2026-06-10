type ReservationResult = { reservationId: string; confirmationCode: string; status: string };

const reservationPromises = new Map<string, Promise<ReservationResult>>();

/**
 * Ensures only one Guesty reservation is created per PayPal payment intent.
 *
 * Both the Stripe webhook and the confirmPayPalBooking tRPC procedure fire
 * simultaneously when a PayPal payment succeeds. This function ensures the
 * first caller runs createFn; subsequent callers with the same piId await
 * the same Promise instead of triggering a duplicate reservation.
 *
 * NOTE: this is in-memory and therefore PER-PROCESS only. Across multiple
 * Render instances or after a restart it provides no protection — that is why
 * `getOrCreateReservation` adds a cross-process guard on top of it.
 */
export function claimOrAwaitReservation(
  piId: string,
  createFn: () => Promise<ReservationResult>
): Promise<ReservationResult> {
  const existing = reservationPromises.get(piId);
  if (existing) return existing;

  const promise = createFn();
  reservationPromises.set(piId, promise);

  // Clean up after 10 minutes to prevent unbounded growth.
  setTimeout(() => reservationPromises.delete(piId), 10 * 60 * 1000);

  return promise;
}

/**
 * Minimal Stripe PaymentIntent accessor used as a cross-process idempotency store.
 * Both PayPal and Klarna run on the same Stripe account, so the PI metadata is
 * readable/writable from any instance.
 */
export interface StripeMetadataPort {
  getMetadata: (piId: string) => Promise<Record<string, string>>;
  setMetadata: (piId: string, partial: Record<string, string>) => Promise<void>;
}

const RESERVATION_ID_KEY = "guestyReservationId";
const CONFIRMATION_CODE_KEY = "guestyConfirmationCode";
const STATUS_KEY = "guestyStatus";
const PAYMENT_RECORDED_KEY = "guestyPaymentRecorded";

/** A Guesty "listing is not available / already reserved" error — i.e. someone already booked these dates. */
function isListingUnavailableConflict(err: any): boolean {
  if (!err) return false;
  if (err.status === 409) return true;
  const detailMessage =
    (typeof err.details === "object" && err.details?.error?.message) || "";
  const text = `${err.message || ""} ${detailMessage}`.toLowerCase();
  return text.includes("not available") || text.includes("already reserved") || text.includes("not active");
}

function reservationFromMetadata(meta: Record<string, string>): ReservationResult | null {
  if (!meta[RESERVATION_ID_KEY]) return null;
  return {
    reservationId: meta[RESERVATION_ID_KEY],
    confirmationCode: meta[CONFIRMATION_CODE_KEY] || "",
    status: meta[STATUS_KEY] || "confirmed",
  };
}

/**
 * Create the Guesty reservation AND record its payment exactly once per PaymentIntent,
 * even across separate processes/instances.
 *
 * Idempotency is layered:
 *   1. Stripe PI metadata (`guestyReservationId`) — shared across instances.
 *   2. `claimOrAwaitReservation` in-memory map — collapses concurrent calls in one process.
 *   3. Conflict recovery — if Guesty rejects the create because the dates are already
 *      booked (a racing instance won), we re-read the metadata and adopt that reservation.
 *
 * The payment is recorded behind the `guestyPaymentRecorded` flag so the webhook and the
 * return-page mutation don't each post a duplicate payment.
 */
export async function getOrCreateReservation(
  piId: string,
  stripe: StripeMetadataPort,
  ops: {
    createReservation: () => Promise<ReservationResult>;
    recordPayment: (reservationId: string) => Promise<void>;
  }
): Promise<ReservationResult> {
  const existingMeta = await stripe.getMetadata(piId).catch(() => ({} as Record<string, string>));
  const fromMeta = reservationFromMetadata(existingMeta);

  if (fromMeta) {
    // Another path already created the reservation. Make sure the payment is recorded too.
    if (existingMeta[PAYMENT_RECORDED_KEY] !== "true") {
      await recordPaymentOnce(piId, stripe, fromMeta.reservationId, ops.recordPayment);
    }
    return fromMeta;
  }

  const result = await claimOrAwaitReservation(piId, async () => {
    try {
      return await ops.createReservation();
    } catch (err: any) {
      if (isListingUnavailableConflict(err)) {
        // A racing instance likely created the reservation between our metadata read and now.
        const racedMeta = await stripe.getMetadata(piId).catch(() => ({} as Record<string, string>));
        const raced = reservationFromMetadata(racedMeta);
        if (raced) {
          console.warn(`[Reservation] Create conflict for ${piId} resolved to existing reservation ${raced.reservationId}`);
          return raced;
        }
      }
      throw err;
    }
  });

  // Persist for other instances. Best-effort: a failure here only weakens dedup, never the booking.
  await stripe
    .setMetadata(piId, {
      [RESERVATION_ID_KEY]: result.reservationId,
      [CONFIRMATION_CODE_KEY]: result.confirmationCode,
      [STATUS_KEY]: result.status,
    })
    .catch((e) => console.warn(`[Reservation] Failed to stamp PI ${piId} metadata: ${e?.message || e}`));

  await recordPaymentOnce(piId, stripe, result.reservationId, ops.recordPayment);

  return result;
}

async function recordPaymentOnce(
  piId: string,
  stripe: StripeMetadataPort,
  reservationId: string,
  recordPayment: (reservationId: string) => Promise<void>
): Promise<void> {
  try {
    await recordPayment(reservationId);
    await stripe
      .setMetadata(piId, { [PAYMENT_RECORDED_KEY]: "true" })
      .catch((e) => console.warn(`[Reservation] Failed to set ${PAYMENT_RECORDED_KEY} for ${piId}: ${e?.message || e}`));
  } catch (e: any) {
    console.warn(`[Reservation] recordPayment failed (non-blocking) for ${reservationId}: ${e?.message || e}`);
  }
}
