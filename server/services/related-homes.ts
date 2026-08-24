/**
 * RELATED HOMES FOR BLOG ARTICLES
 *
 * The blog is 39 published articles that, until now, linked to no property at
 * all: topical authority with nowhere to flow. This picks the homes worth
 * showing under an article so the link is useful to the reader first and to a
 * crawler second.
 *
 * The payload is deliberately slim (a handful of homes, a few fields each, a
 * couple of KB) because it gets SSR-prefetched into the article HTML. The full
 * property list dehydrates to ~1.3 MB and is not embeddable — see buildPrefetch
 * in server/_core/vite.ts.
 */

import { curatedPosition } from "../../client/src/config/propertyOrder";

/**
 * Articles are tagged by editorial region ("minho-coast"), properties by
 * commercial destination ("minho"). They were never the same vocabulary, so
 * map explicitly rather than hoping a string match lands.
 *
 * Tags with no destination of their own — "portugal" on the broad guides — are
 * absent on purpose: they fall through to the curated fallback below.
 */
const TAG_TO_DESTINATION: Record<string, string> = {
  "minho-coast": "minho",
  minho: "minho",
  porto: "porto",
  lisbon: "lisbon",
  lisboa: "lisbon",
  alentejo: "alentejo",
  algarve: "algarve",
  douro: "porto",
};

export interface RelatedHome {
  slug: string;
  name: string;
  destination: string | null;
  locality: string | null;
  bedrooms: number | null;
  maxGuests: number | null;
  image: string | null;
  priceFrom: number | null;
  currency: string | null;
}

function toSlim(p: any): RelatedHome {
  return {
    slug: p.slug,
    name: p.name ?? p.slug,
    destination: p.destination ?? null,
    locality: p.locality ?? null,
    bedrooms: typeof p.bedrooms === "number" ? p.bedrooms : null,
    maxGuests: typeof p.maxGuests === "number" ? p.maxGuests : null,
    image: Array.isArray(p.images) && p.images.length ? p.images[0] : null,
    priceFrom: typeof p.priceFrom === "number" ? p.priceFrom : null,
    currency: p.currency ?? "EUR",
  };
}

/** Commercial ranking first, then the listing's own order — the same rule the
 *  PLP uses, so an article never recommends a home the PLP buries. */
function byCuratedThenSortOrder(a: any, b: any): number {
  const ca = curatedPosition(a?.guestyId);
  const cb = curatedPosition(b?.guestyId);
  if (ca !== cb) return ca - cb;
  return (a?.sortOrder ?? 9999) - (b?.sortOrder ?? 9999);
}

/**
 * Choose the homes to show under an article.
 *
 * Pure — no I/O — so the matching rules can be tested directly.
 *
 * Falls back to the curated top homes when the article's region has no
 * inventory (there are articles tagged "algarve" and no Algarve homes) or when
 * the article carries no region at all. Showing the best available homes beats
 * showing an empty block, and it keeps every article contributing links.
 */
export function pickRelatedHomes(
  properties: any[],
  destinationTag: string | null | undefined,
  limit = 4,
): RelatedHome[] {
  const withSlug = (properties ?? []).filter((p) => p?.slug);
  const destination = destinationTag ? TAG_TO_DESTINATION[destinationTag.toLowerCase()] : undefined;

  const matching = destination
    ? withSlug.filter((p) => String(p.destination ?? "").toLowerCase() === destination)
    : [];

  const pool = matching.length ? matching : withSlug;
  return pool.slice().sort(byCuratedThenSortOrder).slice(0, limit).map(toSlim);
}

/** Load the public property list and pick the related homes for an article. */
export async function getRelatedHomes(
  destinationTag: string | null | undefined,
  limit = 4,
): Promise<RelatedHome[]> {
  const { getPropertiesForSite } = await import("./properties-store");
  return pickRelatedHomes(await getPropertiesForSite(), destinationTag, limit);
}
