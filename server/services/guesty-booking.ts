/**
 * GUESTY BOOKING ENGINE API
 * For direct booking with payment (same Stripe/GuestyPay as Guesty config).
 * Requires: GUESTY_BE_CLIENT_ID, GUESTY_BE_CLIENT_SECRET (from Booking Engine API instance)
 */

import { guestyBEClient } from "../lib/guesty";

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
  const [firstName, ...lastParts] = input.guestName.split(" ");
  const lastName = lastParts.join(" ") || firstName;

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
    const friendly = parseBEError(JSON.stringify(error?.details ?? error?.message ?? ""));
    if ((error?.status ?? 0) === 429) throw new Error(GUESTY_BE_AUTH_ERROR);
    throw new Error(friendly || "Unable to complete payment reservation.");
  }

  return {
    reservationId: reservation._id || "",
    confirmationCode: reservation.confirmationCode || reservation._id?.slice(-8) || "PA-" + Date.now(),
    status: reservation.status || "confirmed",
  };
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
