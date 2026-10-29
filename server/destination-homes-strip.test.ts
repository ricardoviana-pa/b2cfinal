import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { listedDestinationHomes, visibleDestinationHomes } from '@/lib/destinationHomes';
import { PROPERTY_GROUPS } from '@/config/propertyGroups';
import { featuredDestinationHomes } from '@/data/destination-discovery';

// Auditoria 29 out, ux-home-plp-04: the destination guides show their homes
// right under the hero instead of ~14 screens down, without a second set of
// price requests.

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('which homes a destination block shows', () => {
  const group = PROPERTY_GROUPS[0];
  const homes = [
    { guestyId: group.parentGuestyId, slug: 'parent' },
    { guestyId: group.unitGuestyIds[1], slug: 'unit' },
    { guestyId: 'x1', slug: 'one' },
    { guestyId: 'x2', slug: 'off', isActive: false },
    ...Array.from({ length: 6 }, (_, i) => ({ guestyId: null, slug: `partner-${i}` })),
  ];

  it('folds group units into the group card and leaves out unpublished homes', () => {
    expect(listedDestinationHomes(homes).map((h) => h.slug)).toEqual(['parent', 'one', ...Array.from({ length: 6 }, (_, i) => `partner-${i}`)]);
  });

  it('shows at most six in the listing order (apartments last); the editor picks lead when featured', () => {
    expect(visibleDestinationHomes(homes, { slug: 'algarve' }).map((h) => h.slug)).toEqual(['parent', 'one', 'partner-0', 'partner-1', 'partner-2', 'partner-3']);
    const flat = { guestyId: null, slug: 'flat', propertyType: 'Apartment' };
    const villa = { guestyId: null, slug: 'villa', propertyType: 'Villa' };
    expect(visibleDestinationHomes([flat, villa], { slug: 'lisbon' }).map((h) => h.slug)).toEqual(['villa', 'flat']);
    const pick = featuredDestinationHomes.minho[0].id;
    const withPick = [{ guestyId: 'first' }, { guestyId: pick }, { guestyId: 'third' }];
    expect(visibleDestinationHomes(withPick, { slug: 'minho', featured: true })[0].guestyId).toBe(pick);
  });

  it('returns the same array contents for the strip and the section, so their price query key is the same', () => {
    const a = visibleDestinationHomes(homes, { slug: 'lisbon' });
    const b = visibleDestinationHomes([...homes], { slug: 'lisbon' });
    expect(a.map((h) => h.guestyId)).toEqual(b.map((h) => h.guestyId));
  });
});

describe('placement in the destination guide', () => {
  const guide = read('client/src/components/destinations/DestinationVisualGuide.tsx');
  const strip = read('client/src/components/destinations/DestinationHomesStrip.tsx');
  const sections = read('client/src/components/destinations/sections.tsx');

  it('renders the strip after the hero and its chapters, before the first editorial chapter', () => {
    const stripAt = guide.indexOf('<DestinationHomesStrip');
    expect(stripAt).toBeGreaterThan(guide.indexOf('className="minho-chapters"'));
    expect(stripAt).toBeLessThan(guide.indexOf('id="destination-first-visit"'));
  });

  it('gives the strip the same homes and "view all" target as the main homes section', () => {
    expect(guide).toMatch(/<DestinationHomesStrip[\s\S]*?properties=\{cityHomes\}[\s\S]*?viewAllHref=\{d\.slug === "porto" \? "\/homes\?location=porto" : undefined\}/);
    expect(guide).toMatch(/<WhereToStay\s+destination=\{d\}\s+properties=\{cityHomes\}[\s\S]*?viewAllHref=\{d\.slug === "porto" \? "\/homes\?location=porto" : undefined\}/);
  });

  it('both blocks pick their homes with the same function (one price request)', () => {
    expect(strip).toMatch(/visibleDestinationHomes\(properties, \{ slug: d\.slug \}\)/);
    expect(sections).toMatch(/visibleDestinationHomes\(properties, \{ slug: d\.slug, featured \}\)/);
  });

  it('shows real "from" prices, not catalogue placeholders', () => {
    expect(strip).toMatch(/trpc\.booking\.lowestNightlyBatch\.useQuery/);
    expect(strip).toMatch(/usePartnerPrices\(visible\)/);
    expect(strip).toMatch(/fromPrice=\{p\.supplierUid \? partner\.prices\[p\.supplierUid\] : fromPrices\?\.\[p\.guestyId \?\? ''\]\}/);
  });
});
