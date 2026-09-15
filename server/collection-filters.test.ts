import { describe, expect, it } from 'vitest';
import { matchesCollection } from '../client/src/lib/collectionFilters';
describe('collection membership', () => {
  it('uses the actual pet policy, not an incidental mention', () => {
    const def = { slug: 'pet-friendly-villas', filter: { type: 'amenity' } };
    expect(matchesCollection({ petsAllowed: true }, def)).toBe(true);
    expect(matchesCollection({ petsAllowed: false, amenities: { other: ['Pet friendly neighbourhood'] } }, def)).toBe(false);
  });
  it('does not mistake a pool table or view for a pool', () => {
    const def = { slug: 'villas-with-private-pool', filter: { type: 'amenity' }, excludeApartments: true };
    expect(matchesCollection({ amenities: { leisure: ['Pool table', 'Pool view'] } }, def)).toBe(false);
    expect(matchesCollection({ amenities: { leisure: ['Private swimming pool'] } }, def)).toBe(true);
    expect(matchesCollection({ propertyType: 'Apartment', amenities: { leisure: ['Pool'] } }, def)).toBe(false);
  });
  it('matches group size at the advertised threshold', () => {
    const def = { slug: 'large-group-villas', filter: { type: 'minGuests', min: 12 } };
    expect(matchesCollection({ maxGuests: 11 }, def)).toBe(false);
    expect(matchesCollection({ maxGuests: 12 }, def)).toBe(true);
  });
});
