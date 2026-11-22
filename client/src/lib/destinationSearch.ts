/**
 * Destination search — ONE list of choices for the homepage hero and the
 * listing page (auditoria 29 out, ux-home-plp-05).
 *
 * The list is the regions and nothing else, each with the number of homes it
 * opens (o Ricardo, 20 nov 2026: "está muito feio a quantidade de destinos",
 * then "só regiões"). Until then the 31 municipalities followed, grouped
 * under their region: parishes (Carreço, Chafé) beside the supplier's areas
 * ("Central Algarve") beside real towns, 38 lines in all. A municipality is
 * still a valid search (`?location=caminha`, from links made before): the
 * listing filters on it and the picker shows it as the chosen value.
 *
 * Region semantics match the destination pages (server/services/
 * properties-store.ts, getPropertiesForDestination): a region hub lists its
 * own homes and those of its spokes, so `destination=porto` ("Porto and
 * Douro") includes the Douro quintas, while `destination=douro` is the Douro
 * alone.
 */
import destinationsData from '@/data/destinations.json';
import { isChildUnit } from '@/config/propertyGroups';

/** Regions a search can ask for, in the order the pickers show them. */
export const SEARCH_REGIONS = ['minho', 'porto', 'douro', 'lisbon', 'alentejo', 'algarve', 'silver-coast'] as const;
export type SearchRegion = (typeof SEARCH_REGIONS)[number];

type DestinationRecord = { slug: string; region?: string; status?: string; comingSoon?: boolean };
const DESTINATIONS = destinationsData as DestinationRecord[];

/** destination slug → its region (douro → porto, caminha → minho). */
const REGION_OF: Record<string, string> = Object.fromEntries(DESTINATIONS.map((d) => [d.slug, d.region || d.slug]));

/** Regions with a published destination page. While the catalogue is still
 *  loading, only these are offered (from the localities); once it is there,
 *  every region with a home is, the Silver Coast included: with the
 *  municipalities gone from the list, its home had no other line. */
const PUBLISHED_REGIONS = new Set(DESTINATIONS.filter((d) => d.status === 'active' && !d.comingSoon).map((d) => d.slug));

export function isSearchRegion(value: unknown): value is SearchRegion {
  return typeof value === 'string' && (SEARCH_REGIONS as readonly string[]).includes(value);
}

/** A `destination` URL value → the region it asks for, or null (= all homes). */
export function parseSearchRegion(value: string | null | undefined): SearchRegion | null {
  const v = String(value ?? '').trim().toLowerCase();
  return isSearchRegion(v) ? v : null;
}

/** The region a home's destination belongs to. Unknown destinations are their own region. */
export function regionOfDestination(destination: string | null | undefined): string {
  const d = String(destination ?? '');
  return REGION_OF[d] ?? d;
}

/** A home is in a region when its destination is that region or one of its spokes. */
export function matchesSearchRegion(homeDestination: string | null | undefined, region: SearchRegion): boolean {
  if (!homeDestination) return false;
  return homeDestination === region || regionOfDestination(homeDestination) === region;
}

export interface LocalityChoice { label: string; value: string; group?: string; groupSlug?: string }
export interface SearchHome { destination?: string | null; locality?: string | null; isActive?: boolean | null; guestyId?: string | null }

export interface DestinationOptionsModel {
  /** Region choices, with the number of homes each opens (null while the catalogue is loading). */
  regions: Array<{ region: SearchRegion; value: `region:${SearchRegion}`; count: number | null }>;
}

/** The homes a listing card stands for: published and not a unit inside a group card. */
export function isListedHome(h: SearchHome): boolean {
  return h.isActive !== false && !isChildUnit(h.guestyId ?? undefined);
}

/**
 * Build the picker model from the localities endpoint (tiny, SSR-prefetched)
 * and, when it is loaded, the catalogue (for the counts). Counts are the
 * number of cards the listing shows for that region with no other filter.
 */
export function buildDestinationOptions(localities: LocalityChoice[], homes?: SearchHome[] | null): DestinationOptionsModel {
  const listed = homes?.length ? homes.filter(isListedHome) : null;

  const regions: DestinationOptionsModel['regions'] = [];
  for (const region of SEARCH_REGIONS) {
    if (listed) {
      const count = listed.filter((h) => matchesSearchRegion(h.destination, region)).length;
      if (count > 0) regions.push({ region, value: `region:${region}`, count });
      continue;
    }
    // Catalogue still loading: offer the regions the localities already prove exist.
    if (!PUBLISHED_REGIONS.has(region)) continue;
    const present = localities.some((l) => l.groupSlug && (l.groupSlug === region || regionOfDestination(l.groupSlug) === region));
    if (present) regions.push({ region, value: `region:${region}`, count: null });
  }
  return { regions };
}

/** Label of a municipality value for chips and messages ("carreco" → "Carreço"). */
export function localityLabel(localities: LocalityChoice[] | undefined, value: string): string {
  const hit = localities?.find((l) => l.value === value);
  if (hit) return hit.label;
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
