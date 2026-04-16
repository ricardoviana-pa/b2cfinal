import { useEffect } from 'react';
import i18n, { LOCALE_MAP } from '@/i18n';

const SUPPORTED_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];
const BASE_TITLE = 'Luxury Private Villas in Portugal | Hotel Service | Portugal Active';
const BASE_DESC = '50+ private villas across Portugal, each managed like a luxury hotel. Private chef, concierge, pool. Book direct for best rates.';
const BASE_URL = 'https://www.portugalactive.com';
const BASE_IMAGE = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-main-96HXfBCK752avi2daWhgmd.webp';


function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/** Remove all existing hreflang link elements */
function clearHreflang() {
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());
}

/** Inject hreflang link elements for all supported languages */
function setHreflang(pagePath: string) {
  clearHreflang();
  const head = document.head;

  for (const lang of SUPPORTED_LANGS) {
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

interface PageMetaOpts {
  title?: string;
  description?: string;
  image?: string;
  /** Page path without locale prefix, e.g. '/homes' or '/homes/villa-x' */
  url?: string;
  type?: 'website' | 'article' | 'place';
}

export function usePageMeta(opts?: PageMetaOpts) {
  useEffect(() => {
    const lang = i18n.language || 'en';
    const title = opts?.title ? `${opts.title} | Portugal Active` : BASE_TITLE;
    const description = opts?.description || BASE_DESC;
    const image = opts?.image || BASE_IMAGE;
    const pagePath = opts?.url || '/';
    const fullUrl = `${BASE_URL}/${lang}${pagePath === '/' ? '' : pagePath}`;
    const type = opts?.type || 'website';
    const locale = LOCALE_MAP[lang] ?? 'en_GB';

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
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
    setHreflang(pagePath);

    return () => { clearHreflang(); };
  }, [opts?.title, opts?.description, opts?.image, opts?.url, opts?.type]);
}
