/**
 * Guesty para o motor da 2.ª parte (pagamento em duas partes, Fase 2a).
 *
 * O Guesty é espelho, nunca cobrador: daqui só se LÊ a reserva (estado, datas,
 * casa, total, pagamentos) para o motor decidir, e só se ESCREVE o
 * cancelamento da reserva quando a PA cancela por falta de pagamento (H) ou o
 * hóspede cancela pelo link. Registos de pagamento e notas continuam em
 * guesty-openapi-paypal.ts (recordExternalPayment, appendReservationNote).
 *
 * Regra de ouro: uma leitura que não se percebe devolve null e o motor não
 * decide nada com ela (adia e alerta). Nunca se inventa um "sem pagamentos" ou
 * um "não cancelada" a partir de uma resposta incompleta.
 */
import { guestyClient, GuestyClientError, isAmbiguousGuestyFailure } from "../lib/guesty";
import { paymentRecordsIntent, type GuestyReservationPayment } from "./guesty-openapi-paypal";

export interface ReservationSnapshotPayment {
  id: string | null;
  amountCents: number;
  status: string;
  note: string;
  method: string | null;
  /**
   * O objeto tal como o Guesty o devolveu. Fica porque paymentRecordsIntent
   * procura o id do PaymentIntent em QUALQUER campo (o nome do campo da nota
   * no GET não está documentado); sem ele, um registo nosso com a nota noutro
   * campo passava por pagamento de terceiros.
   */
  raw?: unknown;
}

export interface ReservationSnapshot {
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  listingId: string | null;
  totalCents: number | null;
  totalPaidCents: number;
  payments: ReservationSnapshotPayment[];
}

export type GuestyCancelOutcome =
  /** O nosso PUT cancelou a reserva (resposta 200, ou resposta ambígua e a releitura mostra cancelada). */
  | "canceled"
  /** O Guesty recusou o PUT (4xx) porque a reserva já estava cancelada (por outra pessoa ou por uma tentativa nossa anterior). */
  | "already-canceled"
  /** O Guesty recusou (4xx de validação/permissão) e a releitura confirma que a reserva continua ativa. */
  | "refused"
  /** Não se sabe: falha ambígua sem confirmação, ou a releitura falhou. Quem chamou volta a tentar mais tarde. */
  | "unknown";

/** O Guesty escreve "canceled"; aceita-se "cancelled" para que uma grafia
 *  diferente nunca faça uma reserva cancelada parecer ativa. */
export function isGuestyCanceledStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && /^cancel{1,2}ed$/i.test(status.trim());
}

// Mesma expressão de guesty-openapi-paypal.ts (lá é privada e o contrato não
// deixa exportar nada novo de lá). paymentRecordsIntent ignora estes estados
// para decidir se um registo é nosso; aqui ignoram-se para decidir se há
// dinheiro de terceiros. O teste compara as duas para não divergirem.
const VOID_PAYMENT_STATUS = /fail|cancel|void|declin|revers/i;

// Dinheiro anunciado mas ainda não recebido: um payment link do Guesty, um
// pagamento agendado, uma autorização por capturar. Testa-se ANTES de
// "pago" porque "unpaid" contém "paid".
const PENDING_PAYMENT_STATUS = /pend|schedul|await|processing|authori[sz]|unpaid|overdue/i;
const SUCCEEDED_PAYMENT_STATUS = /succe|paid|complet|captur|settl|refund/i;

function isVoidPaymentStatus(status: string | null | undefined): boolean {
  return !!status && VOID_PAYMENT_STATUS.test(status);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toCents(v: number): number {
  return Math.round(v * 100);
}

/** Data de calendário em Lisboa de um instante ISO. Só serve de recurso quando
 *  o Guesty não manda a data local (checkInDateLocalized): as casas são todas
 *  em Portugal continental e o check-in é à tarde, por isso o dia bate. */
function lisbonYmd(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

function reservationDate(localized: unknown, instant: unknown): string | null {
  if (typeof localized === "string" && /^\d{4}-\d{2}-\d{2}/.test(localized)) return localized.slice(0, 10);
  if (typeof instant === "string" && instant.trim()) return lisbonYmd(instant);
  return null;
}

/**
 * Pagamento do Guesty para o retrato. Reimplementação mínima do toPayment
 * (privado em guesty-openapi-paypal.ts): mesmos campos de id e de nota.
 * Devolve null quando um pagamento que conta (não anulado) vem sem valor: não
 * se sabe quanto dinheiro entrou, logo a leitura inteira não serve.
 */
function toSnapshotPayment(p: any): ReservationSnapshotPayment | null {
  const status = typeof p?.status === "string" ? p.status : "";
  const amount = finiteNumber(p?.amount);
  if (amount === null && !isVoidPaymentStatus(status)) return null;
  const method =
    typeof p?.paymentMethod?.method === "string" ? p.paymentMethod.method
      : typeof p?.method === "string" ? p.method
        : null;
  return {
    id: typeof p?._id === "string" ? p._id : typeof p?.id === "string" ? p.id : null,
    amountCents: amount === null ? 0 : toCents(amount),
    status,
    note: String(p?.note ?? p?.notes ?? p?.description ?? ""),
    method,
    raw: p,
  };
}

function parseReservationSnapshot(data: any, reservationId: string): ReservationSnapshot | null {
  if (!data || typeof data !== "object") return null;
  // Uma resposta de outra reserva (envelope trocado, cache errada) nunca pode
  // decidir sobre esta.
  const returnedId = data._id ?? data.id;
  if (typeof returnedId === "string" && returnedId && returnedId !== reservationId) return null;

  const status = typeof data.status === "string" ? data.status.trim() : "";
  if (!status) return null;
  const canceled = isGuestyCanceledStatus(status);

  const m = data.money;
  if (!m || typeof m !== "object") return null;
  // Sem balanceDue numérico o folio ainda não está precificado (ou a resposta
  // veio cortada) e o total e os pagamentos não são de confiança — a mesma
  // regra de readSettlementState. Exceção: uma reserva cancelada decide-se
  // pelo estado e não pelo dinheiro, e não pode ficar presa por isso.
  if (finiteNumber(m.balanceDue) === null && !canceled) return null;

  let totalPaidCents = 0;
  if (m.totalPaid !== undefined && m.totalPaid !== null) {
    const tp = finiteNumber(m.totalPaid);
    if (tp === null) return null;
    totalPaidCents = toCents(tp);
  }

  if (m.payments !== undefined && m.payments !== null && !Array.isArray(m.payments)) return null;
  const payments: ReservationSnapshotPayment[] = [];
  for (const raw of Array.isArray(m.payments) ? m.payments : []) {
    const p = toSnapshotPayment(raw);
    if (!p) return null;
    payments.push(p);
  }

  // Total da reserva: money.totalPrice e, na falta, total/totalAmount (como em
  // guesty-booking.ts). subTotalPrice é campo das quotes e hostPayout é o que
  // o proprietário recebe — nenhum dos dois é o total que o hóspede deve.
  const totalRaw = m.totalPrice ?? m.total ?? m.totalAmount;
  const total = finiteNumber(totalRaw);

  const listingId =
    typeof data.listingId === "string" && data.listingId ? data.listingId
      : typeof data.listing?._id === "string" && data.listing._id ? data.listing._id
        : null;

  return {
    status,
    checkIn: reservationDate(data.checkInDateLocalized, data.checkIn),
    checkOut: reservationDate(data.checkOutDateLocalized, data.checkOut),
    listingId,
    totalCents: total !== null && total >= 0 ? toCents(total) : null,
    totalPaidCents,
    payments,
  };
}

async function fetchReservation(reservationId: string): Promise<any> {
  // Sem filtro de campos: com "fields" o Guesty devolve vazio quando um nome
  // não bate certo, e aqui precisamos de estado, datas, casa E dinheiro numa
  // só leitura. Um campo em falta por causa do filtro parecia "datas
  // alteradas" ou "sem pagamentos" — exatamente o que não se pode inventar.
  return guestyClient.request<any>("GET", `/v1/reservations/${encodeURIComponent(reservationId)}`);
}

/**
 * Retrato da reserva para a reconciliação antes de cada email, cobrança ou
 * cancelamento. null = leitura inválida (erro, resposta incompleta, folio por
 * precificar, pagamento sem valor): o motor adia e alerta, nunca decide.
 * Uma só leitura, sem retries próprios: o cliente já repete 5xx/rede/429 nos
 * GET, e o sweep volta daqui a uma hora.
 */
export async function readReservationSnapshot(reservationId: string): Promise<ReservationSnapshot | null> {
  if (!reservationId) return null;
  try {
    const data = await fetchReservation(reservationId);
    const snap = parseReservationSnapshot(data, reservationId);
    if (!snap) console.warn(`[Guesty balance] Leitura invalida da reserva ${reservationId}: resposta incompleta ou por precificar`);
    return snap;
  } catch (err: any) {
    console.warn(`[Guesty balance] Nao foi possivel ler a reserva ${reservationId}: ${err?.message || err}`);
    return null;
  }
}

/**
 * Dinheiro na reserva que não é nosso: pagamentos cujo registo não traz
 * nenhum dos nossos PaymentIntents (1.ª parte, 2.ª parte, pagamento pelo
 * link). Anulados não contam (mesma regra de paymentRecordsIntent).
 *
 * Um estado que não se reconhece conta como RECEBIDO e não como pendente: do
 * lado "recebido" o motor pára e um humano decide (paid_externally ou
 * needs_review); do lado "pendente" cobrava por cima de um pagamento que
 * talvez já tenha entrado. Reembolsos de terceiros também contam como
 * recebidos, pela mesma razão.
 */
export function foreignPayments(
  snap: ReservationSnapshot,
  ourPaymentIntentIds: string[],
): { succeededCents: number; pendingCents: number } {
  // Um id vazio não identifica nada; filtrá-lo evita que um "" na lista
  // deixe de marcar como terceiros os pagamentos sem nota.
  const ours = ourPaymentIntentIds
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  let succeededCents = 0;
  let pendingCents = 0;
  for (const p of snap.payments) {
    if (isVoidPaymentStatus(p.status)) continue;
    const asGuesty: GuestyReservationPayment = {
      id: p.id,
      amount: p.amountCents / 100,
      status: p.status || null,
      note: p.note,
      raw: p.raw ?? null,
    };
    if (ours.some((pi) => paymentRecordsIntent(asGuesty, pi))) continue;
    if (PENDING_PAYMENT_STATUS.test(p.status)) {
      pendingCents += p.amountCents;
    } else {
      if (!SUCCEEDED_PAYMENT_STATUS.test(p.status)) {
        console.warn(`[Guesty balance] Pagamento de terceiros com estado desconhecido "${p.status}" (${p.id ?? "sem id"}): contado como recebido`);
      }
      succeededCents += p.amountCents;
    }
  }
  // Um estorno lançado como pagamento negativo não pode esconder dinheiro
  // que entrou noutro registo, nem dar um "recebido" abaixo de zero.
  return { succeededCents: Math.max(0, succeededCents), pendingCents: Math.max(0, pendingCents) };
}

/** Estado da reserva para confirmar um cancelamento. null = não se sabe. */
async function readReservationStatus(reservationId: string): Promise<string | null> {
  try {
    const data = await fetchReservation(reservationId);
    const returnedId = data?._id ?? data?.id;
    if (typeof returnedId === "string" && returnedId && returnedId !== reservationId) return null;
    const status = typeof data?.status === "string" ? data.status.trim() : "";
    return status || null;
  } catch (err: any) {
    console.warn(`[Guesty balance] Releitura do estado de ${reservationId} falhou: ${err?.message || err}`);
    return null;
  }
}

// 4xx que são uma resposta do Guesty ao pedido (validação, permissão, conflito,
// reserva inexistente). 401, 408 e 429 não são: o pedido não foi avaliado, e
// uma reserva ativa nesses casos não é uma recusa, é "tentar outra vez".
const REFUSAL_STATUSES = new Set([400, 403, 404, 409, 422]);

/** Espera antes de reler depois de uma falha ambígua: o Guesty é
 *  eventualmente consistente e um cancelamento aceite pode demorar a
 *  aparecer no GET. */
const AMBIGUOUS_REREAD_DELAY_MS = 1500;

/**
 * Cancela a reserva no Guesty (reservations-v3, doc lida a 27 out 2026):
 * PUT /v1/reservations-v3/{id}/status { status: "canceled", canceledBy: "HOST",
 * cancellationReason, cancellationNote } → 200 { reservationId, status }; 422
 * em validação. Um cancelamento não se desfaz, por isso o PUT nunca se repete
 * às cegas (nonIdempotent): em resposta ambígua ou 4xx relê-se o estado.
 *
 * Nunca lança: o resultado diz a quem chamou se pode seguir para o reembolso
 * ("canceled"/"already-canceled"), se tem de escalar ("refused") ou se volta
 * mais tarde ("unknown").
 */
export async function cancelGuestyReservation(
  reservationId: string,
  /** canceledBy: "HOST" quando é a plataforma a cancelar (falta de pagamento),
   *  "GUEST" quando é o hóspede pela página do saldo. */
  p: { reason: string; note: string; canceledBy?: "HOST" | "GUEST" },
): Promise<GuestyCancelOutcome> {
  if (!reservationId) {
    console.error("[Guesty balance] cancelGuestyReservation sem reservationId — nada enviado");
    return "refused";
  }
  const endpoint = `/v1/reservations-v3/${encodeURIComponent(reservationId)}/status`;
  const body = {
    status: "canceled",
    canceledBy: p.canceledBy ?? "HOST",
    cancellationReason: p.reason,
    // Limite defensivo: o Guesty não documenta o máximo, e uma nota longa
    // demais virava um 422 e uma reserva por cancelar.
    cancellationNote: String(p.note ?? "").trim().slice(0, 1000),
  };

  let failure: unknown;
  try {
    const data = await guestyClient.request<any>("PUT", endpoint, { body, nonIdempotent: true });
    if (isGuestyCanceledStatus(data?.status)) {
      console.info(`[Guesty balance] Reserva ${reservationId} cancelada no Guesty`);
      return "canceled";
    }
    // 200 sem o estado esperado: não se assume nada, confirma-se no GET.
    const after = await readReservationStatus(reservationId);
    if (isGuestyCanceledStatus(after)) return "canceled";
    console.error(`[Guesty balance] PUT de cancelamento de ${reservationId} respondeu 200 mas o estado e "${after ?? "ilegivel"}"`);
    return "unknown";
  } catch (err) {
    failure = err;
  }

  const status = failure instanceof GuestyClientError ? failure.status : null;
  // "Talvez tenha sido o nosso PUT": rede/5xx sem repetição (ambíguo), e
  // qualquer erro que não seja do cliente HTTP (ex.: um 200 com corpo que não
  // é JSON rebenta no parse DEPOIS de o Guesty ter cancelado).
  const maybeOurs =
    isAmbiguousGuestyFailure(failure) ||
    !(failure instanceof GuestyClientError) ||
    (status !== null && status >= 500);
  const detail = failure instanceof GuestyClientError
    ? `${failure.status} ${JSON.stringify(failure.details ?? "").slice(0, 300)}`
    : String((failure as any)?.message ?? failure).slice(0, 300);

  if (maybeOurs) await new Promise((r) => setTimeout(r, AMBIGUOUS_REREAD_DELAY_MS));
  const after = await readReservationStatus(reservationId);

  if (isGuestyCanceledStatus(after)) {
    if (maybeOurs) {
      console.info(`[Guesty balance] Cancelamento de ${reservationId} com resposta ambigua confirmado na releitura`);
      return "canceled";
    }
    console.info(`[Guesty balance] Reserva ${reservationId} ja estava cancelada (PUT recusado: ${detail})`);
    return "already-canceled";
  }
  if (!maybeOurs && status !== null && REFUSAL_STATUSES.has(status) && after) {
    console.error(`[Guesty balance] Guesty recusou cancelar ${reservationId} (estado "${after}"): ${detail}`);
    return "refused";
  }
  console.warn(`[Guesty balance] Cancelamento de ${reservationId} por confirmar (estado "${after ?? "ilegivel"}"): ${detail}`);
  return "unknown";
}
