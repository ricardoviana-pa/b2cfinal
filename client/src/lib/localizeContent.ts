/* ==========================================================================
   CONTENT LOCALISATION — data-file content (experiences, services, …) is
   authored in English. This merges per-locale overrides (keyed by slug →
   lang → field) over the English base, so any field that has a translation
   is shown in the active language and anything untranslated falls back to
   English.

   Merge rules (deepMerge):
   - plain objects (e.g. meetingPoint) merge key-by-key, so a partial
     override keeps untranslated keys like lat/lng/googleMapsUrl;
   - arrays of objects (itinerary, faq) merge element-by-element by index,
     so structural fields like stepNumber survive while text is overridden;
   - arrays of strings and primitives are replaced by the override.
   ========================================================================== */
import experiencesI18n from '@/data/experienceDetails.i18n.json';
import servicesI18n from '@/data/services.i18n.json';
import productsI18n from '@/data/products.i18n.json';
import destinationsI18n from '@/data/destinations.i18n.json';

type Dict = Record<string, any>;

function deepMerge(base: any, ov: any): any {
  if (Array.isArray(ov)) {
    if (Array.isArray(base)) {
      return ov.map((v, i) =>
        v && typeof v === 'object' && base[i] && typeof base[i] === 'object'
          ? deepMerge(base[i], v)
          : v,
      );
    }
    return ov;
  }
  if (ov && typeof ov === 'object') {
    if (base && typeof base === 'object' && !Array.isArray(base)) {
      const out: Dict = { ...base };
      for (const k of Object.keys(ov)) out[k] = deepMerge(base[k], ov[k]);
      return out;
    }
    return ov;
  }
  return ov;
}

/** Normalise i18next language ("pt-PT", "en-GB") to the base code ("pt"). */
function baseLang(lang: string | undefined): string {
  return (lang || 'en').toLowerCase().split('-')[0];
}

/** Merge locale overrides over a base content item (deep). */
export function localizeItem<T extends Dict>(
  base: T,
  overridesBySlugLang: Dict,
  slug: string | undefined,
  lang: string | undefined,
): T {
  const code = baseLang(lang);
  if (code === 'en' || !slug) return base;
  const o = overridesBySlugLang?.[slug]?.[code];
  if (!o || typeof o !== 'object') return base;
  return deepMerge(base, o) as T;
}

/** Localise a single experience object for the active language. */
export function localizeExperience<T extends Dict>(exp: T | null | undefined, lang: string | undefined): T | null | undefined {
  if (!exp) return exp;
  return localizeItem(exp, experiencesI18n as Dict, exp.slug, lang);
}

/** Localise a single service object (services.json) for the active language. */
export function localizeService<T extends Dict>(svc: T | null | undefined, lang: string | undefined): T | null | undefined {
  if (!svc) return svc;
  return localizeItem(svc, servicesI18n as Dict, svc.slug, lang);
}

/** Localise a single product/card object (products.json) for the active language. */
export function localizeProduct<T extends Dict>(prod: T | null | undefined, lang: string | undefined): T | null | undefined {
  if (!prod) return prod;
  return localizeItem(prod, productsI18n as Dict, prod.slug, lang);
}

/** Localise a single destination object (destinations.json) for the active language. */
export function localizeDestination<T extends Dict>(dest: T | null | undefined, lang: string | undefined): T | null | undefined {
  if (!dest) return dest;
  return localizeItem(dest, destinationsI18n as Dict, dest.slug, lang);
}
