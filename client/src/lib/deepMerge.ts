/* ==========================================================================
   deepMerge — the merge used by every localiser (content, property, blog).

   Lives on its own so the property page and the blog can import it without
   dragging in the content localiser and, with it, the destination and
   experience translation catalogues (auditoria set/2026, P2).

   Rules:
   - plain objects (e.g. meetingPoint) merge key-by-key, so a partial
     override keeps untranslated keys like lat/lng/googleMapsUrl;
   - arrays of objects (itinerary, faq) merge element-by-element by index,
     so structural fields like stepNumber survive while text is overridden;
   - arrays of strings and primitives are replaced by the override.
   ========================================================================== */

type Dict = Record<string, any>;

export function deepMerge(base: any, ov: any): any {
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

/** Normalise an i18next language ("pt-PT", "en-GB") to the base code ("pt"). */
export function baseLang(lang: string | undefined): string {
  return (lang || 'en').toLowerCase().split('-')[0];
}
