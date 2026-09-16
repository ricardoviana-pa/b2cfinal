import { createHash } from 'node:crypto';

const chargeQueues = new Map<string, Promise<void>>();

/** Serialize changes for one checkout in this process. Stripe's idempotency
 * key additionally covers identical creation retries across processes. */
export async function withCheckoutChargeLock<T>(intentId: string, action: () => Promise<T>): Promise<T> {
  const previous = chargeQueues.get(intentId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  chargeQueues.set(intentId, current);
  await previous;
  try { return await action(); }
  finally {
    release();
    if (chargeQueues.get(intentId) === current) chargeQueues.delete(intentId);
  }
}

/** Same checkout/payload/previous payment => same Stripe creation attempt.
 * A canceled predecessor distinguishes a deliberate replacement. No personal
 * details are exposed in the key. Keep the payload identical on a retry. */
export function cardChargeIdempotencyKey(payload: object, previousPaymentId: string | null): string {
  const digest = createHash('sha256').update(JSON.stringify([previousPaymentId, payload])).digest('hex');
  return `checkout-card-v2-${digest}`;
}
