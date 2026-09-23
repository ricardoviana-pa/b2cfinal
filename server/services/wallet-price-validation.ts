import { getBookingIntent } from '../db';
import { createBEQuote } from './guesty-booking';
import { trustedStayQuote, assertQuotedTotal } from './trusted-checkout-quote';
import { breakdownFromIntent } from './checkout-card-charge';
import { PETS_ONLY_SKUS } from '../config/checkout-extras';

export type WalletSelection = { amount: number; currency: string; listingId: string; checkIn: string; checkOut: string;
  numberOfAdults: number; numberOfChildren: number; numberOfInfants: number; ratePlanId?: string; intentId?: string };
const changed = () => new Error('The price or booking details have changed. Please refresh before paying.');

export async function trustedWalletPrice(input: WalletSelection) {
  if (input.currency.toUpperCase() !== 'EUR') throw changed();
  const guests = input.numberOfAdults + input.numberOfChildren;
  let amount: number;
  let ratePlanId: string;
  if (input.intentId) {
    const m = await getBookingIntent(input.intentId);
    const expiresAt = m?.expiresAt ? new Date(m.expiresAt).getTime() : NaN;
    if (!m || m.status === 'paid' || m.status === 'expired' || !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
        m.listingId !== input.listingId || m.checkIn !== input.checkIn || m.checkOut !== input.checkOut ||
        m.guests !== guests || (input.ratePlanId && input.ratePlanId !== m.ratePlanId)) throw changed();
    const trusted = await trustedStayQuote(m as any);
    assertQuotedTotal(m.quote, trusted.quote);
    const { listingFacts } = await import('../routers/checkout');
    const facts = await listingFacts(m.listingId);
    const safe = { ...m, quote: trusted.quote, extras: facts.pets ? m.extras : ((m.extras as any[]) || []).filter(e => !PETS_ONLY_SKUS.includes(e.sku)) };
    amount = breakdownFromIntent(safe).totalCents;
    ratePlanId = trusted.ratePlanId;
  } else {
    const quote = await createBEQuote({ listingId: input.listingId, checkIn: input.checkIn, checkOut: input.checkOut, guests });
    ratePlanId = input.ratePlanId || quote.ratePlanId;
    const plan = quote.ratePlanOptions?.find(p => p.ratePlanId === ratePlanId);
    if (!plan || quote.currency !== 'EUR') throw changed();
    amount = Math.round(plan.total * 100);
  }
  if (!Number.isSafeInteger(amount) || amount < 100 || Math.abs(amount - input.amount) > 1) throw changed();
  return { amount, ratePlanId };
}

/** A paid payment ID cannot be reused to book another property/date/guest. */
export function assertWalletConfirmation(pi: any, input: Omit<WalletSelection, 'amount'> & { totalAmount: number; guestEmail: string }, source: string) {
  const m = pi?.metadata || {};
  if (pi?.status !== 'succeeded' || m.source !== source || pi.currency !== 'eur' || input.currency.toUpperCase() !== 'EUR' ||
      Math.abs(pi.amount - Math.round(input.totalAmount * 100)) > 1 ||
      ['listingId', 'checkIn', 'checkOut', 'numberOfAdults', 'numberOfChildren', 'numberOfInfants'].some(key => String(m[key]) !== String((input as any)[key])) ||
      String(m.guestEmail).toLowerCase() !== input.guestEmail.toLowerCase() || (!!input.ratePlanId && String(m.ratePlanId || '') !== input.ratePlanId)) throw changed();
}
