import { freeCancellationDays, lisbonToday, normalizePolicyCode } from "@shared/cancellationPolicy";

type ComparableRatePlan = {
  ratePlanId: string;
  cancellationPolicy?: readonly string[];
};

/** Guesty's policies (shared/cancellationPolicy.ts): every refundable code
 * is "free cancellation until N days before arrival, 100 % after", so an
 * open free-cancellation period ranks 1 and anything that charges the full
 * stay if cancelled (non-refundable, or the period ended) ranks 0.
 */
function refundRank(
  plan: ComparableRatePlan,
  checkIn: string,
  today: string
): number | null {
  // Conflicting/multiple policy codes are not evidence for a recommendation.
  if (plan.cancellationPolicy?.length !== 1) return null;
  const code = normalizePolicyCode(plan.cancellationPolicy[0]);
  if (code === "non_refundable") return 0;
  const days = freeCancellationDays(code);
  if (days == null) return null;
  const deadline = new Date(`${checkIn}T12:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() - days);
  const day = deadline.toISOString().slice(0, 10);
  // Date-only policies do not establish the cutoff time. On the deadline
  // day itself, withhold the badge rather than infer a remaining window.
  return day > today ? 1 : day < today ? 0 : null;
}

/** A name such as "Flexible" is insufficient. Recommend only a known,
 * still-open refund window that is better than a known alternative for the
 * same selected dates. Calendar arithmetic is independent of the browser TZ;
 * "today" follows mainland Portugal, where the current catalogue is located.
 */
export function hasVerifiedRefundAdvantage(
  plan: ComparableRatePlan,
  alternatives: readonly ComparableRatePlan[],
  checkIn: string | undefined,
  now: Date = new Date()
): boolean {
  if (
    !checkIn ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ||
    !Number.isFinite(now.getTime())
  )
    return false;
  const parsed = new Date(`${checkIn}T12:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== checkIn
  )
    return false;
  const today = lisbonToday(now);
  const rank = refundRank(plan, checkIn, today);
  if (rank == null || rank <= 0) return false;
  return alternatives.some(other => {
    if (other.ratePlanId === plan.ratePlanId) return false;
    const otherRank = refundRank(other, checkIn, today);
    return otherRank != null && otherRank < rank;
  });
}
