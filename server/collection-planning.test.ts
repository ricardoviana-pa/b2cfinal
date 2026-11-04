import React from 'react';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '../client/src/entry-server';
import { selectCollectionHomes, collectionUnitOptionCount } from '../client/src/lib/collectionHomes';
import { collectionUnitOptionsLabel, collectionCapacityCopy } from '../client/src/data/collectionPlanning';
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
    expect(appHtml).toContain(labels.collections.checkAvailability);
    const primaryCta = appHtml.match(/<a\b[^>]*class="btn-primary text-center"[^>]*>/)?.[0];
    expect(primaryCta).toContain('style="text-transform:none"');
    expect(appHtml).not.toContain(`>${labels.property.checkAvailability}<`);
    const misleading = (labels.property.unitsAvailable_other ?? labels.property.unitsAvailable).replace('{{count}}', '6');
    expect(appHtml).not.toContain(misleading);
    const visibleText = appHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(visibleText).toContain('Fountain Retreat 28 12 13');
    const capacity = collectionCapacityCopy(locale, 20, 12);
    expect(visibleText).toContain(capacity.context);
    expect(visibleText).toContain(capacity.reset);
    const reset = appHtml.match(new RegExp(`href="(/${locale}/collections/large-group-villas[^\"]*)"[^>]*>\\s*${capacity.reset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(reset?.[1]).toBe(`/${locale}/collections/large-group-villas?checkin=2027-05-10&amp;checkout=2027-05-17`);
    if (['en', 'pt'].includes(locale)) {
      expect(appHtml).toContain(`href="/${locale}/contact?subject=plan-my-stay&amp;collection=large-group-villas&amp;${trip}"`);
      const secondaryCta = appHtml.match(/<a\b[^>]*class="btn-ghost text-center"[^>]*>/)?.[0];
      expect(secondaryCta).toContain('style="text-transform:none"');
    }
  });

  it.each(['', '?guests=12', '?guests=4', '?guests=101', '?guests=twenty'])('default or invalid capacity does not add a reset control: %s', async query => {
    const { appHtml } = await render(`/en/collections/large-group-villas${query}`, {
      prefetch: { catalogForSite: properties },
    });
    expect(appHtml).not.toContain('Showing homes with capacity');
    expect(appHtml).not.toContain('See all homes for 12+ guests');
    expect(appHtml).toContain('href="/en/homes/too-small');
  });

  it('an empty filtered result retains a visible reset; its URL restores the full collection and valid dates only', async () => {
    const { appHtml } = await render('/pt/collections/large-group-villas?guests=40&checkin=2027-05-10&checkout=2027-05-17&token=private&unknown=value', {
      prefetch: { catalogForSite: properties },
    });
    expect(appHtml).toContain('A mostrar casas com capacidade para 40 hóspedes');
    expect(appHtml).toContain('Ver todas as casas para 12 ou mais hóspedes');
    const href = '/pt/collections/large-group-villas?checkin=2027-05-10&amp;checkout=2027-05-17';
    expect(appHtml).toContain(`href="${href}"`);
    expect(appHtml).not.toContain('href="/pt/homes/whole-property');
    expect(appHtml).not.toContain('token=private');
    expect(appHtml).not.toContain('unknown=value');
    const reset = await render(href.replaceAll('&amp;', '&'), { prefetch: { catalogForSite: properties } });
    expect(reset.appHtml).not.toContain('A mostrar casas com capacidade');
    expect(reset.appHtml).toContain('href="/pt/homes/too-small?checkin=2027-05-10&amp;checkout=2027-05-17"');
  });

  it('reset drops invalid dates and another collection does not inherit the group capacity context', async () => {
    const empty = await render('/en/collections/large-group-villas?guests=40&checkin=2027-05-17&checkout=2027-05-10&token=private', {
      prefetch: { catalogForSite: properties },
    });
    expect(empty.appHtml).toContain('href="/en/collections/large-group-villas"');
    const other = await render('/en/collections/villas-with-private-pool?guests=20', {
      prefetch: { catalogForSite: properties },
    });
    expect(other.appHtml).not.toContain('Showing homes with capacity');
    expect(other.appHtml).not.toContain('See all homes for 12+ guests');
  });
});
