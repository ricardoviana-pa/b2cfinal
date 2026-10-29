/**
 * O `setup_future_usage` dos PaymentIntents do checkout 2.0 (servidor,
 * createCardPaymentIntent) e o `setupFutureUsage` das duas sessões Elements do
 * cliente (formulário de cartão e Apple Pay / Google Pay) têm de ser iguais.
 * Se divergirem, a Stripe recusa o confirm: "The provided setup_future_usage
 * (off_session) does not match the expected setup_future_usage (null)".
 *
 * O formulário de cartão foi acertado a 29 ago 2026 (99a4cc71); as wallets
 * ficaram sem ele até 29 out 2026. Uma só constante para os três sítios.
 */
export const CHECKOUT_SETUP_FUTURE_USAGE = "off_session" as const;
