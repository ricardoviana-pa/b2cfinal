/**
 * Destination search — ONE list of choices for the homepage hero and the
 * listing page (auditoria 29 out, ux-home-plp-05).
 *
 * Regions come first, each with the number of homes it opens, then the
 * municipalities grouped under their region. The homepage used to offer only
 * the 32 municipalities (five searches to see every Algarve home), and on the
 * listing "Douro" reset the search to all 85 homes and "Porto and Douro"
 * returned no Douro home.
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

/** The pickers offer the regions a guest can also read about (a published
 *  destination page). The Silver Coast (Pataias) has none — its one home is
 *  under its municipality, and destination=silver-coast still filters. */
const PICKER_REGIONS = new Set(DESTINATIONS.filter((d) => d.status === 'active' && !d.comingSoon).map((d) => d.slug));

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
  /** Municipalities under their region (region null = no known region; listed last, ungrouped). */
  groups: Array<{ region: string | null; options: Array<{ value: string; label: string }> }>;
}

/** The homes a listing card stands for: published and not a unit inside a group card. */
export function isListedHome(h: SearchHome): boolean {
  return h.isActive !== false && !isChildUnit(h.guestyId ?? undefined);
}

function localitySlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Build the picker model from the localities endpoint (tiny, SSR-prefetched)
 * and, when it is loaded, the catalogue (for the counts). Counts are the
 * number of cards the listing shows for that region with no other filter.
 */
export function buildDestinationOptions(localities: LocalityChoice[], homes?: SearchHome[] | null): DestinationOptionsModel {
  const listed = homes?.length ? homes.filter(isListedHome) : null;
  const regionOfLocality = new Map<string, string>();
  for (const h of listed ?? []) {
    if (h.locality && h.destination && !regionOfLocality.has(localitySlug(h.locality))) {
      regionOfLocality.set(localitySlug(h.locality), regionOfDestination(h.destination));
    }
  }

  const regions: DestinationOptionsModel['regions'] = [];
  for (const region of SEARCH_REGIONS) {
    if (!PICKER_REGIONS.has(region)) continue;
    if (listed) {
      const count = listed.filter((h) => matchesSearchRegion(h.destination, region)).length;
      if (count > 0) regions.push({ region, value: `region:${region}`, count });
      continue;
    }
    // Catalogue still loading: offer the regions the localities already prove exist.
    const present = localities.some((l) => l.groupSlug && (l.groupSlug === region || regionOfDestination(l.groupSlug) === region));
    if (present) regions.push({ region, value: `region:${region}`, count: null });
  }

  const groups: DestinationOptionsModel['groups'] = [];
  const groupIndex = new Map<string | null, number>();
  for (const l of localities) {
    const region = l.groupSlug ? regionOfDestination(l.groupSlug) : regionOfLocality.get(l.value) ?? null;
    if (!groupIndex.has(region)) {
      groupIndex.set(region, groups.length);
      groups.push({ region, options: [] });
    }
    groups[groupIndex.get(region)!].options.push({ value: l.value, label: l.label });
  }
  // Region order follows the region list; municipalities keep the server's alphabetical order.
  const order = (r: string | null) => {
    const i = r ? (SEARCH_REGIONS as readonly string[]).indexOf(r) : -1;
    return i === -1 ? SEARCH_REGIONS.length + (r ? 0 : 1) : i;
  };
  groups.sort((a, b) => order(a.region) - order(b.region));
  for (const g of groups) g.options.sort((a, b) => a.label.localeCompare(b.label, 'pt'));
  return { regions, groups };
}

/** Label of a municipality value for chips and messages ("carreco" → "Carreço"). */
export function localityLabel(localities: LocalityChoice[] | undefined, value: string): string {
  const hit = localities?.find((l) => l.value === value);
  if (hit) return hit.label;
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
