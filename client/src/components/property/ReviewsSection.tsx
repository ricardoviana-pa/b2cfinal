import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Review {
  rating: number;
  text: string;
  guestName: string;
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
  const { i18n } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  if (!reviews || reviews.length === 0) return null;

  const displayed = showAll ? reviews.slice(0, 20) : reviews.slice(0, 4);
  const totalCount = reviewCount || reviews.length;

  return (
    <section>
      {/* Header with aggregate rating */}
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="headline-sm text-[#1A1A18]">Guest Reviews</h2>
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
            <span className="text-[13px] text-[#9E9A90]">({totalCount} {totalCount === 1 ? 'review' : 'reviews'})</span>
          </div>
        )}
      </div>

      {/* Reviews grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {displayed.map((review, idx) => (
          <div key={idx} className="bg-[#FAFAF7] border border-[#E8E4DC] rounded-lg p-5 hover:border-[#8B7355]/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#8B7355] flex items-center justify-center text-[#FAFAF7] text-[12px] font-medium shrink-0">
                  {review.guestName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A18]">{review.guestName}</p>
                  {review.date && (
                    <p className="text-[11px] text-[#9E9A90]">
                      {new Date(review.date).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })}
                    </p>
                  )}
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
        ))}
      </div>

      {/* Show more / less */}
      {reviews.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAll(prev => !prev)}
          className="mt-5 text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] hover:text-[#6B5A3F] transition-colors"
        >
          {showAll ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
        </button>
      )}

      {/* AggregateRating is emitted on the page-level VacationRental schema
          (see PropertyDetail.tsx) so it stays attached to the item being
          rated, rather than as an orphan node. */}
    </section>
  );
}
