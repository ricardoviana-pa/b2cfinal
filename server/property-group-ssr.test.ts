import React from 'react';
import { describe, expect, it } from 'vitest';
import superjson from 'superjson';
import { render } from '../client/src/entry-server';
import { PROPERTY_GROUPS } from '../client/src/config/propertyGroups';
import { getPropertiesForSite } from './services/properties-store';
import { getPropertyGroupUnits, groupUnitCards } from './services/property-group-units';

(globalThis as any).React = React;

describe('multi-unit property discovery in server HTML', () => {
  it.each(PROPERTY_GROUPS)('$name: renders every public unit link without the whole catalogue', async (group) => {
    const property = (await getPropertiesForSite()).find(p => p.guestyId === group.parentGuestyId)!;
    const units = await getPropertyGroupUnits(group.parentGuestyId);
    expect(units.map(p => p.guestyId)).toEqual(group.unitGuestyIds);
    expect(units.every(p => p.images.length <= 4 && !p.description && !p.reviews)).toBe(true);
    for (const lang of ['en', 'pt']) {
      const { appHtml, dehydratedState } = await render(`/${lang}/homes/${property.slug}`, {
        prefetch: {
          propertyBySlug: { slug: property.slug, data: property },
          groupUnits: { input: { parentGuestyId: group.parentGuestyId }, data: units },
        },
      });
      for (const unit of units) expect(appHtml).toContain(`href="/${lang}/homes/${unit.slug}"`);
      const cache = superjson.parse<any>(dehydratedState);
      const unitQuery = cache.queries.find((q: any) => q.queryKey[0].join('.') === 'properties.groupUnits');
      expect(unitQuery.queryKey[1].input).toEqual({ parentGuestyId: group.parentGuestyId });
      expect(unitQuery.state.data).toEqual(units);
      expect(cache.queries.some((q: any) => ['properties.catalogForSite', 'properties.listForSite'].includes(q.queryKey[0].join('.')))).toBe(false);
    }
  });

  it('drops inactive/missing units and unrelated homes, preserving configured order', () => {
    const group = PROPERTY_GROUPS[0];
    const cards = groupUnitCards(group.parentGuestyId, [
      { guestyId: group.unitGuestyIds[2], slug: 'second', isActive: true },
      { guestyId: group.unitGuestyIds[1], slug: 'inactive', isActive: false },
      { guestyId: 'not-in-this-group', slug: 'unrelated', isActive: true },
      { guestyId: group.parentGuestyId, slug: 'parent', isActive: true },
    ]);
    expect(cards.map(p => p.slug)).toEqual(['parent', 'second']);
    expect(groupUnitCards('not-a-group-parent', cards)).toEqual([]);
  });
});
