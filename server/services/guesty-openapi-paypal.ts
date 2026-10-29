import { guestyClient, isAmbiguousGuestyFailure } from "../lib/guesty";

export interface CreateReservationInput {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone?: string;
  numberOfAdults: number;
  numberOfChildren: number;
  numberOfInfants: number;
  stripePaymentIntentId: string;
  /**
   * Rate plan the guest selected and PAID for at checkout. Without it, Guesty
   * prices the reservation on the listing's DEFAULT rate plan (typically
   * Non-refundable) — which both mis-prices it (payment then exceeds balance
   * due and is rejected) and applies the wrong cancellation terms. Pass it so
   * the reservation matches what the guest actually booked.
   */
  ratePlanId?: string;
}

export async function createReservationViaOpenApi(input: CreateReservationInput): Promise<{
  reservationId: string;
  confirmationCode: string;
  status: string;
}> {
  // Nota 21 ago: reservar a partir da quote BE não é possível — o instant da
  // BE API exige ccToken (cartão tokenizado no Guesty, que o 2b não tem) e o
  // reservations-v3 não aceita quotes do Booking Engine. O preço do site é
  // reposto via invoice item de service fee (addReservationServiceFee).
  const data = await guestyClient.request<any>("POST", "/v1/reservations-v3", {
    body: {
      listingId: input.listingId,
      checkInDateLocalized: input.checkIn,
      checkOutDateLocalized: input.checkOut,
      status: "confirmed",
      // Nome distinto do source da era BE-api (que também aparecia como
      // "website-direct" no Guesty): o CS pediu nomes diferentes para
      // distinguir as reservas do checkout 2.0 nos filtros/relatórios.
      source: "website-checkout",
      guest: {
        firstName: input.guestFirstName,
        lastName: input.guestLastName,
        email: input.guestEmail,
        ...(input.guestPhone && { phones: [input.guestPhone] }),
      },
      numberOfGuests: {
        numberOfAdults: input.numberOfAdults,
        numberOfChildren: input.numberOfChildren,
        numberOfInfants: input.numberOfInfants,
      },
      guestsCount: input.numberOfAdults + input.numberOfChildren,
      // Create the reservation on the SAME rate plan the guest selected and paid for.
      // Without this, Guesty defaults to the listing's base rate plan (typically
      // Non-refundable), which re-prices the reservation differently from the checkout
      // quote — Guesty then rejects the payment with "Payment amount can't be greater than
      // balance due" and the reservation stays unpaid AND on the wrong cancellation terms.
      ...(input.ratePlanId && { ratePlanId: input.ratePlanId }),
      // The Booking Engine quote we charge does NOT apply promotions; applying them here
      // would make the reservation cheaper than what was paid, so keep them off.
      applyPromotions: false,
      ignoreCalendar: false,
      ignoreTerms: false,
      ignoreBlocks: false,
    },
  });

  console.log("[Guesty] /v1/reservations-v3 raw response keys:", Object.keys(data || {}));

  // Guesty's POST /v1/reservations-v3 returns the ID in `reservationId`:
  //   { reservationId, quoteId, confirmationCode, status }
  // Check `reservationId` FIRST, then fall back to `_id`/`id` and the nested shape
  // in case Guesty changes the envelope on other plans.
  const nested = data?.reservation ?? data?.data ?? null;
  const reservationId: string | undefined =
    data?.reservationId ?? data?._id ?? data?.id ?? nested?.reservationId ?? nested?._id ?? nested?.id;

  if (!reservationId) {
    console.error("[Guesty] /v1/reservations-v3 response missing reservation ID. Full response:", JSON.stringify(data));
    throw new Error(
      `Guesty reservation ID missing from response. Keys: ${Object.keys(data || {}).join(", ")}`
    );
  }

  return {
    reservationId,
    confirmationCode: data.confirmationCode ?? nested?.confirmationCode,
    status: data.status ?? nested?.status ?? "confirmed",
  };
}

/**
 * Read the reservation's outstanding balance from the Open API.
 *
 * The reservation is created via reservations-v3 with `applyPromotions: true` and no
 * explicit price, so Guesty re-prices it independently of the Booking Engine quote we
 * charged the guest. That means the reservation's `money.balanceDue` can differ from the
 * amount we collected — Guesty rejects a payment larger than the balance due outright.
 *
 * Returns the balance due in major units (e.g. euros), or null if it can't be determined
 * (in which case the caller falls back to recording the charged amount). Tolerates the
 * brief "Reservation not found" eventual-consistency window right after creation via the
 * guestyClient's built-in 500-retry.
 */
/** Um pagamento tal como o Guesty o devolve em `money.payments[]`. */
export interface GuestyReservationPayment {
  id: string | null;
  amount: number | null;
  status: string | null;
  note: string;
  /** O objeto tal como veio, para procurar o id do PaymentIntent em qualquer campo. */
  raw: unknown;
}

/** Estado financeiro de uma reserva, já com o folio precificado. */
export interface ReservationSettlementState {
  balanceDue: number;
  /** 0 quando o Guesty não manda o campo (reserva sem pagamentos). */
  totalPaid: number;
  payments: GuestyReservationPayment[];
}

function toPayment(p: any): GuestyReservationPayment {
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: typeof p?._id === "string" ? p._id : typeof p?.id === "string" ? p.id : null,
    amount: num(p?.amount),
    status: typeof p?.status === "string" ? p.status : null,
    note: String(p?.note ?? p?.notes ?? p?.description ?? ""),
    raw: p,
  };
}

const VOID_PAYMENT_STATUS = /fail|cancel|void|declin|revers/i;

/**
 * Este pagamento é o registo deste PaymentIntent? O nosso registo leva sempre
 * o id do PI na nota; procura-se em qualquer campo do objeto porque o nome do
 * campo da nota no GET não está documentado. Pagamentos anulados não contam:
 * se alguém anulou o registo no Guesty, voltar a registar é o certo.
 */
export function paymentRecordsIntent(p: GuestyReservationPayment, paymentIntentId: string): boolean {
  if (!paymentIntentId) return false;
  if (p.status && VOID_PAYMENT_STATUS.test(p.status)) return false;
  if (p.note.includes(paymentIntentId)) return true;
  try {
    return JSON.stringify(p.raw ?? {}).includes(paymentIntentId);
  } catch {
    return false;
  }
}

async function readSettlementState(reservationId: string): Promise<ReservationSettlementState | null> {
  // A freshly created reservation 404s on GET for a few seconds (Guesty eventual
  // consistency) — and the client's 500-retry does not cover 404s. Retry here:
  // recording a payment without the real balanceDue is how payments get rejected
  // ("amount can't be greater than balance due"), so waiting beats guessing.
  // The 200 can also arrive BEFORE Guesty has priced the folio: `money` comes
  // back without a numeric balanceDue. That used to return null on the first
  // try — GY-tNwxeWRA (Klarna, 24 set 2026) was read 1.5s after creation, the
  // payment was never recorded and CS had to post it by hand an hour later.
  // Both cases wait and re-read (~36s in total).
  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const data = await guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`, {
        query: { fields: "money status" },
      });
      const m = data?.money ?? {};
      if (typeof m.balanceDue === "number") {
        return {
          balanceDue: m.balanceDue,
          totalPaid: typeof m.totalPaid === "number" && Number.isFinite(m.totalPaid) ? m.totalPaid : 0,
          payments: Array.isArray(m.payments) ? m.payments.map(toPayment) : [],
        };
      }
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`[Guesty] balanceDue still not priced for ${reservationId} after ${attempt} reads`);
        return null;
      }
    } catch (err: any) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`[Guesty] Could not read balanceDue for ${reservationId} after ${attempt} tries: ${err?.message || err}`);
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return null;
}

/** Estado financeiro da reserva (saldo, total pago, pagamentos), com retries
 *  para a janela de eventual consistency pós-criação. null = ilegível. */
export async function getReservationSettlementState(reservationId: string): Promise<ReservationSettlementState | null> {
  return readSettlementState(reservationId);
}

/** Balance due (major units) de uma reserva, com retries para a janela de
 *  eventual consistency pós-criação. */
export async function getReservationBalanceDue(reservationId: string): Promise<number | null> {
  return (await readSettlementState(reservationId))?.balanceDue ?? null;
}

/**
 * Repõe o preço do site na reserva: lança o delta (total cobrado − re-preço do
 * Guesty) como invoice item de fee adicional. A categoria (por omissão
 * SERVICE) tem o tratamento configurado no Guesty para NÃO entrar no split de
 * owners — tal como a cleaning fee — e o Hostkit fatura o total certo.
 * Fail-soft: em erro, o comportamento anterior (registo capado) mantém-se.
 */
export type ServiceFeeOutcome =
  /** O Guesty confirmou o invoice item. */
  | "added"
  /** O Guesty recusou (4xx): não ficou gravado. */
  | "refused"
  /** 5xx, timeout ou rede: pode ou não ter ficado gravado. Quem chamou relê o saldo. */
  | "unknown";

export async function addReservationServiceFee(
  reservationId: string,
  amount: number,
  title = "Service fee",
): Promise<ServiceFeeOutcome> {
  try {
    await guestyClient.request<any>("POST", `/v1/invoice-items/reservation/${reservationId}`, {
      body: {
        title,
        amount,
        normalType: "AFE",
        secondIdentifier: process.env.GUESTY_SERVICE_FEE_CATEGORY || "SERVICE",
        description: "Taxa de servico do checkout do site (portugalactive.com)",
      },
      // Um 5xx repetido lançava a mesma fee duas vezes e inflacionava o saldo
      // (era isso que deixava passar o 2.º registo no GY-Huf4Lp8L).
      nonIdempotent: true,
    });
    console.info(`[Guesty] invoice item "${title}" ${amount} adicionado a ${reservationId} — total do site reposto`);
    return "added";
  } catch (err: any) {
    const outcome: ServiceFeeOutcome = isAmbiguousGuestyFailure(err) ? "unknown" : "refused";
    console.warn(`[Guesty] invoice item ${outcome === "unknown" ? "com resultado desconhecido" : "falhou"} para ${reservationId} (${amount}): ${err?.message}`);
    return outcome;
  }
}

/** Confirmation code of an existing reservation (used to resume a settle that
 *  crashed between creating the reservation and stamping the intent/PI). */
export async function fetchReservationConfirmationCode(reservationId: string): Promise<string | null> {
  try {
    const data = await guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`, {
      query: { fields: "confirmationCode" },
    });
    const code = data?.confirmationCode;
    return typeof code === "string" && code ? code : null;
  } catch (err: any) {
    console.warn(`[Guesty] Could not read confirmationCode for ${reservationId}: ${err?.message || err}`);
    return null;
  }
}

/** Id interno do processador de pagamentos que o Guesty tem ligado a este
 *  alojamento. E obrigatorio para registar um cartao, e NAO e o acct_ do
 *  Stripe — e um id do Guesty. Fail-soft: sem ele nao ha cartao em carteira,
 *  mas a reserva segue. */
export async function fetchPaymentProviderId(listingId: string): Promise<string | null> {
  try {
    const data = await guestyClient.request<any>("GET", "/v1/payment-providers/provider-by-listing", {
      query: { listingId },
    });
    const id = data?._id;
    return typeof id === "string" && id ? id : null;
  } catch (err: any) {
    console.warn(`[Guesty] Sem paymentProviderId para listing ${listingId}: ${err?.message || err}`);
    return null;
  }
}

/** Id do hospede criado com a reserva. Preciso para lhe pendurar o cartao. */
export async function fetchReservationGuestId(reservationId: string): Promise<string | null> {
  try {
    // Sem filtro de campos: pedir "fields" ao Guesty e uma fonte conhecida de
    // respostas vazias quando o nome do campo nao bate certo, e aqui um
    // guestId em falta significa nao haver cartao em carteira.
    const data = await guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`);
    const id = data?.guestId ?? data?.guest?._id ?? data?.guest?.id ?? data?.guest;
    return typeof id === "string" && id ? id : null;
  } catch (err: any) {
    console.warn(`[Guesty] Sem guestId para ${reservationId}: ${err?.message || err}`);
    return null;
  }
}

/**
 * Poe o cartao do hospede na carteira do Guesty.
 *
 * O fluxo antigo (BE instant) mandava um ccToken e o Guesty ficava dono do
 * cartao — podia cobrar caucao, danos, noites extra e qualquer saldo. O
 * checkout 2.0 cobra no nosso Stripe e so REGISTAVA o valor, pelo que o Guesty
 * ficou sem cartao nenhum e sem forma de cobrar (visto a 28 ago 2026 na
 * GY-ATyEq5WB: "Pending payment collection", metodo de pagamento vazio).
 *
 * Isto repoe a capacidade. Funciona porque a conta Stripe que o Guesty tem
 * ligada ao alojamento e a MESMA onde ja cobramos, logo o payment method que
 * ja temos serve tal e qual — nao ha contas separadas nem clonagem.
 *
 * skipSetupIntent: o cartao foi confirmado no browser com setup_future_usage,
 * o mandato ja existe; sem esta flag o Guesty tentaria correr um SetupIntent
 * seu por cima de um metodo ja usado.
 */
export async function attachGuestPaymentMethod(input: {
  guestId: string;
  paymentMethodId: string;
  paymentProviderId: string;
  reservationId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await guestyClient.request<any>("POST", `/v1/guests/${input.guestId}/payment-methods`, {
      body: {
        stripeCardToken: input.paymentMethodId,
        paymentProviderId: input.paymentProviderId,
        reservationId: input.reservationId,
        reuse: true,
        skipSetupIntent: true,
      },
    });
    console.info(`[Guesty] Cartao ${input.paymentMethodId} em carteira na reserva ${input.reservationId}`);
    return { ok: true };
  } catch (err: any) {
    const detail = typeof err?.details === "string" ? err.details : JSON.stringify(err?.details ?? "");
    const msg = `${err?.status ?? ""} ${err?.message ?? ""} ${detail}`.trim().slice(0, 90);
    console.error(
      `[Guesty] Falhou pôr cartao em carteira (reserva ${input.reservationId}, pm ${input.paymentMethodId}): ${msg}`,
    );
    return { ok: false, error: msg };
  }
}

export type RecordExternalPaymentOutcome =
  /** POST feito agora. */
  | "recorded"
  /** Já existe um registo com este PaymentIntent na nota: nada a fazer. */
  | "already-recorded"
  /** Saldo a zero, sem registo deste PI: alguém liquidou a reserva por outra via. */
  | "settled";

export async function recordExternalPayment(
  reservationId: string,
  amount: number,
  currency: string,
  paymentIntentId: string
): Promise<RecordExternalPaymentOutcome> {
  // Record against Guesty's ACTUAL balance due, not the charged amount. The reservation is
  // priced by a different engine than the checkout quote, so paying the charged amount can
  // exceed the balance ("Payment amount can't be greater than balance due") and be rejected
  // entirely — leaving the reservation unpaid.
  const state = await readSettlementState(reservationId);

  // Idempotência a sério: o nosso registo leva o id do PI na nota. Antes disto
  // a única defesa era o saldo chegar a zero, o que deixa de ser verdade quando
  // há mais do que um pagamento por reserva (pagamento em duas partes) ou
  // quando o Guesty preça acima do site (o 2.º passe do GY-Huf4Lp8L registou
  // os mesmos 2.524,07 EUR outra vez porque sobrava saldo).
  if (state && state.payments.some((p) => paymentRecordsIntent(p, paymentIntentId))) {
    console.info(`[Guesty] PI ${paymentIntentId} already recorded on ${reservationId} — skipping.`);
    return "already-recorded";
  }

  const balanceDue = state?.balanceDue ?? null;
  if (balanceDue !== null && balanceDue <= 0) {
    console.info(`[Guesty] Reservation ${reservationId} already settled (balanceDue=0) — skipping payment record for PI ${paymentIntentId}.`);
    return "settled";
  }

  // Never post the charged amount blind: Guesty re-prices the reservation, and an
  // amount above its balanceDue is rejected outright — better to fail retryably
  // (settle/webhook will come back) than to burn retries on a doomed request.
  if (balanceDue === null) {
    throw new Error(`balanceDue unreadable for ${reservationId} — payment not recorded (will retry)`);
  }
  const amountToRecord = Math.min(amount, balanceDue);
  if (amountToRecord !== amount) {
    console.warn(`[Guesty] Charged ${amount} ${currency} but reservation ${reservationId} balanceDue is ${balanceDue}; recording ${amountToRecord} (PI ${paymentIntentId}). Reconcile the difference manually.`);
  }

  const body = {
    paymentMethod: { method: "OTHER" },
    amount: amountToRecord,
    // `paidAt` records the funds as ALREADY COLLECTED (external processor) rather than
    // scheduled/owed — without it Guesty leaves the reservation balance unsettled.
    paidAt: new Date().toISOString(),
    note: `Stripe external payment (${currency}) — PaymentIntent: ${paymentIntentId}`,
  };
  // Um 5xx depois de o Guesty gravar não pode virar dois registos, por isso o
  // cliente não repete este POST (nonIdempotent). A repetição faz-se aqui, da
  // forma segura: reler os pagamentos e só voltar a enviar se o registo deste
  // PI não lá estiver. Devolve aos fluxos Klarna e PayPal a recuperação rápida
  // que tinham quando o cliente repetia tudo às cegas.
  const MAX_POSTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      await guestyClient.request<any>("POST", `/v1/reservations/${reservationId}/payments`, {
        body,
        nonIdempotent: true,
      });
      return "recorded";
    } catch (err) {
      if (!isAmbiguousGuestyFailure(err) || attempt >= MAX_POSTS) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      const after = await readSettlementState(reservationId);
      if (after && after.payments.some((p) => paymentRecordsIntent(p, paymentIntentId))) {
        console.info(`[Guesty] PI ${paymentIntentId}: o POST ambiguo ficou gravado em ${reservationId} — sem segundo registo.`);
        return "recorded";
      }
      if (!after) throw err;
      console.warn(`[Guesty] PI ${paymentIntentId}: POST ambiguo nao gravou em ${reservationId} — nova tentativa ${attempt + 1}/${MAX_POSTS}.`);
    }
  }
}

/**
 * Estado de cobrança de uma reserva, lido pela Open API. O Guesty só cobra o
 * cartão de uma reserva BE API através da política de Auto Payments do listing;
 * se nenhuma regra disparar, a reserva fica "Not paid" com "Next payment:
 * Unscheduled" sem qualquer erro. Devolve null se não conseguir ler.
 */
export async function fetchReservationPaymentState(reservationId: string): Promise<{
  totalPaid: number | null;
  balanceDue: number | null;
  payments: Array<{ id?: string; status?: string; amount?: number; scheduledFor?: string; note?: string }>;
} | null> {
  try {
    const data = await guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`, {
      query: { fields: "money status" },
    });
    const m = data?.money ?? {};
    const payments = Array.isArray(m.payments) ? m.payments : [];
    return {
      totalPaid: typeof m.totalPaid === "number" ? m.totalPaid : null,
      balanceDue: typeof m.balanceDue === "number" ? m.balanceDue : null,
      payments: payments.map((p: any) => ({
        id: typeof p?._id === "string" ? p._id : undefined,
        status: p?.status,
        amount: p?.amount,
        scheduledFor: p?.shouldBePaidAt ?? p?.paidAt ?? undefined,
        note: typeof p?.note === "string" ? p.note : undefined,
      })),
    };
  } catch (err: any) {
    console.warn(`[Guesty] Could not read payment state for ${reservationId}: ${err?.message || err}`);
    return null;
  }
}

/** Teto do notes.other que o site escreve. É nosso (defensivo), o Guesty não
 *  documenta um limite; por isso nunca se corta o que já lá está. */
export const RESERVATION_NOTE_MAX = 4000;

export interface ReservationNotePlan {
  /** O campo notes.other inteiro, como deve ficar. */
  text: string;
  /** Há alguma coisa a gravar (senão não se faz o PUT). */
  changed: boolean;
  /** Texto novo que este PUT grava. */
  written: string[];
  /** Texto novo que não coube e por isso não foi escrito (vai no alerta). */
  missing: string[];
}

/**
 * O que gravar no notes.other, a partir do que já lá está. Pura, testada.
 *
 * - `note` junta-se no fim, como sempre; `prepend` vai para o TOPO do campo,
 *   para linhas que nunca podem cair num corte (o NIF da fatura).
 * - Texto que já lá está não se repete (settle e webhook podem correr os dois).
 * - Nunca se corta o que já lá está, e cada texto novo entra inteiro ou não
 *   entra: um corte a meio deixava na reserva meia data ("agendada para 24/1")
 *   ou um "NAO cobrar" sem fim, e o hóspede pode já ter pago. O que não coube
 *   volta em `missing`, para o alerta levar o texto inteiro ao CS. O topo tem
 *   prioridade sobre o fim.
 */
export function planReservationNote(
  existingRaw: unknown,
  note: string,
  prepend = "",
  max = RESERVATION_NOTE_MAX,
): ReservationNotePlan {
  const existing = String(existingRaw ?? "").trim();
  const top = String(prepend ?? "").trim();
  const add = String(note ?? "").trim();
  const needTop = !!top && !existing.includes(top);
  const needAdd = !!add && !existing.includes(add);
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const written: string[] = [];
  const missing: string[] = [];
  let text = existing;
  if (needTop) {
    if (join(top, text).length <= max) {
      text = join(top, text);
      written.push(top);
    } else missing.push(top);
  }
  if (needAdd) {
    if (join(text, add).length <= max) {
      text = join(text, add);
      written.push(add);
    } else missing.push(add);
  }
  return { text, changed: text !== existing, written, missing };
}

/** Alertas de notas por gravar já entregues: reserva + texto → instante. O
 *  motor das duas partes repete a nota de 10 em 10 minutos enquanto falhar;
 *  o CS recebe o mesmo texto no máximo uma vez por dia. */
const noteAlertSentAt = new Map<string, number>();
const NOTE_ALERT_REPEAT_MS = 24 * 3600_000;

function escapeOpsHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function guestyErrorSummary(err: any): string {
  const parts = [String(err?.message ?? err ?? "erro desconhecido")];
  if (err?.method && err?.endpoint) parts.push(`${err.method} ${err.endpoint}`);
  if (err?.details != null) {
    let details: string;
    try {
      details = typeof err.details === "string" ? err.details : JSON.stringify(err.details);
    } catch {
      details = String(err.details);
    }
    if (details && details !== "null") parts.push(details.slice(0, 300));
  }
  return parts.join(" · ");
}

/**
 * Alerta ao CS com o texto que não ficou na reserva (pode levar o NIF da
 * fatura e, nas duas partes, o "NAO cobrar"), para o colar à mão. Nunca
 * lança. Devolve true quando um humano tem o texto: email entregue agora, ou
 * o mesmo texto já entregue nas últimas 24 h.
 */
async function alertReservationNoteNotWritten(input: {
  reservationId: string;
  confirmationCode?: string | null;
  kind: "failed" | "no-room";
  missing: string[];
  error?: unknown;
}): Promise<boolean> {
  try {
    const text = input.missing.join("\n\n");
    const key = `${input.reservationId}\u0000${input.kind}\u0000${text}`;
    const now = Date.now();
    const last = noteAlertSentAt.get(key);
    if (last != null && now - last < NOTE_ALERT_REPEAT_MS) return true;
    noteAlertSentAt.forEach((at, k) => {
      if (now - at >= NOTE_ALERT_REPEAT_MS) noteAlertSentAt.delete(k);
    });

    const label = escapeOpsHtml(input.confirmationCode || input.reservationId);
    const url = `https://app.guesty.com/reservations/${encodeURIComponent(input.reservationId)}/summary`;
    const textHtml = escapeOpsHtml(text).replace(/\n/g, "<br>");
    // O que se perde se ninguém colar o texto, dito sem rodeios.
    const carries = [
      text.includes("FATURA COM NIF") ? "o NIF para a fatura" : "",
      /NAO cobrar|NAO e divida/i.test(text) ? "o aviso de NÃO cobrar o hóspede" : "",
    ].filter(Boolean);
    const why = carries.length ? ` Leva ${carries.join(" e ")}.` : "";
    const subject =
      input.kind === "failed"
        ? `NOTA NÃO GRAVADA NO GUESTY — ${label}`
        : `NOTA SEM ESPAÇO NO GUESTY — ${label}`;
    const lines =
      input.kind === "failed"
        ? [
            `O site não conseguiu gravar a nota interna da reserva ${label} no Guesty. Esta falha não trava a reserva nem o pagamento.`,
            `Abrir a reserva no Guesty e colar nas notas o texto abaixo, tal como está.${why}`,
            `Reserva: <a href="${url}">${url}</a>`,
            `<strong>Texto por gravar:</strong><br>${textHtml}`,
            `Erro: ${escapeOpsHtml(guestyErrorSummary(input.error))}`,
            `O site escreve estas notas com GET/PUT /v1/reservations/{id}, que o Guesty dá como obsoleto e retira no fim do ano. Se este aviso aparecer em várias reservas, avisar a equipa técnica.`,
          ]
        : [
            `As notas da reserva ${label} no Guesty já não têm espaço (o site escreve até ${RESERVATION_NOTE_MAX} caracteres) e o texto novo não foi escrito. Nada do que lá estava foi apagado.`,
            `Abrir a reserva no Guesty, arrumar as notas e colar o texto abaixo, tal como está.${why}`,
            `Reserva: <a href="${url}">${url}</a>`,
            `<strong>Texto por gravar:</strong><br>${textHtml}`,
          ];
    const { sendOpsAlert } = await import("./transactional-email");
    const delivered = await sendOpsAlert(subject, lines, { copyToSales: true });
    // Um email que não saiu não conta: a próxima tentativa volta a avisar.
    if (delivered) noteAlertSentAt.set(key, now);
    return delivered;
  } catch (err: any) {
    console.error(`[Guesty] alerta de nota por gravar nao saiu (${input.reservationId}): ${err?.message}`);
    return false;
  }
}

/**
 * Nota interna da reserva no Guesty (notes.other): manifesto de serviços,
 * nota do pagamento, NIF da fatura, avisos das duas partes. Best-effort:
 * nunca lança nem bloqueia o pagamento, mas também nunca falha calada. Se
 * não ficar gravada, o CS recebe um alerta com o texto para colar à mão.
 *
 * `opts.prepend` vai para o topo do campo (ver planReservationNote).
 *
 * Devolve true quando não há nada a repetir: texto gravado, já lá estava, ou
 * não coube e o CS já tem o texto por email (repetir não arranja espaço).
 * Devolve false quando a leitura ou a escrita falharam (quem repete, repete)
 * ou quando o alerta de falta de espaço não saiu.
 */
export async function appendReservationNote(
  reservationId: string,
  note: string,
  opts: { prepend?: string } = {},
): Promise<boolean> {
  // Por gravar, por esta ordem: tudo enquanto não se leu a reserva.
  let pending = [String(opts.prepend ?? "").trim(), String(note ?? "").trim()].filter(Boolean);
  if (!pending.length) return true;
  let confirmationCode: string | null = null;
  try {
    // PUT em notes.other SUBSTITUI o campo inteiro. Com o PUT directo, a nota
    // "SERVICOS DO CHECKOUT" (escrita logo a seguir ao settle, e sempre, porque
    // a receção é obrigatória) apagava a nota do pagamento — a que diz que os
    // extras foram cobrados na plataforma e faturados pela Portugal Active, e
    // o aviso de saldo por divergência de preço. Mais qualquer coisa que o CS
    // tivesse escrito ali. Aura, GY-fSBjy7Nw: ficou só "pet-fee x2 150 EUR" e
    // nada a dizer que já estava pago. Lê-se, acrescenta-se, e não se repete.
    // Sem filtro de campos: com "fields" o Guesty devolve vazio quando o nome
    // não bate certo, e um vazio aqui voltava a apagar tudo.
    // GET/PUT /v1/reservations/{id} estão obsoletos (30 jul 2026, retirados no
    // fim do ano): a migração para a v3 precisa de uma reserva de teste.
    const current = await guestyClient.request<any>("GET", "/v1/reservations/" + reservationId);
    confirmationCode = typeof current?.confirmationCode === "string" ? current.confirmationCode : null;
    const plan = planReservationNote(current?.notes?.other, note, opts.prepend);
    pending = pending.filter((t) => plan.written.includes(t) || plan.missing.includes(t));
    if (plan.changed) {
      await guestyClient.request("PUT", "/v1/reservations/" + reservationId, {
        body: { notes: { other: plan.text } },
      });
    }
    if (!plan.missing.length) return true;
    console.warn(`[Guesty] nota sem espaco na reserva ${reservationId}: ${plan.missing.length} texto(s) por gravar — alerta ao CS`);
    return await alertReservationNoteNotWritten({ reservationId, confirmationCode, kind: "no-room", missing: plan.missing });
  } catch (err: any) {
    console.warn("[Guesty] appendReservationNote falhou (" + reservationId + "):", err?.message);
    await alertReservationNoteNotWritten({ reservationId, confirmationCode, kind: "failed", missing: pending, error: err });
    return false;
  }
}

/**
 * Retrato financeiro da reserva do lado do Guesty, para auditoria.
 *
 * O que o proprietário recebe NÃO sai do que entrou em caixa: sai do valor que
 * a reserva tem no Guesty — em primeiro lugar da `fareAccommodation`. Como as
 * reservas do checkout 2.0 nasceram sem ratePlanId, essa fare foi calculada no
 * plano por omissão da listagem e não no plano que o hóspede comprou. Logo o
 * payout ao proprietário assentou num número que nunca foi o preço da venda —
 * para cima ou para baixo, conforme o plano.
 *
 * `hostPayout` é o número do Guesty quando a listagem tem a configuração de
 * ownership preenchida; quando não tem, vem a null e a fare é o indicador.
 */
export async function fetchReservationMoney(reservationId: string): Promise<{
  fareAccommodation: number | null;
  fareCleaning: number | null;
  hostPayout: number | null;
  totalPaid: number | null;
  balanceDue: number | null;
  currency: string | null;
} | null> {
  try {
    const data = await guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`, {
      query: { fields: "money status" },
    });
    const m = data?.money ?? {};
    const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      fareAccommodation: num(m.fareAccommodation),
      fareCleaning: num(m.fareCleaning),
      hostPayout: num(m.hostPayout),
      totalPaid: num(m.totalPaid),
      balanceDue: num(m.balanceDue),
      currency: typeof m.currency === "string" ? m.currency : null,
    };
  } catch (err: any) {
    console.warn(`[Guesty] Sem money para ${reservationId}: ${err?.message || err}`);
    return null;
  }
}
