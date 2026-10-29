/**
 * A cotação do checkout com a tarifa escolhida por cima (o "effective" do
 * CheckoutPage), fora do componente para o teste de paridade com o servidor
 * (server/services/flex-value.test.ts): trocar de tarifa e juntar o Flex tem
 * de dar no ecrã o mesmo total que o servidor cobra.
 */
import { accommodationSubtotal } from "@shared/booking-money";

export interface CheckoutRatePlanOption {
  ratePlanId: string;
  name: string;
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  taxesAndFees?: number;
  cancellationPolicy?: string[];
  /** Guesty's share charged after the deadline (percent) — 100 on every plan today. */
  cancellationFee?: string | number | null;
}

/** Quote snapshot mirrored from the intent (euro floats, same shape as the server json column) */
export interface CheckoutQuoteSnapshot {
  nightlyRate: number;
  totalNights: number;
  cleaningFee: number;
  taxesAndFees: number;
  total: number;
  nights: number;
  currency: string;
  quoteCreatedAt: number | null;
  couponCode?: string;
  ratePlanOptions?: CheckoutRatePlanOption[];
}

/** Derived pricing: the selected rate plan overlays the base quote. */
export function effectiveQuote(quote: CheckoutQuoteSnapshot | null, selectedRatePlanId: string | null) {
  if (!quote) return null;
  const opt = quote.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
  if (!opt) return { ...quote, ratePlanId: selectedRatePlanId ?? undefined, cancellationPolicy: undefined as string[] | undefined };
  return {
    ...quote,
    nightlyRate: opt.nightlyRate,
    totalNights: accommodationSubtotal(opt.total, opt.cleaningFee, opt.taxesAndFees ?? 0),
    cleaningFee: opt.cleaningFee,
    taxesAndFees: opt.taxesAndFees ?? 0,
    total: opt.total,
    ratePlanId: opt.ratePlanId,
    cancellationPolicy: opt.cancellationPolicy,
  };
}
