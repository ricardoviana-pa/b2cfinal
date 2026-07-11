export interface BookingListing {
  id: string;
  name: string;
  images: string[];
  locality: string;
  maxGuests: number;
  minNights: number;
  checkInInstructions: string;
}

export interface BookingQuoteResponse {
  quoteId: string | null;
  nights: number;
  baseRent: number;
  cleaningFee: number;
  serviceFee: number;
  touristTax: number;
  vat: number;
  totalBeforeTax: number;
  totalAfterTax: number;
  currency: string;
  ratePlanId?: string | null;
  ratePlanOptions?: Array<{
    ratePlanId: string;
    name: string;
    type: "flexible" | "non_refundable" | "other";
    cancellationPolicy?: string[];
    cancellationFee?: string | null;
    total: number;
    baseRent: number;
    cleaningFee: number;
  }>;
}

export interface BookingCalendarDay {
  date: string;
  status: string;
  minNights?: number;
  price?: number;
}

/**
 * Confirmation payload handed from the PayPal/Klarna return page to the
 * thank-you page. Guesty's Open-API reservations are not reliably readable via
 * GET immediately after creation, so we carry the data we already have client-
 * side (booking input + mutation result) rather than re-fetching. Stored in
 * sessionStorage so it survives a thank-you-page reload within the session.
 */
export interface ThankYouStash {
  reservationId: string;
  confirmationCode: string;
  status?: string;
  method: "paypal" | "klarna" | "card";
  listingName?: string;
  location?: string;
  checkIn: string;
  checkOut: string;
  guestsCount?: number;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  totalCents: number | null;
  currency: string;
  /** Promo code applied to the quote — carried into the GA4 purchase event */
  couponCode?: string;
}

const thankYouKey = (reservationId: string) => `thankyou_${reservationId}`;

export function stashThankYou(data: ThankYouStash): void {
  try {
    sessionStorage.setItem(thankYouKey(data.reservationId), JSON.stringify(data));
  } catch {
    /* sessionStorage unavailable — page falls back to fetchReservation */
  }
}

export function readThankYou(reservationId: string): ThankYouStash | null {
  try {
    const raw = sessionStorage.getItem(thankYouKey(reservationId));
    return raw ? (JSON.parse(raw) as ThankYouStash) : null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    ...(init || {}),
    credentials: "include",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchListing(listingId: string): Promise<BookingListing> {
  return fetchJson(`/api/listings/${listingId}`);
}

export function fetchQuote(listingId: string, input: {
  checkIn: string;
  checkOut: string;
  guests: number;
  ratePlanId?: string;
}): Promise<BookingQuoteResponse> {
  const params = new URLSearchParams({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: String(input.guests),
  });
  if (input.ratePlanId) params.set("ratePlanId", input.ratePlanId);
  return fetchJson(`/api/listings/${listingId}/quote?${params.toString()}`, undefined, 10000);
}

export function fetchRatePlans(listingId: string): Promise<{
  ratePlans: Array<{
    id: string;
    name: string;
    type: "flexible" | "non_refundable" | "other";
    cancellationPolicy?: string[];
    cancellationFee?: string | null;
  }>;
}> {
  return fetchJson(`/api/listings/${listingId}/rate-plans`);
}

export async function fetchCalendarWindow(listingId: string, months = 3): Promise<BookingCalendarDay[]> {
  const data = await fetchJson<any>(`/api/listings/${listingId}/calendar-window?months=${months}`);
  const rawDays =
    Array.isArray(data?.data?.days)
      ? data.data.days
      : Array.isArray(data?.days)
        ? data.days
        : data?.data && typeof data.data === "object"
          ? Object.values(data.data)
          : [];
  const days = Array.isArray(rawDays) ? rawDays : [];
  return days.map((day: any) => ({
    date: day.date || day.day || day.startDate || "",
    status: day.status || day.availability || "unknown",
    minNights: Number(day.minNights || day.minimumStay || 0) || undefined,
    price: Number(day.price ?? day.nightlyRate ?? day.basePrice ?? 0) || undefined,
  }));
}

// createReservation (inquiry) removed — all bookings must go through
// Booking Engine with Stripe payment. Contact concierge for questions.

export function fetchReservation(reservationId: string) {
  return fetchJson<{
    reservationId: string;
    confirmationCode: string;
    status: string;
    paymentStatus: string;
    listingName: string;
    location?: string;
    checkIn: string;
    checkOut: string;
    guestsCount: number;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    totalCents: number | null;
    nightlyRateCents?: number | null;
    nights?: number | null;
    cleaningFeeCents?: number | null;
    currency: string;
    cancellationPolicy: string[];
    checkInInstructions: string;
    googleCalendarUrl: string;
    icsFileName: string;
  }>(`/api/reservations/${reservationId}`);
}
