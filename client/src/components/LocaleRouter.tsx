/**
 * LocaleRouter — wraps the app in a locale-prefixed router.
 *
 * Reads the first URL segment (e.g. /pt/homes → "pt").
 * If missing or invalid, redirects to /{defaultLang}/...
 * Sets i18n language from URL and provides wouter a base path
 * so every <Link href="/homes"> renders as /{lang}/homes automatically.
 *
 * Language switching is handled by LanguageSwitcher via full page reload
 * (window.location.assign), which re-mounts the Router with the new base.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { Router } from 'wouter';
import { useTranslation } from 'react-i18next';

const SUPPORTED_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];
const DEFAULT_LANG = 'en';

/** Extract the locale from the full browser pathname */
function extractLocale(pathname: string): { lang: string; rest: string } {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();
  if (first && SUPPORTED_LANGS.includes(first)) {
    return { lang: first, rest: '/' + segments.slice(1).join('/') || '/' };
  }
  return { lang: '', rest: pathname };
}

/** Detect preferred language: localStorage > browser > default */
function detectLanguage(): string {
  const stored = localStorage.getItem('i18nextLng');
  if (stored) {
    const base = stored.split('-')[0]?.toLowerCase() || '';
    if (SUPPORTED_LANGS.includes(base)) return base;
  }
  const browserLang = navigator.language?.split('-')[0]?.toLowerCase() || '';
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;
  return DEFAULT_LANG;
}

export default function LocaleRouter({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { lang, rest } = useMemo(() => extractLocale(window.location.pathname), []);

  // If URL has no valid locale prefix, redirect with a real navigation
  // so wouter initializes with the correct base path
  if (!lang) {
    const preferred = detectLanguage();
    const newPath = `/${preferred}${rest === '/' ? '' : rest}${window.location.search}${window.location.hash}`;
    window.location.replace(newPath);
    return null;
  }

  const activeLang = lang;

  // Sync i18n language with URL locale on mount and URL changes
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (i18n.language !== activeLang) {
      void i18n.changeLanguage(activeLang);
    }
  }, [activeLang, i18n]);

  return (
    <Router base={`/${activeLang}`}>
      {children}
    </Router>
  );
}

export { SUPPORTED_LANGS, DEFAULT_LANG, extractLocale };
