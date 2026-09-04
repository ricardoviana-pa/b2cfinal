/* ==========================================================================
   CONTENT LOCALISATION — destinations and experience details are authored in
   English; per-locale overrides live in ONE FILE PER LANGUAGE:

     client/src/data/destinations.i18n/<lang>.json       { slug: fields }
     client/src/data/experienceDetails.i18n/<lang>.json  { slug: fields }

   Only the ACTIVE language's file is fetched (dynamic import → its own
   chunk). The two catalogues used to be single files with all eight
   languages, statically imported here — 890 KB of JSON that every visitor,
   English included, downloaded inside the main bundle (auditoria set/2026,
   P2). Products and services (small) stay in localizeProduct.ts.

   SSR and hydration: the server preloads the language's files before
   rendering, and main.tsx preloads them before hydrating, so the first
   client render matches the server markup. Client-side navigations that
   arrive without a preload fall back to a one-off effect (English first,
   then the translation) — never a hydration mismatch, because that path is
   client-rendered.
   ========================================================================== */
import { useEffect, useState } from 'react';
import { deepMerge, baseLang } from './deepMerge';

export { deepMerge } from './deepMerge';
export { localizeItem, localizeProduct, localizeService } from './localizeProduct';

type Dict = Record<string, any>;
export type ContentKind = 'destinations' | 'experiences';

const LANGS = ['pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;

/** Per-language loaders — Vite code-splits each JSON into its own chunk. */
const LOADERS: Record<ContentKind, Record<string, () => Promise<{ default: Dict }>>> = {
  destinations: {
    pt: () => import('@/data/destinations.i18n/pt.json'),
    fr: () => import('@/data/destinations.i18n/fr.json'),
    es: () => import('@/data/destinations.i18n/es.json'),
    it: () => import('@/data/destinations.i18n/it.json'),
    de: () => import('@/data/destinations.i18n/de.json'),
    nl: () => import('@/data/destinations.i18n/nl.json'),
    sv: () => import('@/data/destinations.i18n/sv.json'),
    fi: () => import('@/data/destinations.i18n/fi.json'),
  },
  experiences: {
    pt: () => import('@/data/experienceDetails.i18n/pt.json'),
    fr: () => import('@/data/experienceDetails.i18n/fr.json'),
    es: () => import('@/data/experienceDetails.i18n/es.json'),
    it: () => import('@/data/experienceDetails.i18n/it.json'),
    de: () => import('@/data/experienceDetails.i18n/de.json'),
    nl: () => import('@/data/experienceDetails.i18n/nl.json'),
    sv: () => import('@/data/experienceDetails.i18n/sv.json'),
    fi: () => import('@/data/experienceDetails.i18n/fi.json'),
  },
};

const EMPTY: Dict = Object.freeze({});
const cache: Record<ContentKind, Record<string, Dict>> = { destinations: {}, experiences: {} };
const pending: Record<ContentKind, Record<string, Promise<Dict>>> = { destinations: {}, experiences: {} };

/** Load one catalogue for one language (cached; {} for English/unknown). */
export async function loadContentOverrides(kind: ContentKind, lang: string | undefined): Promise<Dict> {
  const code = baseLang(lang);
  if (code === 'en' || !LOADERS[kind][code]) return EMPTY;
  if (cache[kind][code]) return cache[kind][code];
  if (!pending[kind][code]) {
    pending[kind][code] = LOADERS[kind][code]()
      .then((m) => (cache[kind][code] = m.default || EMPTY))
      .catch(() => (cache[kind][code] = EMPTY));
  }
  return pending[kind][code];
}

/** Synchronous read of what is already loaded ({} until then). */
export function getContentOverrides(kind: ContentKind, lang: string | undefined): Dict {
  return cache[kind][baseLang(lang)] || EMPTY;
}

/** Which catalogues a route needs, so the preload never fetches more than the page uses. */
export function contentKindsForPath(pathWithoutLocale: string): ContentKind[] {
  const p = pathWithoutLocale || '/';
  const kinds: ContentKind[] = [];
  if (p === '/' || p.startsWith('/destinations')) kinds.push('destinations');
  if (p.startsWith('/experiences') || p.startsWith('/activities')) kinds.push('experiences');
  return kinds;
}

/**
 * Preload the catalogues a path needs, for `lang`. Called by the server before
 * rendering and by main.tsx before hydrating; no-op for English.
 */
export async function preloadContentOverrides(lang: string | undefined, pathWithoutLocale: string): Promise<void> {
  const code = baseLang(lang);
  if (code === 'en' || !(LANGS as readonly string[]).includes(code)) return;
  await Promise.all(contentKindsForPath(pathWithoutLocale).map((k) => loadContentOverrides(k, code)));
}

/**
 * Hook: the overrides for `kind` in `lang`. Returns the cached catalogue
 * synchronously when preloaded (SSR / hydration path); otherwise loads it
 * once and re-renders — the client-navigation path.
 */
export function useContentOverrides(kind: ContentKind, lang: string | undefined): Dict {
  const code = baseLang(lang);
  const ready = cache[kind][code];
  const [, force] = useState(0);
  useEffect(() => {
    if (ready || code === 'en') return;
    let alive = true;
    loadContentOverrides(kind, code).then(() => { if (alive) force((n) => n + 1); });
    return () => { alive = false; };
  }, [kind, code, ready]);
  return ready || EMPTY;
}

export const useDestinationOverrides = (lang: string | undefined) => useContentOverrides('destinations', lang);
export const useExperienceOverrides = (lang: string | undefined) => useContentOverrides('experiences', lang);

/** Merge already-loaded overrides ({ slug: fields }) over an item, EN fallback. */
function mergeBySlug<T extends Dict>(item: T | null | undefined, overrides: Dict): T | null | undefined {
  if (!item) return item;
  const o = item.slug && overrides ? overrides[item.slug] : null;
  if (!o || typeof o !== 'object') return item;
  return deepMerge(item, o) as T;
}

/** Localise a destination with the catalogue from useDestinationOverrides(). */
export function localizeDestination<T extends Dict>(dest: T | null | undefined, overrides: Dict): T | null | undefined {
  return mergeBySlug(dest, overrides);
}

/** Localise an experience with the catalogue from useExperienceOverrides(). */
export function localizeExperience<T extends Dict>(exp: T | null | undefined, overrides: Dict): T | null | undefined {
  return mergeBySlug(exp, overrides);
}
