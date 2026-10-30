/**
 * The one review quoted under the home's key features (PropertyDetail): the
 * reviews section itself sits ~2 800 px down the page, after the map, so the
 * guest deciding in the first screens had no voice of a past guest near them.
 * Same hygiene as ReviewsSection: a real stay, five stars, enough words to
 * mean something, never a line that names the booking channel.
 */
const CHANNEL_RE = /\bairbnb\b|booking\.com|\bvrbo\b|\bexpedia\b|homeaway/i;

export interface FeaturedReview {
  text: string;
  /** First name when the channel gave one; empty for an anonymised review. */
  name: string;
  date: string;
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

export function pickFeaturedReview(reviews: unknown, max = 190): FeaturedReview | null {
  if (!Array.isArray(reviews)) return null;
  const candidates = (reviews as ReviewLike[])
    .filter((r) => {
      const text = (r?.text || '').trim();
      return Number(r?.rating) >= 5 && text.replace(/[^\p{L}]/gu, '').length >= 60 && !CHANNEL_RE.test(text);
    })
    .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
  const best = candidates[0];
  if (!best) return null;
  return {
    text: excerpt(best.text || '', max),
    name: (best.guestDisplayName || best.guestName || '').trim(),
    date: best.date || '',
  };
}
