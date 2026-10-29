/* ==========================================================================
   Which listing photos load first (auditoria out/2026, performance-03-plp-lcp-lazy).

   On /homes and the collection pages the first card's photo is the mobile
   LCP element, and every card photo used to be loading=lazy +
   fetchpriority=low, so it was requested late, at low priority, behind the
   JavaScript. Now:
   - the first card: loading=eager + fetchpriority=high. React then also
     writes <link rel=preload as=image imagesrcset imagesizes
     fetchpriority=high> at the top of the server HTML;
   - cards 2 and 3: still lazy (on a phone they are below the fold and must
     not compete with card 1), but preloaded with a media query on the screens
     where they sit in the first row next to card 1;
   - every other card: unchanged (lazy, low).
   The breakpoints follow each grid's Tailwind columns.
   ========================================================================== */

export type ListingGrid = 'homes' | 'collection';

/** Media query per card index (0-based) under which the card is in the first row. */
const FIRST_ROW_MEDIA: Record<ListingGrid, Array<string | undefined>> = {
  /** Homes.tsx: grid-cols-1, md:grid-cols-2, lg:grid-cols-3. */
  homes: [undefined, '(min-width: 768px)', '(min-width: 1024px)'],
  /** Collection.tsx: grid-cols-1, sm:grid-cols-2, lg:grid-cols-3. */
  collection: [undefined, '(min-width: 640px)', '(min-width: 1024px)'],
};

export interface CardPriority {
  /** First photo eager + fetchpriority=high. */
  priority?: boolean;
  /** Preload the first photo when this media query matches. */
  preloadMedia?: string;
}

export function cardPriority(grid: ListingGrid, index: number): CardPriority {
  if (index === 0) return { priority: true };
  const media = FIRST_ROW_MEDIA[grid][index];
  return media ? { preloadMedia: media } : {};
}

/** <img> loading attributes for a card photo. */
export function cardImageLoading(priority: boolean | undefined, isFirstPhoto: boolean): {
  loading: 'eager' | 'lazy';
  fetchPriority: 'high' | 'low';
  decoding?: 'async';
} {
  return priority && isFirstPhoto
    ? { loading: 'eager', fetchPriority: 'high' }
    : { loading: 'lazy', fetchPriority: 'low', decoding: 'async' };
}
