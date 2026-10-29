/**
 * Language suggestion (auditoria 29 out, i18n-copy-07). The bare domain and
 * any unprefixed link land on /en (server 301, the x-default for crawlers),
 * so a visitor whose browser prefers Portuguese or German reads English.
 * Never redirect by Accept-Language — crawlers must keep seeing /en — but
 * offer the visitor's language in one small, dismissible card, remembered
 * on this device.
 *
 * The card speaks the language it offers (the visitor may not read English),
 * so its copy lives here, eight short lines, instead of in eight locale
 * bundles that would each have to be downloaded to say one sentence.
 */
export const SITE_LANGUAGES = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];
export type SuggestedLanguage = Exclude<SiteLanguage, 'en'>;

/** Written by the language switcher (and by this card) when a visitor picks a language. */
export const LANGUAGE_CHOICE_KEY = 'i18nextLng';
/** The language the visitor said no to; not offered again on this device. */
export const SUGGESTION_DECLINED_KEY = 'pa-lang-suggestion-declined';
/**
 * Shown once per visit, on the first page that exists in the visitor's
 * language — across tabs. The marker used to live in sessionStorage, which
 * every new tab starts empty: a visitor opening homes from the listing in new
 * tabs got the card again in each one (revisão 2 do PR #175). It is now in
 * localStorage with the time of the visit's latest page; a visit ends after
 * SUGGESTION_VISIT_MS without one, like an analytics session.
 */
export const SUGGESTION_SHOWN_KEY = 'pa-lang-suggestion-shown';
export const SUGGESTION_VISIT_MS = 30 * 60 * 1000;

/** Was the card already shown in this visit? `stored` is SUGGESTION_SHOWN_KEY's value (ms). */
export function shownThisVisit(stored: string | null | undefined, now: number): boolean {
  const at = Number(stored);
  if (!stored || !Number.isFinite(at) || at <= 0) return false;
  const age = now - at;
  // A clock set back a little still counts as this visit; a stray far-future value does not.
  return age < SUGGESTION_VISIT_MS && age > -SUGGESTION_VISIT_MS;
}

/** Booking, payment and account pages: a reload to switch language there could lose the form. */
const QUIET_PATHS = /^\/(checkout|booking|account|login|admin|owners-portal)(\/|$)/;

export function siteLanguage(value: string | null | undefined): SiteLanguage | null {
  const base = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return (SITE_LANGUAGES as readonly string[]).includes(base) ? (base as SiteLanguage) : null;
}

export function suggestedLanguage({ pageLang, path, stored, declined, browser }: {
  /** Language of the page being viewed. */
  pageLang: string;
  /** Path without the locale prefix ("/homes"). */
  path: string;
  /** The visitor's own earlier choice (LANGUAGE_CHOICE_KEY), if any. */
  stored?: string | null;
  /** A language the visitor already declined. */
  declined?: string | null;
  /** navigator.languages, most preferred first. */
  browser: readonly string[];
}): SuggestedLanguage | null {
  if (siteLanguage(pageLang) !== 'en' || QUIET_PATHS.test(path)) return null;
  const chosen = siteLanguage(stored);
  let candidate: SiteLanguage | null = chosen;
  if (!candidate) {
    for (const tag of browser) {
      candidate = siteLanguage(tag);
      if (candidate) break;
    }
  }
  if (!candidate || candidate === 'en' || candidate === siteLanguage(declined)) return null;
  return candidate;
}

/**
 * Does this page exist in `lang`? Read from the hreflang alternates in the
 * document head, which the server writes per page: a blog article only lists
 * the editions that are published, and /{lang}/blog/<slug> for any other
 * language 302s back to /en (vite.ts, blogLanguageRedirect). Offering German
 * there reloaded the English article and stored "de" as the visitor's choice
 * (revisão do PR #175, R4). Null while the page has written no alternates
 * yet (a lazily loaded page writes them once its code has arrived).
 */
export function pageOffersLanguage(hreflangs: readonly (string | null | undefined)[], lang: SiteLanguage): boolean | null {
  const offered = hreflangs
    .filter((tag) => tag && tag.toLowerCase() !== 'x-default')
    .map((tag) => siteLanguage(tag));
  return offered.length === 0 ? null : offered.includes(lang);
}

/**
 * Pages with their own fixed bar at the bottom of a phone screen: a home's
 * booking bar and an experience's (ExperienceMobileBookingBar, also on
 * /activities/:slug). The card sits above the bar there, never on its button.
 */
const BOTTOM_BAR_PAGE = /^\/(homes|experiences|activities)\/[^/]+/;
export function hasBottomBookingBar(path: string): boolean {
  return BOTTOM_BAR_PAGE.test(path);
}

/** The same page in another language: /en/homes?x=1#y → /pt/homes?x=1#y. */
export function pathInLanguage(pathname: string, search: string, hash: string, lang: SiteLanguage): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] && siteLanguage(segments[0]) === segments[0].toLowerCase()) segments.shift();
  return `/${lang}${segments.length ? `/${segments.join('/')}` : ''}${search}${hash}`;
}

export const SUGGESTION_COPY: Record<SuggestedLanguage, { prompt: string; action: string; dismiss: string }> = {
  pt: { prompt: 'Este site também está disponível em português.', action: 'Ver em português', dismiss: 'Continuar em inglês' },
  fr: { prompt: 'Ce site est aussi disponible en français.', action: 'Voir en français', dismiss: 'Rester en anglais' },
  es: { prompt: 'Este sitio también está disponible en español.', action: 'Ver en español', dismiss: 'Seguir en inglés' },
  it: { prompt: 'Questo sito è disponibile anche in italiano.', action: 'Passare all’italiano', dismiss: 'Continuare in inglese' },
  de: { prompt: 'Diese Website ist auch auf Deutsch verfügbar.', action: 'Auf Deutsch ansehen', dismiss: 'Auf Englisch bleiben' },
  nl: { prompt: 'Deze website is ook beschikbaar in het Nederlands.', action: 'Bekijk in het Nederlands', dismiss: 'In het Engels blijven' },
  sv: { prompt: 'Webbplatsen finns också på svenska.', action: 'Visa på svenska', dismiss: 'Fortsätt på engelska' },
  fi: { prompt: 'Sivusto on saatavilla myös suomeksi.', action: 'Näytä suomeksi', dismiss: 'Jatka englanniksi' },
};
