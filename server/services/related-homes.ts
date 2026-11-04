/**
 * RELATED HOMES FOR BLOG ARTICLES
 *
 * Picks relevant, published homes so readers can move from planning to a stay.
 *
 * The payload is deliberately slim (a handful of homes, a few fields each, a
 * couple of KB) because it gets SSR-prefetched into the article HTML. The full
 * property list dehydrates to ~1.3 MB and is not embeddable — see buildPrefetch
 * in server/_core/vite.ts.
 */

import { curatedPosition } from "../../client/src/config/propertyOrder";
import { getDisplayName } from "@shared/displayName";
import { localitySlug } from "@shared/destinationNavigation";
import { compareEditorialOperation } from "@shared/editorialHomePriority";
import { PROPERTY_GROUPS } from "../../client/src/config/propertyGroups";

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
  douro: "douro",
};

export interface RelatedHome {
  catalogId: string;
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
    catalogId: String(p.guestyId || p.id || p.slug).replace(/^guesty-/, ''),
    slug: p.slug,
    name: getDisplayName(p) || p.slug,
    destination: p.destination ?? null,
    locality: p.locality ?? null,
    bedrooms: typeof p.bedrooms === "number" ? p.bedrooms : null,
    maxGuests: typeof p.maxGuests === "number" ? p.maxGuests : null,
    image: Array.isArray(p.images) && p.images.length ? p.images[0] : null,
    priceFrom: typeof p.priceFrom === "number" ? p.priceFrom : null,
    currency: p.currency ?? "EUR",
  };
}

/** Direct operation first, then the commercial ranking and listing order. */
function byCuratedThenSortOrder(a: any, b: any): number {
  const operation = compareEditorialOperation(a, b);
  if (operation) return operation;
  const ca = curatedPosition(a?.guestyId);
  const cb = curatedPosition(b?.guestyId);
  if (ca !== cb) return ca - cb;
  return (a?.sortOrder ?? 9999) - (b?.sortOrder ?? 9999);
}

/** Keep the direct operation first, then the guide's geographically varied picks. */
function byGuidePicks(ids: string[]) {
  const position = (p: any) => { const n = ids.indexOf(p.guestyId); return n < 0 ? Infinity : n; };
  return (a: any, b: any) => compareEditorialOperation(a, b) ||
    (position(a) !== position(b) ? position(a) - position(b) : byCuratedThenSortOrder(a, b));
}

/**
 * Choose the homes to show under an article.
 *
 * Pure — no I/O — so the matching rules can be tested directly.
 *
 * Falls back to the curated top homes when the article's region has no
 * inventory or when the article carries no region at all. The reviewed Viana,
 * Esposende and North Portugal guides keep their local or regional scope.
 */
export function pickRelatedHomes(
  properties: any[],
  destinationTag: string | null | undefined,
  limit = 4,
  articleSlug?: string,
): RelatedHome[] {
  const active = (properties ?? []).filter((p) => p?.slug && p.isActive !== false);
  const present = new Set(active.map(p => p.guestyId));
  const children = new Set(PROPERTY_GROUPS.filter(g => present.has(g.parentGuestyId))
    .flatMap(g => g.unitGuestyIds.filter(id => id !== g.parentGuestyId)));
  const withSlug = active.filter(p => !p.guestyId || !children.has(p.guestyId));
  const guideLocality = articleSlug === 'viana-do-castelo-guide' ? 'viana-do-castelo'
    : articleSlug === 'esposende-guide' ? 'esposende' : null;
  if (guideLocality) {
    // Same locality as the guide's "view homes" search. Do not fill an empty
    // selection with homes from a different Minho town.
    const local = withSlug.filter(p => localitySlug(p.locality) === guideLocality);
    const picks = guideLocality === 'viana-do-castelo' ? [
      '69653354109993001383ef5f', // Beach Farm
      '6965331fec80690013738c68', // Villa Aura
      '6adf6ec753313e00790e647f', // Central Pearl Duplex
      '6965332327950e001416f0b2', // Cabedelo Beach Lodge
    ] : [];
    return local.sort(byGuidePicks(picks)).slice(0, limit).map(toSlim);
  }
  if (articleSlug === 'complete-guide-north-portugal') {
    // Coast, Lima valley, mountain base and northern riverside. Picks must
    // still belong to the public Minho pool; missing ones are not revived.
    const picks = [
      '696533466d209c001510ecfe', // Eben Lodge — Carreço
      '69653365bf04fe0013743511', // São Julião Retreat — Ponte de Lima
      '6a7079007df813008d013634', // Gerês Gateway — Vieira do Minho
      '69c415ceab80a8001247452c', // Riverfront Watermill — Caminha
    ];
    return withSlug.filter(p => p.destination === 'minho')
      .sort(byGuidePicks(picks)).slice(0, limit).map(toSlim);
  }
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
  articleSlug?: string,
): Promise<RelatedHome[]> {
  const { getPropertiesForSite, catalogProperties } = await import("./properties-store");
  return pickRelatedHomes(catalogProperties(await getPropertiesForSite()), destinationTag, limit, articleSlug);
}
