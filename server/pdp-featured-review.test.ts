/**
 * The review quoted under the home's key features (lib/featuredReview.ts) and
 * the curated photo order for the page's grid and bedroom cards
 * (config/propertyPhotos.ts).
 *
 * The quote is a ranking, not a 5★ bar (every rating is published since
 * 29 out 2026): best rating first, newest among equals, nothing below 4★, and
 * it carries its own rating so the page draws the right stars.
 */
import { describe, expect, it } from 'vitest';
import { MIN_FEATURED_RATING, excerpt, pickFeaturedReview } from '@/lib/featuredReview';
import { curatedImageOrder, roomPhotoIndex } from '@/config/propertyPhotos';

describe('featured review', () => {
  const reviews = [
    { rating: 5, text: 'Great.', date: '2026-10-01' },
    { rating: 4, text: 'A lovely house with a wonderful pool, we would come back any time without a doubt.', date: '2026-09-20' },
    { rating: 5, text: 'We found it on Airbnb and the villa was spotless, the pool warm and the team always a message away.', date: '2026-09-25' },
    { rating: 5, text: 'The house is even better than the photos. The pool and the view over the valley were unforgettable, and the concierge arranged a chef for our last night.', date: '2026-08-14', guestDisplayName: 'Sophie' },
    { rating: 5, text: 'Perfect week for our family of ten: space for everyone, a kitchen that cooked for all of us and a pool the kids never left.', date: '2026-07-02' },
  ];

  it('quotes the best-rated, newest review with real words, never a channel name, and carries its rating', () => {
    const r = pickFeaturedReview(reviews)!;
    expect(r.name).toBe('Sophie');
    expect(r.date).toBe('2026-08-14');
    expect(r.rating).toBe(5);
    expect(r.text).toBe('The house is even better than the photos. The pool and the view over the valley were unforgettable, and the concierge arranged a chef for our last night.');
  });

  it('ranks the rating above the date: an older 5★ beats a newer 4★', () => {
    const r = pickFeaturedReview([
      { rating: 4, text: 'A lovely house with a wonderful pool, we would come back any time without a doubt.', date: '2026-09-20' },
      { rating: 5, text: 'Perfect week for our family of ten: space for everyone, a kitchen that cooked for all of us and a pool the kids never left.', date: '2026-07-02' },
    ])!;
    expect(r.rating).toBe(5);
    expect(r.date).toBe('2026-07-02');
  });

  it('falls back to the newest 4★ review when no 5★ one is quotable, with four stars', () => {
    const r = pickFeaturedReview([
      { rating: 5, text: 'Great.', date: '2026-10-01' },
      { rating: 4, text: 'An older stay, still a lovely house with a wonderful pool and a kitchen made for long dinners.', date: '2026-05-02', guestDisplayName: 'Marta' },
      { rating: 4, text: 'A lovely house with a wonderful pool, we would come back any time without a doubt.', date: '2026-09-20', guestDisplayName: 'Jonas' },
      { rating: 3, text: 'The house is fine and the view is lovely, but the pool heating did not work for our whole week there.', date: '2026-09-28' },
    ])!;
    expect(r.name).toBe('Jonas');
    expect(r.rating).toBe(4);
  });

  it(`quotes nothing below ${MIN_FEATURED_RATING}★, nor a rating that is not one`, () => {
    expect(MIN_FEATURED_RATING).toBe(4);
    expect(pickFeaturedReview([
      { rating: 3, text: 'The house is fine and the view is lovely, but the pool heating did not work for our whole week there.', date: '2026-09-28' },
      { rating: 3.5, text: 'Comfortable beds and a kind welcome; the kitchen could use more pans and the wifi dropped in the evenings.', date: '2026-08-01' },
      { rating: 0, text: 'The house is even better than the photos. The pool and the view over the valley were unforgettable.', date: '2026-08-14' },
      { text: 'The house is even better than the photos. The pool and the view over the valley were unforgettable.', date: '2026-08-14' },
    ])).toBeNull();
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
