import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

// White-label: never surface a quote that names the booking channel, even
// though the channel is never stored as a field — a guest sometimes writes it
// into their own review text.
const CHANNEL_RE = /\bairbnb\b|booking\.com|\bvrbo\b|\bexpedia\b|homeaway/i;

interface Review {
  rating: number;
  text: string;
  guestName: string;
  /** First name only (privacy-safe). Falls back to guestName if absent. */
  guestDisplayName?: string;
  /** Avatar URL if the channel delivered one — else null/undefined (no photo). */
  guestPhoto?: string | null;
  /** "London, UK" if present — else null/undefined (line hidden). */
  guestLocation?: string | null;
  date: string;
  categories?: Array<{ name: string; score: number }>;
}

interface ReviewsSectionProps {
  propertyName: string;
  propertySlug: string;
  reviews?: Review[];
  averageRating?: number | null;
  reviewCount?: number;
}

export default function ReviewsSection({ propertyName, reviews, averageRating, reviewCount }: ReviewsSectionProps) {
  const { t, i18n } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  // Only genuine top-rated reviews with text, most recent first. Booking's
  // 0–10 scale is normalised to 1–5 upstream, so a 10 arrives here as a 5.
  const topReviews = useMemo(
    () =>
      (reviews ?? [])
        .filter(r => {
          const text = (r.text || '').trim();
          // Real text only: a placeholder like "." or "…" is effectively a
          // note-only review — drop it (needs at least 3 actual letters).
          const letters = text.replace(/[^\p{L}]/gu, '').length;
          return Math.round(r.rating) === 5 && letters >= 3 && !CHANNEL_RE.test(text);
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [reviews],
  );

  // No qualifying 5★-with-text reviews → hide the section entirely (no sad
  // empty state).
  if (topReviews.length === 0) return null;

  const INITIAL = 6;
  const displayed = showAll ? topReviews : topReviews.slice(0, INITIAL);
  // Header shows the REAL aggregate across all reviews (kept as-is — we never
  // fabricate a 5.0 average from the filtered set).
  const totalCount = reviewCount || reviews?.length || 0;

  return (
    <section>
      {/* Header with aggregate rating */}
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="headline-sm text-[#1A1A18]">{t('reviews.title', 'Guest reviews')}</h2>
        {averageRating && averageRating > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[20px] font-display font-light text-[#1A1A18]">{averageRating}</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-4 h-4 ${star <= Math.round(averageRating) ? 'text-[#8B7355]' : 'text-[#E8E4DC]'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-[13px] text-[#9E9A90]">({totalCount} {totalCount === 1 ? t('reviews.singular', 'review') : t('reviews.plural', 'reviews')})</span>
          </div>
        )}
      </div>

      {/* Reviews grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {displayed.map((review, idx) => {
          // This account's reviews are anonymised (no name/photo/location).
          // When there's a real name we show it with an initial avatar; when
          // there isn't, we show a neutral "Verified guest" with a checkmark
          // avatar — credible and premium, no fake initials.
          const realName = (review.guestDisplayName || review.guestName || '').trim();
          const displayName = realName || t('reviews.verifiedGuest', 'Verified guest');
          return (
          <div key={idx} className="bg-[#FAFAF7] border border-[#E8E4DC] rounded-lg p-5 hover:border-[#8B7355]/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                {review.guestPhoto ? (
                  <img
                    src={review.guestPhoto}
                    alt={displayName}
                    loading="lazy"
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : realName ? (
                  <div className="w-8 h-8 rounded-full bg-[#8B7355] flex items-center justify-center text-[#FAFAF7] text-[12px] font-medium shrink-0">
                    {realName.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#8B7355] flex items-center justify-center text-[#FAFAF7] shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A18]">{displayName}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#9E9A90]">
                    {review.guestLocation && <span>{review.guestLocation}</span>}
                    {review.guestLocation && review.date && <span className="text-[#D8D2C6]">·</span>}
                    {review.date && (
                      <span>{new Date(review.date).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className={`w-3.5 h-3.5 ${star <= review.rating ? 'text-[#8B7355]' : 'text-[#E8E4DC]'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
            <p className="text-[13px] text-[#6B6860] leading-relaxed line-clamp-4 font-light italic">"{review.text}"</p>
          </div>
          );
        })}
      </div>

      {/* Show more / less — no count in the label, so it never contradicts the
          real aggregate count shown in the header. */}
      {topReviews.length > INITIAL && (
        <button
          type="button"
          onClick={() => setShowAll(prev => !prev)}
          className="mt-5 text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] hover:text-[#6B5A3F] transition-colors"
        >
          {showAll ? t('reviews.showFewer', 'Show fewer') : t('reviews.showMore', 'Show more')}
        </button>
      )}

      {/* AggregateRating is emitted on the page-level VacationRental schema
          (see PropertyDetail.tsx) so it stays attached to the item being
          rated, rather than as an orphan node. */}
    </section>
  );
}
