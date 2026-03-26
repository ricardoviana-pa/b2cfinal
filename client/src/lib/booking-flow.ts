export interface BookingGuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  estimatedArrivalTime: string;
  specialRequests: string;
  adultsCount: number;
  childrenCount: number;
}

export interface BookingFlowState {
  listingId: string;
  listingName?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  ratePlanId?: string;
  ratePlanType?: "flexible" | "non_refundable" | "other";
  quoteId?: string | null;
  guestDetails: BookingGuestDetails;
  acceptedTerms?: boolean;
  acceptedPolicy?: boolean;
}

export const emptyGuestDetails = (): BookingGuestDetails => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  country: "",
  estimatedArrivalTime: "",
  specialRequests: "",
  adultsCount: 2,
  childrenCount: 0,
});

function storageKey(listingId: string): string {
  return `booking-flow:${listingId}`;
}

export function readBookingFlow(listingId: string): BookingFlowState {
  if (typeof window === "undefined") {
    return {
      listingId,
      checkIn: "",
      checkOut: "",
      guests: 2,
      guestDetails: emptyGuestDetails(),
    };
  }

  try {
    const raw = window.localStorage.getItem(storageKey(listingId));
    if (!raw) {
      return {
        listingId,
        checkIn: "",
        checkOut: "",
        guests: 2,
        guestDetails: emptyGuestDetails(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<BookingFlowState>;
    return {
      listingId,
      checkIn: parsed.checkIn || "",
      checkOut: parsed.checkOut || "",
      guests: parsed.guests || 2,
      listingName: parsed.listingName,
      ratePlanId: parsed.ratePlanId,
      ratePlanType: parsed.ratePlanType,
      quoteId: parsed.quoteId,
      acceptedTerms: parsed.acceptedTerms,
      acceptedPolicy: parsed.acceptedPolicy,
      guestDetails: {
        ...emptyGuestDetails(),
        ...(parsed.guestDetails || {}),
      },
    };
  } catch {
    return {
      listingId,
      checkIn: "",
      checkOut: "",
      guests: 2,
      guestDetails: emptyGuestDetails(),
    };
  }
}

export function writeBookingFlow(listingId: string, next: BookingFlowState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(listingId), JSON.stringify(next));
}

export function patchBookingFlow(listingId: string, patch: Partial<BookingFlowState>): BookingFlowState {
  const current = readBookingFlow(listingId);
  const next: BookingFlowState = {
    ...current,
    ...patch,
    guestDetails: {
      ...current.guestDetails,
      ...(patch.guestDetails || {}),
    },
  };
  writeBookingFlow(listingId, next);
  return next;
}

export function clearBookingFlow(listingId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(listingId));
}
