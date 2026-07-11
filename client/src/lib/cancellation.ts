/**
 * Human, translated cancellation-policy sentences (F1).
 *
 * Guesty sends raw policy codes ("flexible", "moderate", "firm", "strict",
 * "super_strict") through the quote/reservation APIs. These must NEVER reach
 * the UI raw. The semantics below mirror the site's own policy page
 * (client/src/pages/CancellationPolicy.tsx → cancellationPolicy.* i18n keys):
 *   flexible      → full refund until 24h before check-in
 *   moderate      → full refund until 14 days before check-in
 *   firm          → 50% refund until 30 days before check-in
 *   strict        → 50% refund until 60 days before check-in
 *   super_strict  → non-refundable
 * Unknown/missing codes fall back to a generic translated sentence.
 */

import { formatBookingDate } from "./format";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const FREE_UNTIL_DAYS: Record<string, number> = {
  flexible: 1,
  moderate: 14,
};

const HALF_UNTIL_DAYS: Record<string, number> = {
  firm: 30,
  strict: 60,
};

function deadlineFor(checkIn: string | undefined, daysBefore: number): Date | null {
  if (!checkIn) return null;
  const d = new Date(checkIn.length === 10 ? `${checkIn}T12:00:00` : checkIn);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - daysBefore);
  return d;
}

/** YYYY-MM-DD from LOCAL date parts — toISOString would shift the date at UTC+13/+14. */
function toLocalYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Zero out time for "is the deadline still in the future" comparisons. */
function isPast(deadline: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline.getTime() < today.getTime();
}

/**
 * One human sentence for a raw Guesty policy code, translated and (when the
 * check-in date is known) with the concrete cancel-by date. Never returns the
 * raw code.
 */
export function cancellationPolicyText(
  rawCode: string | null | undefined,
  checkIn: string | undefined,
  t: TranslateFn,
  lang?: string,
): string {
  const code = (rawCode || "").toLowerCase().trim();

  if (code === "super_strict" || code === "non_refundable") {
    return t("cancellationPolicy.shortNonRefundable");
  }

  const freeDays = FREE_UNTIL_DAYS[code];
  if (freeDays != null) {
    const deadline = deadlineFor(checkIn, freeDays);
    if (!deadline) {
      return t("cancellationPolicy.shortFreeNoDate", { count: freeDays });
    }
    if (isPast(deadline)) return t("cancellationPolicy.shortWindowPassed");
    return t("cancellationPolicy.shortFree", {
      date: formatBookingDate(toLocalYMD(deadline), lang, true),
    });
  }

  const halfDays = HALF_UNTIL_DAYS[code];
  if (halfDays != null) {
    const deadline = deadlineFor(checkIn, halfDays);
    if (!deadline) {
      return t("cancellationPolicy.shortHalfNoDate", { count: halfDays });
    }
    if (isPast(deadline)) return t("cancellationPolicy.shortWindowPassed");
    return t("cancellationPolicy.shortHalf", {
      date: formatBookingDate(toLocalYMD(deadline), lang, true),
    });
  }

  return t("cancellationPolicy.shortGeneric");
}

/**
 * Concrete free-cancellation deadline (YYYY-MM-DD) for a policy code, or null
 * when the code has no free window / the window already passed. Used by the
 * Flex block's contextual copy (spec §6).
 */
export function freeCancellationDeadline(
  rawCode: string | null | undefined,
  checkIn: string | undefined,
): string | null {
  const code = (rawCode || "").toLowerCase().trim();
  const days = FREE_UNTIL_DAYS[code];
  if (days == null) return null;
  const d = deadlineFor(checkIn, days);
  if (!d || isPast(d)) return null;
  return toLocalYMD(d);
}

/** Is this raw policy code one of the non-refundable family? */
export function isNonRefundableCode(rawCode: string | null | undefined): boolean {
  const code = (rawCode || "").toLowerCase().trim();
  return code === "super_strict" || code === "strict" || code === "non_refundable";
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
