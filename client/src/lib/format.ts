/**
 * Shared formatting utilities.
 */
import { formatQuotedMoney } from "@shared/booking-money";

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
 * Rounded indicative/from prices. Use formatQuotedEur for dated quotes and payments.
 * Pass the active i18n language for locale-correct separators; defaults to pt-PT.
 */
export const formatEur = (amount: number, lang?: string): string =>
  formatCurrency(Math.round(amount), { locale: intlLocale(lang), decimals: 0 });

export const formatQuotedEur = (amount: number, lang?: string): string =>
  formatQuotedMoney(amount, intlLocale(lang));

/* ── Whole euros before the checkout (decisão E07 do Ricardo, 20 nov 2026) ──
   The listing and a home's page show "€2,997", not "€2,996.57"; the cents
   appear in the checkout, which keeps formatQuotedEur everywhere.

   Rounded UP to the euro: the exact amount in the checkout is then never
   above what the guest saw on the way there. A saving is the difference of
   the two prices as shown, so the three figures on a rate card always add up
   and a saving is never overstated by the rounding. */

/** 2996.57 → 2997 · 2997 → 2997 (cents first, so 0.1 + 0.2 is 30 cents, not 30.000000000000004). */
export const stayEuros = (amount: number): number => Math.ceil(Math.round(amount * 100) / 100);

/** A dated price as shown before the checkout: whole euros, rounded up. */
export const formatStayEur = (amount: number, lang?: string): string =>
  formatCurrency(stayEuros(amount), { locale: intlLocale(lang), decimals: 0 });

/** "Save €266": the struck price as shown minus the price as shown (never negative). */
export const staySavingsEuros = (compareTotal: number, total: number): number =>
  Math.max(0, stayEuros(compareTotal) - stayEuros(total));

/**
 * The lines of a price breakdown in whole euros that add up to the total as
 * shown (stayEuros(total)). Each line is rounded to the nearest euro and the
 * first line (the nights, the largest) takes the euro or two the rounding
 * leaves over, so "nights + cleaning + taxes" never disagrees with the total
 * printed under it. When the lines do not add up to the total to begin with,
 * they are only rounded.
 */
export function stayBreakdownEuros(parts: number[], total: number): number[] {
  const shown = parts.map((p) => Math.round(Math.round(p * 100) / 100));
  if (!shown.length) return shown;
  // Lines that are not the whole total (a discount or a fee not listed) stay
  // as they are: the first line must not absorb an amount that is not rounding.
  const exact = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(exact - total) > 0.05) return shown;
  shown[0] += stayEuros(total) - shown.reduce((a, b) => a + b, 0);
  return shown;
}

/** Exact integer-cent amounts (reservation API / ThankYouStash). */
export const formatEurCents = (
  cents: number | null | undefined,
  lang?: string,
  fallback = '—',
): string => (cents == null ? fallback : formatQuotedEur(cents / 100, lang));

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

/** "13 Dec 2026" with non-breaking spaces: a line may break before the date,
 *  never inside it ("until 13 Dec" / "2026"). */
export const noBreak = (text: string): string => text.replace(/ /g, '\u00A0');

/** A phone number in a sentence ("+351 258 358 434") stays whole: at 16 px the
 *  legal pages broke it as "+351 258 358" / "434." */
export const keepPhones = (text: string): string =>
  text.replace(/\+\d{2,3}(?: \d{2,4}){2,4}/g, (number) => number.replace(/ /g, '\u00A0'));

/** A hyphenated word stays whole ("Fünf-Sterne-Service", "au-delà",
 *  "Peneda-Gerês", "360-degree"): balanced wrapping likes to break at the
 *  hyphen. A WORD JOINER after it forbids the break and keeps the same hyphen
 *  glyph. Not used on long-form article text (search engines read it). */
export const keepHyphens = (text: string): string => text.replace(/([\p{L}\p{N}])-(?=\p{L})/gu, '$1-\u2060');

/** A dash stays with the word before it ("the Algarve —" / "the coasts"),
 *  never alone at the start of the next line. A hyphen between spaces is a
 *  dash too ("<name> - <house>": balanced wrapping put the
 *  "- " at the start of the second line of the card). */
export const keepDashes = (text: string): string => text.replace(/ ([—–-]) /g, '\u00A0$1 ');

/** A separator stays with the word before it (" · ", " / "), so a line never
 *  starts with it: body text-wrap: pretty moved the break before the
 *  separator ("Booking.com Traveller Review Awards" / "· 2024", "Olhão" /
 *  "/ Tavira"). The line may end with it, as before the larger type. */
export const keepSeparators = (text: string): string => text.replace(/ ([·/]) /g, '\u00A0$1 ');

/** A home's name on a card: dashes and separators as above, and a two-word
 *  name before a spaced dash stays whole (balanced wrapping broke "Diamante" /
 *  "Azul - Mansion"). An initial is not glued to the next word: in the narrow
 *  related-home cards that made "Lima River · / S. Silvestre / House". */
export const keepNameParts = (name: string): string =>
  keepSeparators(keepDashes(name.replace(/^(\S+) (\S+)(?= [—–-] )/u, '$1\u00A0$2')));

/** French typography in content that does not come from fr.json (article
 *  titles): a no-break space before : ; ! ? » and after «, so a line never
 *  starts with the mark. Other languages come back unchanged. */
export const frenchSpacing = (text: string, lang?: string): string =>
  lang?.toLowerCase().startsWith('fr')
    ? text.replace(/ ([:;!?»])/g, '\u00A0$1').replace(/« /g, '«\u00A0')
    : text;

/** The brand never splits across lines ("Portugal" / "Active"). */
export const keepBrand = (text: string): string => text.replace(/Portugal Active/g, 'Portugal\u00A0Active');

/** A Portuguese postcode stays whole: a WORD JOINER after the hyphen stops the
 *  line breaking as "4900-" / "336" without changing how it looks or copies. */
export const keepPostcode = (text: string): string => text.replace(/(\d{4})-(\d{3})/g, '$1-\u2060$2');

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
export { sanitizePropertyName, getDisplayName } from '@shared/displayName';
