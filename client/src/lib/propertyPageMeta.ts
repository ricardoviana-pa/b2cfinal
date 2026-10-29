/**
 * usePageMeta options of a home's page. The server injects the same title and
 * description for that URL (shared/propertyMeta.ts), so the hydrated page has
 * nothing to rewrite. Kept apart from lib/pageMeta.ts: that one is in the
 * main bundle (usePageMeta runs on every page), this one only in the
 * home-page chunk.
 */
import { propertyPageMeta } from '@shared/propertyMeta';
import type { PageMetaOpts } from './pageMeta';

export function propertyPageMetaOpts(property: unknown, lang: string): PageMetaOpts {
  const m = propertyPageMeta(property, lang);
  return { title: m.title, description: m.description, image: m.image, url: m.path, type: 'place' };
}
