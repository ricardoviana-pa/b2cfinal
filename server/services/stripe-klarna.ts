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
import { CHECKOUT_SETUP_FUTURE_USAGE } from "@shared/stripeSetupFutureUsage";

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

export interface CreateCardPaymentIntentParams extends CreateKlarnaPaymentIntentParams {
  wallet?: boolean;
  idempotencyKey: string;
  /** Só no plano em duas partes: Customer da plataforma que fica dono do cartão
   *  (spec 5.4). Sem `customer` o pedido à Stripe é exatamente o do plano full. */
  customer?: string;
  /** Só com `customer`: "Estadia <casa> <check-in>: 1.ª parte". */
  description?: string;
  /** Só com `customer`: "PART 1/2" (o prefixo vem do Dashboard). */
  statementDescriptorSuffix?: string;
}

/** Fase 2b: PI de cartão na conta da PLATAFORMA (cobrança única estadia+extras).
 *  O formato tem de casar com a sessão Elements que o confirma: a fila express
 *  (Apple/Google Pay) usa sessão automatic → PI automatic (sem redirects); o
 *  form de cartão usa sessão types → PI types:[card]. Formatos trocados são
 *  recusados pelo Stripe no confirm (apanhados em produção a 16 e 21 ago).
 *
 *  Duas partes (Fase 1): com `customer` o PI é a 1.ª parte e o cartão fica
 *  guardado no NOSSO Customer para a 2.ª ser cobrada fora de sessão. Os campos
 *  novos só entram nesse ramo: o plano full tem de chegar à Stripe byte a byte
 *  igual ao de hoje (o stripe-adapter.test.ts fixa o corpo). */
export async function createCardPaymentIntent(
  params: CreateCardPaymentIntentParams,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  // A folha da wallet e o PI têm de ter o mesmo amount (o total); a v1 força
  // full para wallets, por isso as duas combinadas só podem ser um bug a
  // montante — recusar antes de criar um PI de depósito numa sessão automatic.
  if (params.customer && params.wallet) {
    throw new Error("createCardPaymentIntent: two-part payments never use a wallet session");
  }
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    // Guarda o cartao com mandato para cobrancas futuras fora de sessao. E o
    // que devolve ao Guesty a carteira que o fluxo antigo (BE instant/ccToken)
    // tinha: caucao, danos, noites extra e saldos. Sem isto o metodo existe
    // mas nao ha mandato, e a cobranca off-session cai em SCA. As duas sessoes
    // Elements do cliente (cartao e wallets) usam a mesma constante.
    setup_future_usage: CHECKOUT_SETUP_FUTURE_USAGE,
    ...(params.wallet
      ? { automatic_payment_methods: { enabled: true, allow_redirects: "never" as const } }
      : { payment_method_types: ["card"] }),
    ...(params.customer
      ? {
          customer: params.customer,
          // "automatic" deixa a Stripe pedir 3DS quando o emissor/regulação o
          // exigem; com setup_future_usage isso autentica o mandato agora, e a
          // 2.ª parte (MIT) passa sem desafio na grande maioria dos cartões.
          payment_method_options: { card: { request_three_d_secure: "automatic" as const } },
          ...(params.statementDescriptorSuffix
            ? { statement_descriptor_suffix: params.statementDescriptorSuffix }
            : {}),
          ...(params.description ? { description: params.description } : {}),
        }
      : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  }, { idempotencyKey: params.idempotencyKey });
}

/** Línguas do site → `preferred_locales` da Stripe (recibos e páginas
 *  alojadas). pt é sempre pt-PT (a Stripe distingue pt-BR); uma língua que não
 *  conhecemos omite-se, e a Stripe usa a da conta. */
const STRIPE_PREFERRED_LOCALES: Record<string, string[]> = {
  pt: ["pt-PT"],
  en: ["en"],
  es: ["es"],
  fr: ["fr"],
  de: ["de"],
  it: ["it"],
  nl: ["nl"],
  sv: ["sv"],
  fi: ["fi"],
};

function stripePreferredLocales(locale: string | null | undefined): string[] | undefined {
  const lang = String(locale ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return STRIPE_PREFERRED_LOCALES[lang];
}

/** A Stripe recusa telefones de Customer com mais de 20 caracteres; o telefone
 *  é só informativo no Customer, por isso nunca pode impedir o pagamento. */
const STRIPE_CUSTOMER_PHONE_MAX = 20;

/**
 * Duas partes (spec 5.4): Customer da plataforma, dono do cartão até a 2.ª
 * parte estar paga. O chamador grava o id em booking_intents.stripe_customer_id
 * ANTES de criar o PI e nunca o devolve ao browser.
 *
 * A idempotency key por intent faz com que uma retoma (duplo clique, timeout,
 * gravação na BD falhada) devolva o MESMO Customer em vez de criar outro.
 */
export async function ensureStripeCustomer(input: {
  intentId: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  locale?: string | null;
}): Promise<string> {
  const stripe = getStripe();
  const email = input.email?.trim();
  const name = input.name?.trim();
  const phone = input.phone?.trim();
  const preferredLocales = stripePreferredLocales(input.locale);
  try {
    const customer = await stripe.customers.create(
      {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(phone && phone.length <= STRIPE_CUSTOMER_PHONE_MAX ? { phone } : {}),
        ...(preferredLocales ? { preferred_locales: preferredLocales } : {}),
        metadata: { intentId: input.intentId, source: "checkout_v2" },
      },
      { idempotencyKey: `checkout-customer-${input.intentId}` },
    );
    return customer.id;
  } catch (err: any) {
    // A Stripe recusa reutilizar uma key (24 h) com parâmetros diferentes: o
    // hóspede corrigiu o email/nome depois de um 1.º create cujo id não chegou
    // à BD. O Customer já existe — reaproveitá-lo é o que a key pretendia.
    // Search é eventualmente consistente, mas aqui o create original é de um
    // pedido anterior; se ainda não aparecer, o erro sobe e a retoma resolve.
    const idempotencyMismatch =
      err?.type === "StripeIdempotencyError" || err?.rawType === "idempotency_error";
    if (!idempotencyMismatch) throw err;
    const safeId = input.intentId.replace(/['\\]/g, "");
    const found = await stripe.customers.search({
      query: `metadata['intentId']:'${safeId}'`,
      limit: 10,
    });
    const own = found.data.filter(
      (c) => c.metadata?.intentId === input.intentId && c.metadata?.source === "checkout_v2",
    );
    // Mais de um seria um estado que não sabemos desambiguar: o cartão tem de
    // ficar num só Customer (exclusividade, spec 5.4) — melhor falhar alto.
    if (own.length === 1) return own[0].id;
    throw err;
  }
}

/** Duas partes: o cartão guardado pelo PI da 1.ª parte não fica com
 *  allow_redisplay "always"; sem isso a página do saldo (Fase 2) não o pode
 *  mostrar ("Confirmar com o cartão ••••1234") nos Elements. Chamado no settle. */
export async function allowPaymentMethodRedisplay(paymentMethodId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentMethods.update(paymentMethodId, { allow_redisplay: "always" });
}

/** Cancela um PI não-capturado (usado para reformar PIs em formato antigo). */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Retrieve an existing PaymentIntent by its ID.
 *
 * `params` (duas partes, Fase 1) serve para `expand: ["payment_method",
 * "latest_charge"]`: o settle precisa do pm_, de card.brand/last4/exp_* e do
 * amount_refunded. Sem `params` as chamadas são exatamente as de sempre, para
 * nenhum dos chamadores atuais (settle full, recibo, Klarna/PayPal) mudar.
 */
export async function getPaymentIntent(
  paymentIntentId: string,
  options?: Stripe.RequestOptions,
  params?: Stripe.PaymentIntentRetrieveParams,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (params) return stripe.paymentIntents.retrieve(paymentIntentId, params, options);
  return options
    ? stripe.paymentIntents.retrieve(paymentIntentId, {}, options)
    : stripe.paymentIntents.retrieve(paymentIntentId);
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
 *
 * Duas partes: a 2.ª parte (part=balance, Fase 2) também carimba o intentId,
 * mas não é o pagamento do checkout — o settle e os reembolsos por linha
 * trabalham sobre a 1.ª. Escolher o PI do saldo criaria a reserva com o valor
 * errado, por isso fica de fora mesmo que seja o mais recente.
 */
export async function findSucceededPaymentIntentByIntentId(
  intentId: string,
): Promise<Stripe.PaymentIntent | null> {
  const stripe = getStripe();
  const res = await stripe.paymentIntents.search({
    query: `metadata['intentId']:'${intentId.replace(/['\\]/g, "")}' AND status:'succeeded'`,
    limit: 10,
  });
  const pi =
    res.data.find(
      (p) =>
        p.status === "succeeded" &&
        p.metadata?.part !== "balance" &&
        p.metadata?.flow !== "card_v2_balance",
    ) ?? null;
  if (!pi) return null;
  // Retrieve com o charge expandido para saber o que já foi reembolsado
  return stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
}

/**
 * O hóspede chegou a carregar em Pagar neste checkout? Procura na conta da
 * PLATAFORMA os PIs com o intentId na metadata: cartão e wallets (card_v2,
 * criados pelo createCardCharge depois do clique) e PayPal e Klarna (criados
 * no clique, antes do redirect, e que não deixam nada no intent). A 2.ª parte
 * das duas partes não conta: não é uma tentativa do checkout.
 *
 * Só lê. A pesquisa da Stripe é eventualmente consistente (cerca de um
 * minuto): serve para o email de recuperação, que sai uma hora depois.
 */
export async function hasCheckoutPaymentAttempt(intentId: string): Promise<boolean> {
  const stripe = getStripe();
  const res = await stripe.paymentIntents.search({
    query: `metadata['intentId']:'${intentId.replace(/['\\]/g, "")}'`,
    limit: 10,
  });
  return res.data.some(
    (p) =>
      p.metadata?.intentId === intentId &&
      p.metadata?.part !== "balance" &&
      p.metadata?.flow !== "card_v2_balance",
  );
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
