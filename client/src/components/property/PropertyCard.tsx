/* ==========================================================================
   PROPERTY CARD â V3 FINAL (with real images)
   Tier badges (Signature/Select/New), image carousel,
   touch-friendly swipe, no rounded corners, mobile-first
   ========================================================================== */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Heart, ChevronLeft, ChevronRight, Users, BedDouble, Bath, BadgeCheck, Sparkles } from 'lucide-react';
import { formatEur } from '@/lib/format';
import type { Property, Destination } from '@/lib/types';
import { getPropertyImages } from '@/lib/images';
import { useFavorites } from '@/hooks/useFavorites';
import destinationsData from '@/data/destinations.json';

const destinations = destinationsData as unknown as Destination[];
const getDestName = (slug: string) => destinations.find(d => d.slug === slug)?.name || slug;

interface PropertyCardProps {
  property: Property;
  nights?: number;
  checkin?: string;
  checkout?: string;
  guests?: number;
  liveQuote?: {
    total: number;
    nightlyRate: number;
    cleaningFee: number;
    nights: number;
    source?: string;
    fallbackMessage?: string;
  } | null;
  quoteLoading?: boolean;
  /** Batch tRPC failed â show catalogue estimate instead of infinite loading */
  batchFailed?: boolean;
}

export default function PropertyCard({
  property,
  nights = 0,
  checkin,
  checkout,
  guests,
  liveQuote,
  quoteLoading = false,
  batchFailed = false,
}: PropertyCardProps) {
  const { t } = useTranslation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const tierBadge = useMemo(
    (): Record<string, { className: string; label: string }> => ({
      signature: { className: 'badge-signature', label: t('filters.signature') },
      select: { className: 'badge-select', label: t('filters.select') },
      new: { className: 'badge-new', label: t('filters.new') },
    }),
    [t]
  );
  const [currentImage, setCurrentImage] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const saved = isFavorite(property.slug);

  // Use property.images if available, otherwise fall back to curated Unsplash images
  const images = property.images && property.images.length > 0
    ? property.images
    : getPropertyImages(property.slug);
  const total = images.length;

  const nextImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImage(p => (p + 1) % total);
    setImageLoaded(false);
  }, [total]);

  const prevImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImage(p => (p - 1 + total) % total);
    setImageLoaded(false);
  }, [total]);

  const toggleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(property.slug);
  }, [toggleFavorite, property.slug]);

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

  const badge = tierBadge[property.tier];

  return (
    <Link href={`/homes/${property.slug}${checkin && checkout ? `?checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}${guests && guests > 1 ? `&guests=${guests}` : ''}` : ''}`}>
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

        {/* Tier Badge */}
        {badge && (
          <div className={`absolute top-3 left-3 z-10 ${badge.className}`}>
            {badge.label}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={toggleSave}
          className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center bg-white/80 backdrop-blur-sm hover:bg-white transition-colors"
          style={{ minHeight: 'auto', minWidth: 'auto' }}
          aria-label={saved ? t('property.removeSaveAria') : t('property.saveAria')}
        >
          <Heart
            className={`w-4 h-4 transition-colors ${saved ? 'fill-[#DC2626] text-[#DC2626]' : 'text-[#1A1A18]'}`}
          />
        </button>

        {/* Desktop Navigation Arrows */}
        {total > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/80 backdrop-blur-sm hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ minHeight: 'auto', minWidth: 'auto' }}
              aria-label={t('property.prevImage', 'Previous image')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/80 backdrop-blur-sm hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
          {property.locality}, {getDestName(property.destination)}
        </p>

        {/* Name */}
        <h3 className="text-[1.0625rem] font-display text-[#1A1A18] mb-1 group-hover:text-[#8B7355] transition-colors leading-tight">
          {property.name}
        </h3>

        {/* Tagline */}
        <p className="text-[0.8125rem] text-[#9E9A90] mb-2 line-clamp-1">{property.tagline}</p>

        {/* Service level line */}
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3 h-3 text-[#C4A87C] shrink-0" />
          <span className="text-[0.6875rem] text-[#9E9A90] font-light">
            {t('property.dailyHousekeeping')} Â· {t('property.concierge')} Â· {t('property.welcomeHamper')}
          </span>
        </div>

        {/* Specs Row */}
        <div className="flex items-center gap-4 text-[0.8125rem] text-[#6B6860] mb-3">
          <span className="flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5" /> {property.bedrooms}
          </span>
          <span className="flex items-center gap-1.5">
            <Bath className="w-3.5 h-3.5" /> {property.bathrooms}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {property.maxGuests}
          </span>
        </div>

        {/* Price + Best Rate Guarantee */}
        <div className="border-t border-[#E8E4DC] pt-3">
          {nights > 0 ? (
            <>
              <div className="flex items-baseline justify-between">
                {quoteLoading && !liveQuote ? (
                  <div className="flex flex-col gap-1.5 w-full max-w-[200px]" aria-busy="true" aria-label={t('property.checkingPriceAria')}>
                    <div className="h-3.5 bg-[#F5F1EB] rounded-md animate-pulse w-4/5" />
                    <div className="h-3 bg-[#F5F1EB] rounded-md animate-pulse w-1/2" />
                  </div>
                ) : (() => {
                  const fmt = formatEur;
                  const fromCatalogue = (property.priceFrom ?? 0) * nights;
                  // Only show live/cached quotes — never base price estimates
                  const isLiveQuote =
                    liveQuote &&
                    (liveQuote.source === 'live' || liveQuote.source === 'cached') &&
                    liveQuote.total > 0;
                  if (isLiveQuote && liveQuote) {
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
                  // No live quote available — show catalogue per-night rate only
                  if ((property.priceFrom ?? 0) > 0) {
                    return (
                      <div className="text-left w-full">
                        <span className="text-[#1A1A18] font-medium">
                          {t('property.fromPerNight', { price: property.priceFrom.toLocaleString() })}
                        </span>
                        <span className="text-[0.75rem] text-[#9E9A90] ml-1">{t('property.perNight')}</span>
                      </div>
                    );
                  }
                  return (
                    <span className="text-[#9E9A90] text-[0.8125rem]">
                      {t('property.priceOnRequest')}
                    </span>
                  );
                })()}
              </div>
              {liveQuote &&
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
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1">
              <BadgeCheck className="w-3 h-3 text-[#8B7355]" />
              <span className="text-[0.625rem] tracking-[0.02em] text-[#9E9A90] font-medium">{t('property.bestRateGuarantee')}</span>
            </div>
            <span className="text-[0.6875rem] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{t('property.directBooking', 'Direct booking')}</span>
          </div>
        </div>
      </div>
      </article>
    </Link>
  );
}
