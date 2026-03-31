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
    checkIn: string;
    checkOut: string;
    guestsCount: number;
    totalCents: number | null;
    currency: string;
    cancellationPolicy: string[];
    checkInInstructions: string;
    googleCalendarUrl: string;
    icsFileName: string;
  }>(`/api/reservations/${reservationId}`);
}
