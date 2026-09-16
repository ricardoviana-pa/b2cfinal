import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  supplierQuote: vi.fn(), markPaid: vi.fn(),
  intents: new Map<string, any>(), payments: new Map<string, any>(), keys: new Map<string, string>(),
  createIntent: vi.fn(), getIntent: vi.fn(), updateIntent: vi.fn(),
  createPayment: vi.fn(), getPayment: vi.fn(), cancelPayment: vi.fn(), metadata: vi.fn(),
  reserve: vi.fn(), recordPayment: vi.fn(), note: vi.fn(),
  opsEmail: vi.fn(), guestEmail: vi.fn(), lead: vi.fn(),
}));

vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: fake.supplierQuote } }));

vi.mock('../db', () => ({
  markBookingIntentPaid: fake.markPaid,
  createBookingIntent: fake.createIntent, getBookingIntent: fake.getIntent,
  updateBookingIntent: fake.updateIntent, createLead: fake.lead,
  promoteCheckoutLeadToNewsletter: vi.fn(), demoteCheckoutLeadFromNewsletter: vi.fn(),
}));
vi.mock('../services/properties-store', () => ({ getPropertiesForSite: vi.fn(async () => [
  { guestyId: 'synthetic-listing', slug: 'synthetic-home', bedrooms: 3, amenities: [] },
]) }));
vi.mock('../services/transactional-email', () => ({
  sendCheckoutOpsManifest: fake.opsEmail, sendCheckoutGuestConfirmation: fake.guestEmail,
}));
vi.mock('../services/stripe-klarna', () => ({
  createCardPaymentIntent: fake.createPayment, getPaymentIntent: fake.getPayment,
  cancelPaymentIntent: fake.cancelPayment, updatePaymentIntentMetadata: fake.metadata,
  findSucceededPaymentIntentByIntentId: vi.fn(), createPartialRefund: vi.fn(),
}));
vi.mock('../services/guesty-openapi-paypal', () => ({
  createReservationViaOpenApi: fake.reserve, recordExternalPayment: fake.recordPayment,
  appendReservationNote: fake.note, fetchReservationConfirmationCode: vi.fn(async () => 'SYNTHETIC-BOOKING'),
  getReservationBalanceDue: vi.fn(async () => 2147), addReservationServiceFee: vi.fn(async () => true),
  fetchPaymentProviderId: vi.fn(), fetchReservationGuestId: vi.fn(), attachGuestPaymentMethod: vi.fn(),
  fetchReservationPaymentState: vi.fn(async () => ({ balanceDue: 0 })),
}));

import { checkoutRouter } from '../routers/checkout';
const caller = () => checkoutRouter.createCaller({
  req: { headers: { host: 'checkout.invalid' } }, res: {}, user: null,
} as any);
const quote = { nightlyRate: 500.5, totalNights: 2002, cleaningFee: 120,
  taxesAndFees: 25, total: 2147, nights: 4, currency: 'EUR', quoteCreatedAt: Date.now() };
async function draft() {
  const result = await caller().createIntent({ listingId: 'synthetic-listing',
    propertyName: 'Synthetic test home', propertySlug: 'synthetic-home',
    guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', ratePlanId: 'synthetic-flex',
    checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, locale: 'pt', quote });
  return result.intentId!;
}
function savedPayment(intentId: string, overrides: Record<string, unknown> = {}) {
  const pi = { id: 'pi_synthetic_saved', client_secret: 'synthetic_secret', amount: 214700,
    currency: 'eur', status: 'requires_payment_method', metadata: { flow: 'card_v2', intentId }, ...overrides };
  fake.payments.set(pi.id, pi);
  fake.intents.get(intentId).paymentIntentId = pi.id;
  return pi;
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.supplierQuote.mockImplementation(async () => ({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', unitTypeId: 'synthetic-listing',
    checkInDateLocalized: '2099-11-10', checkOutDateLocalized: '2099-11-14', guestsCount: 4,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    rates: { ratePlans: [{ ratePlan: { _id: 'synthetic-flex', name: 'Flexible', money: { subTotalPrice: 2147, fareCleaning: 120, currency: 'EUR' } } }] } }));
  fake.intents.clear(); fake.payments.clear(); fake.keys.clear();
  fake.createIntent.mockImplementation(async (data) => { fake.intents.set(data.id, structuredClone(data)); return data.id; });
  fake.markPaid.mockImplementation(async (id, reservationId, confirmationCode) => {
    const m = fake.intents.get(id); if (!m || m.status === 'paid') return false;
    Object.assign(m, {status:'paid', reservationId, confirmationCode}); return true;
  });
  fake.getIntent.mockImplementation(async id => structuredClone(fake.intents.get(id) ?? null));
  fake.updateIntent.mockImplementation(async (id, patch) => {
    if (!fake.intents.has(id)) return false;
    Object.assign(fake.intents.get(id), structuredClone(patch)); return true;
  });
  fake.getPayment.mockImplementation(async id => {
    if (!fake.payments.has(id)) throw new Error('synthetic payment not found');
    return structuredClone(fake.payments.get(id));
  });
  fake.createPayment.mockImplementation(async params => {
    const prior = fake.keys.get(params.idempotencyKey);
    if (prior) return structuredClone(fake.payments.get(prior));
    const pi = { id: `pi_synthetic_${fake.payments.size + 1}`, client_secret: 'synthetic_secret',
      status: 'requires_payment_method', amount: params.amount, currency: params.currency,
      metadata: params.metadata, automatic_payment_methods: params.wallet ? { enabled: true } : null };
    fake.payments.set(pi.id, pi); fake.keys.set(params.idempotencyKey, pi.id); return structuredClone(pi);
  });
  fake.cancelPayment.mockImplementation(async id => { fake.payments.get(id).status = 'canceled'; });
  fake.metadata.mockImplementation(async (id, data) => Object.assign(fake.payments.get(id).metadata, data));
  fake.reserve.mockResolvedValue({ reservationId: 'synthetic-reservation', confirmationCode: 'SYNTHETIC-BOOKING' });
  fake.recordPayment.mockResolvedValue(undefined); fake.note.mockResolvedValue(true);
  fake.opsEmail.mockResolvedValue(undefined); fake.guestEmail.mockResolvedValue(undefined);
});

describe('synthetic checkout integration — real router and settlement, no providers', () => {
  it('captures contact, prices extras on the server, settles the stay and prepares one confirmation', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: 'guest@checkout.invalid', consent: false, locale: 'pt' });
    await caller().updateIntent({ intentId: id, patch: {
      guestFirstName: 'Synthetic', guestLastName: 'Guest', guestPhone: '+000000000',
      reception: { type: 'self' }, extras: [{ sku: 'private-chef', people: 4, amount: 1 }],
    } });
    const payment = await caller().createCardCharge({ intentId: id });
    expect(payment.totalCents).toBe(252700);
    fake.payments.get(payment.paymentIntentId).status = 'succeeded';
    const confirmation = await caller().finalizeCardCharge({ intentId: id, paymentIntentId: payment.paymentIntentId });
    expect(fake.reserve).toHaveBeenCalledWith(expect.objectContaining({
      listingId: 'synthetic-listing', guestFirstName: 'Synthetic', ratePlanId: 'synthetic-flex',
    }));
    expect(fake.recordPayment).toHaveBeenCalledWith('synthetic-reservation', 2147, 'EUR', payment.paymentIntentId);
    await caller().updateIntent({ intentId: id, patch: { status: 'paid', ...confirmation } });
    await vi.waitFor(() => expect(fake.guestEmail).toHaveBeenCalledOnce());
    expect(fake.guestEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'guest@checkout.invalid', canonical: expect.objectContaining({ totalCents: 252700 }),
      viewUrl: 'https://www.portugalactive.com/pt/booking/thank-you/synthetic-reservation?method=card',
    }));
    expect((await caller().getIntent({ intentId: id })).intent?.status).toBe('paid');
    expect(await caller().updateIntent({ intentId: id, patch: { email: 'changed@checkout.invalid' } })).toEqual({ ok: false });
    expect(fake.guestEmail).toHaveBeenCalledOnce();
  });

  it('reuses an existing pending card payment', async () => {
    const id = await draft(); const previous = savedPayment(id);
    expect((await caller().createCardCharge({ intentId: id })).paymentIntentId).toBe(previous.id);
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('does not start another charge if the previous payment cannot be retrieved', async () => {
    const id = await draft(); savedPayment(id); fake.getPayment.mockRejectedValueOnce(new Error('provider timeout'));
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('does not replace a card payment when canceling it for a wallet fails', async () => {
    const id = await draft(); savedPayment(id); fake.cancelPayment.mockRejectedValueOnce(new Error('provider timeout'));
    await expect(caller().createCardCharge({ intentId: id, wallet: true })).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('does not charge an expired quote', async () => {
    const id = await draft(); fake.intents.get(id).expiresAt = new Date(Date.now() - 1000);
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('recognizes a succeeded payment even when the basket amount has changed', async () => {
    const id = await draft(); const pi = savedPayment(id, { status: 'succeeded', amount: 200000 });
    const result = await caller().createCardCharge({ intentId: id });
    expect(result).toMatchObject({ alreadyPaid: true, paymentIntentId: pi.id, clientSecret: null, totalCents: 200000 });
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('does not replace a processing payment after the basket amount changes', async () => {
    const id = await draft(); savedPayment(id, { status: 'processing', amount: 200000 });
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled(); expect(fake.cancelPayment).not.toHaveBeenCalled();
  });

  it('cancels an unpaid stale amount before replacing the payment', async () => {
    const id = await draft(); const pi = savedPayment(id, { amount: 200000 });
    await caller().createCardCharge({ intentId: id });
    expect(fake.cancelPayment).toHaveBeenCalledWith(pi.id);
    expect(fake.cancelPayment.mock.invocationCallOrder[0]).toBeLessThan(fake.createPayment.mock.invocationCallOrder[0]);
  });

  it('refuses to resume a payment belonging to another checkout', async () => {
    const id = await draft(); savedPayment(id, { metadata: { flow: 'card_v2', intentId: 'another-synthetic-intent' } });
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('refuses non-EUR quotes rather than charging their number as EUR', async () => {
    const id = await draft(); fake.intents.get(id).quote.currency = 'USD';
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('simultaneous double submits share one persisted payment', async () => {
    const id = await draft();
    const results = await Promise.all(Array.from({ length: 6 }, () => caller().createCardCharge({ intentId: id })));
    expect(new Set(results.map(r => r.paymentIntentId)).size).toBe(1);
    expect(fake.createPayment).toHaveBeenCalledOnce();
  });

  it('reuses a wallet payment without creating another card format', async () => {
    const id = await draft();
    const first = await caller().createCardCharge({ intentId: id, wallet: true });
    const retry = await caller().createCardCharge({ intentId: id, wallet: true });
    expect(retry.paymentIntentId).toBe(first.paymentIntentId);
    expect(fake.createPayment).toHaveBeenCalledOnce();
  });

  it('does not expose the secret until the payment reference is saved; retries use the same Stripe key', async () => {
    const id = await draft(); fake.updateIntent.mockResolvedValueOnce(false);
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow('could not be saved');
    expect(fake.intents.get(id).paymentIntentId).toBeUndefined();
    const result = await caller().createCardCharge({ intentId: id });
    const firstKey = fake.createPayment.mock.calls[0][0].idempotencyKey;
    expect(firstKey).toMatch(/^checkout-card-v2-[a-f0-9]{64}$/);
    expect(fake.createPayment.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(fake.payments.size).toBe(1);
    expect(fake.intents.get(id).paymentIntentId).toBe(result.paymentIntentId);
  });

  it('releases the checkout lock after a failure so a safe retry can proceed', async () => {
    const id = await draft(); savedPayment(id); fake.getPayment.mockRejectedValueOnce(new Error('timeout'));
    await expect(caller().createCardCharge({ intentId: id })).rejects.toThrow('timeout');
    expect((await caller().createCardCharge({ intentId: id })).paymentIntentId).toBe('pi_synthetic_saved');
  });

  it('recovers a previously paid checkout even after the quote expires', async () => {
    const id = await draft(); savedPayment(id, { status: 'succeeded' });
    fake.intents.get(id).expiresAt = new Date(Date.now() - 1000);
    expect((await caller().createCardCharge({ intentId: id })).alreadyPaid).toBe(true);
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('does not settle an unpaid payment or create a reservation', async () => {
    const id = await draft(); const payment = await caller().createCardCharge({ intentId: id });
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: payment.paymentIntentId })).rejects.toThrow('not succeeded');
    expect(fake.reserve).not.toHaveBeenCalled(); expect(fake.guestEmail).not.toHaveBeenCalled();
  });

  it('sequential settlement retries reuse the existing reservation', async () => {
    const id = await draft(); const pi = savedPayment(id, { status: 'succeeded' });
    const first = await caller().finalizeCardCharge({ intentId: id, paymentIntentId: pi.id });
    expect(await caller().finalizeCardCharge({ intentId: id, paymentIntentId: pi.id })).toEqual(first);
    expect(fake.reserve).toHaveBeenCalledOnce();
  });
});


describe('server authority before payment', () => {
  it('rejects a fabricated low stay total at creation', async () => {
    await expect(caller().createIntent({ listingId: 'synthetic-listing', guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      checkIn:'2099-11-10', checkOut:'2099-11-14', guests:4, ratePlanId:'synthetic-flex', quote:{...quote,total:1} })).rejects.toThrow();
    expect(fake.createIntent).not.toHaveBeenCalled(); expect(fake.createPayment).not.toHaveBeenCalled();
  });
  it('stores supplier amounts when a browser changes quote component fields', async () => {
    const id = await draft();
    await caller().updateIntent({ intentId:id, patch:{quote:{...quote,total:1,totalNights:1,cleaningFee:0}} });
    expect(fake.intents.get(id).quote.total).toBe(2147);
    expect(fake.intents.get(id).quote.cleaningFee).toBe(120);
    expect((await caller().createCardCharge({intentId:id})).totalCents).toBe(214700);
  });
  it('refuses a new charge if supplier validation is unavailable', async () => {
    const id = await draft(); fake.supplierQuote.mockRejectedValueOnce(new Error('supplier unavailable'));
    await expect(caller().createCardCharge({intentId:id})).rejects.toThrow();
    expect(fake.createPayment).not.toHaveBeenCalled();
  });
  it('does not let a browser manufacture paid status or reservation details', async () => {
    const id = await draft();
    for (const patch of [{status:'paid',confirmationCode:'fabricated'}, {reservationId:'fabricated'}]) {
      await expect(caller().updateIntent({intentId:id,patch:patch as any})).rejects.toThrow();
    }
    expect(fake.intents.get(id).status).toBe('draft'); expect(fake.guestEmail).not.toHaveBeenCalled();
  });
});


describe('provider callbacks and server confirmation', () => {
  it('concurrent settlement callbacks create one reservation and one confirmation', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: 'guest@checkout.invalid', consent: false, locale: 'pt' });
    const payment = await caller().createCardCharge({intentId:id});
    fake.payments.get(payment.paymentIntentId).status='succeeded';
    const results=await Promise.all(Array.from({length:4},()=>caller().finalizeCardCharge({intentId:id,paymentIntentId:payment.paymentIntentId})));
    expect(new Set(results.map(r=>r.reservationId)).size).toBe(1);
    expect(fake.reserve).toHaveBeenCalledOnce();
    await vi.waitFor(()=>expect(fake.guestEmail).toHaveBeenCalledOnce());
  });
  it('rejects a payment for a different stored intent attempt', async()=>{
    const id=await draft();const payment=await caller().createCardCharge({intentId:id});
    fake.payments.get(payment.paymentIntentId).status='succeeded';
    fake.intents.get(id).paymentIntentId='pi_other';
    await expect(caller().finalizeCardCharge({intentId:id,paymentIntentId:payment.paymentIntentId})).rejects.toThrow();
    expect(fake.reserve).not.toHaveBeenCalled();
  });
});


describe('supplier rate plan selection',()=>{
 it('stores and charges the selected plan when it differs from the cheapest plan',async()=>{
  const original=await fake.supplierQuote();
  original.rates.ratePlans.push({ratePlan:{_id:'synthetic-nonref',name:'Non Refundable',money:{subTotalPrice:1900,fareCleaning:120,currency:'EUR'}}});
  fake.supplierQuote.mockResolvedValue(original);
  const id=await draft();
  expect(fake.intents.get(id).quote.total).toBe(2147);
  await caller().updateIntent({intentId:id,patch:{ratePlanId:'synthetic-nonref'}});
  expect(fake.intents.get(id).quote.total).toBe(1900);
  expect((await caller().createCardCharge({intentId:id})).totalCents).toBe(190000);
 });
 it('uses supplier-applied coupons without trusting a browser discount',async()=>{
  const id=await draft();const original=await fake.supplierQuote();
  original.rates.ratePlans[0].ratePlan.money.subTotalPrice=1900;
  original.coupons=[{code:'SYNTHETIC10'}];fake.supplierQuote.mockResolvedValue(original);
  await caller().updateIntent({intentId:id,patch:{quote:{...quote,total:1,couponCode:'FORGED'}}});
  expect(fake.intents.get(id).quote).toMatchObject({total:1900,couponCode:'SYNTHETIC10'});
  expect((await caller().createCardCharge({intentId:id})).totalCents).toBe(190000);
 });
});
