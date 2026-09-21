import { guestyClient, GuestyClientError } from "../lib/guesty";
import { sendReservationAccessLink } from "./transactional-email";
import { canSendCustomerEmail } from "../lib/checkout-email";

/** Open API bookings may be absent from the Booking Engine summary endpoint. */
export async function readReservationForReceipt(id: string): Promise<any> {
  try { return await guestyClient.getReservation(id); }
  catch (error) {
    if (!(error instanceof GuestyClientError) || ![400, 404].includes(error.status)) throw error;
    return guestyClient.request("GET", `/v1/reservations/${encodeURIComponent(id)}`, {
      query: { fields: "_id confirmationCode status paymentStatus listingId listing checkInDateLocalized checkOutDateLocalized guestsCount guest money cancellationPolicy ratePlan" },
    });
  }
}

const sent = new Map<string, number>();
export async function requestReservationAccess(id: string, email: string, locale: string) {
  if (!canSendCustomerEmail() || !/^[a-f0-9]{24}$/i.test(id)) return;
  const now = Date.now();
  for (const [key, until] of sent) if (until <= now) sent.delete(key);
  const reservation = await readReservationForReceipt(id);
  const recipient = String(reservation?.guest?.email || "").trim();
  if (!recipient || recipient.toLowerCase() !== email.trim().toLowerCase()) return;
  if ((sent.get(id) || 0) > now) return;
  sent.set(id, now + 600000);
  try { await sendReservationAccessLink({ email: recipient, reservationId: id, locale }); }
  catch (error) { sent.delete(id); throw error; }
}
