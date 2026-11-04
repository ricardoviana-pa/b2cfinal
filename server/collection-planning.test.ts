import React from 'react';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '../client/src/entry-server';
import { selectCollectionHomes, collectionUnitOptionCount } from '../client/src/lib/collectionHomes';
import { collectionUnitOptionsLabel } from '../client/src/data/collectionPlanning';
import { PROPERTY_GROUPS } from '../client/src/config/propertyGroups';
import type { Property } from '../client/src/lib/types';

(globalThis as any).React = React;
const definition = { slug: 'large-group-villas', filter: { type: 'minGuests', min: 12 } };
const fountain = PROPERTY_GROUPS.find(group => group.name === 'Fountain Retreat')!;
const home = (slug: string, fields: Partial<Property> = {}) => ({
  id: slug, slug, name: slug, guestyId: slug, destination: 'minho', locality: 'Viana do Castelo',
  maxGuests: 12, bedrooms: 6, bathrooms: 5, propertyType: 'House', isActive: true,
  images: ['/images/destinations/minho-coast.webp'], amenities: { outdoors: ['Pool'] },
  ...fields,
} as Property);

describe('large-group collection selection', () => {
  it('prioritizes direct homes, retains other fitting homes and does not mutate the source', () => {
    const input = [home('other', { guestyId: undefined, source: 'tripwix', supplierUid: 'other' }), home('direct')];
    expect(selectCollectionHomes(input, definition).map(property => property.slug)).toEqual(['direct', 'other']);
    expect(input.map(property => property.slug)).toEqual(['other', 'direct']);
  });

  it('a party of 20 sees only listings with that advertised capacity, never summed unit capacities', () => {
    const input = [
      home('nineteen', { maxGuests: 19 }), home('twenty', { maxGuests: 20 }),
      home('parent-sixteen', { guestyId: fountain.parentGuestyId, maxGuests: 16 }),
      home('child-twelve', { guestyId: fountain.unitGuestyIds[1], maxGuests: 12 }),
      home('closed', { maxGuests: 28, isActive: false }),
      home('other-thirty', { guestyId: undefined, source: 'tripwix', supplierUid: 'other', maxGuests: 30 }),
    ];
    expect(selectCollectionHomes(input, definition, 20).map(property => property.slug)).toEqual(['twenty', 'other-thirty']);
    expect(selectCollectionHomes(input, definition, 100)).toEqual([]);
  });

  it('keeps the 12-guest threshold and does not apply group rules to another collection', () => {
    const input = [home('eleven', { maxGuests: 11 }), home('twelve')];
    expect(selectCollectionHomes(input, definition, 4).map(property => property.slug)).toEqual(['twelve']);
    expect(selectCollectionHomes(input, { slug: 'villas-with-private-pool', filter: { type: 'amenity' } }, 20).map(property => property.slug)).toEqual(['eleven', 'twelve']);
  });

  it('the unit-option count excludes the whole-property listing and is not a capacity total', () => {
    const parent = home('whole-property', { guestyId: fountain.parentGuestyId, maxGuests: 28 });
    expect(collectionUnitOptionCount(parent)).toBe(5);
    expect(parent.maxGuests).toBe(28);
    expect(collectionUnitOptionCount(home('single'))).toBe(0);
    expect(collectionUnitOptionsLabel('en', 5)).toBe('5 unit options');
    expect(collectionUnitOptionsLabel('pt', 5)).toBe('5 opções de unidade');
  });
});

describe('large-group collection SSR and safe booking links', () => {
  const group = home('whole-property', { guestyId: fountain.parentGuestyId, maxGuests: 28, bedrooms: 12, bathrooms: 13 });
  const properties = [
    home('other-thirty', { guestyId: undefined, source: 'tripwix', supplierUid: 'other', maxGuests: 30 }),
    home('too-small', { maxGuests: 19 }), group,
    home('individual-unit', { guestyId: fountain.unitGuestyIds[1], maxGuests: 14 }),
  ];
  it.each(['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'])('%s preserves dates and 20 guests, with factual group labels', async locale => {
    const { appHtml } = await render(`/${locale}/collections/large-group-villas?checkin=2027-05-10&checkout=2027-05-17&guests=20&token=private`, {
      prefetch: { catalogForSite: properties, fromPrices: { prices: { [group.guestyId!]: 500 }, at: Date.now() } },
    });
    const trip = 'checkin=2027-05-10&amp;checkout=2027-05-17&amp;guests=20';
    expect(appHtml).toContain(`href="/${locale}/homes/whole-property?${trip}"`);
    expect(appHtml).toContain(`href="/${locale}/homes?collection=large-group-villas&amp;${trip}"`);
    expect(appHtml).not.toContain(`href="/${locale}/homes/too-small`);
    expect(appHtml).not.toContain(`href="/${locale}/homes/individual-unit`);
    expect(appHtml.indexOf(`href="/${locale}/homes/whole-property?`)).toBeLessThan(appHtml.indexOf(`href="/${locale}/homes/other-thirty?`));
    expect(appHtml).not.toContain('token=private');
    expect(appHtml).toContain(collectionUnitOptionsLabel(locale, 5));
    const labels = JSON.parse(fs.readFileSync(`client/src/i18n/locales/${locale}.json`, 'utf8'));
    const misleading = (labels.property.unitsAvailable_other ?? labels.property.unitsAvailable).replace('{{count}}', '6');
    expect(appHtml).not.toContain(misleading);
    const visibleText = appHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(visibleText).toContain('Fountain Retreat 28 12 13');
    if (['en', 'pt'].includes(locale)) {
      expect(appHtml).toContain(`href="/${locale}/contact?subject=plan-my-stay&amp;collection=large-group-villas&amp;${trip}"`);
    }
  });
});
