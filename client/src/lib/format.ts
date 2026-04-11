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

/** Editorial EUR formatting: no decimals for whole amounts, symbol prefix, en-US comma separator. */
export const formatEurEditorial = (amount: number): string => {
  const rounded = Math.round(amount);
  const hasDecimals = Math.abs(amount - rounded) > 0.009;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
};

/**
 * Clean marketing noise from property names:
 * - strip pipes and everything after them ("Eben Lodge | Heated Pool" -> "Eben Lodge")
 * - strip "w/", "with", amenity callouts after a dash
 * - remove duplicated brand prefix "Portugal Active "
 */
export const sanitizePropertyName = (raw: string): string => {
  if (!raw) return raw;
  let name = raw.trim();
  // Drop brand prefix
  name = name.replace(/^Portugal Active\s+/i, '');
  // Drop everything after pipe / dash-em / dash-with-spaces callouts
  name = name.split('|')[0];
  name = name.split(/\s+[-–—]\s+/)[0];
  // Drop "w/ …", "with …" amenity tail
  name = name.replace(/\s+(w\/|with)\s+.*$/i, '');
  // Collapse whitespace
  return name.replace(/\s{2,}/g, ' ').trim();
};
