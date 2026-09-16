import { describe, it, expect } from 'vitest';
import type { Property } from '../client/src/lib/types';
import { addSearchDays, buildHomeSearchPath, hasConfirmedQuote, hasSwimmingPool, hasHeatedPool, parseHomeFilters, parseDestinationSelection, searchPrice, sortSearchResults } from '../client/src/lib/homeSearch';
const home = (slug: string, priceFrom = 100, tier = 'essential') => ({ slug, guestyId: slug, priceFrom, tier } as Property);
const ids = (homes: Property[]) => homes.map(p => p.slug);

describe('home discovery price comparisons', () => {
  const a = home('a', 900), b = home('b', 100), unknown = home('unknown');
  const quotes = {
    a: { total: 500, nightlyRate: 200, source: 'live', available: true },
    b: { total: 900, nightlyRate: 300, source: 'cached', available: true },
  };
  it('sorts dated stays by the displayed total in the chosen direction', () => {
    expect(ids(sortSearchResults([b, unknown, a], 'price-asc', quotes, undefined, 2))).toEqual(['a', 'b', 'unknown']);
    expect(ids(sortSearchResults([a, unknown, b], 'price-desc', quotes, undefined, 2))).toEqual(['b', 'a', 'unknown']);
  });
  it('keeps newest ordering when dates are supplied', () => {
    expect(ids(sortSearchResults([a, home('new', 200, 'new')], 'newest', quotes, undefined, 2))).toEqual(['new', 'a']);
  });
  it('sorts undated searches by the from-price actually displayed, not stale catalogue prices', () => {
    expect(ids(sortSearchResults([b, unknown, a], 'price-asc', {}, { a: 150, b: 450 }, 0))).toEqual(['a', 'b', 'unknown']);
    expect(searchPrice(unknown, {}, {}, 0)).toBeNull();
  });
  it('uses the total including mandatory fees for a dated nightly budget', () => {
    expect(searchPrice(a, quotes, undefined, 2)! / 2).toBe(250);
    expect(searchPrice(a, { a: { ...quotes.a, available: false } }, undefined, 2)).toBeNull();
  });
  it('never claims an estimated or unavailable quote is confirmed availability', () => {
    expect(hasConfirmedQuote(quotes.a)).toBe(true);
    expect(hasConfirmedQuote({ ...quotes.a, source: 'base' })).toBe(false);
    expect(hasConfirmedQuote({ ...quotes.a, available: false })).toBe(false);
    expect(hasConfirmedQuote({ ...quotes.a, available: undefined })).toBe(false);
    expect(hasConfirmedQuote(null)).toBe(false);
  });
  it('uses supplier IDs for undated partner prices and never substitutes the import', () => {
    const partner = { ...home('partner', 1000), guestyId: null, supplierUid: 'supplier-one', source: 'tripwix' } as Property;
    expect(searchPrice(partner, {}, { 'supplier-one': 1299 }, 0)).toBe(1299);
    expect(searchPrice(partner, {}, {}, 0)).toBeNull();
  });
  it('keeps accommodation-only partner quotes out of final-total comparisons', () => {
    const q = { total: 5198.24, nightlyRate: 1299.56, source: 'partner_calendar', available: true, feesKnown: false };
    expect(searchPrice(a, { a: q }, undefined, 4)).toBeNull();
    expect(searchPrice(a, { a: { ...q, feesKnown: true } }, undefined, 4)).toBe(5198.24);
    expect(hasConfirmedQuote(q)).toBe(false);
  });
});

describe('home search filters', () => {
  it('keeps region choices distinct from cities and clears the previous region', () => {
    expect(parseDestinationSelection('region:algarve')).toEqual({ destination: 'algarve', location: '' });
    expect(parseDestinationSelection('Porto')).toEqual({ destination: '', location: 'Porto' });
    expect(parseDestinationSelection('')).toEqual({ destination: '', location: '' });
    expect(parseDestinationSelection('region:invalid')).toEqual({ destination: '', location: '' });
  });
  it('round-trips every filter through a shareable URL', () => {
    const q = new URLSearchParams('bedrooms=7%2B&pool=1&heatedPool=1&pets=1&type=Villa&budget=b2&sort=price-asc');
    expect(parseHomeFilters(q)).toEqual({ type:'Villa', budget:'b2', bedrooms:'7+', pool:true, heatedPool:true, pets:true, sort:'price-asc' });
  });
  it('ignores unsupported values and restores the recommended default', () => {
    expect(parseHomeFilters(new URLSearchParams('sort=invalid&budget=cheap&bedrooms=90&type=Invalid&pool=false'))).toEqual({ type:'all', budget:'all', bedrooms:'all', pool:false, heatedPool:false, pets:false, sort:'recommended' });
  });
  it('does not mistake a pool table or pool view for a swimming pool', () => {
    expect(hasSwimmingPool(['Pool table', 'Pool view'])).toBe(false);
    expect(hasSwimmingPool(['Outdoor pool'])).toBe(true);
    expect(hasSwimmingPool(['Private swimming pool'])).toBe(true);
  });
  it('does not mistake heating in the house for a heated pool', () => {
    expect(hasHeatedPool('Heated floors and outdoor pool')).toBe(false);
    expect(hasHeatedPool('Heated swimming pool')).toBe(true);
    expect(hasHeatedPool('The pool is heated')).toBe(true);
  });
});


describe('homepage search submission', () => {
  it('preserves dates, guests and accented city names in the homes URL', () => {
    const url = new URL(buildHomeSearchPath({ destination: 'Viana do Castelo', checkin: '2026-10-24', checkout: '2026-10-26', guests: 6 }), 'https://example.test');
    expect(url.pathname).toBe('/homes');
    expect(Object.fromEntries(url.searchParams)).toEqual({ location: 'Viana do Castelo', checkin: '2026-10-24', checkout: '2026-10-26', guests: '6' });
    expect(new URL(buildHomeSearchPath({ destination: 'Caminhã', checkin: '', checkout: '', guests: 2 }), 'https://example.test').searchParams.get('location')).toBe('Caminhã');
  });
  it('permits flexible-date browsing without empty parameters', () => {
    expect(buildHomeSearchPath({ destination: '', checkin: '', checkout: '', guests: 1 })).toBe('/homes');
  });
  it('advances correctly through DST, year end and leap day', () => {
    expect(addSearchDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addSearchDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addSearchDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
