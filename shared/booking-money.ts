/** Quoted amounts must retain the cents used for payment. */
export function formatQuotedMoney(amount: number, locale: string): string {
  const cents = Math.round(amount * 100);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** A nightly average may be rounded; derive the lodging subtotal from the quote. */
export function accommodationSubtotal(total: number, cleaningFee = 0, taxesAndFees = 0): number {
  return (Math.round(total * 100) - Math.round(cleaningFee * 100) - Math.round(taxesAndFees * 100)) / 100;
}
