/* ==========================================================================
   Start the page's content catalogues (destination, experience and blog
   translations) together with its interface strings, not after them.

   main.tsx awaits preloadContentOverrides() before hydrating, and that call
   could only start once ./i18n/index had finished loading the language file
   (a top-level await): on a Portuguese home page the two files came one after
   the other, after index.js (auditoria out/2026,
   performance-08-non-en-hydration-waterfall). main.tsx imports this module
   BEFORE ./i18n/index, so both downloads start at the same moment; the later
   preloadContentOverrides() call reuses the same requests.
   ========================================================================== */
import { preloadContentOverrides } from './localizeContent';

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

/** The page's language and its path without the locale, from a pathname. */
export function bootRoute(pathname: string): { lang: string; pathNoLocale: string } {
  const segs = pathname.split('/').filter(Boolean);
  const first = (segs[0] || '').toLowerCase();
  const lang = LANGS.includes(first) ? first : 'en';
  return { lang, pathNoLocale: '/' + (first === lang ? segs.slice(1) : segs).join('/') };
}

if (typeof window !== 'undefined') {
  const { lang, pathNoLocale } = bootRoute(window.location.pathname);
  void preloadContentOverrides(lang, pathNoLocale).catch(() => {});
}
