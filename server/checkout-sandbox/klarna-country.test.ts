import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Klarna com o país de faturação real do hóspede (29 out 2026). O router
 * (booking.createKlarnaPaymentIntent) corre a sério, com a Stripe simulada no
 * SDK: para cada país vê-se o corpo que chega à Stripe (língua da página da
 * Klarna, país na metadata) e o país devolvido ao browser, que é o que ele
 * usa no confirmKlarnaPayment. Fora dos países e dos tectos em que a Klarna se
 * oferece em EUR, o servidor recusa antes de criar o PaymentIntent. Nunca há
 * um pagamento Klarna real: a rede está cortada pelo setup do sandbox.
 */
const sdk = vi.hoisted(() => ({ create: vi.fn(), quote: { totalEur: 950 } }));
vi.mock('stripe', () => ({ default: vi.fn(() => ({ paymentIntents: { create: sdk.create } })) }));
vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: vi.fn() }, guestyClient: { request: vi.fn() } }));
vi.mock('../db', () => ({ getBookingIntent: vi.fn(async () => null) }));
vi.mock('../services/guesty-booking', () => ({
  isBEApiConfigured: () => false,
  // A cotação do fornecedor para o caminho sem intent (o widget antigo): o
  // total vem de sdk.quote para cada teste pôr o valor que quer.
  createBEQuote: vi.fn(async () => ({
    ratePlanId: 'synthetic-flex', currency: 'EUR',
    ratePlanOptions: [{ ratePlanId: 'synthetic-flex', total: sdk.quote.totalEur }],
  })),
  createBEInstantReservation: vi.fn(), getPaymentProvider: vi.fn(), applyCouponToBEQuote: vi.fn(),
}));
vi.mock('../services/properties-store', () => ({ getPropertiesForSite: vi.fn(async () => []), isHiddenFromCatalog: () => false }));
vi.mock('../services/transactional-email', () => ({ sendBookingConfirmation: vi.fn(), sendBookingFailureAlert: vi.fn() }));
vi.mock('../services/rate-plan-policy', () => ({ ratePlanPolicyFor: vi.fn(), withTimeout: (p: Promise<unknown>) => p }));

import { bookingRouter } from '../routers/booking';
import { classifyPaymentError } from '@/lib/paymentErrors';

const caller = () => bookingRouter.createCaller({ req: { headers: {} }, res: {}, user: null } as any);
const input = (over: Record<string, unknown> = {}) => ({
  amount: 95_000, currency: 'eur', listingId: 'synthetic-listing', checkIn: '2099-11-10', checkOut: '2099-11-14',
  guestEmail: 'guest@checkout.invalid', guestName: 'Synthetic Guest',
  numberOfAdults: 2, numberOfChildren: 0, numberOfInfants: 0, ratePlanId: 'synthetic-flex',
  ...over,
});
/** O ecrã e o fornecedor dizem o mesmo total (EUR). */
function priceAt(eur: number) {
  sdk.quote.totalEur = eur;
  return { amount: eur * 100 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_not_a_real_key');
  sdk.create.mockImplementation(async (body: any) => ({
    id: 'pi_synthetic_klarna', client_secret: 'pi_synthetic_klarna_secret', status: 'requires_payment_method',
    amount: body.amount, currency: body.currency, metadata: body.metadata,
  }));
  priceAt(950);
});
afterEach(() => vi.unstubAllEnvs());

describe('createKlarnaPaymentIntent: o país de faturação real, decidido e validado no servidor', () => {
  it.each([
    ['PT', 'pt', 950, 'pt-PT'],
    ['PT', 'en', 950, 'en-PT'],
    ['GR', 'en', 950, 'en-GR'],
    ['ES', 'es', 2700, 'es-ES'],
    ['FR', 'fr', 2700, 'fr-FR'],
    ['IT', 'it', 2700, 'it-IT'],
    ['IE', 'en', 2700, 'en-IE'],
    ['DE', 'de', 4500, 'de-DE'],
    ['AT', 'de', 4500, 'de-AT'],
    ['NL', 'nl', 4500, 'nl-NL'],
    ['DE', 'pt', 4500, 'en-DE'], // a Stripe não tem pt-DE: inglês no país
  ])('%s, site em %s, %s €: cria o PaymentIntent com a página da Klarna em %s e devolve o país', async (country, locale, eur, preferred) => {
    const res = await caller().createKlarnaPaymentIntent(input({ ...priceAt(eur), billingCountry: country, locale }));
    expect(res).toEqual({ clientSecret: 'pi_synthetic_klarna_secret', paymentIntentId: 'pi_synthetic_klarna', billingCountry: country });
    expect(sdk.create).toHaveBeenCalledOnce();
    const body = sdk.create.mock.calls[0][0];
    expect(body).toMatchObject({
      amount: eur * 100, currency: 'eur', payment_method_types: ['klarna'],
      payment_method_options: { klarna: { preferred_locale: preferred } },
    });
    expect(body.metadata).toMatchObject({ source: 'website-klarna', billingCountry: country, ratePlanId: 'synthetic-flex', guestEmail: 'guest@checkout.invalid' });
  });

  it('aceita o país em minúsculas (o PhoneInput dá "pt") e normaliza', async () => {
    const res = await caller().createKlarnaPaymentIntent(input({ billingCountry: 'pt', locale: 'pt-PT' }));
    expect(res.billingCountry).toBe('PT');
    expect(sdk.create.mock.calls[0][0].metadata.billingCountry).toBe('PT');
  });

  it('cliente antigo sem país nem língua: Portugal e a página em en-PT, como até 29 out 2026', async () => {
    const res = await caller().createKlarnaPaymentIntent(input());
    expect(res.billingCountry).toBe('PT');
    expect(sdk.create.mock.calls[0][0].payment_method_options).toEqual({ klarna: { preferred_locale: 'en-PT' } });
    expect(sdk.create.mock.calls[0][0].metadata.billingCountry).toBe('PT');
  });

  it.each(['GB', 'SE', 'DK', 'NO', 'CH', 'US', 'BE', 'FI', 'BR'])(
    '%s: a Klarna não se oferece em euros a quem está neste país; recusa antes de falar com a Stripe',
    async (country) => {
      await expect(caller().createKlarnaPaymentIntent(input({ billingCountry: country })))
        .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/Klarna is not available/) });
      expect(sdk.create).not.toHaveBeenCalled();
    },
  );

  it('acima do tecto do país recusa (Portugal 1 000 €, Alemanha 5 000 €); no tecto, aceita', async () => {
    await expect(caller().createKlarnaPaymentIntent(input({ ...priceAt(2700), billingCountry: 'PT' })))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/Klarna is not available for this amount/) });
    await expect(caller().createKlarnaPaymentIntent(input({ ...priceAt(5500), billingCountry: 'DE' })))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(sdk.create).not.toHaveBeenCalled();
    await expect(caller().createKlarnaPaymentIntent(input({ ...priceAt(5000), billingCountry: 'DE' }))).resolves.toMatchObject({ billingCountry: 'DE' });
    await expect(caller().createKlarnaPaymentIntent(input({ ...priceAt(1000), billingCountry: 'PT' }))).resolves.toMatchObject({ billingCountry: 'PT' });
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it('país mal formado: recusado pela validação da entrada, sem Stripe', async () => {
    for (const billingCountry of ['PRT', 'P', '12']) {
      await expect(caller().createKlarnaPaymentIntent(input({ billingCountry }))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it('interruptor de emergência KLARNA_BILLING_COUNTRY_FORCED_PT=true: força PT (e o tecto de PT) e devolve PT ao browser', async () => {
    vi.stubEnv('KLARNA_BILLING_COUNTRY_FORCED_PT', 'true');
    const res = await caller().createKlarnaPaymentIntent(input({ billingCountry: 'DE', locale: 'de' }));
    expect(res.billingCountry).toBe('PT');
    expect(sdk.create.mock.calls[0][0].payment_method_options).toEqual({ klarna: { preferred_locale: 'en-PT' } });
    expect(sdk.create.mock.calls[0][0].metadata.billingCountry).toBe('PT');
    await expect(caller().createKlarnaPaymentIntent(input({ ...priceAt(2700), billingCountry: 'DE', locale: 'de' })))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('o aviso do browser traduz a recusa do servidor: outro método, nunca duas partes', () => {
    for (const message of ['Klarna is not available for billing country GB', 'Klarna is not available for this amount in PT']) {
      expect(classifyPaymentError(new Error(message))).toEqual({ key: 'payment.errors.klarnaUnavailable', kind: 'decline', retrySameCard: false });
    }
  });
});
