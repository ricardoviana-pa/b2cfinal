/* ==========================================================================
   PROPERTY LOCALISATION — property descriptions come from Guesty in English.
   Per-locale translations live in one file PER LANGUAGE (client/src/data/
   properties.i18n/<lang>.json, keyed by guestyId → fields). Only the ACTIVE
   language's file is fetched (dynamic import → its own code-split chunk), so a
   property page ships ~one language (~450–590 KB) instead of all seven (~4 MB).

   The server seeds the one override the page needs into the react-query cache
   (propertyOverridesQueryKey), so the server HTML and the first client render
   are already in the page's language; the full file still loads afterwards for
   the related-home cards.
   ========================================================================== */
import { mergePropertyOverrides } from '@shared/propertyLocalization';

export { mergePropertyOverrides };

type Dict = Record<string, any>;

/** Per-language override loaders — Vite code-splits each into its own chunk. */
const LOADERS: Record<string, () => Promise<{ default: Dict }>> = {
  pt: () => import('@/data/properties.i18n/pt.json'),
  fr: () => import('@/data/properties.i18n/fr.json'),
  es: () => import('@/data/properties.i18n/es.json'),
  it: () => import('@/data/properties.i18n/it.json'),
  de: () => import('@/data/properties.i18n/de.json'),
  nl: () => import('@/data/properties.i18n/nl.json'),
  sv: () => import('@/data/properties.i18n/sv.json'),
  fi: () => import('@/data/properties.i18n/fi.json'),
};

const cache: Record<string, Dict> = {};

function baseLang(lang: string | undefined): string {
  return (lang || 'en').toLowerCase().split('-')[0];
}

/** Query-cache key under which SSR seeds the page's own override
 *  ({ [guestyId|slug]: fields }, the same shape as a loaded language file). */
export function propertyOverridesQueryKey(lang: string | undefined, slug: string): readonly unknown[] {
  return ['pa', 'propertyOverrides', baseLang(lang), slug] as const;
}

/**
 * Load the property-translation overrides (keyed by guestyId) for a language.
 * Returns {} for English or unsupported languages. Cached after first load.
 */
export async function loadPropertyOverrides(lang: string | undefined): Promise<Dict> {
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
