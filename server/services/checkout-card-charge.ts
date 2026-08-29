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
import {
  getPaymentIntent,
  updatePaymentIntentMetadata,
  findSucceededPaymentIntentByIntentId,
  createPartialRefund,
} from "./stripe-klarna";
import {
  createReservationViaOpenApi,
  recordExternalPayment,
  appendReservationNote,
  fetchReservationConfirmationCode,
  getReservationBalanceDue,
  addReservationServiceFee,
  fetchPaymentProviderId,
  fetchReservationGuestId,
  attachGuestPaymentMethod,
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
  const m = await getBookingIntent(intentId);
  if (!m) throw new Error("intent not found");
  const b = breakdownFromIntent(m);

  // Retomável: a reserva pode já existir de uma tentativa anterior (metadata do
  // PI, ou intent — inclui recuperação manual de um settle que morreu a meio).
  let reservationId: string | null =
    pi.metadata.guestyReservationId || (m as any).reservationId || null;
  let confirmationCode: string =
    pi.metadata.guestyConfirmationCode || (m as any).confirmationCode || "";

  if (!reservationId) {
    // Defesa central: o valor cobrado TEM de bater com a matemática do servidor
    if (Math.abs(pi.amount - b.totalCents) > 100) {
      console.error(`[Card2b] AMOUNT MISMATCH intent=${intentId} pi=${pi.amount}c expected=${b.totalCents}c — reserva NÃO criada`);
      throw new Error("charged amount does not match server pricing");
    }
    // O intent guarda o nome em guestFirstName/guestLastName (não existe
    // "guestName" em booking_intents — ler esse campo mandava "Guest -" para
    // o Guesty em todas as reservas 2b).
    const firstName = String((m as any).guestFirstName ?? "").trim();
    const lastName = String((m as any).guestLastName ?? "").trim();
    const q = ((m as any).quote ?? {}) as any;
    const res = await createReservationViaOpenApi({
      listingId: (m as any).listingId,
      checkIn: (m as any).checkIn,
      checkOut: (m as any).checkOut,
      guestFirstName: firstName || "Guest",
      guestLastName: lastName || "-",
      guestEmail: (m as any).email,
      guestPhone: (m as any).guestPhone ?? undefined,
      numberOfAdults: Number((m as any).guests ?? 2),
      numberOfChildren: 0,
      numberOfInfants: 0,
      ...(q.ratePlanId ? { ratePlanId: q.ratePlanId } : {}),
    } as any);
    reservationId = res.reservationId;
    confirmationCode = res.confirmationCode;
    // Carimbo IMEDIATO, antes de qualquer passo falível (payment/nota): se o
    // resto falhar, o retry retoma ESTA reserva em vez de criar uma segunda.
    await updatePaymentIntentMetadata(paymentIntentId, {
      guestyReservationId: reservationId,
      guestyConfirmationCode: confirmationCode,
    }).catch((e: any) => console.error("[Card2b] stamp PI falhou:", e?.message));
    await updateBookingIntent(intentId, {
      reservationId,
      confirmationCode,
    } as any).catch((e: any) => console.error("[Card2b] stamp intent falhou:", e?.message));
  }
  if (!confirmationCode) {
    confirmationCode = (await fetchReservationConfirmationCode(reservationId)) ?? "";
  }

  // O Guesty tem de receber o TOTAL da estadia do site (Ricardo, 21 ago): o
  // re-preço da tarifa fica aquém (sem o service fee do Booking Engine); o
  // delta entra como invoice item AFE — categoria fora do split de owners,
  // como a cleaning fee — e so depois se regista o pagamento por inteiro.
  if (pi.metadata.feeAdjusted !== "1") {
    const balance = await getReservationBalanceDue(reservationId);
    const stayEur = Math.round(b.stayCents) / 100;
    if (balance !== null && balance > 0 && stayEur - balance > 0.5) {
      const delta = Math.round((stayEur - balance) * 100) / 100;
      const ok = await addReservationServiceFee(reservationId, delta);
      if (ok) await updatePaymentIntentMetadata(paymentIntentId, { feeAdjusted: "1" }).catch(() => {});
    } else if (balance !== null) {
      await updatePaymentIntentMetadata(paymentIntentId, { feeAdjusted: "1" }).catch(() => {});
    }
  }
  // SÓ a estadia entra no Guesty (EUR) — extras ficam na plataforma. Idempotente:
  // com balanceDue=0 (já registado) devolve sem fazer nada.
  await recordExternalPayment(reservationId, b.stayCents / 100, "EUR", paymentIntentId);
  if (pi.metadata.splitNoteAdded !== "1") {
    const noted = await appendReservationNote(
      reservationId,
      `Checkout 2.0: pagamento unico ${(pi.amount / 100).toFixed(2)} EUR na plataforma ` +
        `(estadia ${(b.stayCents / 100).toFixed(2)} registada aqui; servicos ${((pi.amount - b.stayCents) / 100).toFixed(2)} faturados pela Portugal Active). PI ${paymentIntentId}.`,
    ).catch(() => false);
    if (noted) {
      await updatePaymentIntentMetadata(paymentIntentId, { splitNoteAdded: "1" }).catch(() => {});
    }
  }
  // Cartao na carteira do Guesty. Sem isto o Guesty fica sem forma de cobrar
  // caucao, danos, noites extra ou saldos — capacidade que o fluxo antigo
  // (BE instant com ccToken) tinha e o checkout 2.0 perdeu. Idempotente pelo
  // carimbo cardOnFile; fail-soft, nunca trava a reserva.
  if (pi.metadata.cardOnFile !== "1") {
    // O motivo da falha vai para a metadata do PI: sem acesso aos logs do
    // Render, e a unica forma de o ops (e eu) ver PORQUE e que um cartao nao
    // entrou em carteira — visivel no dashboard do Stripe, ao lado da reserva.
    const r = await attachCardToGuesty({
      reservationId,
      listingId: (m as any).listingId,
      paymentIntent: pi,
    }).catch((e: any) => ({ ok: false, reason: `excecao:${String(e?.message).slice(0, 60)}` }));
    await updatePaymentIntentMetadata(
      paymentIntentId,
      r.ok ? { cardOnFile: "1" } : { cardOnFileError: r.reason.slice(0, 100) },
    ).catch(() => {});
  }
  await updatePaymentIntentMetadata(paymentIntentId, {
    guestyReservationId: reservationId,
    guestyConfirmationCode: confirmationCode,
  });
  await updateBookingIntent(intentId, {
    reservationId,
    confirmationCode,
  } as any);
  return { reservationId, confirmationCode };
}


/**
 * Poe o cartao usado no checkout na carteira do Guesty da reserva.
 *
 * Funciona porque a conta Stripe que o Guesty tem ligada ao alojamento e a
 * MESMA onde o checkout 2.0 cobra (verificado a 28 ago 2026: provider-by-listing
 * devolve acct_1KxXZlGsqyDlHBJE, a nossa). Nao ha clonagem entre contas: o
 * payment method do proprio PaymentIntent serve tal e qual.
 *
 * Devolve false (sem lancar) em qualquer passo em falta — o cartao em carteira
 * e uma capacidade extra, nunca uma condicao para a reserva existir.
 */
export async function attachCardToGuesty(input: {
  reservationId: string;
  listingId?: string | null;
  paymentIntent: { payment_method?: unknown };
}): Promise<{ ok: boolean; reason: string }> {
  const pm = input.paymentIntent?.payment_method;
  const paymentMethodId = typeof pm === "string" ? pm : (pm as any)?.id;
  if (!paymentMethodId || !String(paymentMethodId).startsWith("pm_")) {
    return { ok: false, reason: `sem-pm(${String(paymentMethodId).slice(0, 20)})` };
  }
  if (!input.listingId) return { ok: false, reason: "sem-listingId" };

  const [providerId, guestId] = await Promise.all([
    fetchPaymentProviderId(input.listingId),
    fetchReservationGuestId(input.reservationId),
  ]);
  if (!providerId) return { ok: false, reason: "sem-providerId" };
  if (!guestId) return { ok: false, reason: "sem-guestId" };

  const res = await attachGuestPaymentMethod({
    guestId,
    paymentMethodId: String(paymentMethodId),
    paymentProviderId: providerId,
    reservationId: input.reservationId,
  });
  return res.ok ? { ok: true, reason: "ok" } : { ok: false, reason: `guesty:${res.error}` };
}

/* ════════════════════════════════════════════════════════════════
   Bloco 4 — reembolso parcial por linha (2b_plan §5).
   Quando o concierge não consegue entregar uma linha needs_confirmation,
   o hóspede recebe EXATAMENTE essa linha de volta, no PI original, pela
   conta de plataforma. Fonte do valor: as lines gravadas na metadata do
   PI na criação; fallback: recomputar do intent (imutável depois de paid).
   ════════════════════════════════════════════════════════════════ */

export interface RefundLineResult {
  paymentIntentId: string;
  sku: string;
  cents: number;
  executed: boolean;
  refundId?: string;
  /** Reembolsável que sobra no PI depois (ou antes, em dry-run) desta linha */
  remainingCents: number;
  /** Linhas conhecidas do PI (para o dry-run da equipa) */
  lines: Array<{ sku: string; cents: number }>;
  alreadyRefundedSkus: string[];
}

function parseLinesMetadata(raw: string | undefined | null): Array<{ sku: string; cents: number }> {
  if (!raw) return [];
  return raw
    .split("|")
    .map((part) => {
      const i = part.lastIndexOf(":");
      if (i <= 0) return null;
      const cents = Number(part.slice(i + 1));
      const sku = part.slice(0, i);
      return sku && Number.isFinite(cents) && cents > 0 ? { sku, cents } : null;
    })
    .filter(Boolean) as Array<{ sku: string; cents: number }>;
}

/**
 * Reembolsa uma linha (sku de extra, ou os pseudo-skus "reception" e "flex")
 * do pagamento único de um intent. Dry-run por omissão; `execute: true` faz
 * o reembolso real. Idempotente por (PI, sku): a metadata `refunded_skus`
 * bloqueia repetições e a idempotency key do Stripe cobre corridas.
 */
export async function refundCheckoutLine(
  intentId: string,
  sku: string,
  opts: { execute?: boolean } = {},
): Promise<RefundLineResult> {
  const pi = await findSucceededPaymentIntentByIntentId(intentId);
  if (!pi) throw new Error(`No succeeded platform PaymentIntent found for intent ${intentId}`);

  // Linhas: metadata primeiro; fallback recomputa do intent (paid = imutável)
  let lines = parseLinesMetadata(pi.metadata?.lines);
  let receptionCents = Number(pi.metadata?.receptionCents ?? NaN);
  let flexCents = Number(pi.metadata?.flexCents ?? NaN);
  if (!lines.length || !Number.isFinite(receptionCents) || !Number.isFinite(flexCents)) {
    const m = await getBookingIntent(intentId);
    if (m) {
      const b = breakdownFromIntent(m);
      if (!lines.length) lines = b.lines;
      if (!Number.isFinite(receptionCents)) receptionCents = b.receptionCents;
      if (!Number.isFinite(flexCents)) flexCents = b.flexCents;
    }
  }
  receptionCents = Number.isFinite(receptionCents) ? receptionCents : 0;
  flexCents = Number.isFinite(flexCents) ? flexCents : 0;

  const cents =
    sku === "reception" ? receptionCents
    : sku === "flex" ? flexCents
    : lines.find((l) => l.sku === sku)?.cents ?? 0;
  if (!cents || cents <= 0) {
    throw new Error(
      `Line "${sku}" not found (or zero) on PI ${pi.id}. Known lines: ` +
        [...lines.map((l) => `${l.sku}:${l.cents}c`),
          receptionCents ? `reception:${receptionCents}c` : null,
          flexCents ? `flex:${flexCents}c` : null,
        ].filter(Boolean).join(", "),
    );
  }

  const alreadyRefundedSkus = (pi.metadata?.refunded_skus ?? "").split(",").filter(Boolean);
  if (alreadyRefundedSkus.includes(sku)) {
    throw new Error(`Line "${sku}" was already refunded on PI ${pi.id} (refunded_skus=${alreadyRefundedSkus.join(",")})`);
  }

  const charge = pi.latest_charge as import("stripe").default.Charge | null;
  const alreadyRefundedCents = typeof charge === "object" && charge ? (charge.amount_refunded ?? 0) : 0;
  const remainingCents = pi.amount - alreadyRefundedCents;
  if (cents > remainingCents) {
    throw new Error(
      `Refund of ${cents}c exceeds refundable remainder ${remainingCents}c on PI ${pi.id} (amount ${pi.amount}c, refunded ${alreadyRefundedCents}c)`,
    );
  }

  if (!opts.execute) {
    return { paymentIntentId: pi.id, sku, cents, executed: false, remainingCents, lines, alreadyRefundedSkus };
  }

  const refund = await createPartialRefund({
    paymentIntentId: pi.id,
    amountCents: cents,
    intentId,
    sku,
  });
  await updatePaymentIntentMetadata(pi.id, {
    refunded_skus: [...alreadyRefundedSkus, sku].join(","),
  });
  console.info(`[Card2b] Refunded line ${sku} (${cents}c) on PI ${pi.id} — refund ${refund.id}`);
  return {
    paymentIntentId: pi.id,
    sku,
    cents,
    executed: true,
    refundId: refund.id,
    remainingCents: remainingCents - cents,
    lines,
    alreadyRefundedSkus: [...alreadyRefundedSkus, sku],
  };
}
