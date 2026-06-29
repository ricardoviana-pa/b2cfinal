/* ==========================================================================
   PROPERTY LOCALISATION — property descriptions come from Guesty in English.
   This overlays per-property translations (keyed by guestyId → lang → field)
   over the live property object, with English fallback for anything missing.

   Kept in its own module (not localizeContent.ts) so the large overrides file
   only ships in the property-detail route chunk, not in pages that localise
   curated content (experiences/services/destinations).
   ========================================================================== */
import { localizeItem } from './localizeContent';
import propertiesI18n from '@/data/properties.i18n.json';

type Dict = Record<string, any>;

/** Localise a single property (Guesty-sourced) for the active language. */
export function localizeProperty<T extends Dict>(
  prop: T | null | undefined,
  lang: string | undefined,
): T | null | undefined {
  if (!prop) return prop;
  const key = (prop as any).guestyId || (prop as any).slug;
  return localizeItem(prop, propertiesI18n as Dict, key, lang);
}
