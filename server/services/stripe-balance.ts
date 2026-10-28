/**
 * stripe-balance.ts
 *
 * Duas partes (Fase 2a): tudo o que o motor da 2.ª parte pede à Stripe —
 * criar o PI do saldo sem o confirmar, confirmá-lo fora de sessão, relê-lo,
 * cancelar PIs abertos e reembolsar o remanescente de um PI (spec 5.1 e 5.9).
 *
 * Este módulo nunca decide estados da linha: devolve à Stripe o que a Stripe
 * respondeu, de forma que o chamador (checkout-balance.ts) possa decidir com
 * UPDATEs condicionais. Por isso não há aqui nenhum "fallback" que cobre ou
 * devolva dinheiro: na dúvida lança ou diz "ambíguo", e quem chama relê o PI.
 *
 * Cliente Stripe preguiçoso como em stripe-klarna.ts: a chave é lida na
 * primeira chamada (testes com vi.resetModules() + import dinâmico).
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is not set. " +
        "Set it in your .env file before using the Stripe balance service.",
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/* ════════════════════════════════════════════════════════════════
   Classificação das recusas (spec 2.4)
   ════════════════════════════════════════════════════════════════ */

export type DeclineKind = "soft" | "hard" | "auth";

/** O banco pede que o titular confirme (3DS): só o hóspede resolve, no mesmo
 *  cartão, pela página do saldo. */
const AUTH_CODES = new Set(["authentication_required"]);

/** Recusas em que tentar outra vez o mesmo cartão nunca resolve: o hóspede tem
 *  de usar outro. A lista da spec 2.4 e do contrato, mais os códigos que a
 *  Stripe documenta como "não repetir" e que a Visa/Mastercard põem na
 *  categoria "o emissor nunca vai aprovar" (revogações, ordem de paragem,
 *  número inválido): repetir esses pagamentos MIT é proibido pelas redes e
 *  sujeito a taxas por reapresentação excessiva. */
const HARD_CODES = new Set([
  // spec 2.4 / contrato
  "expired_card",
  "lost_card",
  "stolen_card",
  "pickup_card",
  "fraudulent",
  "card_not_supported",
  "incorrect_number",
  "invalid_account",
  "restricted_card",
  "currency_not_supported",
  // "não repetir" na documentação de decline codes da Stripe
  "invalid_number",
  "do_not_try_again",
  "revocation_of_all_authorizations",
  "revocation_of_authorization",
  "stop_payment_order",
  "security_violation",
  "new_account_information_available",
  "merchant_blacklist",
  "transaction_not_allowed",
  "not_permitted",
  "service_not_allowed",
  "testmode_decline",
  "live_mode_test_card",
]);

function normCode(code?: string | null): string | null {
  const c = String(code ?? "").trim().toLowerCase();
  return c ? c : null;
}

/**
 * soft → nova tentativa automática (C+1, C+3); auth → 3DS pelo hóspede;
 * hard → outro cartão. Precedência hard > auth > soft: se QUALQUER dos dois
 * códigos (decline_code ou code do erro) indicar uma recusa definitiva, não se
 * repete — repetir uma recusa hard é o erro caro (regras das redes), tratar
 * uma soft como hard só custa um email a pedir outro cartão.
 *
 * Desconhecidos → soft (contrato): a Stripe acrescenta códigos novos e a
 * maioria é temporária. A linha também pode ter gravado o próprio kind
 * ("soft"/"hard"/"auth") quando a Stripe não deu código; aceita-se tal e qual
 * para o aviso E3 não trocar a variante.
 */
export function classifyDecline(declineCode?: string | null, errorCode?: string | null): DeclineKind {
  const codes = [normCode(declineCode), normCode(errorCode)].filter((c): c is string => c !== null);
  if (codes.some((c) => HARD_CODES.has(c) || c === "hard")) return "hard";
  if (codes.some((c) => AUTH_CODES.has(c) || c === "auth")) return "auth";
  return "soft";
}

/* ════════════════════════════════════════════════════════════════
   Erros: definitivos vs ambíguos
   ════════════════════════════════════════════════════════════════ */

/** Respostas em que a Stripe garante que o pedido NÃO teve efeito (pedido
 *  inválido, sem permissão, recurso inexistente, rate limit) ou em que o
 *  efeito é conhecido (402 = recusa). Tudo o resto — sem resposta, 5xx, 409
 *  (pedido concorrente com a mesma key ainda a correr) — pode ter cobrado. */
const DEFINITIVE_STATUS = new Set([400, 401, 402, 403, 404, 429]);

/**
 * true quando não se sabe se o pedido mexeu em dinheiro: o chamador tem de
 * reler o PI antes de decidir (nunca assumir "falhou" com dinheiro
 * possivelmente cobrado). Também ambíguos, apesar de serem 400:
 * - idempotency_error: a mesma key já foi usada; o pedido original pode ter
 *   cobrado e a resposta perdeu-se;
 * - payment_intent_unexpected_state: o PI mudou de estado entretanto (o
 *   hóspede pagou, o webhook chegou), por isso o estado real é que manda.
 * Um erro que não é da Stripe (sem statusCode) também conta como ambíguo.
 */
export function isAmbiguousStripeError(err: unknown): boolean {
  const e = err as any;
  const status = typeof e?.statusCode === "number" ? e.statusCode : null;
  if (status === null) return true;
  if (e?.type === "StripeIdempotencyError" || e?.rawType === "idempotency_error") return true;
  if (e?.code === "payment_intent_unexpected_state") return true;
  return !DEFINITIVE_STATUS.has(status);
}

function isCardError(err: unknown): boolean {
  const e = err as any;
  return e?.type === "StripeCardError" || e?.rawType === "card_error" || e?.statusCode === 402;
}

/* ════════════════════════════════════════════════════════════════
   PI da 2.ª parte (spec 5.1, "PI da segunda parte")
   ════════════════════════════════════════════════════════════════ */

export type BalanceChargeSource = "sweep" | "guest" | "admin";

export interface CreateBalancePaymentIntentParams {
  scheduledPaymentId: string;
  /** Número da tentativa (attempts depois do claim): entra na idempotency key,
   *  por isso uma retoma da MESMA tentativa devolve o MESMO PI. */
  attempt: number;
  source: BalanceChargeSource;
  /** balance_cents congelado no settle; nunca recalculado de uma quote. */
  amountCents: number;
  /** Customer da plataforma (dono do cartão, spec 5.1). */
  customer: string;
  /** Obrigatório fora de sessão (sweep/admin); o hóspede pode escolher no browser. */
  paymentMethod?: string;
  description: string;
  /** Tem de trazer intentId: é por ele que o webhook, os reembolsos e a busca
   *  do PI pago do checkout (que exclui part=balance) reconhecem a reserva. */
  metadata: Record<string, string>;
  /** Distingue duas criações da MESMA tentativa lógica (a anterior foi
   *  cancelada depois de uma falha técnica): sem isto a Stripe devolvia o PI
   *  cancelado durante 24 h. O motor passa o id do PI anterior (ou "first"). */
  keyNonce?: string;
}

function balanceKeyBase(scheduledPaymentId: string, attempt: number, source: string, keyNonce?: string): string {
  const nonce = keyNonce ? `-${String(keyNonce).replace(/[^A-Za-z0-9_]/g, "").slice(0, 40)}` : "";
  return `checkout-balance-${scheduledPaymentId}-a${attempt}-${source}${nonce}`;
}

function assertNonEmpty(value: unknown, name: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`stripe-balance: ${name} em falta`);
  }
}

function assertAttempt(attempt: unknown): void {
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1) {
    throw new Error(`stripe-balance: tentativa inválida (${String(attempt)})`);
  }
}

/**
 * Passo 1 da cobrança: cria o PI SEM confirmar. O chamador grava o id na linha
 * (UPDATE ... WHERE status='charging') e só depois chama
 * confirmBalanceOffSession: um processo que morra entre os dois passos deixa o
 * id gravado e a tentativa seguinte age pelo estado real desse PI.
 *
 * Validações antes de qualquer chamada: um valor ou um Customer errados aqui
 * seriam uma cobrança errada, e esses erros só podem vir de um bug a montante.
 */
export async function createBalancePaymentIntent(p: CreateBalancePaymentIntentParams): Promise<Stripe.PaymentIntent> {
  assertNonEmpty(p.scheduledPaymentId, "scheduledPaymentId");
  assertAttempt(p.attempt);
  if (p.source !== "sweep" && p.source !== "guest" && p.source !== "admin") {
    throw new Error(`stripe-balance: origem inválida (${String(p.source)})`);
  }
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) {
    throw new Error(`stripe-balance: valor inválido (${String(p.amountCents)})`);
  }
  if (typeof p.customer !== "string" || !p.customer.startsWith("cus_")) {
    throw new Error("stripe-balance: Customer da plataforma em falta");
  }
  if (p.paymentMethod !== undefined) assertNonEmpty(p.paymentMethod, "paymentMethod");
  // Fora de sessão não há ninguém para escolher o cartão: sem pm_ a Stripe
  // recusaria só no confirm, depois de o PI já existir e estar gravado.
  if (p.source !== "guest" && !p.paymentMethod) {
    throw new Error("stripe-balance: cobrança fora de sessão sem cartão guardado");
  }
  assertNonEmpty(p.description, "description");
  assertNonEmpty(p.metadata?.intentId, "metadata.intentId");

  const stripe = getStripe();
  return stripe.paymentIntents.create(
    {
      amount: p.amountCents,
      currency: "eur",
      customer: p.customer,
      ...(p.paymentMethod ? { payment_method: p.paymentMethod } : {}),
      confirm: false,
      payment_method_types: ["card"],
      // O prefixo vem do Dashboard; "PART 2/2" é o que o hóspede lê no extrato.
      statement_descriptor_suffix: "PART 2/2",
      description: p.description,
      metadata: {
        ...p.metadata,
        // Depois do spread: flow/part são o que mantém este PI fora do settle
        // da 1.ª parte e do findSucceededPaymentIntentByIntentId; o chamador
        // não os pode trocar por engano.
        flow: "card_v2_balance",
        part: "balance",
        scheduledPaymentId: p.scheduledPaymentId,
        attempt: String(p.attempt),
        source: p.source,
      },
    },
    { idempotencyKey: `${balanceKeyBase(p.scheduledPaymentId, p.attempt, p.source, p.keyNonce)}-create` },
  );
}

// processing e requires_action em membros separados (o contrato junta-os num
// só): com um membro de discriminante "a" | "b", dois `if` seguidos não o
// tiram da união e o TypeScript não estreita o resto do código do chamador.
export type ConfirmBalanceResult =
  | { outcome: "succeeded"; pi: Stripe.PaymentIntent }
  | { outcome: "processing"; pi: Stripe.PaymentIntent }
  | { outcome: "requires_action"; pi: Stripe.PaymentIntent }
  | { outcome: "declined"; kind: DeclineKind; declineCode: string | null; message: string; pi?: Stripe.PaymentIntent }
  | { outcome: "error"; message: string; ambiguous: boolean; code?: string | null };

/** Código a gravar em last_decline_code: o decline_code do emissor quando
 *  existe (insufficient_funds...), senão o code do erro (expired_card,
 *  authentication_required...). A Stripe põe decline_code="" nos erros de
 *  cartão sem código, por isso string vazia conta como ausente. */
function declineCodeOf(declineCode?: string | null, code?: string | null): string | null {
  return normCode(declineCode) ?? normCode(code);
}

function fromPaymentIntentState(pi: Stripe.PaymentIntent): ConfirmBalanceResult {
  switch (pi.status) {
    case "succeeded":
      return { outcome: "succeeded", pi };
    case "processing":
      return { outcome: "processing", pi };
    case "requires_action":
      return { outcome: "requires_action", pi };
    case "requires_payment_method": {
      // A Stripe costuma lançar 402 nas recusas off-session; se em vez disso
      // devolver o PI recusado, a recusa está em last_payment_error.
      const lpe: any = pi.last_payment_error;
      const declineCode = declineCodeOf(lpe?.decline_code, lpe?.code);
      return {
        outcome: "declined",
        kind: classifyDecline(lpe?.decline_code, lpe?.code),
        declineCode,
        message: String(lpe?.message || "pagamento recusado"),
        pi,
      };
    }
    default:
      // requires_confirmation, requires_capture, canceled: nada disto é um
      // resultado normal de um confirm off-session. Ambíguo de propósito: o
      // chamador relê o PI e decide pelo estado real.
      return {
        outcome: "error",
        message: `PI ${pi.id} em estado inesperado depois do confirm: ${pi.status}`,
        ambiguous: true,
        code: null,
      };
  }
}

/**
 * Passo 3 da cobrança: confirma fora de sessão (MIT com o mandato da 1.ª
 * parte). Nunca lança: o resultado diz o que aconteceu.
 * - 402 (StripeCardError) → declined, com o PI que vem no erro;
 * - erro de rede/5xx/409 → error ambiguous=true: o chamador relê o PI antes
 *   de decidir, porque o banco pode ter aprovado e a resposta perdeu-se.
 * A idempotency key por tentativa e origem faz com que os retries do SDK e
 * uma retoma do mesmo passo não confirmem duas vezes.
 */
export async function confirmBalanceOffSession(
  piId: string,
  p: { scheduledPaymentId: string; attempt: number; source: string; keyNonce?: string },
): Promise<ConfirmBalanceResult> {
  let stripe: Stripe;
  try {
    assertNonEmpty(piId, "piId");
    assertNonEmpty(p.scheduledPaymentId, "scheduledPaymentId");
    assertAttempt(p.attempt);
    assertNonEmpty(p.source, "source");
    stripe = getStripe();
  } catch (err: any) {
    // Nada foi pedido à Stripe: definitivo, não ambíguo.
    return { outcome: "error", message: String(err?.message ?? err), ambiguous: false, code: null };
  }
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.confirm(
      piId,
      { off_session: true },
      { idempotencyKey: `${balanceKeyBase(p.scheduledPaymentId, p.attempt, p.source, p.keyNonce)}-confirm` },
    );
  } catch (err: any) {
    if (isCardError(err)) {
      const declineCode = declineCodeOf(err?.decline_code, err?.code);
      return {
        outcome: "declined",
        kind: classifyDecline(err?.decline_code, err?.code),
        declineCode,
        message: String(err?.message || "pagamento recusado"),
        ...(err?.payment_intent && typeof err.payment_intent === "object"
          ? { pi: err.payment_intent as Stripe.PaymentIntent }
          : {}),
      };
    }
    return {
      outcome: "error",
      message: String(err?.message ?? err),
      ambiguous: isAmbiguousStripeError(err),
      code: typeof err?.code === "string" ? err.code : null,
    };
  }
  return fromPaymentIntentState(pi);
}

/** Estado real de um PI do saldo, com o charge (amount_refunded, outcome). */
export async function retrieveBalancePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
  assertNonEmpty(id, "id do PaymentIntent");
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
}

/**
 * Rede secundária da spec 5.1: PIs do saldo de uma linha, pelo Customer
 * (list é consistente logo a seguir à escrita; search não é, e nunca serve
 * para read-after-write). Para quando a idempotency key já expirou (24 h) ou
 * o id não chegou à BD.
 */
export async function listBalancePaymentIntentsForLine(
  customer: string,
  scheduledPaymentId: string,
): Promise<Stripe.PaymentIntent[]> {
  assertNonEmpty(customer, "customer");
  assertNonEmpty(scheduledPaymentId, "scheduledPaymentId");
  const stripe = getStripe();
  const res = await stripe.paymentIntents.list({ customer, limit: 20 });
  return res.data.filter(
    (pi) => pi.metadata?.scheduledPaymentId === scheduledPaymentId && pi.metadata?.part === "balance",
  );
}

/* ════════════════════════════════════════════════════════════════
   Cancelar PIs abertos (hard stop, cancelamento, pagamento pelo outro lado)
   ════════════════════════════════════════════════════════════════ */

const CANCELABLE = new Set<Stripe.PaymentIntent.Status>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

function isBalancePi(pi: Stripe.PaymentIntent): boolean {
  return pi.metadata?.part === "balance" || pi.metadata?.flow === "card_v2_balance";
}

/**
 * Cancela um PI do saldo que ainda não cobrou. Só os três estados abertos são
 * cancelados; o resto diz o que é:
 * - "succeeded": o dinheiro entrou — o chamador NÃO pode cancelar a reserva;
 * - "already-final": já estava cancelado;
 * - processing/requires_capture → lança: o banco ainda está a decidir e um
 *   "já final" aqui levaria a cancelar e reembolsar uma reserva que pode ficar
 *   paga daqui a minutos. O chamador repete na passagem seguinte.
 * Corrida com o hóspede (pagou entre o retrieve e o cancel): a Stripe recusa o
 * cancel e relê-se o PI para devolver o estado real.
 */
export async function cancelOpenPaymentIntent(id: string): Promise<"canceled" | "already-final" | "succeeded"> {
  assertNonEmpty(id, "id do PaymentIntent");
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(id);
  // Esta função só serve o saldo: o PI da 1.ª parte nunca pode ser cancelado
  // por aqui, mesmo por engano de quem chama.
  if (!isBalancePi(pi)) {
    throw new Error(`stripe-balance: ${id} não é um PI da 2.ª parte (part=${pi.metadata?.part ?? "—"})`);
  }
  const settled = finalState(pi);
  if (settled) return settled;
  if (!CANCELABLE.has(pi.status)) {
    throw new Error(`stripe-balance: PI ${id} em ${pi.status}, ainda não cancelável`);
  }
  try {
    const canceled = await stripe.paymentIntents.cancel(id);
    if (canceled.status === "canceled") return "canceled";
    const after = finalState(canceled);
    if (after) return after;
    throw new Error(`stripe-balance: cancel de ${id} devolveu ${canceled.status}`);
  } catch (err) {
    const again = await stripe.paymentIntents.retrieve(id);
    const after = finalState(again);
    if (after) return after;
    throw err;
  }
}

function finalState(pi: Stripe.PaymentIntent): "already-final" | "succeeded" | null {
  if (pi.status === "succeeded") return "succeeded";
  if (pi.status === "canceled") return "already-final";
  return null;
}

/* ════════════════════════════════════════════════════════════════
   Reembolso do remanescente de um PI (spec 5.1 "Reembolso" e 5.9)
   ════════════════════════════════════════════════════════════════ */

const REFUND_FLOW = "checkout_v2_two_parts_cancel";
const MAX_REFUND_PAGES = 10;

/** Um reembolso nosso (deste fluxo e desta linha) já feito neste PI. A key de
 *  idempotência só vale 24 h e, depois de um reembolso total, o remanescente
 *  é 0: sem esta busca, uma retoma depois de a BD não ter gravado o refund
 *  devolveria "nada a reembolsar" e o email diria 0 €. */
async function findOwnRefund(
  stripe: Stripe,
  paymentIntentId: string,
  scheduledPaymentId: string,
): Promise<Stripe.Refund | null> {
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_REFUND_PAGES; page++) {
    const res = await stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const own = res.data.find(
      (r) => r.metadata?.flow === REFUND_FLOW && r.metadata?.scheduledPaymentId === scheduledPaymentId,
    );
    if (own) return own;
    if (!res.has_more || res.data.length === 0) return null;
    startingAfter = res.data[res.data.length - 1].id;
  }
  // Mais de 1000 reembolsos num PI não é um estado que saibamos ler: falhar
  // alto em vez de arriscar um segundo reembolso.
  throw new Error(`stripe-balance: demasiados reembolsos em ${paymentIntentId} para verificar`);
}

export interface RefundRemainingResult {
  refundId: string | null;
  refundCents: number;
  /** status do Refund na Stripe (pending/succeeded/failed/canceled/requires_action),
   *  ou "nothing" quando já não havia nada por devolver. */
  status: string;
}

/**
 * Devolve o que falta devolver de um PI: amount_received − amount_refunded do
 * charge (os reembolsos por linha do checkout já saíram deste valor). Usado
 * no hard stop (1.ª parte inteira, incluindo extras, receção e Flex) e no
 * cancelamento pelo hóspede (cada PI).
 *
 * Idempotente de três formas: o reembolso nosso já existente é devolvido tal
 * e qual (mesmo que tenha falhado — um refund falhado é decisão humana, nunca
 * se cria outro às cegas); a idempotency key por (linha, PI); e o
 * remanescente recalculado sempre a partir da Stripe.
 */
export async function refundRemaining(p: {
  paymentIntentId: string;
  intentId: string;
  scheduledPaymentId: string;
  reason: string;
  /** Parte que fica retida (o Flex depois dos 14 dias, spec 5.9); nunca negativa. */
  withholdCents?: number;
}): Promise<RefundRemainingResult> {
  assertNonEmpty(p.paymentIntentId, "paymentIntentId");
  assertNonEmpty(p.intentId, "intentId");
  assertNonEmpty(p.scheduledPaymentId, "scheduledPaymentId");
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(p.paymentIntentId, { expand: ["latest_charge"] });

  // Nunca reembolsar o PI de outra reserva: o id vem da BD e um troca-troca
  // de colunas a montante devolveria dinheiro de um terceiro.
  if (pi.metadata?.intentId !== p.intentId) {
    throw new Error(
      `stripe-balance: PI ${pi.id} pertence a ${pi.metadata?.intentId ?? "—"}, não a ${p.intentId}`,
    );
  }
  if (pi.status === "processing") {
    throw new Error(`stripe-balance: PI ${pi.id} ainda em processing — reembolso adiado`);
  }

  const existing = await findOwnRefund(stripe, pi.id, p.scheduledPaymentId);
  if (existing) {
    return { refundId: existing.id, refundCents: existing.amount, status: existing.status ?? "pending" };
  }

  const received = Number(pi.amount_received ?? 0);
  if (received <= 0) return { refundId: null, refundCents: 0, status: "nothing" };

  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") {
    throw new Error(`stripe-balance: PI ${pi.id} sem latest_charge expandido — remanescente desconhecido`);
  }
  // Um PI de cartão com captura automática tem um só charge com tudo o que foi
  // recebido; se não bater, há charges que esta conta não vê e o remanescente
  // seria um palpite.
  if (typeof charge.amount_captured === "number" && charge.amount_captured !== received) {
    throw new Error(
      `stripe-balance: PI ${pi.id} recebeu ${received} mas o último charge capturou ${charge.amount_captured}`,
    );
  }
  // O que fica retido sai do que ainda há por devolver; quem chama não passa
  // o Flex se ele já tiver sido devolvido por linha (refunded_skus).
  const withhold = Math.max(0, Math.round(Number(p.withholdCents ?? 0)) || 0);
  const refunded = Number(charge.amount_refunded ?? 0);
  const remaining = received - refunded - withhold;
  if (received - refunded < 0) {
    throw new Error(`stripe-balance: PI ${pi.id} com mais reembolsado do que recebido`);
  }
  if (remaining <= 0) return { refundId: null, refundCents: 0, status: "nothing" };

  const refund = await stripe.refunds.create(
    {
      payment_intent: pi.id,
      amount: remaining,
      reason: "requested_by_customer",
      metadata: {
        flow: REFUND_FLOW,
        intentId: p.intentId,
        scheduledPaymentId: p.scheduledPaymentId,
        cancelReason: String(p.reason ?? "").slice(0, 500),
      },
    },
    { idempotencyKey: `checkout-two-parts-cancel-${p.scheduledPaymentId}-${pi.id}` },
  );
  return { refundId: refund.id, refundCents: refund.amount, status: refund.status ?? "pending" };
}


/* ════════════════════════════════════════════════════════════════
   Fase 2b: troca de cartão pelo hóspede (SetupIntent na conta da plataforma)
   ════════════════════════════════════════════════════════════════ */

/**
 * SetupIntent para o hóspede autorizar outro cartão para a 2.ª parte. Fica no
 * Customer da plataforma (nunca no Guesty), com uso off_session e 3DS quando
 * o banco o pedir. A chave de idempotência muda a cada minuto: um duplo
 * clique devolve o mesmo, um regresso mais tarde cria outro.
 */
export async function createCardChangeSetupIntent(p: { scheduledPaymentId: string; intentId: string; customer: string; now?: Date }): Promise<Stripe.SetupIntent> {
  assertNonEmpty(p.scheduledPaymentId, "scheduledPaymentId");
  assertNonEmpty(p.intentId, "intentId");
  if (!/^cus_/.test(String(p.customer ?? ""))) throw new Error("stripe-balance: SetupIntent sem customer da plataforma");
  const bucket = Math.floor((p.now ?? new Date()).getTime() / 60_000);
  return getStripe().setupIntents.create(
    {
      customer: p.customer,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { flow: "card_v2_card_change", intentId: p.intentId, scheduledPaymentId: p.scheduledPaymentId },
    },
    { idempotencyKey: `checkout-balance-${p.scheduledPaymentId}-card-change-${bucket}` },
  );
}

/** SetupIntent com o payment_method expandido (marca, últimos 4, validade). */
export async function retrieveCardChangeSetupIntent(id: string): Promise<Stripe.SetupIntent> {
  assertNonEmpty(id, "setupIntentId");
  return getStripe().setupIntents.retrieve(id, { expand: ["payment_method"] });
}

/** O cartão pode aparecer na página do saldo ("••••1234"). */
export async function allowRedisplay(paymentMethodId: string): Promise<void> {
  assertNonEmpty(paymentMethodId, "paymentMethodId");
  await getStripe().paymentMethods.update(paymentMethodId, { allow_redisplay: "always" } as any);
}
