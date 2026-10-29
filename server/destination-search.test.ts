import { describe, expect, it } from 'vitest';
import { buildDestinationOptions, isListedHome, localityLabel, matchesSearchRegion, parseSearchRegion, regionOfDestination, SEARCH_REGIONS } from '@/lib/destinationSearch';
import { buildHomeSearchPath, parseDestinationSelection } from '@/lib/homeSearch';
import { filterProperties } from '@/lib/utils';
import { isChildUnit, PROPERTY_GROUPS } from '@/config/propertyGroups';
import type { Property } from '@/lib/types';
import { getPropertiesForDestination, getPropertiesForSite, catalogProperties, getSiteLocalities } from './services/properties-store';
import { destinationHomesHref } from '@shared/destinationNavigation';
import { listedDestinationHomes } from '@/lib/destinationHomes';

// Auditoria 29 out, ux-home-plp-05: one list of destination choices for the
// homepage and the listing, regions first with counts; "Douro" and "Porto and
// Douro" must find the Douro homes; no default guests=2 in the URL.

/** The listing's own filtering (Homes.tsx): municipality wins over region. */
function listingResults(homes: Property[], params: URLSearchParams): Property[] {
  const location = params.get('location') || 'all';
  const region = parseSearchRegion(params.get('destination'));
  return filterProperties(homes, 'all', 'all', undefined, undefined, undefined, 'all', location)
    .filter((p) => location !== 'all' || !region || matchesSearchRegion(p.destination, region))
    .filter((p) => !isChildUnit(p.guestyId));
}

describe('region parsing', () => {
  it('accepts every region the pickers offer, douro and silver-coast included', () => {
    for (const r of SEARCH_REGIONS) {
      expect(parseSearchRegion(r)).toBe(r);
      expect(parseDestinationSelection(`region:${r}`)).toEqual({ destination: r, location: '' });
    }
    expect(parseSearchRegion('DOURO')).toBe('douro');
    expect(parseSearchRegion('')).toBeNull();
    expect(parseSearchRegion(null)).toBeNull();
    expect(parseSearchRegion('narnia')).toBeNull();
    expect(parseDestinationSelection('region:narnia')).toEqual({ destination: '', location: '' });
    expect(parseDestinationSelection('carreco')).toEqual({ destination: '', location: 'carreco' });
  });

  it('a region covers its spokes: Porto and Douro includes the Douro, the Douro alone does not include Porto', () => {
    expect(regionOfDestination('douro')).toBe('porto');
    expect(regionOfDestination('caminha')).toBe('minho');
    expect(regionOfDestination('silver-coast')).toBe('silver-coast');
    expect(matchesSearchRegion('douro', 'porto')).toBe(true);
    expect(matchesSearchRegion('porto', 'porto')).toBe(true);
    expect(matchesSearchRegion('porto', 'douro')).toBe(false);
    expect(matchesSearchRegion('douro', 'douro')).toBe(true);
    expect(matchesSearchRegion('lisbon', 'porto')).toBe(false);
    expect(matchesSearchRegion('silver-coast', 'silver-coast')).toBe(true);
    expect(matchesSearchRegion(undefined, 'porto')).toBe(false);
  });
});

describe('homepage search URL', () => {
  it('sends a region as destination= and a municipality as location=', () => {
    expect(buildHomeSearchPath({ destination: 'region:algarve', checkin: '', checkout: '', guests: 0 })).toBe('/homes?destination=algarve');
    expect(buildHomeSearchPath({ destination: 'region:douro', checkin: '2027-07-10', checkout: '2027-07-17', guests: 0 }))
      .toBe('/homes?destination=douro&checkin=2027-07-10&checkout=2027-07-17');
    expect(buildHomeSearchPath({ destination: 'albufeira', checkin: '', checkout: '', guests: 0 })).toBe('/homes?location=albufeira');
    expect(buildHomeSearchPath({ destination: 'region:narnia', checkin: '', checkout: '', guests: 0 })).toBe('/homes');
  });

  it('never writes the default party size; a chosen one is kept', () => {
    // HeroSearch passes 0 until the guest touches the picker.
    expect(buildHomeSearchPath({ destination: '', checkin: '', checkout: '', guests: 0 })).toBe('/homes');
    expect(buildHomeSearchPath({ destination: '', checkin: '', checkout: '', guests: 6 })).toBe('/homes?guests=6');
  });
});

describe('destination options model', () => {
  const localities = [
    { label: 'Viana do Castelo', value: 'viana-do-castelo', group: 'Minho', groupSlug: 'minho' },
    { label: 'Carreço', value: 'carreco', group: 'Minho', groupSlug: 'minho' },
    { label: 'Trofa', value: 'trofa', group: 'Porto', groupSlug: 'porto' },
    { label: 'Douro', value: 'douro', group: 'Douro', groupSlug: 'douro' },
    { label: 'Albufeira', value: 'albufeira', group: 'Algarve', groupSlug: 'algarve' },
    { label: 'Pataias', value: 'pataias' },
  ];
  const child = PROPERTY_GROUPS[0].unitGuestyIds[1];
  const homes = [
    { destination: 'minho', locality: 'Viana do Castelo', guestyId: 'a' },
    { destination: 'minho', locality: 'Carreço', guestyId: child },
    { destination: 'minho', locality: 'Carreço', guestyId: 'b', isActive: false },
    { destination: 'porto', locality: 'Trofa', guestyId: 'c' },
    { destination: 'douro', locality: 'Douro', guestyId: null },
    { destination: 'douro', locality: 'Douro', guestyId: null },
    { destination: 'algarve', locality: 'Albufeira', guestyId: null },
    { destination: 'silver-coast', locality: 'Pataias', guestyId: 'd' },
  ];

  it('lists regions first, with the number of listing cards each opens', () => {
    const model = buildDestinationOptions(localities, homes);
    expect(model.regions).toEqual([
      { region: 'minho', value: 'region:minho', count: 1 },   // child unit and inactive home not counted
      { region: 'porto', value: 'region:porto', count: 3 },   // Porto and Douro: Trofa + the two Douro homes
      { region: 'douro', value: 'region:douro', count: 2 },
      { region: 'algarve', value: 'region:algarve', count: 1 },
    ]);
    // Silver Coast has no destination page: no region choice, its municipality still there.
    expect(model.regions.some((r) => r.region === 'silver-coast')).toBe(false);
  });

  it('groups municipalities under their region, spokes under their hub, sorted by region then name', () => {
    const model = buildDestinationOptions(localities, homes);
    expect(model.groups.map((g) => [g.region, g.options.map((o) => o.value)])).toEqual([
      ['minho', ['carreco', 'viana-do-castelo']],
      ['porto', ['douro', 'trofa']],
      ['algarve', ['albufeira']],
      ['silver-coast', ['pataias']],
    ]);
  });

  it('while the catalogue loads, offers the regions the localities prove exist, without counts', () => {
    const model = buildDestinationOptions(localities, null);
    expect(model.regions.map((r) => [r.region, r.count])).toEqual([['minho', null], ['porto', null], ['douro', null], ['algarve', null]]);
    expect(model.groups.at(-1)).toEqual({ region: null, options: [{ value: 'pataias', label: 'Pataias' }] });
  });

  it('labels municipalities by their real name, not the URL slug', () => {
    expect(localityLabel(localities, 'carreco')).toBe('Carreço');
    expect(localityLabel(localities, 'quinta-do-lago')).toBe('Quinta Do Lago');
    expect(isListedHome({ isActive: false })).toBe(false);
  });
});

describe('the repository catalogue', () => {
  it('every region choice opens exactly the homes its count promises, and Porto and Douro includes the Douro homes', async () => {
    const homes = catalogProperties(await getPropertiesForSite()) as Property[];
    const model = buildDestinationOptions(await getSiteLocalities(), homes);
    expect(model.regions.length).toBeGreaterThanOrEqual(6);
    for (const r of model.regions) {
      const results = listingResults(homes, new URLSearchParams({ destination: r.region }));
      expect(results.length, r.region).toBe(r.count);
    }
    const douro = listingResults(homes, new URLSearchParams({ destination: 'douro' }));
    const portoAndDouro = listingResults(homes, new URLSearchParams({ destination: 'porto' }));
    expect(douro.length).toBeGreaterThan(0);
    expect(douro.every((p) => portoAndDouro.includes(p))).toBe(true);
    // Before: destination=douro fell back to every home.
    expect(douro.length).toBeLessThan(listingResults(homes, new URLSearchParams()).length);
  });

  it('a destination page and its "view all" listing agree on the homes (the strip count)', async () => {
    const homes = catalogProperties(await getPropertiesForSite()) as Property[];
    for (const slug of ['algarve', 'lisbon', 'alentejo', 'douro', 'caminha']) {
      const pageHomes = listedDestinationHomes(await getPropertiesForDestination(slug) as Property[]);
      const href = destinationHomesHref({ slug, region: regionOfDestination(slug) });
      const listing = listingResults(homes, new URL(href, 'https://x.test').searchParams);
      expect(listing.length, `${slug} → ${href}`).toBe(pageHomes.length);
    }
  });
});
