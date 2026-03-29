import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ReviewsSectionProps {
  propertyName: string;
  propertySlug: string;
}

export default function ReviewsSection({ propertyName, propertySlug }: ReviewsSectionProps) {
  const { data: allReviews = [] } = trpc.reviews.list.useQuery({ activeOnly: true });

  const { propertyReviews, globalReviews } = useMemo(() => {
    const propertyRevs = allReviews.filter(r => r.propertyName === propertyName);
    const globalRevs = allReviews.filter(r => !r.propertyName);
    return { propertyReviews: propertyRevs, globalReviews: globalRevs };
  }, [allReviews, propertyName]);

  const displayReviews = propertyReviews.length > 0 ? propertyReviews : globalReviews;
  const showGlobalBanner = propertyReviews.length === 0 && globalReviews.length > 0;

  if (!displayReviews.length) return null;

  return (
    <section>
      <h2 className="headline-sm text-[#1A1A18] mb-6">Guest Reviews</h2>

      {showGlobalBanner && (
        <div className="mb-6 p-4 rounded-lg bg-[#F5F1EB] border border-[#E8E4DC]">
          <p className="text-[13px] text-[#6B6860] font-light">
            <span className="font-medium text-[#C7A574]">4.9/5</span> from 2000+ verified reviews
          </p>
        </div>
      )}

      <div className="space-y-4">
        {displayReviews.slice(0, 3).map((review) => (
          <div key={review.id} className="p-4 rounded-lg border border-[#E8E4DC] bg-white hover:border-[#C7A574]/30 transition-colors">
            {/* Stars */}
            <div className="flex items-center gap-1 mb-2">
              {Array.from({ length: review.rating || 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  className="fill-[#C7A574] text-[#C7A574]"
                />
              ))}
            </div>

            {/* Quote */}
            <p className="text-[13px] text-[#6B6860] font-light leading-relaxed mb-3 italic">
              "{review.quote}"
            </p>

            {/* Reviewer info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-[#1A1A18]">{review.guestName}</p>
                {review.guestCountry && (
                  <p className="text-[11px] text-[#9E9A90]">{review.guestCountry}</p>
                )}
              </div>
              {review.date && (
                <p className="text-[10px] text-[#9E9A90]">{review.date}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Schema.org AggregateRating */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AggregateRating',
            'ratingValue': propertyReviews.length > 0
              ? (propertyReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / propertyReviews.length).toFixed(1)
              : '4.9',
            'bestRating': '5',
            'worstRating': '1',
            'ratingCount': propertyReviews.length > 0 ? propertyReviews.length : 2000,
            'name': `Reviews for ${propertyName}`
          })
        }}
      />
    </section>
  );
}
