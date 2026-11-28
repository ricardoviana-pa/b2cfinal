/**
 * Leitura e escrita de reservas na Open API do Guesty pelos endpoints novos.
 *
 * O Guesty retira a 1 mar 2027 a API antiga de reservas: GET/PUT
 * /v1/reservations/{id}, GET /v1/reservations (lista),
 * POST /v1/reservations/{id}/payments e POST /v1/guests/{id}/payment-methods
 * (email de 9 nov 2026, ticket 2202626; guia
 * open-api-docs.guesty.com/docs/reservation-migration).
 *
 * Os substitutos foram lidos em produção a 28 nov 2026, só com GETs, em
 * reservas reais do checkout:
 * - GET /v1/reservations-v3?reservationIds[]=ID: devolve um array. Tem
 *   `_id`, `status`, `confirmationCode`, `bookerId` (= guestId antigo),
 *   `guests[].id`, `stay[]` (`unitId` = listingId, `ratePlanId`,
 *   `checkInDateLocalized`, `checkOutDateLocalized`) e `notes` (o mesmo
 *   objeto do antigo). Com `reservationIds=ID` sem os [] o Guesty responde 400
 *   ("reservationIds must be an array").
 * - GET /v1/payments?reservationId=ID: `balanceDue`, `totalPaid`,
 *   `totalRefunded`, `currency`, `hostPayout` e `payments[]` (com `note`,
 *   onde está o id do PaymentIntent). Os números bateram certo com o
 *   `money` antigo, ao cêntimo.
 * - GET /v1/reservations-v3/search?filter[...]: `results[]` com
 *   `stay[].listingId`, e `pagination`.
 *
 * Até à data de retirada, qualquer falha do caminho novo volta ao antigo e
 * fica no log como "[Guesty v3] ... legado". Depois de 1 mar 2027 o antigo
 * deixa de ser tentado.
 */
import { guestyClient, GuestyClientError, isAmbiguousGuestyFailure } from "../lib/guesty";

/** Data em que o Guesty desliga os endpoints antigos de reservas. */
export const LEGACY_RESERVATIONS_SUNSET = Date.parse("2027-03-01T00:00:00Z");

/** Ainda se pode tentar o endpoint antigo? */
export function legacyReservationsAvailable(now = Date.now()): boolean {
  return now < LEGACY_RESERVATIONS_SUNSET;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function errText(err: unknown): string {
  const e = err as any;
  const status = e?.status != null ? `${e.status} ` : "";
  return `${status}${String(e?.message ?? err)}`.slice(0, 200);
}

/** Não é resposta do Guesty ao pedido (rede, 5xx sem repetição, timeout):
 *  um POST pode ter ficado gravado, por isso não se repete noutro endpoint. */
function mayHaveWritten(err: unknown): boolean {
  if (isAmbiguousGuestyFailure(err)) return true;
  if (!(err instanceof GuestyClientError)) return true;
  return err.status >= 500 || err.status === 408;
}

/** A reserva tal como o GET /v3 a devolve, ou null se não veio. */
export async function fetchReservationV3Raw(reservationId: string): Promise<any | null> {
  const data = await guestyClient.request<any>("GET", "/v1/reservations-v3", {
    query: { "reservationIds[]": reservationId },
  });
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
  return list.find((r) => r && (r._id === reservationId || r.reservationId === reservationId)) ?? null;
}

/** Pagamentos e saldo da reserva (GET /v1/payments). */
export async function fetchReservationPaymentsV3(reservationId: string): Promise<any> {
  const data = await guestyClient.request<any>("GET", "/v1/payments", { query: { reservationId } });
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`GET /v1/payments sem objeto para ${reservationId}`);
  }
  return data;
}

/**
 * A reserva v3 no formato antigo, com os campos que o site lê:
 * `_id`, `status`, `confirmationCode`, `listingId`, `guestId`, `ratePlanId`,
 * `checkInDateLocalized`, `checkOutDateLocalized`, `notes` e, se vierem os
 * pagamentos, `money` com `balanceDue`, `totalPaid`, `totalRefunded`,
 * `currency`, `hostPayout` e `payments`.
 *
 * `money.totalPrice` fica de fora de propósito: o GET antigo também não o
 * trazia (visto a 28 nov 2026), e quem o lê trata a falta como "desconhecido".
 */
export function legacyShapeFromV3(v3: any, payments?: any): any {
  const stays: any[] = Array.isArray(v3?.stay) ? v3.stay : [];
  const first = stays[0] ?? {};
  const last = stays[stays.length - 1] ?? first;
  const guestId =
    str(v3?.bookerId) ?? str(v3?.guestId) ?? (Array.isArray(v3?.guests) ? str(v3.guests[0]?.id) : null);
  const out: any = {
    _id: str(v3?._id) ?? str(v3?.reservationId),
    status: v3?.status,
    confirmationCode: v3?.confirmationCode,
    listingId: str(first.unitId) ?? str(first.listingId) ?? str(first.unitTypeId) ?? str(v3?.listingId),
    guestId,
    ratePlanId: str(first.ratePlanId) ?? str(v3?.ratePlanId),
    checkInDateLocalized: first.checkInDateLocalized ?? v3?.checkInDateLocalized,
    checkOutDateLocalized: last.checkOutDateLocalized ?? v3?.checkOutDateLocalized,
    checkIn: first.checkIn ?? v3?.checkIn,
    checkOut: last.checkOut ?? v3?.checkOut,
    notes: v3?.notes && typeof v3.notes === "object" ? v3.notes : {},
  };
  if (payments) {
    out.money = {
      balanceDue: payments.balanceDue,
      totalPaid: payments.totalPaid,
      totalRefunded: payments.totalRefunded,
      currency: payments.currency,
      hostPayout: payments.hostPayout,
      isFullyPaid: payments.isFullyPaid,
      payments: Array.isArray(payments.payments) ? payments.payments : [],
    };
  }
  return out;
}

/**
 * A reserva no formato antigo, lida pelos endpoints novos. Com
 * `money: true` lê também os pagamentos. Se o caminho novo falhar e o antigo
 * ainda existir, lê o antigo (mesmo formato) e deixa o aviso no log.
 * Lança quando nenhum dos dois responde, como o GET antigo lançava.
 */
export async function readReservation(
  reservationId: string,
  opts: { money?: boolean } = {},
): Promise<any> {
  let failure: unknown;
  try {
    const [v3, payments] = await Promise.all([
      fetchReservationV3Raw(reservationId),
      opts.money ? fetchReservationPaymentsV3(reservationId) : Promise.resolve(undefined),
    ]);
    if (v3) return legacyShapeFromV3(v3, payments);
    failure = new GuestyClientError({
      message: "Reservation not found in reservations-v3",
      status: 404,
      method: "GET",
      endpoint: "/v1/reservations-v3",
    });
  } catch (err) {
    failure = err;
  }
  if (!legacyReservationsAvailable()) throw failure;
  console.warn(`[Guesty v3] leitura de ${reservationId} falhou (${errText(failure)}) — a ler pelo endpoint legado`);
  return legacyEndpoints.readReservation(reservationId);
}

/**
 * Regista um pagamento já cobrado fora do Guesty (POST /v1/payments/record).
 * Sem `shouldBePaidAt` o Guesty grava-o já como SUCCEEDED (doc da referência).
 * Os métodos aceites são RECORDED_CASH, ECHECK, DEBIT, CREDIT, BANK_TRANSFER,
 * CREDIT_NOTE, VOUCHER, CHECK e OTHER.
 *
 * Se o Guesty recusar o pedido novo (4xx: nada foi criado) e o antigo ainda
 * existir, regista pelo antigo com o corpo de sempre. Uma falha ambígua sobe
 * sem segunda tentativa: quem chama relê os pagamentos antes de repetir.
 */
export async function recordReservationPayment(input: {
  reservationId: string;
  amount: number;
  note: string;
  confirmationCode?: string | null;
}): Promise<void> {
  try {
    await guestyClient.request<any>("POST", "/v1/payments/record", {
      body: {
        reservationId: input.reservationId,
        amount: input.amount,
        paymentMethod: { method: "OTHER" },
        note: input.note.slice(0, 500),
        ...(input.confirmationCode ? { confirmationCode: input.confirmationCode } : {}),
      },
      nonIdempotent: true,
    });
    return;
  } catch (err) {
    if (mayHaveWritten(err) || !legacyReservationsAvailable()) throw err;
    console.warn(`[Guesty v3] POST /payments/record recusado em ${input.reservationId} (${errText(err)}) — a registar pelo endpoint legado`);
  }
  await legacyEndpoints.recordReservationPayment(input);
}

/**
 * Escreve notes.other (PUT /v1/reservations-v3/{id}/notes).
 *
 * A doc não diz se o PUT substitui o objeto `notes` inteiro ou só os campos
 * enviados, por isso vão também os outros campos que já lá estavam, sem
 * mexer: em qualquer das leituras nada se perde.
 */
export async function writeReservationOtherNote(
  reservationId: string,
  currentNotes: unknown,
  other: string,
): Promise<void> {
  const notes: Record<string, string> = {};
  if (currentNotes && typeof currentNotes === "object") {
    for (const key of ["cleaning", "guest", "specialRequests", "keyCode"]) {
      const v = (currentNotes as any)[key];
      if (typeof v === "string" && v) notes[key] = v;
    }
  }
  notes.other = other;
  try {
    await guestyClient.request("PUT", `/v1/reservations-v3/${encodeURIComponent(reservationId)}/notes`, {
      body: { notes },
    });
    return;
  } catch (err) {
    if (mayHaveWritten(err) || !legacyReservationsAvailable()) throw err;
    console.warn(`[Guesty v3] PUT notes recusado em ${reservationId} (${errText(err)}) — a gravar pelo endpoint legado`);
  }
  await legacyEndpoints.writeReservationOtherNote(reservationId, currentNotes, other);
}

/**
 * Põe um payment method do Stripe na carteira do hóspede (POST
 * /v1/payment-methods). O novo liga o cartão à reserva pelo
 * `confirmationCode` e não pelo id.
 *
 * O antigo levava `skipSetupIntent`, que a referência nova não documenta;
 * não se manda, para não arriscar um 400 por campo desconhecido. Se o novo
 * recusar (4xx) e o antigo ainda existir, vai pelo antigo como antes.
 */
export async function createGuestPaymentMethod(input: {
  guestId: string;
  paymentMethodId: string;
  paymentProviderId: string;
  reservationId: string;
  confirmationCode: string | null;
}): Promise<void> {
  if (input.confirmationCode) {
    try {
      const res = await guestyClient.request<any>("POST", "/v1/payment-methods", {
        body: {
          guestId: input.guestId,
          paymentProviderId: input.paymentProviderId,
          confirmationCode: input.confirmationCode,
          stripeCardToken: input.paymentMethodId,
          reuse: true,
        },
      });
      const status = typeof res?.status === "string" ? res.status : "?";
      if (status !== "ACTIVE") {
        console.warn(`[Guesty v3] cartao ${input.paymentMethodId} em carteira com estado ${status} (reserva ${input.reservationId})`);
      }
      return;
    } catch (err) {
      if (mayHaveWritten(err) || !legacyReservationsAvailable()) throw err;
      console.warn(`[Guesty v3] POST /payment-methods recusado em ${input.reservationId} (${errText(err)}) — a usar o endpoint legado`);
    }
  } else if (!legacyReservationsAvailable()) {
    throw new Error(`sem confirmationCode para ${input.reservationId}: o Guesty exige-o para ligar o cartao`);
  }
  await legacyEndpoints.createGuestPaymentMethod(input);
}

/**
 * Há alguma reserva confirmada ou em espera nesta casa que se cruze com as
 * datas? (GET /v1/reservations-v3/search.) Datas YYYY-MM-DD, check-out
 * exclusivo: cruza-se quem entra antes de `checkOut` e sai depois de
 * `checkIn`. Lança quando não consegue saber.
 */
export async function hasOverlappingReservation(listingId: string, checkIn: string, checkOut: string): Promise<boolean> {
  try {
    const data = await guestyClient.request<any>("GET", "/v1/reservations-v3/search", {
      query: {
        "filter[listingId]": listingId,
        "filter[checkIn][lt]": checkOut,
        "filter[checkOut][gt]": checkIn,
        "filter[status]": "confirmed,reserved",
        limit: 1,
        skip: 0,
      },
    });
    if (!Array.isArray(data?.results)) throw new Error("reservations-v3/search sem results");
    return data.results.length > 0;
  } catch (err) {
    if (!legacyReservationsAvailable()) throw err;
    console.warn(`[Guesty v3] pesquisa de reservas falhou (${errText(err)}) — a pesquisar pelo endpoint legado`);
  }
  return legacyEndpoints.hasOverlappingReservation(listingId, checkIn, checkOut);
}

/**
 * Os mesmos cinco serviços pelos endpoints ANTIGOS, tal como o site os chamava
 * até nov 2026. Servem de recurso até 1 mar 2027 e deixam os testes da lógica
 * de negócio (que simulam o Guesty pelos endereços antigos) correr sem
 * mudança: basta trocar as funções do módulo por estas no vi.mock.
 */
export const legacyEndpoints = {
  readReservation(reservationId: string, _opts: { money?: boolean } = {}): Promise<any> {
    return guestyClient.request<any>("GET", `/v1/reservations/${encodeURIComponent(reservationId)}`);
  },

  async recordReservationPayment(input: { reservationId: string; amount: number; note: string }): Promise<void> {
    await guestyClient.request<any>("POST", `/v1/reservations/${input.reservationId}/payments`, {
      body: {
        paymentMethod: { method: "OTHER" },
        amount: input.amount,
        // `paidAt` marca o valor como já recebido (processador externo).
        paidAt: new Date().toISOString(),
        note: input.note,
      },
      nonIdempotent: true,
    });
  },

  async writeReservationOtherNote(reservationId: string, _currentNotes: unknown, other: string): Promise<void> {
    await guestyClient.request("PUT", "/v1/reservations/" + reservationId, {
      body: { notes: { other } },
    });
  },

  async createGuestPaymentMethod(input: {
    guestId: string;
    paymentMethodId: string;
    paymentProviderId: string;
    reservationId: string;
    confirmationCode?: string | null;
  }): Promise<void> {
    await guestyClient.request<any>("POST", `/v1/guests/${input.guestId}/payment-methods`, {
      body: {
        stripeCardToken: input.paymentMethodId,
        paymentProviderId: input.paymentProviderId,
        reservationId: input.reservationId,
        reuse: true,
        skipSetupIntent: true,
      },
    });
  },

  async hasOverlappingReservation(listingId: string, checkIn: string, checkOut: string): Promise<boolean> {
    const result = await guestyClient.request<any>("GET", "/v1/reservations", {
      query: {
        filters: JSON.stringify([
          { field: "listingId", operator: "$eq", value: listingId },
          { field: "checkInDateLocalized", operator: "$lt", value: checkOut },
          { field: "checkOutDateLocalized", operator: "$gt", value: checkIn },
          { field: "status", operator: "$in", value: ["confirmed", "reserved"] },
        ]),
        fields: "_id status listingId checkInDateLocalized checkOutDateLocalized",
        limit: 1,
        skip: 0,
      },
    });
    if (!Array.isArray(result?.results)) throw new Error("Unable to verify recovery availability");
    return result.results.length > 0;
  },
};
