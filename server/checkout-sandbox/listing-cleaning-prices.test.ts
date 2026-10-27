import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Casa fora da tabela de limpezas (CLEANING_BY_LISTING), com 5 quartos: a
 * limpeza diária vale 105 € pela tipologia, não os 65 € de 3 quartos. O ecrã
 * (getExtras) e o cartão já usavam os quartos; os emails, a validação do
 * Klarna/PayPal e o recálculo dos reembolsos não. Aqui os quatro têm de dizer
 * o mesmo valor.
 */
const fake = vi.hoisted(() => ({
  supplierQuote: vi.fn(), markPaid: vi.fn(),
  intents: new Map<string, any>(), payments: new Map<string, any>(), keys: new Map<string, string>(),
  createIntent: vi.fn(), getIntent: vi.fn(), updateIntent: vi.fn(),
  createPayment: vi.fn(), getPayment: vi.fn(), cancelPayment: vi.fn(), metadata: vi.fn(),
  findPaid: vi.fn(), reserve: vi.fn(), recordPayment: vi.fn(), note: vi.fn(),
  opsEmail: vi.fn(), guestEmail: vi.fn(), lead: vi.fn(),
}));

vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: fake.supplierQuote } }));
vi.mock('../db', () => ({
  markBookingIntentPaid: fake.markPaid,
  createBookingIntent: fake.createIntent, getBookingIntent: fake.getIntent,
  updateBookingIntent: fake.updateIntent, createLead: fake.lead,
  promoteCheckoutLeadToNewsletter: vi.fn(), demoteCheckoutLeadFromNewsletter: vi.fn(),
}));
vi.mock('../services/visit-origin-store', () => ({ saveIntentOrigin: vi.fn(async () => true), getIntentOrigin: vi.fn(async () => null) }));
// 5 quartos, sem animais, e um id que não está na tabela de limpezas por casa.
vi.mock('../services/properties-store', () => ({ getPropertiesForSite: vi.fn(async () => [
  { guestyId: 'synthetic-listing', slug: 'synthetic-home', bedrooms: 5, amenities: [] },
]) }));
vi.mock('../services/transactional-email', () => ({
  sendCheckoutOpsManifest: fake.opsEmail, sendCheckoutGuestConfirmation: fake.guestEmail,
}));
vi.mock('../services/stripe-klarna', () => ({
  createCardPaymentIntent: fake.createPayment, getPaymentIntent: fake.getPayment,
  cancelPaymentIntent: fake.cancelPayment, updatePaymentIntentMetadata: fake.metadata,
  findSucceededPaymentIntentByIntentId: fake.findPaid, createPartialRefund: vi.fn(),
}));
vi.mock('../services/guesty-openapi-paypal', () => ({
  createReservationViaOpenApi: fake.reserve, recordExternalPayment: fake.recordPayment,
  appendReservationNote: fake.note, fetchReservationConfirmationCode: vi.fn(async () => 'SYNTHETIC-BOOKING'),
  getReservationBalanceDue: vi.fn(async () => 2147), addReservationServiceFee: vi.fn(async () => 'added'),
  getReservationSettlementState: vi.fn(async () => ({ balanceDue: 2147, totalPaid: 0, payments: [] })),
  paymentRecordsIntent: vi.fn(() => false),
  fetchPaymentProviderId: vi.fn(), fetchReservationGuestId: vi.fn(), attachGuestPaymentMethod: vi.fn(),
  fetchReservationPaymentState: vi.fn(async () => ({ balanceDue: 0 })),
}));

import { checkoutRouter } from '../routers/checkout';
import { trustedWalletPrice } from '../services/wallet-price-validation';
import { refundCheckoutLine } from '../services/checkout-card-charge';
import { CLEANING_BY_LISTING } from '../config/cleaning-rates';

const caller = () => checkoutRouter.createCaller({
  req: { headers: { host: 'checkout.invalid' } }, res: {}, user: null,
} as any);
const quote = { nightlyRate: 500.5, totalNights: 2002, cleaningFee: 120,
  taxesAndFees: 25, total: 2147, nights: 4, currency: 'EUR', quoteCreatedAt: Date.now() };

/** Estadia de 2 147 € com duas limpezas diárias: 2 × 105 € numa casa de 5 quartos. */
async function intentWithCleaning() {
  const { intentId } = await caller().createIntent({ listingId: 'synthetic-listing',
    propertyName: 'Synthetic test home', propertySlug: 'synthetic-home',
    guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', ratePlanId: 'synthetic-flex',
    checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, locale: 'pt', quote });
  const id = intentId!;
  await caller().captureLead({ intentId: id, email: 'guest@checkout.invalid', consent: false, locale: 'pt' });
  await caller().updateIntent({ intentId: id, patch: {
    guestFirstName: 'Synthetic', guestLastName: 'Guest', guestPhone: '+000000000',
    reception: { type: 'self' }, extras: [{ sku: 'daily-cleaning', qty: 2, amount: 210 }],
  } });
  return id;
}
const EXPECTED_TOTAL = 214700 + 2 * 10500;

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
    Object.assign(m, { status: 'paid', reservationId, confirmationCode }); return true;
  });
  fake.getIntent.mockImplementation(async id => structuredClone(fake.intents.get(id) ?? null));
  fake.updateIntent.mockImplementation(async (id, patch) => {
    if (!fake.intents.has(id)) return false;
    Object.assign(fake.intents.get(id), structuredClone(patch)); return true;
  });
  fake.getPayment.mockImplementation(async id => structuredClone(fake.payments.get(id)));
  fake.createPayment.mockImplementation(async params => {
    const prior = fake.keys.get(params.idempotencyKey);
    if (prior) return structuredClone(fake.payments.get(prior));
    const pi = { id: `pi_synthetic_${fake.payments.size + 1}`, client_secret: 'synthetic_secret',
      status: 'requires_payment_method', amount: params.amount, currency: params.currency,
      metadata: params.metadata, automatic_payment_methods: params.wallet ? { enabled: true } : null };
    fake.payments.set(pi.id, pi); fake.keys.set(params.idempotencyKey, pi.id); return structuredClone(pi);
  });
  fake.metadata.mockImplementation(async (id, data) => Object.assign(fake.payments.get(id).metadata, data));
  fake.reserve.mockResolvedValue({ reservationId: 'synthetic-reservation', confirmationCode: 'SYNTHETIC-BOOKING' });
  fake.recordPayment.mockResolvedValue('recorded'); fake.note.mockResolvedValue(true);
  fake.opsEmail.mockResolvedValue(undefined); fake.guestEmail.mockResolvedValue(undefined);
});

describe('casa fora da tabela de limpezas: ecrã, cartão, emails, Klarna/PayPal e reembolsos dizem o mesmo', () => {
  it('a casa de teste está mesmo fora da tabela por casa', () => {
    expect(CLEANING_BY_LISTING['synthetic-listing']).toBeUndefined();
  });

  it('o ecrã mostra a limpeza pela tipologia (5 quartos)', async () => {
    const res = await caller().getExtras({ listingId: 'synthetic-listing', nights: 4, guests: 4 });
    expect(res.extras.find((e: any) => e.sku === 'daily-cleaning')?.unitPrice).toBe(105);
  });

  it('o email ao hóspede e o manifesto mostram o total que o cartão cobrou', async () => {
    const id = await intentWithCleaning();
    const payment = await caller().createCardCharge({ intentId: id });
    expect(payment.totalCents).toBe(EXPECTED_TOTAL);
    fake.payments.get(payment.paymentIntentId).status = 'succeeded';
    await caller().finalizeCardCharge({ intentId: id, paymentIntentId: payment.paymentIntentId });
    await vi.waitFor(() => expect(fake.guestEmail).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(fake.opsEmail).toHaveBeenCalledOnce());
    for (const sent of [fake.guestEmail.mock.calls[0][0], fake.opsEmail.mock.calls[0][0]]) {
      expect(sent.canonical).toMatchObject({ totalCents: EXPECTED_TOTAL });
      expect(sent.canonical.lines).toEqual([{ sku: 'daily-cleaning', cents: 21000 }]);
    }
  });

  it('o Klarna e o PayPal aceitam o valor que o ecrã mostrou', async () => {
    const id = await intentWithCleaning();
    await expect(trustedWalletPrice({
      amount: EXPECTED_TOTAL, currency: 'EUR', listingId: 'synthetic-listing', checkIn: '2099-11-10', checkOut: '2099-11-14',
      numberOfAdults: 4, numberOfChildren: 0, numberOfInfants: 0, intentId: id,
    })).resolves.toMatchObject({ amount: EXPECTED_TOTAL });
  });

  it('o reembolso de uma limpeza sem linhas no pagamento (Klarna/PayPal) devolve o que foi cobrado', async () => {
    const id = await intentWithCleaning();
    fake.intents.get(id).status = 'paid';
    fake.findPaid.mockResolvedValue({ id: 'pi_klarna', amount: EXPECTED_TOTAL, metadata: { source: 'website-klarna', intentId: id }, latest_charge: null });
    const dry = await refundCheckoutLine(id, 'daily-cleaning');
    expect(dry).toMatchObject({ cents: 21000, executed: false });
  });
});
