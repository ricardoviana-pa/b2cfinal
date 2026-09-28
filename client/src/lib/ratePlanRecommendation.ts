type ComparableRatePlan = {
  ratePlanId: string;
  cancellationPolicy?: readonly string[];
};

/** Existing published policy semantics (also used by cancellation.ts).
 * These are comparison ranks, not a quote of an amount refundable.
 */
const REFUND_WINDOWS: Record<string, { days: number; rank: number }> = {
  flexible: { days: 1, rank: 2 },
  moderate: { days: 14, rank: 2 },
  firm: { days: 30, rank: 1 },
  strict: { days: 60, rank: 1 },
};

function refundRank(
  plan: ComparableRatePlan,
  checkIn: string,
  today: string
): number | null {
  // Conflicting/multiple policy codes are not evidence for a recommendation.
  if (plan.cancellationPolicy?.length !== 1) return null;
  const code = plan.cancellationPolicy[0].trim().toLowerCase();
  if (code === "super_strict" || code === "non_refundable") return 0;
  const policy = REFUND_WINDOWS[code];
  if (!policy) return null;
  const deadline = new Date(`${checkIn}T12:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() - policy.days);
  const day = deadline.toISOString().slice(0, 10);
  // Date-only policies do not establish the cutoff time. On the deadline
  // day itself, withhold the badge rather than infer a remaining window.
  return day > today ? policy.rank : day < today ? 0 : null;
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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const rank = refundRank(plan, checkIn, today);
  if (rank == null || rank <= 0) return false;
  return alternatives.some(other => {
    if (other.ratePlanId === plan.ratePlanId) return false;
    const otherRank = refundRank(other, checkIn, today);
    return otherRank != null && otherRank < rank;
  });
}
