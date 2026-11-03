import { LANGUAGE_CHOICE_COOKIE, LANGUAGE_CHOICE_KEY, languageCookieValue, preferredSiteLanguage, siteLanguage, type SiteLanguage } from '@shared/siteLanguage';

export function detectPreferredLanguage(): SiteLanguage {
  let stored: string | null = null;
  try { stored = localStorage.getItem(LANGUAGE_CHOICE_KEY); } catch { /* storage may be blocked */ }
  let cookie: string | null = null;
  try { cookie = languageCookieValue(document.cookie); } catch { /* cookies may be blocked too */ }
  return preferredSiteLanguage(navigator.languages?.length ? navigator.languages : [navigator.language], siteLanguage(stored) || cookie);
}

/** Mirror only a deliberate choice, so the no-JS entry can honour it too. */
export function rememberLanguage(lang: SiteLanguage): void {
  try { localStorage.setItem(LANGUAGE_CHOICE_KEY, lang); } catch { /* cookie remains an independent fallback */ }
  try {
    document.cookie = `${LANGUAGE_CHOICE_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch { /* navigation works even with all storage disabled */ }
}
