/**
 * Plural forms in the site's own variant of each language.
 *
 * i18next picks a plural form with Intl.PluralRules for the bare language
 * code, and bare "pt" is Brazilian Portuguese: 0 and every number below 2
 * take the singular there, so a home with 1.5 bathrooms read "1,5 Casa de
 * Banho" (review of PR #177). The site writes European Portuguese, where only
 * exactly 1 is singular (pt-PT: "1,5 Casas de Banho"). pluralCount() hands
 * i18next a count that selects the form the site's locale would; the number
 * shown comes from {{num}}, formatted for that locale.
 */
import { intlLocale } from './format';

/** Languages whose bare code resolves to another variant's plural rules. */
const SITE_PLURAL_LOCALE: Record<string, string> = { pt: 'pt-PT' };

/** The `count` to pass to t() so the plural form is the site locale's. */
export function pluralCount(n: number, lang?: string): number {
  const locale = SITE_PLURAL_LOCALE[(lang || '').slice(0, 2).toLowerCase()];
  if (!locale || !Number.isFinite(n)) return n;
  // Bare "pt" reads 1 as "one" and 2 as "other", like pt-PT does.
  return new Intl.PluralRules(locale).select(n) === 'one' ? 1 : 2;
}

/** Interpolation values for a "{{num}} Bedroom(s)" string: the plural count
 *  and the number in the site's format ("1,5" in pt, "1.5" in en). */
export function countVars(n: number, lang?: string): { count: number; num: string } {
  return { count: pluralCount(n, lang), num: new Intl.NumberFormat(intlLocale(lang)).format(n) };
}
