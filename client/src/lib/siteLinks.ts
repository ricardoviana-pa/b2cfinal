/**
 * Links to the sibling sites under portugalactive.com.
 *
 * These are subfolders of this domain, not third-party destinations: they must be
 * linked as internal, followed links, and pointed straight at the locale so the
 * visitor does not land on a redirect.
 */

/** Locales the owner-facing site publishes. Portuguese lives at its root. */
const MANAGEMENT_LOCALES = ["en", "fr", "de", "nl", "es", "it", "he", "ar", "zh"];

/**
 * The owner site in the visitor's language, falling back to English — which is
 * also this site's own default — for locales it does not publish (sv, fi).
 */
export function managementUrl(language: string | undefined): string {
  const lang = (language || "en").split("-")[0];
  if (lang === "pt") return "https://www.portugalactive.com/management/";
  const locale = MANAGEMENT_LOCALES.includes(lang) ? lang : "en";
  return `https://www.portugalactive.com/management/${locale}/`;
}
