/** Pure merge helper for editorial validation. Public Journal pages obtain
 * one localized article or card metadata through the server, never a complete
 * browser-side catalogue of article bodies. */
import { deepMerge } from './deepMerge';

type Dict = Record<string, any>;

/** Merge already-loaded overrides (slug-keyed) over an article, EN fallback. */
export function mergeBlogOverride<T extends Dict>(article: T | null | undefined, overrides: Dict): T | null | undefined {
  if (!article) return article;
  const o = (article as any).slug && overrides ? overrides[(article as any).slug] : null;
  if (!o || typeof o !== 'object') return article;
  return deepMerge(article, o) as T;
}
