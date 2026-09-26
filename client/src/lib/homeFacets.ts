/**
 * Catalogue facets for /homes — one place for what each filter means.
 *
 * The rail (HomesFilterRail) only renders; Homes.tsx only wires URL state.
 * Everything a filter *decides* lives here so the option counts shown in the
 * panels and the list itself can never disagree.
 */
import type { Property, SortOption } from './types';
import { isApartment } from './utils';
import { hasSwimmingPool, hasHeatedPool, searchPrice } from './homeSearch';

export type HomeKind = 'all' | 'houses' | 'apartments';
export type BedroomBand = 'all' | '1-2' | '3-4' | '5-6' | '7+';
export type BudgetBand = 'all' | 'b1' | 'b2' | 'b3' | 'b4';
export type FeatureKey = 'pool' | 'heatedPool' | 'jacuzzi' | 'seaView' | 'pets';

export const HOME_KINDS: HomeKind[] = ['houses', 'apartments', 'all'];
export const BEDROOM_BANDS: Exclude<BedroomBand, 'all'>[] = ['1-2', '3-4', '5-6', '7+'];
export const BUDGET_BANDS: Exclude<BudgetBand, 'all'>[] = ['b1', 'b2', 'b3', 'b4'];
export const FEATURE_KEYS: FeatureKey[] = ['pool', 'heatedPool', 'jacuzzi', 'seaView', 'pets'];
/** "Sleeps at least" steps; 0 means any. */
export const SLEEPS_STEPS = [4, 6, 8, 12, 16];

export interface HomeFacets {
  kind: HomeKind;
  bedrooms: BedroomBand;
  budget: BudgetBand;
  features: Record<FeatureKey, boolean>;
  sort: SortOption;
}

/** URL → facets. `type` accepts the old per-type values too, so shared links keep working. */
export function parseHomeFacets(params: URLSearchParams): HomeFacets {
  const pick = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
    const value = params.get(key) || '';
    return (options as readonly string[]).includes(value) ? (value as T) : fallback;
  };
  const rawType = params.get('type') || '';
  const kind: HomeKind =
    rawType === 'apartments' || rawType === 'Apartment' ? 'apartments'
    : rawType === 'houses' || rawType === 'House' || rawType === 'Villa' ? 'houses'
    : 'all';
  const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, params.get(k) === '1'])) as Record<FeatureKey, boolean>;
  return {
    kind,
    bedrooms: pick<BedroomBand>('bedrooms', ['1-2', '3-4', '5-6', '7+'], 'all'),
    budget: pick<BudgetBand>('budget', ['b1', 'b2', 'b3', 'b4'], 'all'),
    features,
    sort: pick<SortOption>('sort', ['recommended', 'price-asc', 'price-desc', 'newest'], 'recommended'),
  };
}

/** Query-string keys the facets own (what "clear all" removes). */
export const FACET_PARAM_KEYS = ['type', 'bedrooms', 'budget', 'guests', 'sort', ...FEATURE_KEYS];

export function amenityStrings(p: Property): string[] {
  return Object.values((p.amenities || {}) as Record<string, unknown>)
    .flat()
    .filter((a): a is string => typeof a === 'string');
}

export function matchesKind(p: Property, kind: HomeKind): boolean {
  if (kind === 'all') return true;
  return kind === 'apartments' ? isApartment(p) : !isApartment(p);
}

export function matchesBedrooms(p: Property, band: BedroomBand): boolean {
  const n = p.bedrooms ?? 0;
  switch (band) {
    case '1-2': return n >= 1 && n <= 2;
    case '3-4': return n >= 3 && n <= 4;
    case '5-6': return n >= 5 && n <= 6;
    case '7+': return n >= 7;
    default: return true;
  }
}

export function matchesSleeps(p: Property, guests: number): boolean {
  return guests <= 0 || (p.maxGuests ?? 0) >= guests;
}

/** Heated pools are flagged by slug (heatedPool.json) or named in the copy. */
export function hasFeature(p: Property, key: FeatureKey, heatedSlugs: Set<string>): boolean {
  const list = amenityStrings(p);
  switch (key) {
    case 'pool': return heatedSlugs.has(p.slug) || hasSwimmingPool(list);
    case 'heatedPool': return heatedSlugs.has(p.slug) || hasHeatedPool(`${p.name} ${(p as any).tagline || ''} ${list.join(' ')}`);
    case 'jacuzzi': return list.some((a) => /jacuzzi|hot tub/i.test(a));
    case 'seaView': return list.some((a) => /\b(sea|ocean|beach) ?(view|front)\b/i.test(a));
    case 'pets': return !!(p as any).petsAllowed;
  }
}

export function matchesBudget(nightly: number | null, band: BudgetBand): boolean {
  if (band === 'all') return true;
  if (nightly === null) return false;
  switch (band) {
    case 'b1': return nightly <= 300;
    case 'b2': return nightly > 300 && nightly <= 500;
    case 'b3': return nightly > 500 && nightly <= 800;
    case 'b4': return nightly > 800;
  }
}

export interface FacetContext {
  heatedSlugs: Set<string>;
  /** Price inputs; omit to skip the budget facet (before quotes exist). */
  prices?: {
    quotes: Record<string, Parameters<typeof searchPrice>[1][string]>;
    fromPrices: Record<string, number | null> | undefined;
    nights: number;
  };
}

export function nightlyRate(p: Property, prices: NonNullable<FacetContext['prices']>): number | null {
  const price = searchPrice(p, prices.quotes, prices.fromPrices, prices.nights);
  if (price === null) return null;
  return prices.nights > 0 ? price / prices.nights : price;
}

/** Every facet except the price-dependent budget when `ctx.prices` is absent. */
export function matchesFacets(p: Property, f: HomeFacets, guests: number, ctx: FacetContext): boolean {
  if (!matchesKind(p, f.kind)) return false;
  if (!matchesBedrooms(p, f.bedrooms)) return false;
  if (!matchesSleeps(p, guests)) return false;
  for (const key of FEATURE_KEYS) if (f.features[key] && !hasFeature(p, key, ctx.heatedSlugs)) return false;
  if (ctx.prices && !matchesBudget(nightlyRate(p, ctx.prices), f.budget)) return false;
  return true;
}

export interface FacetCounts {
  kind: Record<HomeKind, number>;
  bedrooms: Record<BedroomBand, number>;
  sleeps: Record<number, number>;
  budget: Record<BudgetBand, number>;
  features: Record<FeatureKey, number>;
}

/** How many homes each option would leave, given everything else that is set. */
export function countFacetOptions(list: Property[], f: HomeFacets, guests: number, ctx: FacetContext): FacetCounts {
  const n = (g: HomeFacets, sleeps = guests) => list.filter((p) => matchesFacets(p, g, sleeps, ctx)).length;
  const kind = {} as Record<HomeKind, number>;
  for (const k of ['all', ...HOME_KINDS] as HomeKind[]) kind[k] = n({ ...f, kind: k });
  const bedrooms = {} as Record<BedroomBand, number>;
  for (const b of ['all', ...BEDROOM_BANDS] as BedroomBand[]) bedrooms[b] = n({ ...f, bedrooms: b });
  const sleeps: Record<number, number> = { 0: n(f, 0) };
  for (const s of SLEEPS_STEPS) sleeps[s] = n(f, s);
  const budget = {} as Record<BudgetBand, number>;
  for (const b of ['all', ...BUDGET_BANDS] as BudgetBand[]) budget[b] = n({ ...f, budget: b });
  const features = {} as Record<FeatureKey, number>;
  for (const k of FEATURE_KEYS) features[k] = n({ ...f, features: { ...f.features, [k]: true } });
  return { kind, bedrooms, sleeps, budget, features };
}

export function activeFacetCount(f: HomeFacets, guests: number): number {
  return [
    f.kind !== 'all',
    f.bedrooms !== 'all',
    f.budget !== 'all',
    guests > 0,
    ...FEATURE_KEYS.map((k) => f.features[k]),
  ].filter(Boolean).length;
}
