import { TRPCError } from '@trpc/server';
import { guestyBEClient } from '../lib/guesty';
import { parseBEQuote } from './guesty-booking';

export type StayIdentity = { listingId: string; guestyQuoteId?: string | null; checkIn: string; checkOut: string; guests: number; ratePlanId?: string | null };
const invalid = () => new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Please refresh your dates and price before continuing.' });

/** Bind the supplier's quote to the stay before using any of its amounts. */
export function canonicalStayQuote(raw: any, stay: StayIdentity, now = Date.now()) {
  const expiresAt = Date.parse(raw?.expiresAt);
  const listing = raw?.unitTypeId ?? raw?.listingId;
  if (!stay.guestyQuoteId || String(raw?._id) !== stay.guestyQuoteId || listing !== stay.listingId ||
      raw?.checkInDateLocalized !== stay.checkIn || raw?.checkOutDateLocalized !== stay.checkOut ||
      Number(raw?.guestsCount) !== stay.guests || !Number.isFinite(expiresAt) || expiresAt <= now) throw invalid();
  const parsed = parseBEQuote(raw, stay.listingId, stay.checkIn, stay.checkOut);
  const ratePlanId = stay.ratePlanId || parsed.ratePlanId;
  const plan = parsed.ratePlanOptions?.find(p => p.ratePlanId === ratePlanId);
  const rawPlan = raw.rates.ratePlans.find((p: any) => String(p.ratePlan?._id || p._id || p.id || p.ratePlanId) === ratePlanId);
  const currency = (rawPlan?.ratePlan?.money || rawPlan?.money)?.currency;
  if (!plan || currency !== 'EUR' || parsed.currency !== 'EUR' || !(plan.total > 0) || !Number.isFinite(plan.total) || parsed.nights <= 0) throw invalid();
  const coupon = Array.isArray(raw.coupons) ? raw.coupons.find((c: any) => c.code)?.code : undefined;
  return { ratePlanId, expiresAt: new Date(expiresAt), quote: {
    nightlyRate: plan.nightlyRate, totalNights: plan.total - plan.cleaningFee - plan.taxesAndFees,
    cleaningFee: plan.cleaningFee, taxesAndFees: plan.taxesAndFees, total: plan.total,
    nights: parsed.nights, currency: parsed.currency, quoteCreatedAt: Date.parse(raw.createdAt) || now,
    ratePlanOptions: parsed.ratePlanOptions, ...(coupon ? { couponCode: String(coupon) } : {}),
  } };
}

export async function trustedStayQuote(stay: StayIdentity, validAt = Date.now()) {
  if (!/^[a-f0-9]{24}$/i.test(stay.guestyQuoteId || '')) throw invalid();
  const raw = await guestyBEClient.request<any>('GET', `/api/reservations/quotes/${stay.guestyQuoteId}`);
  return canonicalStayQuote(raw, stay, validAt);
}

/** Never silently charge a newly higher price or accept a browser discount. */
export function assertQuotedTotal(shown: any, confirmed: { total: number; currency: string }) {
  if (String(shown?.currency).toUpperCase() !== confirmed.currency || !Number.isFinite(shown?.total) ||
      Math.abs(Math.round(shown.total * 100) - Math.round(confirmed.total * 100)) > 1) throw invalid();
}
