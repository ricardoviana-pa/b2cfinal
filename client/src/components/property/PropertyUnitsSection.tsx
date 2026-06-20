/* ==========================================================================
   PROPERTY UNITS SECTION — booking.com-style grid for multi-unit groups
   Renders inside the parent PDP. Each unit shows its own photo, specs and
   (when dates are selected) a live Guesty quote, with a CTA that links to
   the unit's own PDP — where the full booking widget completes the flow.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { BedDouble, Bath, Users } from 'lucide-react';
import type { Property } from '@/lib/types';
import { formatEur, sanitizePropertyName } from '@/lib/format';
import { getPropertyImages, optimizeGuestyImage } from '@/lib/images';
import { trpc } from '@/lib/trpc';
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
          const cover = (unit.images?.length ? unit.images : getPropertyImages(unit.slug))[0];
          const coverUrl = cover ? optimizeGuestyImage(cover, 800) : '';

          return (
            <Link
              key={unit.id}
              href={`/homes/${unit.slug}${qs}`}
              className="group flex flex-col bg-white border border-[#E8E4DC] hover:border-[#8B7355] transition-colors overflow-hidden"
            >
              <div className="relative aspect-[5/3] bg-[#F5F1EB] overflow-hidden">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={unit.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  />
                ) : null}
                {isParent && (
                  <span className="absolute top-3 left-3 bg-[#1A1A18] text-white text-[10px] font-medium tracking-[0.04em] uppercase px-2 py-1">
                    {t('property.wholeProperty', 'Whole property')}
                  </span>
                )}
              </div>

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
