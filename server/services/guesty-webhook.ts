/**
 * Lê o corpo de um webhook do Guesty, nos dois formatos.
 *
 * - Antigo (sai a 1 mar 2027): `reservation.new` / `reservation.updated`, com a
 *   reserva inteira em `data.reservation` (`_id`, `listingId`, `status`).
 * - v2: `reservation.created.v2` / `reservation.updated.v2`, magro: em `data`
 *   vêm `reservationId`, `status`, `unitId`/`unitTypeId`/`lastStayListingId`
 *   e `stay[]` (doc webhooks-reservations, nov 2026). Sem `listingId`.
 *
 * O nome do evento sai sem o ".v2", e o `reservation.new` antigo passa a
 * `reservation.created`, para o resto do código ver um só nome por evento.
 */
export interface GuestyWebhookEvent {
  eventType: string;
  listingId: string;
  reservationId: string;
  guestyStatus: string;
  /** O objeto da reserva tal como veio (inteiro no antigo, magro no v2). */
  reservation: any;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function parseGuestyWebhook(payload: any): GuestyWebhookEvent {
  const rawEvent = str(payload?.event) || str(payload?.type) || "unknown";
  let eventType = rawEvent.replace(/\.v2$/i, "");
  if (/^reservation\.new$/i.test(eventType)) eventType = "reservation.created";
  eventType = eventType.replace(/^Reservation\./, "reservation.");

  const data = payload?.data ?? {};
  const reservation = data?.reservation || data || payload;
  const stays: any[] = Array.isArray(reservation?.stay) ? reservation.stay : [];
  const listingId =
    str(reservation?.listingId) ||
    str(reservation?.unitId) ||
    str(stays[0]?.unitId) ||
    str(reservation?.lastStayListingId) ||
    str(reservation?.unitTypeId) ||
    str(payload?.listingId);
  const reservationId = str(reservation?._id) || str(reservation?.reservationId) || str(data?._id) || str(data?.reservationId);
  const guestyStatus = str(reservation?.status).toLowerCase();
  return { eventType, listingId, reservationId, guestyStatus, reservation };
}
