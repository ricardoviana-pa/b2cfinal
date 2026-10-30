/**
 * The one review quoted under the home's key features (PropertyDetail): the
 * reviews section itself sits ~2 800 px down the page, after the map, so the
 * guest deciding in the first screens had no voice of a past guest near them.
 *
 * Same hygiene as ReviewsSection (shared/reviewStats.ts): a real rating,
 * enough words to mean something, never a line that names the booking
 * channel. Every rating is published (Ricardo, 29 out 2026), so this is not a
 * 5★ bar: it ranks — the best-rated review first, the newest among equals —
 * and quotes nothing below MIN_FEATURED_RATING, because a single quote in the
 * first screens is a recommendation, not the full picture; the real average,
 * over every review, stands beside the title. The quote carries its own
 * rating, and the page draws those stars, not five by default.
 */
import { REVIEW_CHANNEL_RE, isValidRating, reviewLetters } from '@shared/reviewStats';

/** A quote needs at least this rating: a 4★ or 5★ voice, never a 3★. */
export const MIN_FEATURED_RATING = 4;
/** Letters a quote needs to mean something ("Great." is not a quote). */
const MIN_LETTERS = 60;

export interface FeaturedReview {
  text: string;
  /** First name when the channel gave one; empty for an anonymised review. */
  name: string;
  date: string;
  /** The quoted review's own rating (1–5), drawn as its stars. */
  rating: number;
}

interface ReviewLike {
  rating?: number;
  text?: string;
  guestName?: string;
  guestDisplayName?: string;
  date?: string;
}

/** Cut at a sentence or clause end once past 60% of `max`, else at a word. */
export function excerpt(text: string, max = 190): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const floor = Math.floor(max * 0.6);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  if (sentence >= floor) return cut.slice(0, sentence + 1);
  const clause = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' '));
  return `${cut.slice(0, clause >= floor ? clause : max).replace(/[,;:\s]+$/, '')}…`;
}

const quotable = (r: ReviewLike): boolean => {
  const rating = Number(r?.rating);
  const text = (r?.text || '').trim();
  return isValidRating(rating) && rating >= MIN_FEATURED_RATING && reviewLetters(text) >= MIN_LETTERS && !REVIEW_CHANNEL_RE.test(text);
};

const when = (r: ReviewLike): number => Date.parse(r.date || '') || 0;

export function pickFeaturedReview(reviews: unknown, max = 190): FeaturedReview | null {
  if (!Array.isArray(reviews)) return null;
  const candidates = (reviews as ReviewLike[])
    .filter(quotable)
    // Best rating first; among equals the newest. Array.prototype.sort is
    // stable, so two identical entries keep the catalogue's order.
    .sort((a, b) => Number(b.rating) - Number(a.rating) || when(b) - when(a));
  const best = candidates[0];
  if (!best) return null;
  return {
    text: excerpt(best.text || '', max),
    name: (best.guestDisplayName || best.guestName || '').trim(),
    date: best.date || '',
    rating: Number(best.rating),
  };
}
