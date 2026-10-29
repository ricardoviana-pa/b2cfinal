import { useEffect } from 'react';
import i18n, { LOCALE_MAP } from '@/i18n';
import { resolvePageMeta, SITE_BASE_URL, type PageMetaOpts } from '@/lib/pageMeta';

const SUPPORTED_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];
const BASE_URL = SITE_BASE_URL;


function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/** Remove all existing hreflang link elements */
function clearHreflang() {
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());
}

/** Inject hreflang link elements for all supported languages */
function setHreflang(pagePath: string, languages = SUPPORTED_LANGS) {
  clearHreflang();
  const head = document.head;

  for (const lang of languages) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = lang;
    link.href = `${BASE_URL}/${lang}${pagePath === '/' ? '' : pagePath}`;
    head.appendChild(link);
  }
  // x-default → English
  const xDefault = document.createElement('link');
  xDefault.rel = 'alternate';
  xDefault.hreflang = 'x-default';
  xDefault.href = `${BASE_URL}/en${pagePath === '/' ? '' : pagePath}`;
  head.appendChild(xDefault);
}

/** The path whose <head> the server wrote (it marks the document with
 *  pa-ssr-meta), until the visitor navigates to another path. `undefined`
 *  until the first run has looked for the marker. */
let ssrMetaPath: string | null | undefined;

/** True while the document still shows the page the server rendered.
 *
 *  The server injects the localized title, description, Open Graph and
 *  hreflang for every route it knows. Re-running the client template on that
 *  same page can only make things worse: on home pages it ran again when the
 *  translations loaded and put an English title on every non-English page
 *  (auditoria set/2026 N20/G5, and again out/2026). So the server's head
 *  stays for as long as the visitor is on the path it was written for — not
 *  just for the first run. Client-side navigations still run in full. */
function serverOwnsMeta(): boolean {
  if (ssrMetaPath === undefined) {
    const markers = document.querySelectorAll('meta[name="pa-ssr-meta"]');
    ssrMetaPath = markers.length ? window.location.pathname : null;
    markers.forEach((m) => m.remove());
  }
  if (ssrMetaPath !== null && window.location.pathname !== ssrMetaPath) ssrMetaPath = null;
  return ssrMetaPath !== null;
}

export function usePageMeta(opts?: PageMetaOpts) {
  useEffect(() => {
    if (serverOwnsMeta()) return;
    const lang = i18n.language || 'en';
    const { title, description, image, url: fullUrl, type, pagePath } = resolvePageMeta(opts, lang);
    const locale = LOCALE_MAP[lang] ?? 'en_GB';

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);

    if (opts?.noindex) {
      // Transactional page: never indexable, no alt-language variants
      setMeta('meta[name="robots"]', 'content', 'noindex, nofollow');
      clearHreflang();
      return () => { setMeta('meta[name="robots"]', 'content', 'index, follow'); };
    }
    const production = ['www.portugalactive.com', 'portugalactive.com'].includes(window.location.hostname);
    setMeta('meta[name="robots"]', 'content', production ? 'index, follow' : 'noindex, nofollow');
    setMeta('link[rel="canonical"]', 'href', fullUrl);

    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:image"]', 'content', image);
    setMeta('meta[property="og:url"]', 'content', fullUrl);
    setMeta('meta[property="og:type"]', 'content', type);
    setMeta('meta[property="og:locale"]', 'content', locale);

    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', image);

    // Set hreflang tags for all language versions
    setHreflang(pagePath, opts?.publishedLocales);

    return () => { clearHreflang(); };
  }, [opts?.title, opts?.description, opts?.image, opts?.url, opts?.type, opts?.noindex, opts?.publishedLocales]);
}
