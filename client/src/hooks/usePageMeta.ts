import { useEffect } from 'react';
import i18n, { LOCALE_MAP } from '@/i18n';

const BASE_TITLE = 'Luxury Private Villas in Portugal | Hotel Service | Portugal Active';
const BASE_DESC = '50+ private villas across Portugal, each managed like a luxury hotel. Private chef, concierge, pool. Book direct for best rates.';
const BASE_URL = 'https://www.portugalactive.com';
const BASE_IMAGE = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-main-96HXfBCK752avi2daWhgmd.webp';


function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

interface PageMetaOpts {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'place';
}

export function usePageMeta(opts?: PageMetaOpts) {
  useEffect(() => {
    const title = opts?.title ? `${opts.title} | Portugal Active` : BASE_TITLE;
    const description = opts?.description || BASE_DESC;
    const image = opts?.image || BASE_IMAGE;
    const url = opts?.url ? `${BASE_URL}${opts.url}` : BASE_URL;
    const type = opts?.type || 'website';
    const locale = LOCALE_MAP[i18n.language] ?? 'en_GB';

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('link[rel="canonical"]', 'href', url);

    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:image"]', 'content', image);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[property="og:type"]', 'content', type);
    setMeta('meta[property="og:locale"]', 'content', locale);

    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', image);
  }, [opts?.title, opts?.description, opts?.image, opts?.url, opts?.type]);
}
