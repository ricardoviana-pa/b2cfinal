import { describe, expect, it } from 'vitest';
import { toCatalogCard, recentGuestFeedback } from './services/property-catalog';

describe('public catalogue cards', () => {
  it('keeps filter, group and display data without the full listing or precise address', () => {
    const card = toCatalogCard({ id: 'one', slug: 'villa', bedrooms: 7, petsAllowed: true,
      amenities: { outdoor: ['Heated pool'] }, groupId: 'group', unitOf: 'parent',
      images: ['1', '2', '3', '4', '5'], description: 'long', reviews: [{ text: 'private detail' }],
      address: { lat: 41.123456, lng: -8.654321, street: 'Exact street' }, internalNotes: 'private',
    });
    expect(card).toMatchObject({ bedrooms: 7, petsAllowed: true, groupId: 'group', unitOf: 'parent', amenities: { outdoor: ['Heated pool'] } });
    expect(card.images).toHaveLength(4);
    expect(card.address).toEqual({ lat: 41.123, lng: -8.654 });
    expect(card).not.toHaveProperty('description');
    expect(card).not.toHaveProperty('reviews');
    expect(card).not.toHaveProperty('internalNotes');
  });
  it('handles missing images and invalid coordinates', () => {
    expect(toCatalogCard({ slug: 'partner', address: { lat: null, lng: 2 } })).toEqual({ slug: 'partner', images: [], amenities: {} });
  });
});


describe('recent public feedback', () => {
  it('keeps lower ratings, picks the latest feedback per published home and limits the result', () => {
    const review = (rating: number, date: string, text = 'A useful detailed account of our stay') => ({ rating, date, text, guestName: 'Ana Silva' });
    const result = recentGuestFeedback([
      { slug: 'hidden', isActive: false, reviews: [review(5, '2026-09-15')] },
      { slug: 'one', reviews: [review(5, '2026-07-01'), review(2, '2026-09-14')] },
      { slug: 'two', reviews: [review(4, '2026-09-13')] },
      { slug: 'three', reviews: [review(3, '2026-09-12')] },
      { slug: 'four', reviews: [review(4, '2026-09-11')] },
      { slug: 'five', reviews: [review(5, '2026-09-10')] },
      { slug: 'invalid', reviews: [review(9, '2026-09-15'), review(5, '2026-09-15', 'OK')] },
    ]);
    expect(result.map(r => r.property.slug)).toEqual(['one', 'two', 'three', 'four']);
    expect(result[0]).toMatchObject({ rating: 2, guestName: 'Ana' });
  });
});
