/**
 * Brand facts — the numbers the site says about itself, in one place.
 *
 * Shared by the client (copy, schema, answer capsules), the server (PAGE_META,
 * SSR seo-content, emails) and the llms.txt generator, so a figure can never
 * drift between surfaces again (auditoria set/2026, I1/T1: the home count was
 * 50+, 60+ and 70 on the same site).
 *
 * HOME_COUNT preserves the complete data-derived public catalogue size.
 * HOME_COUNT_LABEL is the public brand figure approved by Ricardo on
 * 3 November 2026. Marketing uses 70 without exposing the source split;
 * search results continue to show their actual counts.
 *
 * Locale strings that need the count interpolate `{{homes}}` and pass
 * HOME_COUNT_LABEL at the call site; strings with an SLA say "2 hours"
 * literally because JSON cannot import — keep them in step with
 * CONCIERGE_SLA_HOURS (scripts/i18n-missing.mjs greps for stragglers).
 */
import generated from "./brandFacts.generated.json";

/** Public homes right now (own + partner), from the data. */
export const HOME_COUNT: number = generated.homeCount;
/** Public brand figure approved by Ricardo on 3 November 2026.
 * Catalogue/result counts remain data-derived; marketing does not expose the supplier split. */
export const HOME_COUNT_LABEL = "70";
export const OWN_HOME_COUNT: number = generated.ownHomeCount;
export const PARTNER_HOME_COUNT: number = generated.partnerHomeCount;
/**
 * Homes our own team runs end to end (no partner inventory), same rounding:
 * "70+". Retained for internal audits; public brand copy uses HOME_COUNT_LABEL.
 */
export const OWN_HOME_COUNT_LABEL: string = homeCountLabel(OWN_HOME_COUNT);

/** Preparation checklist run before every arrival. */
export const CHECKLIST_POINTS = 147;
/** Concierge first-response promise, in hours — the only SLA the site quotes. */
export const CONCIERGE_SLA_HOURS = 2;
/** Languages the site is published in. */
export const LANGUAGES = 9;
export const FOUNDED = 2017;
/** Regions in brand order — north to south. Use this order in every list. */
export const REGIONS = ["Minho", "Porto", "Douro", "Lisbon", "Alentejo", "Algarve"] as const;
export const REGIONS_TEXT = "Minho, Porto, Douro, Lisbon, Alentejo and Algarve";

/** Same rounding the generator uses, for anything that counts at runtime. */
export function homeCountLabel(n: number): string {
  const floored = Math.floor(n / 10) * 10;
  return floored > 0 ? `${floored}+` : String(n);
}
