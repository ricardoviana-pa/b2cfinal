import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: 'pi_synthetic_adapter' })),
  retrieve: vi.fn(async (id: string) => ({ id, status: 'succeeded' })),
  search: vi.fn(),
  customersCreate: vi.fn(async () => ({ id: 'cus_synthetic_adapter' })),
  customersSearch: vi.fn(),
  paymentMethodsUpdate: vi.fn(async (id: string) => ({ id })),
}));
vi.mock('stripe', () => ({ default: vi.fn(() => ({
  paymentIntents: { create: sdk.create, retrieve: sdk.retrieve, search: sdk.search },
  customers: { create: sdk.customersCreate, search: sdk.customersSearch },
  paymentMethods: { update: sdk.paymentMethodsUpdate },
})) }));
import {
  allowPaymentMethodRedisplay, createCardPaymentIntent, ensureStripeCustomer,
  findSucceededPaymentIntentByIntentId, getPaymentIntent, hasCheckoutPaymentAttempt,
} from '../services/stripe-klarna';

const metadata = { flow: 'card_v2', intentId: 'synthetic-checkout' };
beforeEach(() => {
  Object.values(sdk).forEach(fn => fn.mockClear());
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_not_a_real_key');
});
afterEach(() => vi.unstubAllEnvs());
describe('Stripe adapter request contract (SDK simulated)', () => {
  it.each([false, true])('forwards the idempotency key with wallet=%s', async wallet => {
    await createCardPaymentIntent({ amount: 12345, currency: 'eur', wallet,
      metadata: { flow: 'card_v2', intentId: 'synthetic-checkout' }, idempotencyKey: 'synthetic-attempt' });
    const [body, options] = sdk.create.mock.calls[0] as any[];
    expect(options).toEqual({ idempotencyKey: 'synthetic-attempt' });
    expect(body).toMatchObject({ amount: 12345, currency: 'eur', setup_future_usage: 'off_session' });
    expect(body).not.toHaveProperty('idempotencyKey');
    if (wallet) expect(body.automatic_payment_methods).toEqual({ enabled: true, allow_redirects: 'never' });
    else expect(body.payment_method_types).toEqual(['card']);
  });

  // Plano full (Fase 1 dormente): o corpo enviado à Stripe é o de antes das
  // duas partes, chave a chave e pela mesma ordem (o SDK codifica pela ordem).
  it.each([
    [false, '{"amount":12345,"currency":"eur","setup_future_usage":"off_session","payment_method_types":["card"],"metadata":{"flow":"card_v2","intentId":"synthetic-checkout"}}'],
    [true, '{"amount":12345,"currency":"eur","setup_future_usage":"off_session","automatic_payment_methods":{"enabled":true,"allow_redirects":"never"},"metadata":{"flow":"card_v2","intentId":"synthetic-checkout"}}'],
  ])('keeps the full-plan body byte-identical with wallet=%s', async (wallet, expected) => {
    await createCardPaymentIntent({ amount: 12345, currency: 'eur', wallet, metadata, idempotencyKey: 'synthetic-attempt' });
    expect(JSON.stringify(sdk.create.mock.calls[0][0])).toBe(expected);
  });

  it('never sends two-part fields without a customer', async () => {
    await createCardPaymentIntent({ amount: 12345, currency: 'eur', metadata, idempotencyKey: 'synthetic-attempt',
      description: 'Estadia Synthetic 2099-11-10: 1.ª parte', statementDescriptorSuffix: 'PART 1/2' });
    expect(sdk.create.mock.calls[0][0]).toStrictEqual({ amount: 12345, currency: 'eur',
      setup_future_usage: 'off_session', payment_method_types: ['card'], metadata });
  });

  it('builds the first-part PI on the platform customer with 3DS automatic', async () => {
    const twoParts = { ...metadata, part: 'deposit', plan: 'two_parts' };
    await createCardPaymentIntent({ amount: 63100, currency: 'eur', metadata: twoParts,
      idempotencyKey: 'synthetic-attempt-2p', customer: 'cus_synthetic',
      description: 'Estadia Synthetic 2099-11-10: 1.ª parte', statementDescriptorSuffix: 'PART 1/2' });
    const [body, options] = sdk.create.mock.calls[0] as any[];
    expect(options).toEqual({ idempotencyKey: 'synthetic-attempt-2p' });
    expect(body).toStrictEqual({
      amount: 63100, currency: 'eur', setup_future_usage: 'off_session', payment_method_types: ['card'],
      customer: 'cus_synthetic', payment_method_options: { card: { request_three_d_secure: 'automatic' } },
      statement_descriptor_suffix: 'PART 1/2', description: 'Estadia Synthetic 2099-11-10: 1.ª parte',
      metadata: twoParts,
    });
  });

  it('refuses a two-part PI in a wallet session before calling Stripe', async () => {
    await expect(createCardPaymentIntent({ amount: 63100, currency: 'eur', wallet: true,
      idempotencyKey: 'synthetic-attempt-2p', customer: 'cus_synthetic' })).rejects.toThrow(/wallet/);
    expect(sdk.create).not.toHaveBeenCalled();
  });
});

describe('ensureStripeCustomer', () => {
  const intentId = '12345678-1234-4234-8234-123456789abc';
  it('creates the customer once per intent through the idempotency key', async () => {
    const id = await ensureStripeCustomer({ intentId, email: ' guest@example.invalid ', name: 'Synthetic Guest',
      phone: '+351 912 345 678', locale: 'pt' });
    expect(id).toBe('cus_synthetic_adapter');
    expect(sdk.customersCreate).toHaveBeenCalledTimes(1);
    const [body, options] = sdk.customersCreate.mock.calls[0] as any[];
    expect(options).toEqual({ idempotencyKey: `checkout-customer-${intentId}` });
    expect(body).toStrictEqual({ email: 'guest@example.invalid', name: 'Synthetic Guest', phone: '+351 912 345 678',
      preferred_locales: ['pt-PT'], metadata: { intentId, source: 'checkout_v2' } });
  });

  it.each([
    ['pt', ['pt-PT']], ['pt-PT', ['pt-PT']], ['en', ['en']], ['en-GB', ['en']],
    ['es', ['es']], ['fr', ['fr']], ['de', ['de']], ['it', ['it']], ['nl', ['nl']], ['sv', ['sv']], ['fi', ['fi']],
    ['xx', undefined], ['', undefined], [null, undefined],
  ])('maps locale %s to preferred_locales %j', async (locale, expected) => {
    await ensureStripeCustomer({ intentId, locale });
    const body = sdk.customersCreate.mock.calls[0][0] as any;
    if (expected) expect(body.preferred_locales).toEqual(expected);
    else expect(body).not.toHaveProperty('preferred_locales');
  });

  it('omits empty contact fields and phones Stripe would reject', async () => {
    await ensureStripeCustomer({ intentId, email: '', name: null, phone: '+351 (0) 912 345 678 ext 9' });
    expect(sdk.customersCreate.mock.calls[0][0]).toStrictEqual({ metadata: { intentId, source: 'checkout_v2' } });
  });

  it('reuses the existing customer when the key was first used with other details', async () => {
    sdk.customersCreate.mockRejectedValueOnce(Object.assign(new Error('Keys for idempotent requests can only be used with the same parameters'),
      { type: 'StripeIdempotencyError', rawType: 'idempotency_error' }));
    sdk.customersSearch.mockResolvedValueOnce({ data: [
      { id: 'cus_other', metadata: { intentId: 'another-intent', source: 'checkout_v2' } },
      { id: 'cus_first', metadata: { intentId, source: 'checkout_v2' } },
    ] });
    await expect(ensureStripeCustomer({ intentId, email: 'changed@example.invalid' })).resolves.toBe('cus_first');
    expect(sdk.customersSearch).toHaveBeenCalledWith({ query: `metadata['intentId']:'${intentId}'`, limit: 10 });
  });

  it('surfaces the error when the customer cannot be found or the failure is not idempotency', async () => {
    const mismatch = Object.assign(new Error('idempotency'), { type: 'StripeIdempotencyError' });
    sdk.customersCreate.mockRejectedValueOnce(mismatch);
    sdk.customersSearch.mockResolvedValueOnce({ data: [] });
    await expect(ensureStripeCustomer({ intentId })).rejects.toBe(mismatch);
    sdk.customersCreate.mockRejectedValueOnce(Object.assign(new Error('api down'), { type: 'StripeAPIError' }));
    await expect(ensureStripeCustomer({ intentId })).rejects.toThrow('api down');
    expect(sdk.customersSearch).toHaveBeenCalledTimes(1);
  });
});

describe('getPaymentIntent, allowPaymentMethodRedisplay and the deposit lookup', () => {
  it('keeps the existing retrieve calls and expands only when asked', async () => {
    await getPaymentIntent('pi_a');
    await getPaymentIntent('pi_b', { timeout: 3000, maxNetworkRetries: 0 });
    await getPaymentIntent('pi_c', undefined, { expand: ['payment_method', 'latest_charge'] });
    await getPaymentIntent('pi_d', { timeout: 3000 }, { expand: ['payment_method'] });
    expect(sdk.retrieve.mock.calls).toEqual([
      ['pi_a'],
      ['pi_b', {}, { timeout: 3000, maxNetworkRetries: 0 }],
      ['pi_c', { expand: ['payment_method', 'latest_charge'] }, undefined],
      ['pi_d', { expand: ['payment_method'] }, { timeout: 3000 }],
    ]);
  });

  it('lets the saved card be shown again on the balance page', async () => {
    await allowPaymentMethodRedisplay('pm_synthetic');
    expect(sdk.paymentMethodsUpdate).toHaveBeenCalledWith('pm_synthetic', { allow_redisplay: 'always' });
  });

  it('never picks the second-part PI as the checkout payment', async () => {
    sdk.search.mockResolvedValueOnce({ data: [
      { id: 'pi_balance', status: 'succeeded', metadata: { flow: 'card_v2_balance', part: 'balance', intentId: 'i1' } },
      { id: 'pi_deposit', status: 'succeeded', metadata: { flow: 'card_v2', part: 'deposit', intentId: 'i1' } },
    ] });
    await findSucceededPaymentIntentByIntentId('i1');
    expect(sdk.retrieve).toHaveBeenCalledWith('pi_deposit', { expand: ['latest_charge'] });
    sdk.retrieve.mockClear();
    sdk.search.mockResolvedValueOnce({ data: [
      { id: 'pi_balance', status: 'succeeded', metadata: { flow: 'card_v2_balance', part: 'balance', intentId: 'i1' } },
    ] });
    await expect(findSucceededPaymentIntentByIntentId('i1')).resolves.toBeNull();
    expect(sdk.retrieve).not.toHaveBeenCalled();
  });

  it('a payment attempt is any checkout PI (card, wallet, PayPal or Klarna), never the second part', async () => {
    sdk.search.mockResolvedValueOnce({ data: [
      { id: 'pi_paypal', status: 'requires_payment_method', metadata: { source: 'website-paypal', intentId: 'i1' } },
    ] });
    await expect(hasCheckoutPaymentAttempt("i1'")).resolves.toBe(false); // outro intent: não conta
    expect(sdk.search).toHaveBeenCalledWith({ query: "metadata['intentId']:'i1'", limit: 10 });
    for (const metadata of [
      { source: 'website-paypal', intentId: 'i1' },
      { source: 'website-klarna', intentId: 'i1' },
      { flow: 'card_v2', intentId: 'i1' },
    ]) {
      sdk.search.mockResolvedValueOnce({ data: [{ id: 'pi_x', status: 'canceled', metadata }] });
      await expect(hasCheckoutPaymentAttempt('i1')).resolves.toBe(true);
    }
    sdk.search.mockResolvedValueOnce({ data: [
      { id: 'pi_balance', status: 'requires_payment_method', metadata: { flow: 'card_v2_balance', part: 'balance', intentId: 'i1' } },
    ] });
    await expect(hasCheckoutPaymentAttempt('i1')).resolves.toBe(false);
    sdk.search.mockResolvedValueOnce({ data: [] });
    await expect(hasCheckoutPaymentAttempt('i1')).resolves.toBe(false);
  });
});
