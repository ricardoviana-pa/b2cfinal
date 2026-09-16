import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const create = vi.hoisted(() => vi.fn(async () => ({ id: 'pi_synthetic_adapter' })));
vi.mock('stripe', () => ({ default: vi.fn(() => ({ paymentIntents: { create } })) }));
import { createCardPaymentIntent } from '../services/stripe-klarna';

beforeEach(() => { create.mockClear(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_not_a_real_key'); });
afterEach(() => vi.unstubAllEnvs());
describe('Stripe adapter request contract (SDK simulated)', () => {
  it.each([false, true])('forwards the idempotency key with wallet=%s', async wallet => {
    await createCardPaymentIntent({ amount: 12345, currency: 'eur', wallet,
      metadata: { flow: 'card_v2', intentId: 'synthetic-checkout' }, idempotencyKey: 'synthetic-attempt' });
    const [body, options] = create.mock.calls[0] as any[];
    expect(options).toEqual({ idempotencyKey: 'synthetic-attempt' });
    expect(body).toMatchObject({ amount: 12345, currency: 'eur', setup_future_usage: 'off_session' });
    expect(body).not.toHaveProperty('idempotencyKey');
    if (wallet) expect(body.automatic_payment_methods).toEqual({ enabled: true, allow_redirects: 'never' });
    else expect(body.payment_method_types).toEqual(['card']);
  });
});
