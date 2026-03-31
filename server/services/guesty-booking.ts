/**
 * GUESTY BOOKING ENGINE API
 * For direct booking with payment (same Stripe/GuestyPay as Guesty config).
 * Requires: GUESTY_BE_CLIENT_ID, GUESTY_BE_CLIENT_SECRET (from Booking Engine API instance)
 *
 * IMPORTANT: Average transaction value is €7,000+. Every edge case matters.
 * - Idempotency: quoteId acts as natural idempotency key (1 booking per quote)
 * - Double-submit guard: in-flight map prevents concurrent calls for same quoteId
 * - Structured error logging with booking context for incident investigation
 */

import { guestyBEClient } from "../lib/guesty";

/**
 * In-flight booking guard: prevents double-charging when the same quoteId
 * is submitted concurrently (e.g., user double-clicks, network retry, etc.).
 * Maps quoteId → Promise<result> so concurrent calls await the same promise.
 */
const inFlightBookings = new Map<string, Promise<BEInstantReservationResult>>();

const GUESTY_BE_AUTH_ERROR =
  "O serviço de reservas está temporariamente sobrecarregado. Aguarde 1-2 minutos e tente novamente.";

/** Parse BE API error body and return a user-friendly message */
function parseBEError(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      const msg = first?.message ?? first?.code;
      if (typeof msg === "string") {
        if (first?.path?.includes?.("guestEmail")) return "Please enter a valid email address.";
        if (first?.path?.includes?.("guestPhone")) return "Please enter a valid phone number.";
        if (msg.includes("email")) return "Please enter a valid email address.";
        return msg;
      }
    }
    if (parsed?.error?.code === "LISTING_IS_NOT_AVAILABLE") {
      const details = parsed?.error?.data?.moreDetails?.notApplicableRatePlans || [];
      const hasMinNights = details.some((p: any) => p?.notApplicable?.minNights);
      const hasAdvanceNotice = details.some((p: any) => p?.notApplicable?.advanceNotice);
      const hasManual = details.some((p: any) => p?.notApplicable?.manual);
      if (hasMinNights) return "These dates do not meet the minimum stay rule for this property.";
      if (hasAdvanceNotice) return "These dates cannot be booked online because the advance notice rule is not met.";
      if (hasManual) return "This property is only available by request for the selected dates.";
      return "This property is not available for the selected dates.";
    }
    if (parsed?.message) return parsed.message;
    if (parsed?.error) return parsed.error;
  } catch {
    /* ignore parse errors */
  }
  return null;
}

export function isBEApiConfigured(): boolean {
  return guestyBEClient.isConfigured();
}

export interface BERatePlanOption {
  ratePlanId: string;
  name: string;
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  cancellationPolicy?: string[];
  cancellationFee?: string;
}

export interface BEQuoteResult {
  quoteId: string;
  listingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  total: number;
  ratePlanId: string;
  cancellationPolicy?: string[];
  pricing: {
    nightlyRate: number;
    totalNights: number;
    cleaningFee: number;
  };
  /** All available rate plans (refundable, non-refundable, etc.) */
  ratePlanOptions?: BERatePlanOption[];
}

export async function createBEQuote(input: {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
}): Promise<BEQuoteResult> {
  const body: Record<string, unknown> = {
    listingId: input.listingId,
    checkInDateLocalized: input.checkIn,
    checkOutDateLocalized: input.checkOut,
    guestsCount: input.guests,
  };
  if (input.guestFirstName || input.guestLastName || input.guestEmail) {
    body.guest = {
      firstName: input.guestFirstName || "Guest",
      lastName: input.guestLastName || "Guest",
      email: input.guestEmail || "guest@example.com",
    };
  }

  let quote: any;
  try {
    quote = await guestyBEClient.request<any>("POST", "/api/reservations/quotes", { body });
  } catch (error: any) {
    const details = error?.details ?? null;
    if (details) console.error("[BE Quote] Raw error details:", JSON.stringify(details));
    const friendly = parseBEError(JSON.stringify(details ?? error?.message ?? ""));
    if ((error?.status ?? 0) === 429) throw new Error(GUESTY_BE_AUTH_ERROR);
    if ((error?.status ?? 0) === 422) throw new Error(friendly || "This property is not available for the selected dates.");
    throw new Error(friendly || error?.message || "Unable to get live quote from Guesty.");
  }

  const ratePlans = quote.rates?.ratePlans || [];
  const plan = ratePlans[0];
  if (!plan) throw new Error("No rate plan available for this property");

  const nights = Math.ceil(
    (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000
  );

  // Guesty BE wraps rate plan data under a nested "ratePlan" key
  const resolvePlanId = (p: any): string =>
    p?.ratePlan?._id || p?._id || p?.id || p?.ratePlanId || "";

  const mapPlan = (p: any) => {
    // Support both nested { ratePlan: { _id, name, money, ... } } and flat structures
    const rp = p.ratePlan || p;
    const m = rp.money || p.money || {};
    // Use fareAccommodationAdjusted (after promos) for accurate nightly rate
    const fareAccommodation = Number(
      m.fareAccommodationAdjusted ?? m.fareAccommodation ?? m.accommodationFare ?? 0
    );
    const fareCleaning = Number(m.fareCleaning ?? m.cleaningFee ?? 0);
    const total = Number(
      m.subTotalPrice ?? m.hostPayout ?? m.totalPrice ?? m.total ?? m.totalAmount ??
      fareAccommodation + fareCleaning
    ) || 0;
    const cancellationPolicy = rp.cancellationPolicy
      ? [String(rp.cancellationPolicy)]
      : (p.cancellationPolicy ?? undefined);
    return {
      ratePlanId: resolvePlanId(p),
      name: rp.name || p.name || "Standard rate",
      total,
      nightlyRate: nights > 0 ? fareAccommodation / nights : 0,
      cleaningFee: fareCleaning,
      cancellationPolicy,
      cancellationFee: rp.cancellationFee ?? p.cancellationFee,
    };
  };

  const options = ratePlans.map(mapPlan);
  const selected = mapPlan(plan);
  const money = plan.ratePlan?.money || plan.money || {};

  return {
    quoteId: quote._id,
    listingId: input.listingId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    currency: money.currency || "EUR",
    total: selected.total,
    ratePlanId: resolvePlanId(plan),
    cancellationPolicy: selected.cancellationPolicy,
    pricing: {
      nightlyRate: selected.nightlyRate,
      totalNights: selected.total - selected.cleaningFee,
      cleaningFee: selected.cleaningFee,
    },
    ratePlanOptions: options,
  };
}

export interface BEInstantReservationResult {
  reservationId: string;
  confirmationCode: string;
  status: string;
}

export async function createBEInstantReservation(input: {
  quoteId: string;
  ratePlanId: string;
  ccToken: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  policy?: Record<string, unknown>;
}): Promise<BEInstantReservationResult> {
  // ── Idempotency guard: prevent double-charging for same quoteId ──
  const existing = inFlightBookings.get(input.quoteId);
  if (existing) {
    console.warn(`[BE Booking] DUPLICATE REQUEST detected for quoteId=${input.quoteId} — awaiting existing call`);
    return existing;
  }

  const bookingPromise = executeInstantReservation(input);
  inFlightBookings.set(input.quoteId, bookingPromise);

  try {
    return await bookingPromise;
  } finally {
    // Clean up after 60s (keep briefly for rapid retries)
    setTimeout(() => inFlightBookings.delete(input.quoteId), 60_000);
  }
}

async function executeInstantReservation(input: {
  quoteId: string;
  ratePlanId: string;
  ccToken: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  policy?: Record<string, unknown>;
}): Promise<BEInstantReservationResult> {
  const [firstName, ...lastParts] = input.guestName.split(" ");
  const lastName = lastParts.join(" ") || firstName;
  const startedAt = Date.now();

  const logCtx = {
    quoteId: input.quoteId,
    ratePlanId: input.ratePlanId,
    guestEmail: input.guestEmail,
    ccTokenPrefix: input.ccToken.slice(0, 6),
  };

  console.info(`[BE Booking] START instant reservation`, JSON.stringify(logCtx));

  let reservation: any;
  try {
    reservation = await guestyBEClient.request<any>(
      "POST",
      `/api/reservations/quotes/${input.quoteId}/instant`,
      {
        body: {
          ratePlanId: input.ratePlanId,
          ccToken: input.ccToken,
          guest: {
            firstName,
            lastName,
            email: input.guestEmail,
            phone: input.guestPhone,
          },
          policy: input.policy || {},
        },
      }
    );
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    const status = error?.status ?? 0;
    const errorDetails = error?.details ?? error?.message ?? "";
    const friendly = parseBEError(JSON.stringify(errorDetails));

    console.error(`[BE Booking] FAILED instant reservation (${durationMs}ms, status=${status})`, JSON.stringify({
      ...logCtx,
      status,
      error: typeof errorDetails === "string" ? errorDetails.slice(0, 500) : errorDetails,
    }));

    if (status === 429) throw new Error(GUESTY_BE_AUTH_ERROR);

    // Categorize error for frontend handling
    if (status === 409 || /already.*booked|conflict|dates.*unavail/i.test(String(errorDetails))) {
      throw new Error("These dates have just been booked by another guest. Please select different dates.");
    }
    if (status === 422) {
      throw new Error(friendly || "The booking could not be processed. Please check your details and try again.");
    }
    if (status >= 500) {
      throw new Error("The payment system is temporarily unavailable. Your card has not been charged. Please try again in a few minutes.");
    }

    throw new Error(friendly || "Unable to complete payment reservation.");
  }

  const durationMs = Date.now() - startedAt;
  const result: BEInstantReservationResult = {
    reservationId: reservation._id || "",
    confirmationCode: reservation.confirmationCode || reservation._id?.slice(-8) || "PA-" + Date.now(),
    status: reservation.status || "confirmed",
  };

  console.info(`[BE Booking] SUCCESS instant reservation (${durationMs}ms)`, JSON.stringify({
    ...logCtx,
    reservationId: result.reservationId,
    confirmationCode: result.confirmationCode,
    status: result.status,
  }));

  return result;
}

export async function getPaymentProvider(listingId: string): Promise<{
  providerType: string;
  providerAccountId?: string;
}> {
  const provider = await guestyBEClient.request<any>("GET", `/api/listings/${listingId}/payment-provider`);
  return {
    providerType: provider.providerType || "unknown",
    providerAccountId: provider.providerAccountId,
  };
}
