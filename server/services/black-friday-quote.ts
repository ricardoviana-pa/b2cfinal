/**
 * Public Black Friday quote. Runs ONLY when the dated, explicit env gate is on.
 * Guesty alone calculates price; never calculate percentage discounts locally.
 *
 * Coupon POST mutates Guesty's quote. NEVER use a cached anonymous quote here:
 * another guest might otherwise see/overwrite this visitor's coupon.
 */
import { isPartnerHome } from "../../shared/partnerHome";
import { getPropertiesForSite, isHiddenFromCatalog } from "./properties-store";
import { createBEQuote, applyCouponToBEQuote } from "./guesty-booking";
import type { QuoteResult } from "./guesty";
import { blackFridayPublicCoupon } from "./black-friday-2026";

export function eligibleBlackFridayListing(home: any, listingId: string): boolean {
  return !!home && !!listingId
    && String(home.guestyId || home.listingId || "") === listingId
    && home.isActive !== false && !home.isPortfolio
    && !isHiddenFromCatalog(home)
    && !isPartnerHome(home)
    && home.bookingMode !== "request";
}

/**
 * null means no public campaign or property outside direct-bookable inventory.
 * On failure of an ELIGIBLE campaign coupon, throw and do NOT quietly quote
 * the full amount as though the advertised discount was present.
 */
export async function isBlackFridayDirectListing(listingId: string): Promise<boolean> {
  const homes = await getPropertiesForSite();
  const home = homes.find((p: any) => String(p.guestyId || p.listingId || "") === listingId);
  return eligibleBlackFridayListing(home, listingId);
}

export async function blackFridayPublicQuote(input: {
  listingId: string; checkIn: string; checkOut: string; guests: number;
}): Promise<QuoteResult | null> {
  const code = blackFridayPublicCoupon();
  if (!code) return null;
  if (!(await isBlackFridayDirectListing(input.listingId))) return null;

  // The fresh quote is private to this request, not in the shared BE cache.
  const base = await createBEQuote({ ...input, fresh: true });
  const applied = await applyCouponToBEQuote({
    ...input, quoteId: base.quoteId, coupons: [code],
  });
  const containsCode = applied.coupons.some((c) => c.code.toUpperCase() === code);
  const basePlans = new Map((base.ratePlanOptions ?? []).map((p) => [p.ratePlanId, p.total]));
  // The chosen rate plan, not merely *some* rate plan, must actually be discounted.
  const beforeSelected = basePlans.get(applied.ratePlanId);
  const selectedDiscounted = typeof beforeSelected === "number"
    && applied.total > 0 && applied.total < beforeSelected;
  if (!containsCode || !selectedDiscounted || applied.currency !== "EUR") {
    throw new Error("Black Friday discount could not be confirmed by Guesty.");
  }
  return {
    available: true,
    listingId: input.listingId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: applied.nights,
    currency: applied.currency,
    source: "live",
    quoteId: applied.quoteId,
    ratePlanId: applied.ratePlanId,
    ratePlanOptions: applied.ratePlanOptions,
    couponCode: code,
    pricing: {
      nightlyRate: applied.pricing.nightlyRate,
      totalNights: applied.pricing.totalNights,
      cleaningFee: applied.pricing.cleaningFee,
      taxesAndFees: applied.pricing.taxesAndFees,
      subtotal: applied.total,
      total: applied.total,
    },
  };
}
