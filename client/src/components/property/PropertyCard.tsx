/* ==========================================================================
   PROPERTY CARD â V3 FINAL (with real images)
   Tier badges (Signature/Select/New), image carousel,
   touch-friendly swipe, no rounded corners, mobile-first
   ========================================================================== */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Users, BedDouble, Bath, Flame, Star } from 'lucide-react';
import { formatEur, sanitizePropertyName } from '@/lib/format';
import type { Property, Destination } from '@/lib/types';
import { getPropertyImages } from '@/lib/images';
import destinationsData from '@/data/destinations.json';
import { pushEcommerce } from '@/lib/datalayer';

const destinations = destinationsData as unknown as Destination[];
const getDestName = (slug: string) => destinations.find(d => d.slug === slug)?.name || slug;

interface PropertyCardProps {
  property: Property;
  nights?: number;
  checkin?: string;
  checkout?: string;
  guests?: number;
  listId?: string;
  listName?: string;
  itemIndex?: number;
  liveQuote?: {
    total: number;
    nightlyRate: number;
    cleaningFee: number;
    nights: number;
    source?: string;
    fallbackMessage?: string;
    available?: boolean;
  } | null;
  quoteLoading?: boolean;
  /** Batch tRPC failed â show catalogue estimate instead of infinite loading */
  batchFailed?: boolean;
  /** When true, the price/rate row is hidden entirely (e.g. homepage showcase). */
  hidePrice?: boolean;
}

export default function PropertyCard({
  property,
  nights = 0,
  checkin,
  checkout,
  guests,
  listId = 'search_results',
  listName = 'Search Results',
  itemIndex,
  liveQuote,
  quoteLoading = false,
  batchFailed = false,
  hidePrice = false,
}: PropertyCardProps) {
  const { t } = useTranslation();
  const [currentImage, setCurrentImage] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  // Use property.images if available, otherwise fall back to curated Unsplash images
  const images = property.images && property.images.length > 0
    ? property.images
    : getPropertyImages(property.slug);
  const total = images.length;

  const nextImage = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImage(p => (p + 1) % total);
    setImageLoaded(false);
  }, [total]);

  const prevImage = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImage(p => (p - 1 + total) % total);
    setImageLoaded(false);
  }, [total]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    setIsDragging(false);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
    if (Math.abs(touchCurrentX.current - touchStartX.current) > 10) setIsDragging(true);
  };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchCurrentX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) setCurrentImage(p => (p + 1) % total);
      else setCurrentImage(p => (p - 1 + total) % total);
      setImageLoaded(false);
    }
    setTimeout(() => setIsDragging(false), 50);
  };

  const handleCardClick = () => {
    pushEcommerce({
      event: 'select_item',
      ecommerce: {
        item_list_id: listId,
        item_list_name: listName,
        items: [
          {
            item_id: `PROP-${property.id}`,
            item_name: property.name,
            item_category: 'villa',
            item_category2: property.locality || property.destination || '',
            item_category3: 'Portugal',
            item_variant: property.tier || '',
            price: property.priceFrom || 0,
            quantity: nights || 1,
            ...(itemIndex !== undefined && { index: itemIndex }),
          },
        ],
      },
    });
  };

  // Urgency badge — tier-based + review-driven signals
  const urgencyBadge = useMemo(() => {
    const rating = (property as any).averageRating;
    const reviewCount = (property as any).reviewCount || 0;
    if (property.tier === 'signature') {
      return { label: t('urgency.highDemand', 'High demand'), icon: Flame, color: 'bg-[#1A1A18]/80' };
    }
    if (rating && rating >= 4.8 && reviewCount >= 5) {
      return { label: t('urgency.guestFavourite', 'Guest favourite'), icon: Star, color: 'bg-[#8B7355]/90' };
    }
    if (property.tier === 'new') {
      return { label: t('urgency.justAdded', 'Just added'), icon: null, color: 'bg-[#8B7355]/90' };
    }
    return null;
  }, [property, t]);

  return (
    <Link
      href={`/homes/${property.slug}${checkin && checkout ? `?checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}${guests && guests > 1 ? `&guests=${guests}` : ''}` : ''}`}
      onClick={handleCardClick}
    >
      <article className="group cursor-pointer block">
      {/* Image Carousel â 4:3 aspect */}
      <div
        className="relative overflow-hidden bg-[#E8E4DC] img-fallback"
        style={{ aspectRatio: '4/3' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={images[currentImage]}
          alt={t('property.imageAlt', { name: property.name, current: currentImage + 1, total })}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.03] ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          width={800} height={600}
          onLoad={() => setImageLoaded(true)}
          onError={e => { (e.currentTarget.parentElement as HTMLElement)?.setAttribute('data-broken', 'true'); e.currentTarget.style.display = 'none'; }}
        />

        {/* Shimmer skeleton while image loads */}
        {!imageLoaded && (
          <div className="absolute inset-0 skeleton-shimmer" />
        )}

        {/* Subtle bottom gradient for readability */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.08) 0%, transparent 40%)' }} />

        {/* Urgency badge */}
        {urgencyBadge && (
          <div className={`absolute top-3 left-3 z-10 ${urgencyBadge.color} text-white text-[10px] font-medium tracking-[0.04em] uppercase px-2.5 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm`}>
            {urgencyBadge.icon && <urgencyBadge.icon className="w-3 h-3" />}
            {urgencyBadge.label}
          </div>
        )}

        {/* Navigation Arrows — always visible so the slide is discoverable */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={prevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors"
              style={{ minHeight: 'auto', minWidth: 'auto' }}
              aria-label={t('property.prevImage', 'Previous image')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors"
              style={{ minHeight: 'auto', minWidth: 'auto' }}
              aria-label={t('property.nextImage', 'Next image')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Dots */}
        {total > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
            {images.slice(0, 5).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentImage ? 'bg-white w-4' : 'bg-white/50 w-1.5'
                }`}
              />
            ))}
            {total > 5 && <span className="text-white/50 text-[10px] ml-1">{t('property.plusMoreImages', { count: total - 5 })}</span>}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="pt-3.5">
        {/* Location */}
        <p className="text-[0.6875rem] font-medium tracking-[0.02em] text-[#8B7355] mb-1">
          {property.locality}, Portugal
        </p>

        {/* Name */}
        <h3 className="text-[1.0625rem] font-display text-[#1A1A18] mb-1 group-hover:text-[#8B7355] transition-colors leading-tight">
          {sanitizePropertyName(property.name)}
        </h3>

        {/* Tagline */}
        <p className="text-[0.8125rem] text-[#9E9A90] mb-3 line-clamp-1">{property.tagline}</p>

        {/* Specs Row */}
        <div className="flex items-center gap-4 text-[0.8125rem] text-[#6B6860] mb-3">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {property.maxGuests}
          </span>
          <span className="flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5" /> {property.bedrooms}
          </span>
          <span className="flex items-center gap-1.5">
            <Bath className="w-3.5 h-3.5" /> {property.bathrooms}
          </span>
        </div>

        {/* Price + Best Rate Guarantee */}
        {!hidePrice && <div className="border-t border-[#E8E4DC] pt-3">
          {nights > 0 ? (
            <>
              <div className="flex items-baseline justify-between">
                {quoteLoading && !liveQuote ? (
                  <div className="flex flex-col gap-1.5 w-full max-w-[200px]" aria-busy="true" aria-label={t('property.checkingPriceAria')}>
                    <div className="h-3.5 bg-[#F5F1EB] rounded-md animate-pulse w-4/5" />
                    <div className="h-3 bg-[#F5F1EB] rounded-md animate-pulse w-1/2" />
                  </div>
                ) : liveQuote && liveQuote.available === false ? (
                  <div className="w-full">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-[#DC2626] shrink-0" />
                      <span className="text-[#DC2626] text-[0.8125rem] font-medium">
                        {t('property.unavailableForDates', 'Unavailable for these dates')}
                      </span>
                    </div>
                    <p className="text-[0.6875rem] text-[#9E9A90] mt-1">
                      {t('property.tryOtherDates', 'Try different dates or contact us for alternatives')}
                    </p>
                  </div>
                ) : (() => {
                  const fmt = formatEur;
                  // Only show confirmed total for live/cached quotes
                  const isLiveOrCached = liveQuote && (liveQuote.source === 'live' || liveQuote.source === 'cached') && liveQuote.total > 0;
                  if (isLiveOrCached && liveQuote) {
                    return (
                      <>
                        <span className="text-[#1A1A18] font-medium">
                          {fmt(liveQuote.total)} {t('property.totalLabel')}
                        </span>
                        <span className="text-[0.75rem] text-[#9E9A90]">
                          {t('booking.nights', { count: liveQuote.nights })}
                        </span>
                      </>
                    );
                  }
                  // Non-live pricing — show "Price on request" with base rate context
                  if ((property.priceFrom ?? 0) > 0) {
                    return (
                      <div className="text-left w-full">
                        <span className="text-[#8B7355] font-medium text-[0.8125rem]">
                          {t('property.priceOnRequest', 'Price on request')}
                        </span>
                        <span className="text-[0.6875rem] text-[#9E9A90] ml-1.5">
                          {t('property.fromRate', { defaultValue: 'from {{price}}/night', price: fmt(property.priceFrom) })}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <span className="text-[#8B7355] font-medium text-[0.8125rem]">
                      {t('property.priceOnRequest', 'Price on request')}
                    </span>
                  );
                })()}
              </div>
              {/* Price detail line — only for confirmed live/cached pricing */}
              {liveQuote && liveQuote.available !== false &&
                (liveQuote.source === 'live' || liveQuote.source === 'cached') &&
                liveQuote.total > 0 && (
                <p className="text-[0.6875rem] text-[#9E9A90] mt-0.5">
                  {t('property.nightCleaningLine', {
                    nightly: formatEur(liveQuote.nightlyRate),
                    cleaning: formatEur(liveQuote.cleaningFee),
                  })}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-baseline justify-between">
              {(property.priceFrom ?? 0) > 0 ? (
                <>
                  <span className="text-[#1A1A18] font-medium">
                    {t('property.fromPerNight', { price: property.priceFrom.toLocaleString() })}
                  </span>
                  <span className="text-[0.75rem] text-[#9E9A90]">{t('property.perNight')}</span>
                </>
              ) : (
                <span className="text-[#9E9A90] text-[0.8125rem]">
                  {t('property.priceOnRequest')}
                </span>
              )}
            </div>
          )}
        </div>}
      </div>
      </article>
    </Link>
  );
}
