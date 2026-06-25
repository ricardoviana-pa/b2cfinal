/* ==========================================================================
   PROPERTY UNITS SECTION — booking.com-style grid for multi-unit groups
   Renders inside the parent PDP. Each unit shows its own photo, specs and
   (when dates are selected) a live Guesty quote, with a CTA that links to
   the unit's own PDP — where the full booking widget completes the flow.
   ========================================================================== */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { BedDouble, Bath, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import type { Property } from '@/lib/types';
import { formatEur, sanitizePropertyName } from '@/lib/format';
import { getPropertyImages, optimizeGuestyImage } from '@/lib/images';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { PropertyGroup } from '@/config/propertyGroups';

interface UnitQuote {
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  nights: number;
  available?: boolean;
  source?: string;
}

interface Props {
  group: PropertyGroup;
  /** Pulled from trpc.properties.listForSite — same dataset the related
   *  section already loads, so no extra request. */
  allProperties: Property[];
  /** From the URL (?checkin=YYYY-MM-DD) — empty when no dates picked. */
  checkin?: string;
  checkout?: string;
  guests?: number;
}

export default function PropertyUnitsSection({
  group,
  allProperties,
  checkin,
  checkout,
  guests,
}: Props) {
  const { t } = useTranslation();

  // Resolve the ordered list of unit Property objects from the catalogue.
  // Listings missing in allProperties (e.g. inactive) are dropped — never blank.
  const units = useMemo(() => {
    const byId = new Map<string, Property>();
    for (const p of allProperties) if (p.guestyId) byId.set(p.guestyId, p);
    return group.unitGuestyIds
      .map((id) => byId.get(id))
      .filter((p): p is Property => !!p);
  }, [allProperties, group.unitGuestyIds]);

  const nights = useMemo(() => {
    if (!checkin || !checkout) return 0;
    const d = (new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000;
    return Math.max(0, Math.ceil(d));
  }, [checkin, checkout]);

  // Live quotes per unit (batch tRPC — single call covering every unit at once).
  const [quotes, setQuotes] = useState<Record<string, UnitQuote | null>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (nights <= 0 || units.length === 0) {
      setQuotes({});
      setQuotesLoading(false);
      return;
    }
    const listings = units
      .filter((p) => p.guestyId && p.isActive !== false)
      .map((p) => ({ listingId: p.guestyId!, slug: p.slug }));
    if (listings.length === 0) return;

    let cancelled = false;
    setQuotesLoading(true);
    utils.booking.getBatchQuotes
      .fetch({ listings, checkIn: checkin!, checkOut: checkout!, guests: guests || 2 })
      .then((data) => {
        if (cancelled) return;
        const mapped: Record<string, UnitQuote | null> = {};
        for (const [slug, q] of Object.entries(data)) {
          mapped[slug] = {
            total: q.pricing.total,
            nightlyRate: q.pricing.nightlyRate,
            cleaningFee: q.pricing.cleaningFee,
            nights: q.nights,
            source: q.source,
            available: q.available,
          };
        }
        setQuotes(mapped);
        setQuotesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setQuotes({});
        setQuotesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [units, nights, checkin, checkout, guests, utils]);

  if (units.length === 0) return null;

  // Preserve dates on the unit links so customers don't lose context.
  const search = new URLSearchParams();
  if (checkin) search.set('checkin', checkin);
  if (checkout) search.set('checkout', checkout);
  if (guests) search.set('guests', String(guests));
  const qs = search.toString() ? `?${search.toString()}` : '';

  return (
    <section className="mt-12 lg:mt-16">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-[24px] lg:text-[28px] font-display text-[#1A1A18]">
          {t('property.unitsInPropertyTitle', { count: units.length, defaultValue: '{{count}} units in this property' })}
        </h2>
        <p className="text-[12px] text-[#9E9A90] hidden sm:block">
          {t('property.unitsHint', 'Each unit can be reserved independently')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
        {units.map((unit) => {
          const q = quotes[unit.slug];
          const isParent = unit.guestyId === group.parentGuestyId;
          const unitImages = (unit.images?.length ? unit.images : getPropertyImages(unit.slug))
            .slice(0, 8)
            .map((img) => optimizeGuestyImage(img, 800))
            .filter(Boolean);

          return (
            <Link
              key={unit.id}
              href={`/homes/${unit.slug}${qs}`}
              className="group flex flex-col bg-white border border-[#E8E4DC] hover:border-[#8B7355] transition-colors overflow-hidden"
            >
              <UnitImageCarousel
                images={unitImages}
                alt={unit.name}
                badge={isParent ? t('property.wholeProperty', 'Whole property') : undefined}
                prevLabel={t('property.prevPhoto', 'Previous photo')}
                nextLabel={t('property.nextPhoto', 'Next photo')}
              />

              <div className="p-4 lg:p-5 flex-1 flex flex-col">
                <h3 className="text-[15px] lg:text-[16px] font-display text-[#1A1A18] leading-tight mb-1 group-hover:text-[#8B7355] transition-colors">
                  {sanitizePropertyName(unit.name)}
                </h3>

                <div className="flex items-center gap-4 text-[12px] text-[#6B6860] mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {unit.maxGuests}
                  </span>
                  <span className="flex items-center gap-1">
                    <BedDouble className="w-3.5 h-3.5" /> {unit.bedrooms}
                  </span>
                  <span className="flex items-center gap-1">
                    <Bath className="w-3.5 h-3.5" /> {unit.bathrooms}
                  </span>
                </div>

                <div className="mt-auto pt-3 border-t border-[#E8E4DC]">
                  {nights > 0 ? (
                    quotesLoading && !q ? (
                      <div className="flex flex-col gap-1.5" aria-busy="true">
                        <div className="h-3 bg-[#F5F1EB] rounded-md animate-pulse w-3/4" />
                        <div className="h-2.5 bg-[#F5F1EB] rounded-md animate-pulse w-1/2" />
                      </div>
                    ) : q && q.available === false ? (
                      <p className="text-[12px] text-[#DC2626]">
                        {t('property.unavailableForDates', 'Unavailable for these dates')}
                      </p>
                    ) : q && q.total > 0 && (q.source === 'live' || q.source === 'cached') ? (
                      <div className="flex items-baseline justify-between">
                        <span className="text-[14px] text-[#1A1A18] font-medium">
                          {formatEur(q.total)}
                        </span>
                        <span className="text-[11px] text-[#9E9A90]">
                          {t('booking.nights', { count: q.nights })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#9E9A90]">
                        {t('property.priceOnRequest')}
                      </span>
                    )
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#1A1A18] font-medium">
                        {t('property.selectDatesForPrice')}
                      </span>
                      <span className="text-[11px] text-[#8B7355] uppercase tracking-[0.04em]">
                        {t('property.viewUnit', 'View unit')} →
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Per-card image carousel — lets guests browse a unit's photos in place
   (swipe on mobile, hover arrows on desktop, dot indicators) without
   leaving the parent PDP. The whole card stays a link to the unit; the
   arrows stop the click from bubbling so they only change the slide, while
   a tap on the photo still opens the unit.
   ------------------------------------------------------------------------- */
function UnitImageCarousel({
  images,
  alt,
  badge,
  prevLabel,
  nextLabel,
}: {
  images: string[];
  alt: string;
  badge?: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi]);

  // Prevent arrow clicks from triggering the card's <Link> navigation.
  const guard = useCallback(
    (fn?: () => void) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      fn?.();
    },
    [],
  );

  return (
    <div className="relative aspect-[5/3] bg-[#F5F1EB] overflow-hidden">
      {images.length > 0 && (
        <div className="overflow-hidden h-full" ref={emblaRef}>
          <div className="flex h-full">
            {images.map((src, i) => (
              <div key={i} className="relative flex-[0_0_100%] min-w-0 h-full">
                <img
                  src={src}
                  alt={alt}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {badge && (
        <span className="absolute top-3 left-3 z-10 bg-[#1A1A18] text-white text-[10px] font-medium tracking-[0.04em] uppercase px-2 py-1">
          {badge}
        </span>
      )}

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={prevLabel}
            onClick={guard(() => emblaApi?.scrollPrev())}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 grid place-items-center w-8 h-8 rounded-full bg-white/90 text-[#1A1A18] shadow-sm opacity-0 group-hover:opacity-100 hover:bg-white transition-opacity duration-200"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label={nextLabel}
            onClick={guard(() => emblaApi?.scrollNext())}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 grid place-items-center w-8 h-8 rounded-full bg-white/90 text-[#1A1A18] shadow-sm opacity-0 group-hover:opacity-100 hover:bg-white transition-opacity duration-200"
          >
            <ChevronRight size={16} />
          </button>

          <div className="absolute bottom-2.5 left-0 right-0 z-10 flex justify-center gap-1.5 pointer-events-none">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  i === selected ? 'w-4 bg-white' : 'w-1.5 bg-white/60',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
