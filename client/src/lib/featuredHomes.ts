/**
 * The twelve cards of the homepage strip ("Editor's Picks"), chosen from the
 * public catalogue by HOME_FEATURED_ORDER (config/propertyOrder.ts).
 *
 * Partner homes have no Guesty listing, so entries are matched on the
 * catalogue key (guestyId for our homes, catalogue id for partner inventory).
 * Multi-unit child units never surface individually: the parent listing,
 * which PropertyCard renders as a group card, represents the cluster.
 *
 * If fewer than HOME_FEATURED_COUNT entries exist in the current catalogue
 * (a listing temporarily unlisted in Guesty, partner inventory switched off
 * with TRIPWIX_INVENTORY=0), the slots are filled from our own homes in the
 * curated PLP order, then by price descending, skipping anything already
 * chosen and any group child.
 */
import { HOME_FEATURED_ORDER, HOME_FEATURED_COUNT, catalogKey, curatedPosition } from '@/config/propertyOrder';
import { isChildUnit } from '@/config/propertyGroups';

export interface FeaturedCandidate {
  id: string;
  guestyId?: string | null;
  priceFrom?: number | null;
  isActive?: boolean;
}

export function selectFeaturedHomes<T extends FeaturedCandidate>(properties: readonly T[], count = HOME_FEATURED_COUNT): T[] {
  const live = properties.filter(p => p.isActive !== false);
  const byKey = new Map(live.map(p => [catalogKey(p), p]));
  const pinned = HOME_FEATURED_ORDER
    .map(key => byKey.get(key))
    .filter((p): p is T => !!p && !isChildUnit(p.guestyId ?? undefined))
    .slice(0, count);
  if (pinned.length >= count) return pinned;
  const pinnedSet = new Set(pinned.map(catalogKey));
  const fillers = live
    .filter(p => p.guestyId && !pinnedSet.has(catalogKey(p)) && !isChildUnit(p.guestyId ?? undefined))
    .sort((a, b) => {
      // The curated ranks as the tie-breaker, so fillers still come in
      // commercial-team order, then price descending for anything off it.
      const pa = curatedPosition(a.guestyId ?? undefined);
      const pb = curatedPosition(b.guestyId ?? undefined);
      if (pa !== pb) return pa - pb;
      return (b.priceFrom ?? 0) - (a.priceFrom ?? 0);
    });
  return [...pinned, ...fillers].slice(0, count);
}
