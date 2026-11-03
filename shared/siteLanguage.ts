export const SITE_LANGUAGES = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];
export const LANGUAGE_CHOICE_KEY = 'i18nextLng';
export const LANGUAGE_CHOICE_COOKIE = 'pa-site-language';

export function siteLanguage(value: string | null | undefined): SiteLanguage | null {
  const base = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return (SITE_LANGUAGES as readonly string[]).includes(base) ? base as SiteLanguage : null;
}

/** An explicit choice always wins. Automatic detection is never saved as one. */
export function preferredSiteLanguage(browser: readonly string[], stored?: string | null): SiteLanguage {
  const chosen = siteLanguage(stored);
  if (chosen) return chosen;
  for (const tag of browser) {
    const lang = siteLanguage(tag);
    if (lang) return lang;
  }
  return 'en';
}

export function languageCookieValue(cookie: string | undefined): SiteLanguage | null {
  const value = (cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${LANGUAGE_CHOICE_COOKIE}=`));
  if (!value) return null;
  try { return siteLanguage(decodeURIComponent(value.slice(LANGUAGE_CHOICE_COOKIE.length + 1))); } catch { return null; }
}

/** Ordered language preferences for the JavaScript-free fallback. */
export function acceptLanguagePreferences(header: string | undefined): string[] {
  return (header ?? '').split(',').map((part, order) => {
    const [tag, ...params] = part.trim().split(';');
    const weight = params.find(p => /^\s*q=/i.test(p));
    const q = weight ? Number(weight.split('=')[1]) : 1;
    return { tag, q, order };
  }).filter(v => v.tag && Number.isFinite(v.q) && v.q > 0 && v.q <= 1)
    .sort((a, b) => b.q - a.q || a.order - b.order).map(v => v.tag);
}
