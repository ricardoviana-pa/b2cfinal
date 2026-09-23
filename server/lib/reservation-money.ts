function cents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** A receipt shows money collected from the guest, never owner proceeds. */
export function reservationPaidCents(money: any): number | null {
  return cents(money?.totalPaid);
}

export function reservationTotalCents(money: any): number | null {
  return cents(money?.total ?? money?.totalPrice ?? money?.totalAmount);
}

/** Keep only a complete breakdown; omitted fees must not imply a false sum. */
export function reservationBreakdown(money: any, totalCents: number | null) {
  const accommodation = cents(money?.fareAccommodationAdjusted ?? money?.fareAccommodation ?? money?.accommodationFare);
  const cleaning = cents(money?.fareCleaning ?? money?.cleaningFee);
  const reconciles = totalCents !== null && accommodation !== null && accommodation + (cleaning ?? 0) === totalCents;
  return {
    accommodationCents: reconciles ? accommodation : null,
    cleaningFeeCents: reconciles ? cleaning : null,
  };
}
