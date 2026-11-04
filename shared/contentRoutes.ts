/**
 * Which per-language content catalogues a page loads before it renders
 * (destination, journal and experience translations — client/src/lib/
 * localizeContent.ts). Shared so the server can modulepreload exactly the
 * files the browser is about to request (server/lib/routeAssets.ts).
 */
export type ContentKind = "destinations" | "experiences" | "journal";

/** Which catalogues a route needs, so the preload never fetches more than the page uses. */
export function contentKindsForPath(pathWithoutLocale: string): ContentKind[] {
  const p = pathWithoutLocale || "/";
  const kinds: ContentKind[] = [];
  if (p === "/" || p.startsWith("/destinations")) kinds.push("destinations");
  if (p.startsWith("/destinations/")) kinds.push("journal");
  if (p.startsWith("/experiences") || p.startsWith("/activities")) kinds.push("experiences");
  return kinds;
}

/** Source module of each catalogue for a language, as Vite names it in its manifest. */
export const CONTENT_MODULES: Record<ContentKind, (lang: string) => string> = {
  destinations: (lang) => `src/data/destinations.i18n/${lang}.json`,
  journal: (lang) => `src/data/journal-index/${lang}.json`,
  experiences: (lang) => `src/data/experienceDetails.i18n/${lang}.json`,
};
