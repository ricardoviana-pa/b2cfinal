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
  /**
   * Quote do Booking Engine que o site cotou E COBROU (inclui o service fee).
   * Reservar a partir dela faz o Guesty registar o preço EXATO pago pelo
   * hóspede — o service fee entra com o tratamento já configurado no Guesty
   * (fora do split de owners) e o Hostkit fatura o valor certo. Sem ela, o
   * Guesty re-preça só pela tarifa e fatura-se a menos (achado 21 ago,
   * reserva GY-q5rd7VG6: cobrado 2069,20, Guesty 1902,20).
   */
  quoteId?: string;
}

export async function createReservationViaOpenApi(input: CreateReservationInput): Promise<{
  reservationId: string;
  confirmationCode: string;
  status: string;
}> {
  // Caminho preferido: reservar a partir da quote cotada/cobrada. Se a quote
  // já não for aceite (expirada — settle tardio via webhook/retry), cai no
  // caminho por listing+datas+ratePlan (preço re-calculado, capado no payment).
  if (input.quoteId && input.ratePlanId) {
    try {
      const viaQuote = await guestyClient.request<any>("POST", "/v1/reservations-v3", {
        body: {
          quoteId: input.quoteId,
          ratePlanId: input.ratePlanId,
          status: "confirmed",
          source: "website-direct",
          guest: {
            firstName: input.guestFirstName,
            lastName: input.guestLastName,
            email: input.guestEmail,
            ...(input.guestPhone && { phones: [input.guestPhone] }),
          },
        },
      });
      const rid = viaQuote?.reservationId ?? viaQuote?._id;
      if (rid) {
        console.info(`[Guesty] reserva criada a partir da quote ${input.quoteId} — preço do site preservado`);
        return {
          reservationId: String(rid),
          confirmationCode: String(viaQuote?.confirmationCode ?? ""),
          status: String(viaQuote?.status ?? "confirmed"),
        };
      }
      console.warn("[Guesty] criação por quote sem reservationId na resposta — a cair para listing+datas");
    } catch (err: any) {
      console.warn(`[Guesty] criação por quote falhou (${err?.message}) — a cair para listing+datas`);
    }
  }
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
