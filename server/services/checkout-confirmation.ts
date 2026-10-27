import { getBookingIntent, markBookingIntentPaid } from '../db';

/** Internal only: call after provider payment verification and reservation settlement. */
export async function completeCheckoutIntent(
  intentId: string,
  reservationId: string,
  confirmationCode: string,
  /** Como o Flex foi cobrado (settle do cartão). Sem isto, os emails leem a oferta no instante do envio. */
  pricing?: { flexGift?: boolean; at?: number },
) {
  const intent = await getBookingIntent(intentId);
  if (!intent) throw new Error('Checkout not found');
  if (intent.reservationId && intent.reservationId !== reservationId) throw new Error('Reservation does not match checkout');
  if (await markBookingIntentPaid(intentId, reservationId, confirmationCode)) {
    const { fireCheckoutPaidEmails } = await import('../routers/checkout');
    void fireCheckoutPaidEmails({ ...intent, status: 'paid', reservationId, confirmationCode }, intentId, pricing);
  }
}
