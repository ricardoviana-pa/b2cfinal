/* ==========================================================================
   HOMES — V1.6 Redesign
   Property catalogue with filters, tiers, and modal
   ========================================================================== */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import { SlidersHorizontal, X, Search, Calendar, Users, Minus, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { Property, FilterDestination, SortOption } from '@/lib/types';
import { filterProperties, sortProperties } from '@/lib/utils';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';

const BEDROOM_OPTIONS = ['1-2', '3-4', '5-6', '7+'];

export default function Homes() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Private Villas Portugal | Luxury Holiday Homes', description: 'Browse 50+ handpicked private villas across Portugal. Pool, concierge, housekeeping included. Filter by region and book direct.', image: IMAGES.heroHomes, url: '/homes' });
  const [, navigate] = useLocation();

  const OCCASIONS = useMemo(
    () => [
      { label: t('filters.all'), value: 'all' },
      { label: t('filters.couples'), value: 'couples' },
      { label: t('filters.families'), value: 'families' },
      { label: t('filters.groups'), value: 'groups' },
      { label: t('filters.extendedStays'), value: 'extended-stays' },
    ],
    [t]
  );

  const DESTINATIONS = useMemo(
    (): { label: string; value: FilterDestination }[] => [
      { label: t('filters.all'), value: 'all' },
      { label: t('destinations.minho'), value: 'minho' },
      { label: t('destinations.porto'), value: 'porto' },
      { label: t('destinations.algarve'), value: 'algarve' },
    ],
    [t]
  );

  const TIERS = useMemo(
    () => [
      { label: t('filters.allTiers'), value: 'all' },
      { label: t('filters.signature'), value: 'signature' },
      { label: t('filters.select'), value: 'select' },
      { label: t('filters.new'), value: 'new' },
    ],
    [t]
  );

  const SORT_OPTIONS = useMemo(
    (): { label: string; value: SortOption }[] => [
      { label: t('filters.recommended'), value: 'recommended' },
      { label: t('filters.sortPriceAsc'), value: 'price-asc' },
      { label: t('filters.sortPriceDesc'), value: 'price-desc' },
      { label: t('filters.sortNewest'), value: 'newest' },
    ],
    [t]
  );

  const PRICE_OPTIONS = useMemo(
    () => [
      { label: t('filters.priceUnder200'), value: 'under-200' },
      { label: t('filters.price200400'), value: '200-400' },
      { label: t('filters.price400600'), value: '400-600' },
      { label: t('filters.price600Plus'), value: '600+' },
    ],
    [t]
  );

  const STYLE_OPTIONS = useMemo(
    () => [
      t('filters.stylePool'),
      t('filters.styleHeatedPool'),
      t('filters.styleBeachfront'),
      t('filters.styleCountryside'),
      t('filters.styleOceanView'),
      t('filters.stylePetFriendly'),
      t('filters.styleRemoteWork'),
    ],
    [t]
  );
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const searchCheckin = searchParams.get('checkin') || '';
  const searchCheckout = searchParams.get('checkout') || '';
  const searchGuests = searchParams.get('guests') || '';
  const searchDestinationFromUrl = searchParams.get('destination') || '';
  const searchNights = useMemo(() => {
    if (!searchCheckin || !searchCheckout) return 0;
    const diff = new Date(searchCheckout).getTime() - new Date(searchCheckin).getTime();
    return diff > 0 ? Math.ceil(diff / 86400000) : 0;
  }, [searchCheckin, searchCheckout]);
  const searchGuestsCount = useMemo(() => {
    const parsed = Number(searchGuests);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [searchGuests]);

  const { data: propsData, isLoading, isError } = trpc.properties.listForSite.useQuery();
  const allProperties = (propsData ?? []) as Property[];

  const [occasion, setOccasion] = useState('all');
  const [destination, setDestination] = useState<FilterDestination>('all');
  const [tier, setTier] = useState('all');
  const [sort, setSort] = useState<SortOption>('recommended');
  const [bedrooms, setBedrooms] = useState<string | undefined>();
  const [price, setPrice] = useState<string | undefined>();
  const [style, setStyle] = useState<string | undefined>();
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [bookingDestination, setBookingDestination] = useState(searchDestinationFromUrl);
  const [bookingCheckin, setBookingCheckin] = useState(searchCheckin);
  const [bookingCheckout, setBookingCheckout] = useState(searchCheckout);
  const [bookingGuests, setBookingGuests] = useState(searchGuests ? Number(searchGuests) : 2);
  const effectiveGuests = searchGuestsCount > 0 ? searchGuestsCount : bookingGuests;
  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const minCheckOut = useMemo(() => {
    if (!bookingCheckin) return today;
    const d = new Date(bookingCheckin);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, [bookingCheckin, today]);

  const toFilterDestination = (value: string): FilterDestination => {
    if (value === 'minho' || value === 'porto' || value === 'algarve') return value;
    return 'all';
  };

  useEffect(() => {
    setBookingDestination(searchDestinationFromUrl);
    setBookingCheckin(searchCheckin);
    setBookingCheckout(searchCheckout);
    setBookingGuests(searchGuests ? Math.max(1, Number(searchGuests) || 2) : 2);
    setDestination(toFilterDestination(searchDestinationFromUrl));
  }, [searchDestinationFromUrl, searchCheckin, searchCheckout, searchGuests]);

  const filtered = useMemo(() => {
    const f = filterProperties(allProperties, occasion, destination, bedrooms, price, style, tier);
    const withGuestCapacity =
      searchGuestsCount > 0
        ? f.filter((property) => (property.maxGuests ?? 0) >= searchGuestsCount)
        : f;
    return sortProperties(withGuestCapacity, sort);
  }, [allProperties, occasion, destination, sort, bedrooms, price, style, tier, searchGuestsCount]);

  const hasActiveFilters = occasion !== 'all' || destination !== 'all' || tier !== 'all' || bedrooms || price || style;

  const clearFilters = () => {
    setOccasion('all');
    setDestination('all');
    setTier('all');
    setBedrooms(undefined);
    setPrice(undefined);
    setStyle(undefined);
  };

  const applyBookingSearch = () => {
    const params = new URLSearchParams();
    if (bookingDestination && bookingDestination !== 'all') params.set('destination', bookingDestination);
    if (bookingCheckin) params.set('checkin', bookingCheckin);
    if (bookingCheckout) params.set('checkout', bookingCheckout);
    if (bookingGuests > 1) params.set('guests', String(bookingGuests));
    const qs = params.toString();
    navigate(`/homes${qs ? `?${qs}` : ''}`);
  };

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-[11px] font-medium tracking-[0.12em] uppercase whitespace-nowrap transition-all border rounded-full ${
        active
          ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
          : 'bg-transparent text-[#6B6860] border-[#E8E4DC] hover:border-[#1A1A18] hover:text-[#1A1A18]'
      }`}
      style={{ minHeight: '44px', minWidth: 'auto' }}
    >
      {children}
    </button>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="w-[320px] h-[180px] rounded-lg bg-[#F5F1EB] animate-pulse border border-[#E8E4DC]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <section className="section-padding">
          <div className="container text-center">
            <h2 className="headline-md text-[#1A1A18] mb-3">{t('homes.loadErrorTitle')}</h2>
            <p className="body-md mb-6">{t('homes.loadErrorBody')}</p>
            <button onClick={() => navigate('/homes')} className="btn-primary">{t('homes.tryAgain')}</button>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-homes-NBdFZGmwXL2AoxvceMgjMy.webp" alt="Collection of luxury private villas across Portugal" className="absolute inset-0 w-full h-full object-cover" width={1600} height={900} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white mb-4">{t('homes.title')}</h1>
          <p className="body-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('homes.subtitle')}
          </p>
        </div>
      </section>

      {/* Sticky Filter Bar */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container py-3 md:py-4">
          {/* Booking bar with dates on PLP */}
          <div className="mb-3 md:mb-4 border border-[#E8E4DC] bg-white">
            <div className="grid grid-cols-1 md:grid-cols-12">
              <div className="md:col-span-3 border-b md:border-b-0 md:border-r border-[#E8E4DC] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#9E9A90] mb-1">{t('homes.bookingBarDestination')}</p>
                <select
                  value={bookingDestination}
                  onChange={(e) => setBookingDestination(e.target.value)}
                  className="w-full bg-transparent text-[13px] text-[#1A1A18] focus:outline-none cursor-pointer"
                >
                  <option value="">{t('search.allRegions')}</option>
                  <option value="minho">{t('destinations.minho')}</option>
                  <option value="porto">{t('destinations.porto')}</option>
                  <option value="algarve">{t('destinations.algarve')}</option>
                </select>
              </div>

              <div
                className="md:col-span-3 border-b md:border-b-0 md:border-r border-[#E8E4DC] px-3 py-2.5 cursor-pointer"
                onClick={() => checkInRef.current?.showPicker?.()}
              >
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#9E9A90] mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {t('search.checkIn')}
                </p>
                <input
                  ref={checkInRef}
                  type="date"
                  min={today}
                  value={bookingCheckin}
                  onChange={(e) => {
                    setBookingCheckin(e.target.value);
                    if (bookingCheckout && bookingCheckout <= e.target.value) setBookingCheckout('');
                    setTimeout(() => checkOutRef.current?.showPicker?.(), 50);
                  }}
                  className="w-full bg-transparent text-[13px] text-[#1A1A18] focus:outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute"
                />
              </div>

              <div
                className="md:col-span-3 border-b md:border-b-0 md:border-r border-[#E8E4DC] px-3 py-2.5 cursor-pointer"
                onClick={() => checkOutRef.current?.showPicker?.()}
              >
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#9E9A90] mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {t('search.checkOut')}
                </p>
                <input
                  ref={checkOutRef}
                  type="date"
                  min={minCheckOut}
                  value={bookingCheckout}
                  onChange={(e) => setBookingCheckout(e.target.value)}
                  className="w-full bg-transparent text-[13px] text-[#1A1A18] focus:outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute"
                />
              </div>

              <div className="md:col-span-2 border-b md:border-b-0 md:border-r border-[#E8E4DC] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#9E9A90] mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {t('search.guests')}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingGuests(g => Math.max(1, g - 1))}
                    disabled={bookingGuests <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="min-w-[3ch] text-center text-[13px] text-[#1A1A18] tabular-nums">{bookingGuests}</span>
                  <button
                    type="button"
                    onClick={() => setBookingGuests(g => Math.min(30, g + 1))}
                    disabled={bookingGuests >= 30}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-1 px-2 py-2">
                <button
                  onClick={applyBookingSearch}
                  className="w-full h-full min-h-[48px] rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase hover:bg-[#333330] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" /> {t('search.search')}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden flex items-center justify-between">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="flex items-center gap-2 text-[13px] font-medium text-[#1A1A18] border border-[#E8E4DC] px-4 py-2.5"
              style={{ minHeight: '44px', minWidth: 'auto' }}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {t('filters.mobileFilter')}{hasActiveFilters ? ` (${filtered.length})` : ''}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="text-[13px] text-[#6B6860] bg-transparent border border-[#E8E4DC] px-3 py-2.5 font-sans"
              style={{ minHeight: '44px' }}
            >
              {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Desktop */}
          <div className="hidden lg:block">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map(o => (
                  <Chip key={o.value} active={occasion === o.value} onClick={() => setOccasion(o.value)}>{o.label}</Chip>
                ))}
                <div className="w-px h-8 bg-[#E8E4DC] self-center mx-1" />
                {TIERS.map(t => (
                  <Chip key={t.value} active={tier === t.value} onClick={() => setTier(t.value)}>{t.label}</Chip>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors" style={{ minHeight: '44px', minWidth: 'auto' }}>
                    {t('filters.clearAll')}
                  </button>
                )}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="text-[13px] text-[#6B6860] bg-transparent border border-[#E8E4DC] px-3 py-2 font-sans"
                >
                  {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {DESTINATIONS.map(d => (
                <Chip
                  key={d.value}
                  active={destination === d.value}
                  onClick={() => {
                    setDestination(d.value);
                    setBookingDestination(d.value === 'all' ? '' : d.value);
                  }}
                >
                  {d.label}
                </Chip>
              ))}
              <button
                onClick={() => setShowMoreFilters(!showMoreFilters)}
                className="text-[13px] font-medium text-[#8B7355] ml-2 hover:text-[#1A1A18] transition-colors"
                style={{ minHeight: '44px', minWidth: 'auto' }}
              >
                {showMoreFilters ? t('filters.lessFilters') : t('filters.moreFilters')}
              </button>
            </div>

            {showMoreFilters && (
              <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-[#E8E4DC]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90]">{t('filters.bedrooms')}:</span>
                  {BEDROOM_OPTIONS.map(b => (
                    <Chip key={b} active={bedrooms === b} onClick={() => setBedrooms(bedrooms === b ? undefined : b)}>{b}</Chip>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90]">{t('filters.price')}:</span>
                  {PRICE_OPTIONS.map(p => (
                    <Chip key={p.value} active={price === p.value} onClick={() => setPrice(price === p.value ? undefined : p.value)}>{p.label}</Chip>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[#9E9A90]">{t('filters.amenitiesLabel')}</span>
                  {STYLE_OPTIONS.map(s => (
                    <Chip key={s} active={style === s} onClick={() => setStyle(style === s ? undefined : s)}>{s}</Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filters Bottom Sheet */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[#FAFAF7] max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-display text-[#1A1A18]">{t('filters.showFilters')}</h3>
                <button onClick={() => setMobileFiltersOpen(false)} className="w-10 h-10 flex items-center justify-center" style={{ minHeight: 'auto', minWidth: 'auto' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {([
                { groupKey: 'occasion' as const, labelKey: 'filters.occasion', items: OCCASIONS, value: occasion },
                { groupKey: 'destination' as const, labelKey: 'filters.destinationLabel', items: DESTINATIONS, value: destination },
                { groupKey: 'tier' as const, labelKey: 'filters.tierLabel', items: TIERS, value: tier },
              ] as const).map((group) => (
                <div key={group.groupKey} className="mb-6">
                  <p className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90] mb-3">{t(group.labelKey)}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item: { label: string; value: string }) => (
                      <Chip
                        key={item.value}
                        active={group.value === item.value}
                        onClick={() => {
                          if (group.groupKey === 'occasion') setOccasion(item.value);
                          if (group.groupKey === 'tier') setTier(item.value);
                          if (group.groupKey === 'destination') {
                            setDestination(item.value as FilterDestination);
                            setBookingDestination(item.value === 'all' ? '' : item.value);
                          }
                        }}
                      >
                        {item.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="btn-primary w-full mt-4"
              >
                {t('filters.showHomes', { count: filtered.length })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <section className="section-padding">
        <div className="container">
          <p className="text-[13px] text-[#9E9A90] mb-6">
            {t('homes.available', { count: filtered.length })}
            {searchGuestsCount > 0 && (
              <span> · {t('homes.guestsPlus', { count: searchGuestsCount })}</span>
            )}
            {searchNights > 0 && (
              <span> · {t('homes.nightsCount', { count: searchNights })}</span>
            )}
          </p>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-6 md:gap-y-10 md:overflow-visible">
            {filtered.map(property => (
              <div key={property.id} className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <PropertyCard
                  property={property}
                  nights={searchNights}
                  checkin={searchCheckin}
                  checkout={searchCheckout}
                />
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="body-lg mb-2" style={{ color: '#1A1A18' }}>{t('homes.noMatch')}</p>
              <p className="body-md mb-8">{t('homes.noMatchHint')}</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <button onClick={clearFilters} className="btn-primary">{t('filters.clearAll')}</button>
                <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-ghost">{t('homes.talkConcierge')}</a>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
