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

/** Fase 2b: PI de cartão na conta da PLATAFORMA (cobrança única estadia+extras).
 *  O formato tem de casar com a sessão Elements que o confirma: a fila express
 *  (Apple/Google Pay) usa sessão automatic → PI automatic (sem redirects); o
 *  form de cartão usa sessão types → PI types:[card]. Formatos trocados são
 *  recusados pelo Stripe no confirm (apanhados em produção a 16 e 21 ago). */
export async function createCardPaymentIntent(
  params: CreateKlarnaPaymentIntentParams & { wallet?: boolean },
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    // Guarda o cartao com mandato para cobrancas futuras fora de sessao. E o
    // que devolve ao Guesty a carteira que o fluxo antigo (BE instant/ccToken)
    // tinha: caucao, danos, noites extra e saldos. Sem isto o metodo existe
    // mas nao ha mandato, e a cobranca off-session cai em SCA.
    setup_future_usage: "off_session",
    ...(params.wallet
      ? { automatic_payment_methods: { enabled: true, allow_redirects: "never" as const } }
      : { payment_method_types: ["card"] }),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
}

/** Cancela um PI não-capturado (usado para reformar PIs em formato antigo). */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(paymentIntentId);
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
 * Bloco 4: encontra o PI pago de um intent do checkout v2 (conta de
 * PLATAFORMA — cartão card_v2, wallet, Klarna ou PayPal, todos carimbam
 * metadata.intentId). Devolve null se não houver pagamento bem-sucedido.
 */
export async function findSucceededPaymentIntentByIntentId(
  intentId: string,
): Promise<Stripe.PaymentIntent | null> {
  const stripe = getStripe();
  const res = await stripe.paymentIntents.search({
    query: `metadata['intentId']:'${intentId.replace(/['\\]/g, "")}' AND status:'succeeded'`,
    limit: 10,
  });
  const pi = res.data.find((p) => p.status === "succeeded") ?? null;
  if (!pi) return null;
  // Retrieve com o charge expandido para saber o que já foi reembolsado
  return stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
}

/**
 * Bloco 4: reembolso parcial no PI original, SEMPRE na conta de plataforma.
 * Idempotente por (PI, sku) via idempotency key do Stripe.
 */
export async function createPartialRefund(params: {
  paymentIntentId: string;
  amountCents: number;
  intentId: string;
  sku: string;
}): Promise<Stripe.Refund> {
  const stripe = getStripe();
  return stripe.refunds.create(
    {
      payment_intent: params.paymentIntentId,
      amount: params.amountCents,
      reason: "requested_by_customer",
      metadata: { flow: "checkout_v2_line_refund", intentId: params.intentId, sku: params.sku },
    },
    { idempotencyKey: `checkout-line-refund-${params.paymentIntentId}-${params.sku}` },
  );
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
