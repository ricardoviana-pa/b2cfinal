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
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
}

export async function createKlarnaPaymentIntent(
  params: CreateKlarnaPaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    payment_method_types: ["klarna"] as any,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
}

export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

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
