import copy from './experienceSearchCopy.json';

/** Reviewed search copy is locale-specific; never replace another language
 * with the English version when its translation is not present. */
export function experienceSearchCopy(slug: string, language: string) {
  const entries = copy as Record<string, Record<string, { seoTitle: string; seoDescription: string }>>;
  return entries[slug]?.[language.split('-')[0]];
}
