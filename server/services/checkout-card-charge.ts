/**
 * Fase 2b — cobrança única de cartão na PLATAFORMA (decisão 12 jul 2026).
 * O hóspede paga estadia+extras num só PaymentIntent nosso; a reserva Guesty
 * é criada SÓ com a estadia + recordExternalPayment (extras nunca entram no
 * Guesty — bolo à parte dos owners). Padrão Klarna: finalize síncrono no
 * cliente + webhook como rede de segurança, idempotente via metadata do PI.
 */
import { getBookingIntent, updateBookingIntent } from "../db";
import { computeChargeBreakdown } from "./checkout-pricing";
import { resolveCleaningRates } from "../config/cleaning-rates";
import { getPaymentIntent, updatePaymentIntentMetadata } from "./stripe-klarna";
import {
  createReservationViaOpenApi,
  recordExternalPayment,
  appendReservationNote,
} from "./guesty-openapi-paypal";

export function breakdownFromIntent(m: any) {
  const q = (m?.quote ?? {}) as any;
  return computeChargeBreakdown({
    quoteTotal: Number(q.total ?? 0),
    totalNights: q.totalNights != null ? Number(q.totalNights) : null,
    nights: q.nights != null ? Number(q.nights) : null,
    reception: (m?.reception as any) ?? null,
    extras: (m?.extras as any) ?? null,
    flex: !!m?.flex,
    unitPriceOverrides: (() => {
      const r = resolveCleaningRates((m as any)?.listingId, null);
      return { "daily-cleaning": r.daily, "deep-cleaning": r.deep };
    })(),
  });
}

/** Cria a reserva Guesty (só estadia) para um PI card_v2 pago. Idempotente. */
export async function settleCardCharge(intentId: string, paymentIntentId: string): Promise<{
  reservationId: string;
  confirmationCode: string;
}> {
  const pi = await getPaymentIntent(paymentIntentId);
  if (pi.status !== "succeeded") throw new Error(`PI ${paymentIntentId} not succeeded (${pi.status})`);
  if (pi.metadata?.flow !== "card_v2" || pi.metadata?.intentId !== intentId) {
    throw new Error("PI does not belong to this intent");
  }
  // Idempotência entre finalize e webhook: o primeiro caminho carimba o PI
  if (pi.metadata.guestyReservationId && pi.metadata.guestyConfirmationCode) {
    return {
      reservationId: pi.metadata.guestyReservationId,
      confirmationCode: pi.metadata.guestyConfirmationCode,
    };
  }
  const m = await getBookingIntent(intentId);
  if (!m) throw new Error("intent not found");
  if ((m as any).reservationId) {
    return {
      reservationId: (m as any).reservationId,
      confirmationCode: (m as any).confirmationCode ?? "",
    };
  }
  // Defesa central: o valor cobrado TEM de bater com a matemática do servidor
  const b = breakdownFromIntent(m);
  if (Math.abs(pi.amount - b.totalCents) > 100) {
    console.error(`[Card2b] AMOUNT MISMATCH intent=${intentId} pi=${pi.amount}c expected=${b.totalCents}c — reserva NÃO criada`);
    throw new Error("charged amount does not match server pricing");
  }
  const name = String((m as any).guestName ?? "").trim();
  const [firstName, ...rest] = name.split(/\s+/);
  const q = ((m as any).quote ?? {}) as any;
  const res = await createReservationViaOpenApi({
    listingId: (m as any).listingId,
    checkIn: (m as any).checkIn,
    checkOut: (m as any).checkOut,
    guestFirstName: firstName || "Guest",
    guestLastName: rest.join(" ") || "-",
    guestEmail: (m as any).email,
    guestPhone: (m as any).guestPhone ?? undefined,
    numberOfAdults: Number((m as any).guests ?? 2),
    numberOfChildren: 0,
    numberOfInfants: 0,
    ...(q.ratePlanId ? { ratePlanId: q.ratePlanId } : {}),
  } as any);
  // SÓ a estadia entra no Guesty (EUR) — extras ficam na plataforma
  await recordExternalPayment(res.reservationId, b.stayCents / 100, "EUR", paymentIntentId);
  await appendReservationNote(
    res.reservationId,
    `Checkout 2.0: pagamento unico ${(pi.amount / 100).toFixed(2)} EUR na plataforma ` +
      `(estadia ${(b.stayCents / 100).toFixed(2)} registada aqui; servicos ${((pi.amount - b.stayCents) / 100).toFixed(2)} faturados pela Portugal Active). PI ${paymentIntentId}.`,
  ).catch(() => {});
  await updatePaymentIntentMetadata(paymentIntentId, {
    guestyReservationId: res.reservationId,
    guestyConfirmationCode: res.confirmationCode,
  });
  await updateBookingIntent(intentId, {
    reservationId: res.reservationId,
    confirmationCode: res.confirmationCode,
  } as any);
  return { reservationId: res.reservationId, confirmationCode: res.confirmationCode };
}
