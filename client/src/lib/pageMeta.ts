/**
 * What usePageMeta writes into <head>, as a pure function — so a test can
 * prove that the hydrated page asks for exactly what the server injected
 * (auditoria out/2026: non-English home pages switched to an English title
 * after hydration). No DOM and no i18n import here.
 */

export const SITE_BASE_URL = 'https://www.portugalactive.com';
export const BASE_TITLE = 'Luxury Villas & Private Homes in Portugal | Portugal Active';
export const BASE_DESC = 'Luxury villas and private homes in Portugal, run end to end by our own in-house team: concierge, private chef and housekeeping. Minho, Porto, Douro, Lisbon, Alentejo and Algarve. Book direct.';
export const BASE_IMAGE = 'https://www.portugalactive.com/hero/home-mirante-tennis-og.jpg';

export interface PageMetaOpts {
  title?: string;
  description?: string;
  image?: string;
  /** Page path without locale prefix, e.g. '/homes' or '/homes/villa-x' */
  url?: string;
  type?: 'website' | 'article' | 'place';
  /** Transactional pages (checkout) — sets robots noindex and skips hreflang/canonical */
  noindex?: boolean;
  publishedLocales?: string[];
}

export interface ResolvedPageMeta {
  title: string;
  description: string;
  image: string;
  /** Canonical / og:url. */
  url: string;
  type: string;
  pagePath: string;
}

export function resolvePageMeta(opts: PageMetaOpts | undefined, lang: string): ResolvedPageMeta {
  const title = opts?.title ? `${opts.title.replace(/(?:\s*\|\s*Portugal Active)+$/i, '')} | Portugal Active` : BASE_TITLE;
  const description = opts?.description || BASE_DESC;
  // Crawlers can't resolve relative paths: always an absolute image URL, the
  // way the server's buildOg writes it.
  const rawImage = (opts?.image || '').trim() || BASE_IMAGE;
  const image = /^https?:\/\//i.test(rawImage) ? rawImage : `${SITE_BASE_URL}${rawImage.startsWith('/') ? '' : '/'}${rawImage}`;
  const pagePath = opts?.url || '/';
  const url = `${SITE_BASE_URL}/${lang}${pagePath === '/' ? '' : pagePath}`;
  return { title, description, image, url, type: opts?.type || 'website', pagePath };
}
