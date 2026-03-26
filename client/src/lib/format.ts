/**
 * Shared formatting utilities.
 */

/** Format a number as currency (default: EUR, pt-PT locale). */
export const formatCurrency = (
  amount: number,
  opts: { currency?: string; locale?: string; decimals?: number } = {},
): string => {
  const { currency = 'EUR', locale = 'pt-PT', decimals = 2 } = opts;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

/** Shorthand: format EUR with 2 decimals (matches Guesty pricing display). */
export const formatEur = (amount: number): string => formatCurrency(amount);
