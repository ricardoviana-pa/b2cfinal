import { getPaidBookingIntentByReservationId } from "../db";
import { reservationPaidCents } from "../lib/reservation-money";
import { getPaymentIntent } from "./stripe-klarna";

/** Read-only: a saved payment includes services the reservation folio omits. */
export async function readReservationPaidCents(reservationId: string, money: any): Promise<number | null> {
  try {
    const intent = await getPaidBookingIntentByReservationId(reservationId);
    if (!intent) return reservationPaidCents(money);
    if (!intent.paymentIntentId) return null;
    const payment = await getPaymentIntent(intent.paymentIntentId, { timeout: 3000, maxNetworkRetries: 0 });
    const identityMatches = payment.metadata?.intentId === intent.id ||
      payment.metadata?.guestyReservationId === reservationId;
    if (!identityMatches || payment.id !== intent.paymentIntentId || payment.status !== "succeeded" ||
        payment.currency.toUpperCase() !== String(money?.currency || "EUR").toUpperCase() ||
        !Number.isSafeInteger(payment.amount_received) || payment.amount_received < 0) return null;
    return payment.amount_received;
  } catch {
    // A missing payment/provider response is not evidence that the guest paid
    // the folio balance. Leave it unconfirmed; never substitute owner proceeds.
    return null;
  }
}
