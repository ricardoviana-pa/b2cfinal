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

  return {
    reservationId: data._id,
    confirmationCode: data.confirmationCode,
    status: data.status,
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
      note: `PayPal via Stripe — PaymentIntent: ${paymentIntentId}`,
    },
  });
}
