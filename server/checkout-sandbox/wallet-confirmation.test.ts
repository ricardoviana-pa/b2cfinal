/**
 * PayPal e Klarna: uma confirmação por reserva.
 *
 * Até out/2026 o regresso do PayPal e do Klarna (confirmPayPalBooking e
 * confirmKlarnaBooking) mandava sempre a confirmação antiga, sem língua e por
 * isso em inglês, e o checkout 2.0 mandava a sua (9 línguas, resumo, política):
 * o hóspede recebia duas. Aqui corre o router a sério (booking e o fecho do
 * checkout), com a Stripe, o Guesty e o email simulados, e conta-se o que o
 * hóspede recebe em cada caminho.
 */
import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  intents: new Map<string, any>(), payments: new Map<string, any>(),
  getIntent: vi.fn(), markPaid: vi.fn(),
  getPayment: vi.fn(), metadata: vi.fn(),
  reserve: vi.fn(), recordPayment: vi.fn(), note: vi.fn(),
  newConfirmation: vi.fn(), oldConfirmation: vi.fn(), opsEmail: vi.fn(), failureAlert: vi.fn(),
}));

vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: vi.fn() }, guestyClient: { request: vi.fn() } }));
vi.mock('../db', () => ({ getBookingIntent: fake.getIntent, markBookingIntentPaid: fake.markPaid }));
vi.mock('../services/visit-origin-store', () => ({ getIntentOrigin: vi.fn(async () => null), saveIntentOrigin: vi.fn() }));
vi.mock('../services/properties-store', () => ({
  getPropertiesForSite: vi.fn(async () => [{ guestyId: 'synthetic-listing', slug: 'synthetic-home', bedrooms: 3, amenities: [] }]),
  isHiddenFromCatalog: () => false,
}));
vi.mock('../services/transactional-email', () => ({
  sendCheckoutGuestConfirmation: fake.newConfirmation, sendCheckoutOpsManifest: fake.opsEmail,
  sendBookingConfirmation: fake.oldConfirmation, sendBookingFailureAlert: fake.failureAlert,
}));
vi.mock('../services/stripe-paypal', () => ({ getPaymentIntent: fake.getPayment, updatePaymentIntentMetadata: fake.metadata }));
vi.mock('../services/stripe-klarna', () => ({ getPaymentIntent: fake.getPayment, updatePaymentIntentMetadata: fake.metadata }));
vi.mock('../services/guesty-openapi-paypal', () => ({
  createReservationViaOpenApi: fake.reserve, recordExternalPayment: fake.recordPayment, appendReservationNote: fake.note,
}));
vi.mock('../services/rate-plan-policy', () => ({
  ratePlanPolicyFor: vi.fn(async (_l: string, ratePlanId: string) => ({ ratePlanId, name: 'Flexible', cancellationPolicy: ['MODERATE'] })),
  withTimeout: (p: Promise<unknown>) => p,
}));

import { bookingRouter } from '../routers/booking';
import { completeCheckoutIntent } from '../services/checkout-confirmation';

const caller = () => bookingRouter.createCaller({ req: { headers: {} }, res: {}, user: null } as any);
const quote = { nightlyRate: 500, totalNights: 2000, cleaningFee: 120, taxesAndFees: 27, total: 2147, nights: 4,
  currency: 'EUR', quoteCreatedAt: Date.now(),
  ratePlanOptions: [{ ratePlanId: 'synthetic-flex', name: 'Flexible', total: 2147, nightlyRate: 500, cleaningFee: 120, cancellationPolicy: ['MODERATE'] }] };

let seq = 0;
/** Um checkout 2.0 no passo de pagamento, e o PI pago do PayPal ou do Klarna que lhe pertence. */
function paidWallet(source: 'website-paypal' | 'website-klarna', opts: { intent?: boolean } = {}) {
  seq += 1;
  const intentId = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  if (opts.intent !== false) {
    fake.intents.set(intentId, {
      id: intentId, listingId: 'synthetic-listing', propertyName: 'Synthetic test home', propertySlug: 'synthetic-home',
      destination: 'minho', checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, ratePlanId: 'synthetic-flex',
      email: 'guest@checkout.invalid', guestFirstName: 'Synthetic', guestLastName: 'Guest', guestPhone: '+000000000',
      quote, extras: [], reception: { type: 'self' }, flex: false, status: 'payment_pending', locale: 'fr',
      paymentPlan: 'full', reservationId: null, confirmationCode: null,
    });
  }
  const pi = {
    // Um PI por teste: a idempotência do PayPal guarda a reserva por PI em memória.
    id: `pi_synthetic_wallet_${seq}`, status: 'succeeded', amount: 214700, amount_received: 214700, currency: 'eur',
    metadata: { source, listingId: 'synthetic-listing', checkIn: '2099-11-10', checkOut: '2099-11-14',
      guestEmail: 'guest@checkout.invalid', guestName: 'Synthetic Guest', numberOfAdults: '4', numberOfChildren: '0',
      numberOfInfants: '0', ratePlanId: 'synthetic-flex', intentId },
  };
  fake.payments.set(pi.id, pi);
  return { intentId, pi };
}
function legacyPayment(source: 'website-paypal' | 'website-klarna') {
  const { pi } = paidWallet(source, { intent: false });
  delete (pi.metadata as any).intentId;
  return pi;
}
const confirmInput = (paymentIntentId: string) => ({
  paymentIntentId, listingId: 'synthetic-listing', checkIn: '2099-11-10', checkOut: '2099-11-14',
  guestFirstName: 'Synthetic', guestLastName: 'Guest', guestEmail: 'guest@checkout.invalid', guestPhone: '+000000000',
  numberOfAdults: 4, numberOfChildren: 0, numberOfInfants: 0, totalAmount: 2147, currency: 'EUR',
  propertyName: 'Synthetic test home', destination: 'minho',
});
const confirm = (source: 'website-paypal' | 'website-klarna', paymentIntentId: string) =>
  source === 'website-paypal'
    ? caller().confirmPayPalBooking(confirmInput(paymentIntentId))
    : caller().confirmKlarnaBooking(confirmInput(paymentIntentId));
/** Os emails ao hóspede são fire-and-forget: dá-lhes tempo de sair antes de contar. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const guestConfirmations = () => fake.newConfirmation.mock.calls.length + fake.oldConfirmation.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  fake.intents.clear(); fake.payments.clear();
  fake.getIntent.mockImplementation(async (id: string) => structuredClone(fake.intents.get(id) ?? null));
  fake.markPaid.mockImplementation(async (id: string, reservationId: string, confirmationCode: string) => {
    const m = fake.intents.get(id); if (!m || m.status === 'paid') return false;
    Object.assign(m, { status: 'paid', reservationId, confirmationCode }); return true;
  });
  fake.getPayment.mockImplementation(async (id: string) => {
    if (!fake.payments.has(id)) throw new Error('synthetic payment not found');
    return structuredClone(fake.payments.get(id));
  });
  fake.metadata.mockImplementation(async (id: string, data: Record<string, string>) => Object.assign(fake.payments.get(id).metadata, data));
  fake.reserve.mockImplementation(async () => ({ reservationId: `synthetic-reservation-${seq}`, confirmationCode: `SYNTHETIC-${seq}`, status: 'confirmed' }));
  fake.recordPayment.mockResolvedValue(undefined);
  fake.note.mockResolvedValue(true);
  fake.newConfirmation.mockResolvedValue(undefined); fake.oldConfirmation.mockResolvedValue(undefined);
  fake.opsEmail.mockResolvedValue(undefined); fake.failureAlert.mockResolvedValue(undefined);
});

describe.each(['website-paypal', 'website-klarna'] as const)('%s: one confirmation per booking', (source) => {
  it('checkout 2.0: only the checkout confirmation, in the guest language, never the old English one', async () => {
    const { intentId, pi } = paidWallet(source);
    const r = await confirm(source, pi.id);
    expect(r.confirmationCode).toMatch(/^SYNTHETIC-/);
    await vi.waitFor(() => expect(fake.newConfirmation).toHaveBeenCalledOnce());
    await settle();
    expect(fake.oldConfirmation).not.toHaveBeenCalled();
    expect(guestConfirmations()).toBe(1);
    expect(fake.newConfirmation.mock.calls[0][0]).toMatchObject({ email: 'guest@checkout.invalid', locale: 'fr', intentId });
    expect(fake.intents.get(intentId)).toMatchObject({ status: 'paid', reservationId: r.reservationId });
  });

  it('webhook first, return page after: still one confirmation', async () => {
    const { intentId, pi } = paidWallet(source);
    // O webhook cria a reserva pelo mesmo PI e fecha o checkout primeiro.
    await completeCheckoutIntent(intentId, `synthetic-reservation-${seq}`, `SYNTHETIC-${seq}`);
    await vi.waitFor(() => expect(fake.newConfirmation).toHaveBeenCalledOnce());
    await confirm(source, pi.id);
    await settle();
    expect(guestConfirmations()).toBe(1);
    expect(fake.oldConfirmation).not.toHaveBeenCalled();
  });

  it('the return page reloaded: still one confirmation', async () => {
    const { pi } = paidWallet(source);
    await confirm(source, pi.id);
    await confirm(source, pi.id);
    await settle();
    expect(fake.reserve).toHaveBeenCalledOnce();
    expect(guestConfirmations()).toBe(1);
    expect(fake.newConfirmation).toHaveBeenCalledOnce();
  });

  it('without checkout 2.0 (old widget, no intent): the old confirmation, once', async () => {
    const pi = legacyPayment(source);
    await confirm(source, pi.id);
    await vi.waitFor(() => expect(fake.oldConfirmation).toHaveBeenCalledOnce());
    await settle();
    expect(fake.newConfirmation).not.toHaveBeenCalled();
    expect(guestConfirmations()).toBe(1);
    expect(fake.oldConfirmation.mock.calls[0][0]).toMatchObject({ guestEmail: 'guest@checkout.invalid', cancellation: { policy: 'moderate' } });
  });

  it('a checkout that cannot be closed still leaves the guest one confirmation, and the error surfaces', async () => {
    const { pi } = paidWallet(source, { intent: false });
    await expect(confirm(source, pi.id)).rejects.toThrow(/Checkout not found/);
    await vi.waitFor(() => expect(fake.oldConfirmation).toHaveBeenCalledOnce());
    await settle();
    expect(fake.newConfirmation).not.toHaveBeenCalled();
    expect(guestConfirmations()).toBe(1);
  });
});
