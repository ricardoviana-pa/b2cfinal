/**
 * The review quoted under the home's key features (lib/featuredReview.ts) and
 * the curated photo order for the page's grid and bedroom cards
 * (config/propertyPhotos.ts).
 */
import { describe, expect, it } from 'vitest';
import { excerpt, pickFeaturedReview } from '@/lib/featuredReview';
import { curatedImageOrder, roomPhotoIndex } from '@/config/propertyPhotos';

describe('featured review', () => {
  const reviews = [
    { rating: 5, text: 'Great.', date: '2026-10-01' },
    { rating: 4, text: 'A lovely house with a wonderful pool, we would come back any time without a doubt.', date: '2026-09-20' },
    { rating: 5, text: 'We found it on Airbnb and the villa was spotless, the pool warm and the team always a message away.', date: '2026-09-25' },
    { rating: 5, text: 'The house is even better than the photos. The pool and the view over the valley were unforgettable, and the concierge arranged a chef for our last night.', date: '2026-08-14', guestDisplayName: 'Sophie' },
    { rating: 5, text: 'Perfect week for our family of ten: space for everyone, a kitchen that cooked for all of us and a pool the kids never left.', date: '2026-07-02' },
  ];

  it('quotes the newest five-star review with real words, never a channel name or a four-star one', () => {
    const r = pickFeaturedReview(reviews)!;
    expect(r.name).toBe('Sophie');
    expect(r.date).toBe('2026-08-14');
    expect(r.text).toBe('The house is even better than the photos. The pool and the view over the valley were unforgettable, and the concierge arranged a chef for our last night.');
  });

  it('cuts a long review at the end of a sentence, else at a clause with an ellipsis', () => {
    const long = 'The house is even better than the photos. The pool and the view over the valley were unforgettable, and the concierge arranged a chef for our last night.';
    // a sentence end past 60% of the limit wins; else the last clause, with an ellipsis
    expect(excerpt(long, 60)).toBe('The house is even better than the photos.');
    expect(excerpt(long, 100)).toBe('The house is even better than the photos. The pool and the view over the valley were unforgettable…');
    expect(excerpt('A lovely house with a wonderful pool, we would come back any time without a doubt and bring friends', 60)).toBe('A lovely house with a wonderful pool, we would come back…');
    expect(excerpt('short', 60)).toBe('short');
  });

  it('is nothing when there is nothing worth quoting', () => {
    expect(pickFeaturedReview(undefined)).toBeNull();
    expect(pickFeaturedReview([{ rating: 5, text: 'Great.' }])).toBeNull();
  });
});

describe('curated photos', () => {
  const images = ['a', 'b', 'c', 'd', 'e', 'f'];
  it('puts the curated photos first and keeps the rest in catalogue order', () => {
    expect(curatedImageOrder(images, [3, 0, 5])).toEqual(['d', 'a', 'f', 'b', 'c', 'e']);
    expect(curatedImageOrder(images, [3, 3, 9, -1])).toEqual(['d', 'a', 'b', 'c', 'e', 'f']);
    expect(curatedImageOrder(images)).toBe(images);
    expect(curatedImageOrder(images, [42])).toBe(images);
  });
  it('reads a bedroom photo by catalogue index, or none', () => {
    expect(roomPhotoIndex({ rooms: [2, null, 7] }, 0, 6)).toBe(2);
    expect(roomPhotoIndex({ rooms: [2, null, 7] }, 1, 6)).toBeNull();
    expect(roomPhotoIndex({ rooms: [2, null, 7] }, 2, 6)).toBeNull();
    expect(roomPhotoIndex(undefined, 0, 6)).toBeNull();
  });
});
