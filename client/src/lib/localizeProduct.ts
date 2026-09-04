/* ==========================================================================
   PRODUCT / SERVICE LOCALISATION — the small catalogues (products.i18n.json
   ~48 KB, services.i18n.json ~64 KB, all languages) stay statically imported:
   the booking widget and the property page need them synchronously and the
   cost is modest. The heavy ones (destinations, experiences) live in
   localizeContent.ts behind per-language loaders — this file exists so the
   property page never imports those (auditoria set/2026, P2).
   ========================================================================== */
import servicesI18n from '@/data/services.i18n.json';
import productsI18n from '@/data/products.i18n.json';
import { deepMerge, baseLang } from './deepMerge';

type Dict = Record<string, any>;

/** Merge locale overrides ({ slug: { lang: fields } }) over a base content item. */
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
