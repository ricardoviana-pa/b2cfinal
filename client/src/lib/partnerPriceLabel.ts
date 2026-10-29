/**
 * The price line of a listing card (or the property page's mobile bar) with
 * no price to show and no dates chosen.
 *
 * Kept free of imports on purpose: the listing card is in the entry chunk
 * that every page loads, and importing this from partnerAvailability.ts
 * pulled the date-range rules and the partner panel's notices in with it
 * (+2.4 kB, revisão do PR #180, R3). Those stay in the panel's own chunk.
 *
 * A partner home whose "from" came back as none (`null`: no calendar, or
 * nothing open in 12 months) cannot be priced by picking dates either, so it
 * reads "Price on request"; `undefined` (not computed yet) and our own homes
 * keep "Select dates for price".
 */
export function noPriceLabelKey(isPartner: boolean, fromPrice: number | null | undefined): "property.priceOnRequest" | "property.selectDatesForPrice" {
  return isPartner && fromPrice === null ? "property.priceOnRequest" : "property.selectDatesForPrice";
}
