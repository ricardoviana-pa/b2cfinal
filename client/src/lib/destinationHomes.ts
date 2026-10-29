/**
 * Which homes a destination page shows. Shared by the early strip under the
 * hero and the "Homes in …" section further down, so both ask for exactly
 * the same price list (same `lowestNightlyBatch` / `partnerPrices` query
 * key → one request, served from react-query's cache the second time).
 */
import { PROPERTY_GROUPS } from '@/config/propertyGroups';
import { selectDestinationHomes } from '@/data/destination-discovery';
import { sortProperties } from '@/lib/utils';
import type { Property } from '@/lib/types';

type DestinationHome = { guestyId?: string | null; isActive?: boolean };

/** Published homes, with the units of a group folded into the group's card. */
export function listedDestinationHomes<T extends DestinationHome>(properties: T[]): T[] {
  const present = new Set(properties.map((p) => p.guestyId));
  const groupedChildren = new Set(
    PROPERTY_GROUPS.filter((g) => present.has(g.parentGuestyId))
      .flatMap((g) => g.unitGuestyIds.filter((id) => id !== g.parentGuestyId)),
  );
  return properties.filter((p) => p.isActive !== false && (!p.guestyId || !groupedChildren.has(p.guestyId)));
}

/** The cards a block renders: the editor's picks when `featured`, else the
 *  first six — in the listing's "recommended" order (curated ranking, houses
 *  and villas before apartments), so "view all" continues where it left off. */
export function visibleDestinationHomes<T extends DestinationHome>(properties: T[], opts: { slug: string; featured?: boolean }): T[] {
  const homes = sortProperties(listedDestinationHomes(properties) as unknown as Property[], 'recommended') as unknown as T[];
  return opts.featured ? selectDestinationHomes(homes, opts.slug) : homes.slice(0, 6);
}
