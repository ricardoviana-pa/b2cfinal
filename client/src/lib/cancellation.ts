/**
 * Cancellation-policy sentences for the UI. The rule of every Guesty code and
 * its words in every language live in shared/cancellationPolicy.ts (the one
 * source of truth, used by the server too); this file only plugs in the site's
 * date format. Raw Guesty codes never reach the UI.
 */

import {
  describeCancellationPolicy,
  freeCancellationDeadline as sharedFreeCancellationDeadline,
  type CancellationDescription,
} from "@shared/cancellationPolicy";
import { formatBookingDate } from "./format";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export {
  isNonRefundablePlan,
  planPolicyCode,
  rateKind,
  cancellationPolicyPath,
  cancellationPolicyCopy,
} from "@shared/cancellationPolicy";

/**
 * The policy of one rate for these dates: Guesty's code → rule, with the
 * concrete cancel-by date when the arrival is known. Unknown code → "the
 * cancellation terms of your rate" (`known: false`, so the caller adds the
 * link to the terms). Pass planPolicyCode(plan) when the plan is at hand.
 */
export function cancellationPolicyInfo(
  rawCode: unknown,
  checkIn: string | undefined | null,
  lang?: string,
): CancellationDescription {
  return describeCancellationPolicy(rawCode, {
    lang,
    checkIn,
    formatDate: (ymd) => formatBookingDate(ymd, lang, true),
  });
}

/** Just the sentence of cancellationPolicyInfo. */
export function cancellationPolicyText(
  rawCode: unknown,
  checkIn: string | undefined | null,
  lang?: string,
): string {
  return cancellationPolicyInfo(rawCode, checkIn, lang).text;
}

/**
 * Last free-cancellation day (YYYY-MM-DD) for the code, or null when there is
 * none (non-refundable, unknown code, or the period has ended). Feeds the
 * Flex block's contextual copy.
 */
export function freeCancellationDeadline(
  rawCode: unknown,
  checkIn: string | undefined,
): string | null {
  return sharedFreeCancellationDeadline(rawCode, checkIn);
}

/** Translated reservation-status label — never the raw Guesty enum. */
export function reservationStatusLabel(rawStatus: string | null | undefined, t: TranslateFn): string {
  const status = (rawStatus || "").toLowerCase().trim();
  const known = new Set([
    "confirmed",
    "reserved",
    "pending",
    "canceled",
    "declined",
    "expired",
    "inquiry",
  ]);
  if (status === "cancelled") return t("bookingStatus.canceled");
  if (known.has(status)) return t(`bookingStatus.${status}`);
  return t("bookingStatus.processing");
}
