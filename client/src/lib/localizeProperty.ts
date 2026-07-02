/* ==========================================================================
   PROPERTY LOCALISATION — property descriptions come from Guesty in English.
   Per-locale translations live in one file PER LANGUAGE (client/src/data/
   properties.i18n/<lang>.json, keyed by guestyId → fields). Only the ACTIVE
   language's file is fetched (dynamic import → its own code-split chunk), so a
   property page ships ~one language (~450–590 KB) instead of all seven (~4 MB).
   ========================================================================== */
import { deepMerge } from './localizeContent';

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
};

const cache: Record<string, Dict> = {};

function baseLang(lang: string | undefined): string {
  return (lang || 'en').toLowerCase().split('-')[0];
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

/** Merge already-loaded overrides (guestyId-keyed) over a property, EN fallback. */
export function mergePropertyOverrides<T extends Dict>(prop: T | null | undefined, overrides: Dict): T | null | undefined {
  if (!prop) return prop;
  const key = (prop as any).guestyId || (prop as any).slug;
  const o = key && overrides ? overrides[key] : null;
  if (!o || typeof o !== 'object') return prop;
  return deepMerge(prop, o) as T;
}
