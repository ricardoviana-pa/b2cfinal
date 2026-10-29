/**
 * Per-language property overrides (client/src/data/properties.i18n/<lang>.json,
 * keyed by guestyId, or by slug for partner homes) laid over the English
 * record. One merge for the client and the server, so the server HTML and the
 * hydrated page say the same thing: the server used to spread the override
 * shallowly for the meta only, and render the English record in the body
 * (auditoria out/2026, seo-health-pdp-hydration-english-meta).
 */
import { deepMerge } from '../client/src/lib/deepMerge';

type Dict = Record<string, any>;

/** The key a property's override is stored under. */
export function propertyOverrideKey(prop: Dict | null | undefined): string | null {
  return (prop && (prop.guestyId || prop.slug)) || null;
}

/** This property's override in a loaded language map, if any. */
export function propertyOverrideFor(prop: Dict | null | undefined, overrides: Dict | null | undefined): Dict | null {
  const key = propertyOverrideKey(prop);
  const o = key && overrides ? overrides[key] : null;
  return o && typeof o === 'object' ? o : null;
}

/** Merge already-loaded overrides over a property, English fallback. */
export function mergePropertyOverrides<T extends Dict>(prop: T | null | undefined, overrides: Dict): T | null | undefined {
  if (!prop) return prop;
  const o = propertyOverrideFor(prop, overrides);
  if (!o) return prop;
  return deepMerge(prop, o) as T;
}
