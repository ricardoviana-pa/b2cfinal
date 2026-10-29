import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { formatSiteDate } from '@shared/siteDate';
import { displayedAggregate, formatRating, publishableReviews, sortReviewsForDisplay } from '@shared/reviewStats';
import { detectReviewLanguage } from '@shared/reviewLanguage';
import { reviewLanguageLabel } from '@/lib/reviewLanguage';

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

const STAR = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

/** Five stars, the first round(value) filled. Labelled on a card ("4/5");
 *  decorative in the header, where the number is already written out. */
function Stars({ value, className, labelled }: { value: number; className: string; labelled?: boolean }) {
  const filled = Math.round(value);
  return (
    <div className="flex gap-0.5" {...(labelled ? { role: 'img', 'aria-label': `${value}/5` } : { 'aria-hidden': true })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} className={`${className} ${star <= filled ? 'text-[#8B7355]' : 'text-[#E8E4DC]'}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d={STAR} />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsSection({ reviews, averageRating, reviewCount }: ReviewsSectionProps) {
  const { t, i18n } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const pageLang = (i18n.language || 'en').split('-')[0];

  // Every rating is shown (Ricardo, 29 out 2026) — a review needs real text
  // and must not name the booking channel, that is all. Reviews in the page
  // language first, then English, then the rest, newest first within each,
  // as on the homepage rail; the others carry a "Written in …" line.
  const items = useMemo(() => {
    const list = publishableReviews(reviews ?? []);
    const language = new Map(list.map((r) => [r, detectReviewLanguage(r.text)] as const));
    return sortReviewsForDisplay(list, (r) => language.get(r) ?? null, pageLang)
      .map((review) => ({ review, language: language.get(review) ?? null }));
  }, [reviews, pageLang]);

  // The real aggregate across ALL reviews of the home (the cards are capped,
  // the count is not); no average under three reviews.
  const stats = displayedAggregate({ reviews, averageRating, reviewCount });

  // Nothing qualifying → hide the section entirely (no sad empty state).
  if (items.length === 0 && stats.count === 0) return null;

  const INITIAL = 4;
  const displayed = showAll ? items : items.slice(0, INITIAL);
  const countLabel = `${stats.count} ${stats.count === 1 ? t('reviews.singular', 'review') : t('reviews.plural', 'reviews')}`;

  return (
    <section id="property-reviews" className="scroll-mt-28">
      {/* Header with the aggregate: "4,7/5 ★★★★★ (12 reviews)", or just the
          count while a home has fewer than three reviews. */}
      <div className="flex flex-wrap items-baseline gap-3 mb-6">
        <h2 className="headline-sm text-[#1A1A18]">{t('reviews.title', 'Guest reviews')}</h2>
        {stats.count > 0 && (
          <div className="flex items-center gap-1.5">
            {stats.average !== null && (
              <>
                <span className="text-[20px] font-display font-light text-[#1A1A18]">{`${formatRating(stats.average, i18n.language)}/5`}</span>
                <Stars value={stats.average} className="w-4 h-4" />
              </>
            )}
            <span className="text-[13px] text-[#726D63]">{stats.average !== null ? `(${countLabel})` : countLabel}</span>
          </div>
        )}
      </div>

      {/* Anonymous cards can read as fabricated; one line explains the
          provenance without naming (or promoting) the OTAs they came through. */}
      <p className="text-[12px] text-[#726D63] -mt-4 mb-6" style={{ fontWeight: 300 }}>
        {t('reviews.verifiedNote', 'All reviews are from completed stays, collected through our booking channels.')}
      </p>

      {/* Reviews grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {displayed.map(({ review, language }, idx) => {
          // This account's reviews are anonymised (no name/photo/location).
          // When there's a real name we show it with an initial avatar; when
          // there isn't, we show a neutral "Verified guest" with a checkmark
          // avatar — credible and premium, no fake initials.
          const realName = (review.guestDisplayName || review.guestName || '').trim();
          const displayName = realName || t('reviews.verifiedGuest', 'Verified guest');
          const month = formatSiteDate(review.date, i18n.language, { month: 'short', year: 'numeric' });
          const meta = [
            review.guestLocation || null,
            month || null,
            language && language !== pageLang ? reviewLanguageLabel(t, pageLang, language) : null,
          ].filter((x): x is string => !!x);
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
                  <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#726D63]">
                    {meta.map((part, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span className="text-[#D8D2C6]" aria-hidden="true">·</span>}
                        {part}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <Stars value={review.rating} className="w-3.5 h-3.5" labelled />
            </div>
            <details className="group/review" lang={language ?? undefined}>
              <summary className="cursor-pointer list-none">
                <p className="text-[13px] text-pa-earth leading-relaxed line-clamp-3 group-open/review:hidden">{review.text}</p>
                <span className="inline-block min-h-11 pt-3 caption text-pa-gold-aa underline">{t('conversion.readReview')}</span>
              </summary>
              <p className="text-[13px] text-pa-earth leading-relaxed">{review.text}</p>
            </details>
          </div>
          );
        })}
      </div>

      {/* Show more / less — no count in the label, so it never contradicts the
          real aggregate count shown in the header. */}
      {items.length > INITIAL && (
        <button
          type="button"
          onClick={() => setShowAll(prev => !prev)}
          className="mt-5 text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] hover:text-[#6B5A3F] transition-colors"
        >
          {showAll ? t('reviews.showFewer', 'Show fewer') : t('reviews.showMore', 'Show more')}
        </button>
      )}

      {/* AggregateRating is emitted on the page-level VacationRental schema
          (see PropertyDetail.tsx) from the same displayedAggregate(), so it
          stays attached to the item being rated and says what the page says. */}
    </section>
  );
}
