/**
 * Guest reviews: the one place that decides what a rating is worth, what the
 * average is and in which order the cards come. Shared by the Guesty sync
 * (server/services/guesty-sync.ts), the curated-reviews scripts, the property
 * page (ReviewsSection, the rating beside the title, the JSON-LD) and the
 * server-rendered JSON-LD (server/_core/vite.ts), so they can never disagree.
 *
 * Policy (Ricardo, 29 out 2026): every review of a home counts and is shown,
 * whatever its rating — the average is the real one. Until 29 out the site
 * kept 5★ only, so every home read "5.0" by construction.
 *
 * Two honesty rules on top:
 *  - a home with fewer than MIN_REVIEWS_FOR_AVERAGE reviews shows the count
 *    and no average (one 5★ stay is not "5.0");
 *  - the average is shown with one decimal, and the JSON-LD declares the same
 *    rounded value the visitor sees.
 */

export const MIN_REVIEWS_FOR_AVERAGE = 3;

/** White-label: a quote that names the booking channel is never shown —
 *  "Airbnb", "air bnb" and "AirBnB" alike (a guest wrote "our original air
 *  bnb booking", and it reached the page's featured quote, 30 out 2026). */
export const REVIEW_CHANNEL_RE = /\bair[\s-]?bnb\b|booking\.com|\bvrbo\b|\bexpedia\b|homeaway/i;

export interface RatedReview {
  rating: number;
  text?: string | null;
  date?: string | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** A published rating: 1 to 5, in tenths. */
export function isValidRating(rating: unknown): rating is number {
  return finite(rating) && rating >= 1 && rating <= 5;
}

/**
 * A channel rating as the site stores it: 1–5 in tenths. Ten-point channels
 * (Booking.com style) are halved; a score below the floor of the scale (1/10)
 * becomes the floor, never 0.5. Null when there is no usable rating.
 */
export function normaliseRating(raw: unknown, tenPoint: boolean): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const onFive = tenPoint ? n / 2 : n;
  if (onFive > 5) return null;
  return Math.max(1, Math.round(onFive * 10) / 10);
}

/** The letters of a review body (a "👍" or a date is not a review). */
export function reviewLetters(text: unknown): number {
  return typeof text === 'string' ? text.replace(/[^\p{L}]/gu, '').length : 0;
}

/** Reviews that can be shown as cards: a valid rating, real text, no channel name. */
export function publishableReviews<T extends RatedReview>(reviews: readonly T[] | null | undefined, minLetters = 3): T[] {
  return (reviews ?? []).filter(r =>
    isValidRating(r?.rating) && reviewLetters(r.text) >= minLetters && !REVIEW_CHANNEL_RE.test(String(r.text)));
}

/** Count and mean (two decimals) over every review with a valid rating. */
export function reviewAggregate(reviews: readonly RatedReview[] | null | undefined): { count: number; average: number | null } {
  const rated = (reviews ?? []).filter(r => isValidRating(r?.rating));
  if (rated.length === 0) return { count: 0, average: null };
  const average = Math.round((rated.reduce((sum, r) => sum + r.rating, 0) / rated.length) * 100) / 100;
  return { count: rated.length, average };
}

export interface ReviewAggregateInput {
  reviews?: readonly RatedReview[] | null;
  /** Stored by the sync over the full review set (the cards are capped at 40). */
  averageRating?: number | null;
  reviewCount?: number | null;
}

/**
 * What the page says about a home: the count of all its reviews and, from
 * MIN_REVIEWS_FOR_AVERAGE on, the average rounded to one decimal. The stored
 * aggregate wins (it covers reviews beyond the shipped cards); without one the
 * cards themselves are used.
 */
export function displayedAggregate(input: ReviewAggregateInput | null | undefined): { count: number; average: number | null } {
  if (!input) return { count: 0, average: null };
  const fromCards = reviewAggregate(input.reviews);
  const count = finite(input.reviewCount) && input.reviewCount >= 0 ? Math.round(input.reviewCount) : fromCards.count;
  const stored = isValidRating(input.averageRating) ? input.averageRating : fromCards.average;
  if (count < MIN_REVIEWS_FOR_AVERAGE || stored === null) return { count, average: null };
  return { count, average: Math.round(stored * 10) / 10 };
}

/** "4.7" / "4,7" / "5.0" in the page language. */
export function formatRating(average: number, lang?: string): string {
  const locale = (lang || 'en').slice(0, 2);
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(average);
  } catch {
    return average.toFixed(1);
  }
}

/**
 * Card order: reviews in the page language first, then English, then the
 * rest; newest first within each group. Without a page language, newest
 * first. The language of each review comes from `languageOf` (shared/
 * reviewLanguage.ts), null when unsure, which counts as "the rest".
 */
export function sortReviewsForDisplay<T extends RatedReview>(
  reviews: readonly T[],
  languageOf?: (review: T) => string | null,
  pageLang?: string | null,
): T[] {
  const lang = pageLang ? String(pageLang).toLowerCase().slice(0, 2) : null;
  const rank = (review: T) => {
    if (!lang || !languageOf) return 0;
    const language = languageOf(review);
    return language === lang ? 0 : language === 'en' ? 1 : 2;
  };
  const time = (review: T) => Date.parse(String(review.date ?? '')) || 0;
  return reviews
    .map((review, index) => ({ review, index, rank: rank(review), time: time(review) }))
    .sort((a, b) => a.rank - b.rank || b.time - a.time || a.index - b.index)
    .map(x => x.review);
}
