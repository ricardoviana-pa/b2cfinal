/* ==========================================================================
   EXPERIENCE RELATED EXPERIENCES — "You might also like" cross-sell section
   Horizontal scrollable cards (3 visible desktop, 1.2 mobile for peek effect)
   Each card: image, name, price, duration, rating
   Links to /experiences/{slug}
   ========================================================================== */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

interface ExperienceData {
  slug: string;
  name: string;
  image?: string;
  price?: string;
  priceFrom?: number;
  duration?: string;
  rating?: number;
  reviewCount?: number;
}

interface ServiceData {
  slug: string;
  name: string;
  image?: string;
  price?: string;
  duration?: string;
}

interface ExperienceRelatedExperiencesProps {
  currentSlug: string;
  relatedSlugs: string[];
}

export default function ExperienceRelatedExperiences({
  currentSlug,
  relatedSlugs,
}: ExperienceRelatedExperiencesProps) {
  const [experiencesData, setExperiencesData] = useState<ExperienceData[]>([]);
  const [servicesData, setServicesData] = useState<ServiceData[]>([]);
  const [scrollPos, setScrollPos] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [expRes, svcRes] = await Promise.all([
          import('@/data/experienceDetails.json'),
          import('@/data/services.json'),
        ]);
        setExperiencesData(expRes.experiences || []);
        // services.json has both "services" and "activities" — we need activities for experience slugs
        setServicesData([...(svcRes.activities || []), ...(svcRes.services || [])]);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  // Find matching items
  const relatedItems = useMemo(() => {
    const items: (ExperienceData | ServiceData)[] = [];
    relatedSlugs.forEach(slug => {
      if (slug === currentSlug) return; // skip current
      const exp = experiencesData.find(e => e.slug === slug);
      if (exp) {
        items.push(exp);
        return;
      }
      const svc = servicesData.find(s => s.slug === slug);
      if (svc) {
        items.push(svc);
      }
    });
    return items;
  }, [relatedSlugs, currentSlug, experiencesData, servicesData]);

  if (relatedItems.length === 0) return null;

  const handleScroll = (direction: 'left' | 'right') => {
    const container = document.getElementById('related-scroll-container');
    if (!container) return;
    const cardWidth = 320; // approx width + gap
    const newPos = direction === 'left' ? scrollPos - cardWidth : scrollPos + cardWidth;
    container.scrollTo({ left: newPos, behavior: 'smooth' });
    setScrollPos(newPos);
  };

  const handleScrollChange = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollPos(el.scrollLeft);
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  return (
    <section>
      <div>
        {/* Header */}
        <div className="flex items-end justify-between mb-10 md:mb-12">
          <h2 className="text-[28px] md:text-[36px] font-display text-[#1A1A18] leading-tight">
            You might also like
          </h2>
          {/* Navigation arrows - desktop only */}
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              className="w-12 h-12 flex items-center justify-center bg-white border border-[#E8E4DC] hover:border-[#1A1A18] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 text-[#1A1A18]" />
            </button>
            <button
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              className="w-12 h-12 flex items-center justify-center bg-white border border-[#E8E4DC] hover:border-[#1A1A18] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 text-[#1A1A18]" />
            </button>
          </div>
        </div>

        {/* Scrollable container */}
        <div
          id="related-scroll-container"
          className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          onScroll={handleScrollChange}
        >
          <div className="flex gap-6 md:gap-8 pb-4">
            {relatedItems.map((item, idx) => {
              const isExperience = 'priceFrom' in item;
              const href = `/experiences/${item.slug}`;
              const hasImage = !!item.image;
              const imageUrl =
                item.image ||
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23E8E4DC" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="14" fill="%239E9A90"%3ENo image%3C/text%3E%3C/svg%3E';

              return (
                <Link key={idx} href={href} className="flex-shrink-0 w-full md:w-80 snap-start block bg-white border border-[#E8E4DC] overflow-hidden hover:shadow-md transition-shadow">
                    {/* Image */}
                    <div className="aspect-video bg-[#E8E4DC] overflow-hidden">
                      <img
                        src={imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23E8E4DC" width="400" height="300"/%3E%3C/svg%3E';
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div className="p-6 md:p-7">
                      {/* Name */}
                      <h3 className="text-[15px] font-display text-[#1A1A18] leading-snug mb-3 line-clamp-2">
                        {item.name}
                      </h3>

                      {/* Rating if available (experience only) */}
                      {isExperience && 'rating' in item && item.rating && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${
                                  i < Math.round(item.rating || 0)
                                    ? 'fill-[#8B7355] text-[#8B7355]'
                                    : 'text-[#E8E4DC]'
                                }`}
                              />
                            ))}
                          </div>
                          {item.rating && (
                            <span className="text-[11px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                              {item.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Metadata row: duration + price */}
                      <div className="flex items-baseline justify-between">
                        {item.duration && (
                          <p className="text-[11px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
                            {item.duration}
                          </p>
                        )}
                        {item.price && (
                          <p className="text-[13px] font-display text-[#1A1A18]">
                            {typeof item.price === 'string'
                              ? item.price
                              : `€${item.price}`}
                          </p>
                        )}
                      </div>
                    </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}
