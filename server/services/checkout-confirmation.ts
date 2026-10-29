import { z } from 'zod';
import { getBookingIntent, markBookingIntentPaid } from '../db';

/** A mesma regra do updateIntent para o email do checkout. */
const checkoutEmail = z.string().trim().email().max(320);

/**
 * PayPal e Klarna: o email com que o hóspede pagou, se o checkout guardou outro.
 *
 * O email do passo 3 só chega ao intent pelo flush antes de pagar, que o
 * cartão e as wallets fazem e o PayPal e o Klarna não. Esse email vai na
 * metadata do PI, cria a reserva no Guesty e o regresso ao site tem de o
 * repetir (assertWalletConfirmation). Sem isto, quem corrigiu o email no passo 3
 * recebia a confirmação, e o [CS] mostrava, o endereço do passo 1.
 *
 * Devolve o email a gravar, ou null quando é o mesmo (sem distinguir
 * maiúsculas) ou não é um email válido. Pura.
 */
export function paidEmailUpdate(intentEmail: string | null | undefined, paidEmail: unknown): string | null {
  const parsed = checkoutEmail.safeParse(paidEmail);
  if (!parsed.success) return null;
  const same = String(intentEmail ?? '').trim().toLowerCase() === parsed.data.toLowerCase();
  return same ? null : parsed.data;
}

/** Internal only: call after provider payment verification and reservation settlement. */
export async function completeCheckoutIntent(
  intentId: string,
  reservationId: string,
  confirmationCode: string,
  /** Como o Flex foi cobrado (settle do cartão). Sem isto, os emails leem a oferta no instante do envio. */
  pricing?: { flexGift?: boolean; at?: number },
  /** PayPal e Klarna: o email com que se pagou (metadata do PI). Ver paidEmailUpdate. */
  payment?: { email?: string | null },
) {
  const intent = await getBookingIntent(intentId);
  if (!intent) throw new Error('Checkout not found');
  if (intent.reservationId && intent.reservationId !== reservationId) throw new Error('Reservation does not match checkout');
  // Gravado na própria transição para pago: só quem a ganha o escreve, e os
  // emails que essa mesma chamada dispara já vão para ele. Nunca depois de pago.
  const email = paidEmailUpdate(intent.email, payment?.email);
  if (await markBookingIntentPaid(intentId, reservationId, confirmationCode, email ? { email } : {})) {
    if (email) console.info(`[Checkout] intent ${intentId}: email do checkout trocado pelo do pagamento (corrigido no passo 3)`);
    const { fireCheckoutPaidEmails } = await import('../routers/checkout');
    void fireCheckoutPaidEmails({ ...intent, ...(email ? { email } : {}), status: 'paid', reservationId, confirmationCode }, intentId, pricing);
  }
}
