/**
 * Erros de pagamento em linguagem humana, nas 9 línguas, e as ações que cada
 * um permite (auditoria do funil, out/2026, n.º 4).
 *
 * Uma só tradução para cartão, Apple Pay / Google Pay, PayPal e Klarna:
 * - Stripe: decline_code (mais específico) ou code;
 * - servidor (tRPC): as mensagens conhecidas do createCardCharge e do
 *   PayPal/Klarna, em inglês técnico, nunca chegam cruas ao hóspede.
 *
 * Regras:
 * - recusas por fraude, cartão perdido/roubado ou do_not_honor nunca sugerem
 *   tentar de novo o mesmo cartão (e não revelam o motivo, como a Stripe pede);
 * - "já pago" / "ainda a processar" / "transação duplicada" nunca oferecem
 *   outro método nem as duas partes: pagar outra vez seria uma dupla cobrança;
 * - as duas partes oferecem-se depois de uma recusa por LIMITE do cartão
 *   (insufficient_funds e afins) e, desde 29 out 2026 (decisão do Ricardo),
 *   também depois de uma recusa GENÉRICA (generic_decline, card_declined sem
 *   motivo): os emissores escondem muitas vezes o limite atrás de uma recusa
 *   sem motivo, e metade do valor no mesmo cartão é a saída mais comum. Com a
 *   oferta do servidor e o hóspede em "tudo agora"; o cartão escrito fica no
 *   formulário ao mudar de plano, por isso a ação é uma nova tentativa com o
 *   mesmo cartão e um valor menor. Nunca depois de fraude, perda, roubo,
 *   do_not_honor, cartão expirado, não aceite ou transação duplicada
 *   (revisão do PR #176).
 */

export type PaymentErrorKind =
  /** O banco ou o fornecedor recusou com um motivo que exclui o mesmo cartão: outro cartão ou método. */
  | "decline"
  /** Recusa sem motivo (generic_decline, card_declined): outro método e também as duas partes. */
  | "decline_generic"
  /** Recusa pelo limite do cartão para este valor: também as duas partes. */
  | "decline_limit"
  /** Dados do cartão por corrigir (CVC, número, validade): corrigir e repetir. */
  | "card_details"
  /** Falha passageira (banco, rede, gravação): repetir é seguro, nada foi cobrado. */
  | "retry"
  /** Preço expirado ou datas ocupadas: o ecrã já mostra o que fazer. */
  | "stale"
  /** Pagamento já feito ou ainda a processar: não pagar outra vez. */
  | "blocked"
  /** As duas partes deixaram de estar disponíveis: volta-se a "tudo agora". */
  | "two_parts_unavailable"
  /** Falta a caixa da autorização da 2.ª parte. */
  | "mandate_missing"
  | "generic";

export interface PaymentErrorInfo {
  /** Chave i18n; null quando a mensagem da Stripe (já na língua do Elements) é a certa. */
  key: string | null;
  kind: PaymentErrorKind;
  /** Tentar outra vez com o MESMO cartão pode resultar. */
  retrySameCard: boolean;
}

/** Recusas pelo valor: as únicas em que pagar menos hoje, com o mesmo cartão, pode resultar. */
export const LIMIT_DECLINE_CODES = ["insufficient_funds", "card_velocity_exceeded", "withdrawal_count_limit_exceeded", "invalid_amount"] as const;
const LIMIT = new Set<string>(LIMIT_DECLINE_CODES);
const EXPIRED = new Set(["expired_card"]);
const NOT_SUPPORTED = new Set(["card_not_supported", "currency_not_supported"]);
const INCORRECT_CVC = new Set(["incorrect_cvc", "invalid_cvc"]);
const INCORRECT_NUMBER = new Set(["incorrect_number", "invalid_number"]);
const CARD_DETAILS = new Set([
  "invalid_expiry_month", "invalid_expiry_year", "invalid_expiry_month_past", "invalid_expiry_year_past",
  "incorrect_zip", "incorrect_address", "postal_code_invalid",
  "incomplete_number", "incomplete_cvc", "incomplete_expiry", "incomplete_zip",
]);
const BANK_UNAVAILABLE = new Set(["processing_error", "try_again_later", "issuer_not_available", "reenter_transaction", "approve_with_id"]);
const AUTHENTICATION = new Set(["authentication_required", "payment_intent_authentication_failure", "setup_intent_authentication_failure"]);
/** O PI já está noutro estado (pago ou em curso): nunca convidar a pagar de novo. */
const IN_FLIGHT = new Set(["payment_intent_unexpected_state"]);
/** A Stripe: "verifique se já existe um pagamento recente" — nunca outro método
 *  nem duas partes (pode haver um pagamento noutra janela para a mesma estadia). */
const DUPLICATE = new Set(["duplicate_transaction"]);
/** Recusa sem motivo: o emissor não disse porquê (muitas vezes é o limite,
 *  escondido). Mesma mensagem que as recusas duras, mas com as duas partes como
 *  saída (decisão do Ricardo, 29 out 2026). */
export const GENERIC_DECLINE_CODES = ["generic_decline", "card_declined"] as const;
const GENERIC_DECLINE = new Set<string>(GENERIC_DECLINE_CODES);
/** Sem motivo revelado e sem "tente de novo" (a Stripe pede que fraude,
 *  perda e roubo pareçam uma recusa genérica). Nunca as duas partes: o
 *  motivo exclui o mesmo cartão, seja qual for o valor. */
export const NO_RETRY_DECLINE_CODES = [
  "fraudulent", "lost_card", "stolen_card", "pickup_card", "restricted_card", "security_violation",
  "merchant_blacklist", "do_not_honor", "do_not_try_again", "revocation_of_all_authorizations",
  "revocation_of_authorization", "stop_payment_order", "not_permitted", "transaction_not_allowed",
  "invalid_account", "new_account_information_available", "no_action_taken", "call_issuer",
  "service_not_allowed", "testmode_decline",
  "invalid_pin", "incorrect_pin", "pin_try_exceeded", "offline_pin_required", "online_or_offline_pin_required",
  "payment_method_provider_decline",
] as const;
const NO_RETRY = new Set<string>(NO_RETRY_DECLINE_CODES);

/** Mensagens conhecidas do servidor (routers/checkout.ts, trusted-checkout-quote.ts,
 *  PayPal/Klarna). A primeira que casa ganha. */
const SERVER_MESSAGES: Array<[RegExp, PaymentErrorInfo]> = [
  [/quote expired|refresh your dates|refresh the price/i, { key: "payment.errors.quoteExpired", kind: "stale", retrySameCard: true }],
  // PayPal/Klarna (wallet-price-validation.ts): preço, tarifa ou intent mudaram desde o ecrã
  [/details have changed|refresh before paying/i, { key: "payment.errors.priceChanged", kind: "stale", retrySameCard: false }],
  [/dates no longer available/i, { key: "payment.errors.datesGone", kind: "stale", retrySameCard: false }],
  [/still processing/i, { key: "payment.errors.stillProcessing", kind: "blocked", retrySameCard: false }],
  [/already paid/i, { key: "payment.errors.alreadyPaidShort", kind: "blocked", retrySameCard: false }],
  [/two-part payment is not available/i, { key: "payment.errors.twoPartsUnavailable", kind: "two_parts_unavailable", retrySameCard: false }],
  [/authori[sz]ation for the second payment/i, { key: "payment.mandateMissing", kind: "mandate_missing", retrySameCard: true }],
  [/could not be prepared/i, { key: "payment.errors.prepareFailed", kind: "retry", retrySameCard: true }],
  [/could not be saved/i, { key: "payment.errors.saveFailed", kind: "retry", retrySameCard: true }],
  // routers/booking.ts (createKlarnaPaymentIntent): país de faturação ou valor fora do que a Klarna aceita
  [/klarna is not available/i, { key: "payment.errors.klarnaUnavailable", kind: "decline", retrySameCard: false }],
  [/too many requests|rate limit|\b429\b/i, { key: "payment.errors.rateLimitError", kind: "retry", retrySameCard: true }],
  [/fetch|network|failed to load|timed? ?out/i, { key: "payment.errors.network", kind: "retry", retrySameCard: true }],
];

const GENERIC: PaymentErrorInfo = { key: "payment.errors.genericRetry", kind: "generic", retrySameCard: true };
const DECLINED: PaymentErrorInfo = { key: "payment.errors.declinedGeneric", kind: "decline", retrySameCard: false };
/** A mesma frase, mas com as duas partes entre as saídas. */
const DECLINED_GENERIC: PaymentErrorInfo = { key: "payment.errors.declinedGeneric", kind: "decline_generic", retrySameCard: false };

/** Todas as chaves que este módulo pode devolver (o teste confirma-as nas 9 línguas). */
export const PAYMENT_ERROR_KEYS = [
  "payment.errors.declinedLimit",
  "payment.errors.declinedGeneric",
  "payment.errors.duplicateTransaction",
  "payment.errors.cardExpired",
  "payment.errors.cardNotSupported",
  "payment.errors.incorrectCvc",
  "payment.errors.incorrectNumber",
  "payment.errors.cardDetails",
  "payment.errors.bankUnavailable",
  "payment.errors.authenticationFailed",
  "payment.errors.cardValidationFailed",
  ...new Set([...SERVER_MESSAGES.map(([, info]) => info.key as string), GENERIC.key as string]),
];

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function fromStripeCode(c: string): PaymentErrorInfo | null {
  if (LIMIT.has(c)) return { key: "payment.errors.declinedLimit", kind: "decline_limit", retrySameCard: false };
  if (EXPIRED.has(c)) return { key: "payment.errors.cardExpired", kind: "decline", retrySameCard: false };
  if (NOT_SUPPORTED.has(c)) return { key: "payment.errors.cardNotSupported", kind: "decline", retrySameCard: false };
  if (INCORRECT_CVC.has(c)) return { key: "payment.errors.incorrectCvc", kind: "card_details", retrySameCard: true };
  if (INCORRECT_NUMBER.has(c)) return { key: "payment.errors.incorrectNumber", kind: "card_details", retrySameCard: true };
  if (CARD_DETAILS.has(c)) return { key: "payment.errors.cardDetails", kind: "card_details", retrySameCard: true };
  if (BANK_UNAVAILABLE.has(c)) return { key: "payment.errors.bankUnavailable", kind: "retry", retrySameCard: true };
  if (AUTHENTICATION.has(c)) return { key: "payment.errors.authenticationFailed", kind: "retry", retrySameCard: true };
  if (IN_FLIGHT.has(c)) return { key: "payment.errors.stillProcessing", kind: "blocked", retrySameCard: false };
  if (DUPLICATE.has(c)) return { key: "payment.errors.duplicateTransaction", kind: "blocked", retrySameCard: false };
  if (NO_RETRY.has(c)) return DECLINED;
  if (GENERIC_DECLINE.has(c)) return DECLINED_GENERIC;
  return null;
}

export function classifyPaymentError(e: unknown): PaymentErrorInfo {
  const err = (e ?? {}) as { type?: unknown; code?: unknown; decline_code?: unknown; message?: unknown };
  const type = str(err.type);
  // Validação do próprio formulário da Stripe (campo incompleto): a mensagem
  // dela já vem na língua do Elements e o campo fica assinalado.
  if (type === "validation_error") return { key: null, kind: "card_details", retrySameCard: true };
  const decline = str(err.decline_code);
  const code = str(err.code);
  if (decline) {
    const hit = fromStripeCode(decline);
    if (hit) return hit;
    // Um motivo que não conhecemos: recusa dura (sem duas partes), nunca
    // "genérica" só porque o code por baixo é card_declined.
    return DECLINED;
  }
  if (code) {
    const hit = fromStripeCode(code);
    if (hit) return hit;
  }
  // Recusa da Stripe sem código nenhum: recusa genérica dura.
  if (type === "card_error") return DECLINED;
  if (type === "api_connection_error") return { key: "payment.errors.network", kind: "retry", retrySameCard: true };
  if (type === "rate_limit_error") return { key: "payment.errors.rateLimitError", kind: "retry", retrySameCard: true };
  const msg = String(err.message ?? "");
  for (const [re, info] of SERVER_MESSAGES) if (re.test(msg)) return info;
  return GENERIC;
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** O preço tem de ser refeito antes de pagar: o checkout mostra "Atualizar preço". */
export function needsPriceRefresh(info: Pick<PaymentErrorInfo, "key"> | null | undefined): boolean {
  return info?.key === "payment.errors.quoteExpired" || info?.key === "payment.errors.priceChanged";
}

export function humanPaymentError(e: unknown, t: Translate): string {
  const info = classifyPaymentError(e);
  if (info.key === null) {
    const own = str((e as { message?: unknown } | null)?.message);
    return own ?? t("payment.errors.cardValidationFailed");
  }
  return t(info.key);
}

export interface PaymentErrorActions {
  /** "Pagar em duas partes (X hoje)" */
  twoParts: boolean;
  /** "Usar outro cartão ou método" */
  otherMethod: boolean;
  /** "Falar com o concierge" (WhatsApp) */
  concierge: boolean;
}

/** Até três ações por erro, nunca uma que leve a pagar duas vezes. */
export function paymentErrorActions(
  info: Pick<PaymentErrorInfo, "kind">,
  ctx: { twoPartsOffered: boolean; plan?: "full" | "two_parts" },
): PaymentErrorActions {
  switch (info.kind) {
    case "decline_limit":
    case "decline_generic":
      return { twoParts: ctx.twoPartsOffered && ctx.plan !== "two_parts", otherMethod: true, concierge: true };
    case "decline":
      return { twoParts: false, otherMethod: true, concierge: true };
    case "retry":
    case "generic":
      return { twoParts: false, otherMethod: true, concierge: true };
    case "stale":
    case "blocked":
    case "two_parts_unavailable":
      return { twoParts: false, otherMethod: false, concierge: true };
    case "card_details":
    case "mandate_missing":
      return { twoParts: false, otherMethod: false, concierge: false };
  }
}
