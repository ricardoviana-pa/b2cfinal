/* ==========================================================================
   BLOG LOCALISATION — articles in client/src/data/blog.json are authored in
   English. Per-locale translations live in one file PER LANGUAGE
   (client/src/data/blog.i18n/<lang>.json, keyed by slug → fields). Only the
   ACTIVE language's file is fetched (dynamic import → its own chunk), with
   English fallback for anything untranslated.
   ========================================================================== */
import { deepMerge } from './localizeContent';

type Dict = Record<string, any>;

/** Per-language override loaders — Vite code-splits each into its own chunk. */
const LOADERS: Record<string, () => Promise<{ default: Dict }>> = {
  pt: () => import('@/data/blog.i18n/pt.json'),
  fr: () => import('@/data/blog.i18n/fr.json'),
  es: () => import('@/data/blog.i18n/es.json'),
  it: () => import('@/data/blog.i18n/it.json'),
  de: () => import('@/data/blog.i18n/de.json'),
  nl: () => import('@/data/blog.i18n/nl.json'),
  sv: () => import('@/data/blog.i18n/sv.json'),
};

const cache: Record<string, Dict> = {};

function baseLang(lang: string | undefined): string {
  return (lang || 'en').toLowerCase().split('-')[0];
}

/** Load blog-translation overrides (keyed by slug) for a language. {} for English. */
export async function loadBlogOverrides(lang: string | undefined): Promise<Dict> {
  const code = baseLang(lang);
  if (code === 'en' || !LOADERS[code]) return {};
  if (!cache[code]) {
    try {
      cache[code] = (await LOADERS[code]()).default || {};
    } catch {
      cache[code] = {};
    }
  }
  return cache[code];
}

/** Merge already-loaded overrides (slug-keyed) over an article, EN fallback. */
export function mergeBlogOverride<T extends Dict>(article: T | null | undefined, overrides: Dict): T | null | undefined {
  if (!article) return article;
  const o = (article as any).slug && overrides ? overrides[(article as any).slug] : null;
  if (!o || typeof o !== 'object') return article;
  return deepMerge(article, o) as T;
}
