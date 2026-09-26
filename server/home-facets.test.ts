import { describe, expect, it } from 'vitest';
import { sortProperties } from '../client/src/lib/utils';
import { countFacetOptions, matchesFacets, parseHomeFacets, activeFacetCount } from '../client/src/lib/homeFacets';
import type { Property } from '../client/src/lib/types';

const home = (over: Partial<Property> & { guestyId: string }): Property => ({
  id: over.guestyId, slug: `home-${over.guestyId}`, name: `Home ${over.guestyId}`, bedrooms: 3, maxGuests: 6,
  priceFrom: 250, pricePerNight: 250, sortOrder: 0, amenities: { property: ['Outdoor pool'] }, images: [],
  ...over,
} as Property);

describe('catalogue order', () => {
  it('lists apartments after every house and villa, keeping each group in its own order', () => {
    const list = [
      home({ guestyId: 'a1', propertyType: 'Apartment', sortOrder: 1 }),
      home({ guestyId: 'v1', propertyType: 'Villa', sortOrder: 2 }),
      home({ guestyId: 'a2', propertyType: 'Apartment', sortOrder: 3 }),
      home({ guestyId: 'h1', propertyType: 'House', sortOrder: 4 }),
    ];
    expect(sortProperties(list, 'recommended').map((p) => p.guestyId)).toEqual(['v1', 'h1', 'a1', 'a2']);
    // Price sorts stay pure price.
    expect(sortProperties(list, 'price-asc')[0].guestyId).toBe('a1');
  });
});

describe('facets', () => {
  const ctx = { heatedSlugs: new Set(['home-heat']) };
  const heated = home({ guestyId: 'heat', propertyType: 'Villa', bedrooms: 5, maxGuests: 12, amenities: { property: ['Outdoor pool', 'Sea view'] }, petsAllowed: true } as any);
  const flat = home({ guestyId: 'flat', propertyType: 'Apartment', bedrooms: 2, maxGuests: 4, amenities: { property: ['Hot tub'] } });

  it('reads the URL, including the old per-type values', () => {
    const f = parseHomeFacets(new URLSearchParams('type=Villa&bedrooms=5-6&pool=1&seaView=1&sort=newest'));
    expect(f.kind).toBe('houses');
    expect(f.bedrooms).toBe('5-6');
    expect(f.features.pool && f.features.seaView && !f.features.jacuzzi).toBe(true);
    expect(f.sort).toBe('newest');
    expect(parseHomeFacets(new URLSearchParams('type=apartments')).kind).toBe('apartments');
    expect(activeFacetCount(f, 8)).toBe(5);
  });

  it('matches kind, bedrooms, sleeps and features', () => {
    const base = parseHomeFacets(new URLSearchParams());
    expect(matchesFacets(heated, { ...base, kind: 'houses' }, 0, ctx)).toBe(true);
    expect(matchesFacets(flat, { ...base, kind: 'houses' }, 0, ctx)).toBe(false);
    expect(matchesFacets(flat, { ...base, features: { ...base.features, jacuzzi: true } }, 0, ctx)).toBe(true);
    expect(matchesFacets(heated, { ...base, features: { ...base.features, heatedPool: true } }, 0, ctx)).toBe(true);
    expect(matchesFacets(flat, base, 8, ctx)).toBe(false);
    expect(matchesFacets(heated, { ...base, bedrooms: '1-2' }, 0, ctx)).toBe(false);
  });

  it('counts what each option would leave, given the rest', () => {
    const base = parseHomeFacets(new URLSearchParams('seaView=1'));
    const c = countFacetOptions([heated, flat], base, 0, ctx);
    expect(c.kind).toEqual({ all: 1, houses: 1, apartments: 0 });
    expect(c.features.pets).toBe(1);
    expect(c.sleeps[16]).toBe(0);
    expect(c.bedrooms['5-6']).toBe(1);
  });
});
