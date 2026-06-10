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
}

export async function createReservationViaOpenApi(input: CreateReservationInput): Promise<{
  reservationId: string;
  confirmationCode: string;
  status: string;
}> {
  const data = await guestyClient.request<any>("POST", "/v1/reservations-v3", {
    body: {
      listingId: input.listingId,
      checkInDateLocalized: input.checkIn,
      checkOutDateLocalized: input.checkOut,
      status: "confirmed",
      source: "website-paypal",
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
      applyPromotions: true,
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

export async function recordExternalPayment(
  reservationId: string,
  amount: number,
  currency: string,
  paymentIntentId: string
): Promise<void> {
  await guestyClient.request<any>("POST", `/v1/reservations/${reservationId}/payments`, {
    body: {
      paymentMethod: { method: "OTHER" },
      amount,
      // `paidAt` records the funds as ALREADY COLLECTED (external processor) rather than
      // scheduled/owed — without it Guesty leaves the reservation balance unsettled.
      paidAt: new Date().toISOString(),
      note: `Stripe external payment (${currency}) — PaymentIntent: ${paymentIntentId}`,
    },
  });
}
