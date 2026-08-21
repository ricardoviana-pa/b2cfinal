import { guestyClient } from "../lib/guesty";

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
      source: "website-direct",
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
async function fetchReservationBalanceDue(reservationId: string): Promise<number | null> {
  // A freshly created reservation 404s on GET for a few seconds (Guesty eventual
  // consistency) — and the client's 500-retry does not cover 404s. Retry here:
  // recording a payment without the real balanceDue is how payments get rejected
  // ("amount can't be greater than balance due"), so waiting beats guessing.
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const data = await guestyClient.request<any>("GET", `/v1/reservations/${reservationId}`, {
        query: { fields: "money status" },
      });
      const balanceDue = data?.money?.balanceDue;
      return typeof balanceDue === "number" ? balanceDue : null;
    } catch (err: any) {
      if (attempt === 6) {
        console.warn(`[Guesty] Could not read balanceDue for ${reservationId} after ${attempt} tries: ${err?.message || err}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return null;
}

/** Balance due (major units) de uma reserva, com retries para a janela de
 *  eventual consistency pós-criação. Exportado para o settle medir o delta
 *  entre o cobrado no site e o re-preço do Guesty. */
export async function getReservationBalanceDue(reservationId: string): Promise<number | null> {
  return fetchReservationBalanceDue(reservationId);
}

/**
 * Repõe o preço do site na reserva: lança o delta (total cobrado − re-preço do
 * Guesty) como invoice item de fee adicional. A categoria (por omissão
 * SERVICE) tem o tratamento configurado no Guesty para NÃO entrar no split de
 * owners — tal como a cleaning fee — e o Hostkit fatura o total certo.
 * Fail-soft: em erro, o comportamento anterior (registo capado) mantém-se.
 */
export async function addReservationServiceFee(
  reservationId: string,
  amount: number,
  title = "Service fee",
): Promise<boolean> {
  try {
    await guestyClient.request<any>("POST", `/v1/invoice-items/reservation/${reservationId}`, {
      body: {
        title,
        amount,
        normalType: "AFE",
        secondIdentifier: process.env.GUESTY_SERVICE_FEE_CATEGORY || "SERVICE",
        description: "Taxa de servico do checkout do site (portugalactive.com)",
      },
    });
    console.info(`[Guesty] invoice item "${title}" ${amount} adicionado a ${reservationId} — total do site reposto`);
    return true;
  } catch (err: any) {
    console.warn(`[Guesty] invoice item falhou para ${reservationId} (${amount}): ${err?.message}`);
    return false;
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

export async function recordExternalPayment(
  reservationId: string,
  amount: number,
  currency: string,
  paymentIntentId: string
): Promise<void> {
  // Record against Guesty's ACTUAL balance due, not the charged amount. The reservation is
  // priced by a different engine than the checkout quote, so paying the charged amount can
  // exceed the balance ("Payment amount can't be greater than balance due") and be rejected
  // entirely — leaving the reservation unpaid. Capping at balanceDue also makes this
  // idempotent: a second path (webhook vs. return page) sees balanceDue=0 and skips cleanly.
  const balanceDue = await fetchReservationBalanceDue(reservationId);

  if (balanceDue !== null && balanceDue <= 0) {
    console.info(`[Guesty] Reservation ${reservationId} already settled (balanceDue=0) — skipping payment record for PI ${paymentIntentId}.`);
    return;
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

  await guestyClient.request<any>("POST", `/v1/reservations/${reservationId}/payments`, {
    body: {
      paymentMethod: { method: "OTHER" },
      amount: amountToRecord,
      // `paidAt` records the funds as ALREADY COLLECTED (external processor) rather than
      // scheduled/owed — without it Guesty leaves the reservation balance unsettled.
      paidAt: new Date().toISOString(),
      note: `Stripe external payment (${currency}) — PaymentIntent: ${paymentIntentId}`,
    },
  });
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
  payments: Array<{ status?: string; amount?: number; scheduledFor?: string }>;
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
        status: p?.status,
        amount: p?.amount,
        scheduledFor: p?.shouldBePaidAt ?? p?.paidAt ?? undefined,
      })),
    };
  } catch (err: any) {
    console.warn(`[Guesty] Could not read payment state for ${reservationId}: ${err?.message || err}`);
    return null;
  }
}

/** Manifesto de serviços na nota da reserva Guesty (best-effort; fecha o gap
 *  Klarna/PayPal). Nunca bloqueia o pagamento. */
export async function appendReservationNote(reservationId: string, note: string): Promise<boolean> {
  try {
    await guestyClient.request("PUT", "/v1/reservations/" + reservationId, {
      body: { notes: { other: note.slice(0, 4000) } },
    });
    return true;
  } catch (err: any) {
    console.warn("[Guesty] appendReservationNote falhou (" + reservationId + "):", err?.message);
    return false;
  }
}
