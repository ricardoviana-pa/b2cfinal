/**
 * stripe-klarna.ts
 *
 * Stripe service for Klarna-based PaymentIntents.
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
        "Set it in your .env file before using the Stripe Klarna service."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export interface CreateKlarnaPaymentIntentParams {
  /** Amount in the smallest currency unit (e.g. cents for EUR). */
  amount: number;
  /** ISO 4217 currency code in lowercase, e.g. "eur". */
  currency: string;
  /** Optional metadata to attach to the PaymentIntent. */
  metadata?: Record<string, string>;
}

/**
 * Create a Stripe PaymentIntent configured for Klarna.
 */
export async function createKlarnaPaymentIntent(
  params: CreateKlarnaPaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    // `as any` needed because Stripe SDK types don't enumerate all redirect-based methods like Klarna.
    payment_method_types: ["klarna"] as any,
    payment_method_options: {
      klarna: { preferred_locale: "en-PT" },
    } as any,
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
 * Construct and verify a Stripe webhook event for Klarna events.
 *
 * Throws if the signature is invalid or `STRIPE_KLARNA_WEBHOOK_SECRET` is not set.
 */
export function constructStripeKlarnaWebhookEvent(
  payload: Buffer | string,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_KLARNA_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_KLARNA_WEBHOOK_SECRET environment variable is not set. " +
        "Set it in your .env file to verify Klarna webhook signatures."
    );
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
