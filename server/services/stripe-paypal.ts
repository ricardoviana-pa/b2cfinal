/**
 * stripe-paypal.ts
 *
 * Stripe service for PayPal-based PaymentIntents.
 *
 * Uses a lazy singleton pattern: the Stripe instance is created on first
 * call so that `STRIPE_SECRET_KEY` is read at call time, not at module load.
 * This keeps the module test-friendly (vi.resetModules() + dynamic import).
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is not set. " +
        "Set it in your .env file before using the Stripe PayPal service."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export interface CreatePayPalPaymentIntentParams {
  /** Amount in the smallest currency unit (e.g. cents for EUR). */
  amount: number;
  /** ISO 4217 currency code in lowercase, e.g. "eur". */
  currency: string;
  /** Optional metadata to attach to the PaymentIntent. */
  metadata?: Record<string, string>;
}

/**
 * Create a Stripe PaymentIntent configured for PayPal.
 */
export async function createPayPalPaymentIntent(
  params: CreatePayPalPaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    payment_method_types: ["paypal"] as any,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
}

/**
 * Retrieve an existing PaymentIntent by its ID.
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Merge metadata into an existing PaymentIntent.
 *
 * Stripe merges the supplied keys with the PI's existing metadata (keys not passed
 * are preserved), so this is used as a cross-process idempotency store: the first
 * path to create a Guesty reservation stamps its id here, and any other path/instance
 * reads it back instead of creating a duplicate.
 */
export async function updatePaymentIntentMetadata(
  paymentIntentId: string,
  metadata: Record<string, string>
): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentIntents.update(paymentIntentId, { metadata });
}

/**
 * Construct and verify a Stripe webhook event for PayPal events.
 *
 * Throws if the signature is invalid or `STRIPE_PAYPAL_WEBHOOK_SECRET` is not set.
 */
export function constructStripePayPalWebhookEvent(
  payload: Buffer | string,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_PAYPAL_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_PAYPAL_WEBHOOK_SECRET environment variable is not set. " +
        "Set it in your .env file to verify PayPal webhook signatures."
    );
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
