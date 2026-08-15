/**
 * Shared formatting utilities.
 */

/** Site language (2-letter i18n code) → BCP47 locale for Intl formatting. */
const BCP47: Record<string, string> = {
  en: 'en-GB',
  pt: 'pt-PT',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  de: 'de-DE',
  nl: 'nl-NL',
  fi: 'fi-FI',
  sv: 'sv-SE',
};

/** Resolve the active i18n language to a region-qualified Intl locale. */
export const intlLocale = (lang?: string): string =>
  BCP47[(lang || '').slice(0, 2).toLowerCase()] || 'pt-PT';

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

/**
 * Brand rule: prices are always whole euros, everywhere (F4).
 * Pass the active i18n language for locale-correct separators; defaults to pt-PT.
 */
export const formatEur = (amount: number, lang?: string): string =>
  formatCurrency(Math.round(amount), { locale: intlLocale(lang), decimals: 0 });

/** Same as formatEur but for integer-cent amounts (reservation API / ThankYouStash). */
export const formatEurCents = (
  cents: number | null | undefined,
  lang?: string,
  fallback = '—',
): string => (cents == null ? fallback : formatEur(cents / 100, lang));

/**
 * Booking date display: zero-padded day + short month (+ year), in the SITE
 * locale — never the browser locale (F6). E.g. "08 Apr" / "08 abr. 2026".
 */
export const formatBookingDate = (
  dateStr: string,
  lang?: string,
  includeYear = false,
): string => {
  if (!dateStr) return '';
  const iso = dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  // Month is formatted ALONE: pairing {month:'short', year:'numeric'} makes
  // some CLDR locales (pt-PT) fall back to numeric "08/2026".
  const month = date
    .toLocaleDateString(intlLocale(lang), { month: 'short' })
    .replace(/\.$/, '');
  return includeYear ? `${day} ${month} ${date.getFullYear()}` : `${day} ${month}`;
};

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
 * - remove the brand prefix "Portugal Active " (legacy listings on Guesty)
 * - remove the brand suffix "… by Portugal Active" / "… by PortugalActive…"
 *   The brand attribution is needed on OTAs (Airbnb / Booking) for trust,
 *   but on our own site the customer already knows where they are — shorter
 *   names read better in cards and breadcrumbs.
 */
export const sanitizePropertyName = (raw: string): string => {
  if (!raw) return raw;
  let name = raw.trim();
  // Drop brand prefix
  name = name.replace(/^Portugal Active\s+/i, '');
  // Drop "… by Portugal Active" / "… By PortugalActive…" suffix and any
  // noise that follows (handles e.g. "Habito's Lodge By PortugalActive/
  // 5min Beach & Town").
  name = name.replace(/\s+by\s+portugal\s*active\b.*$/i, '');
  // Drop everything after pipe / dash-em / dash-with-spaces callouts
  name = name.split('|')[0];
  name = name.split(/\s+[-–—]\s+/)[0];
  // Drop "w/ …", "with …" amenity tail
  name = name.replace(/\s+(w\/|with)\s+.*$/i, '');
  // Collapse whitespace
  return name.replace(/\s{2,}/g, ' ').trim();
};
