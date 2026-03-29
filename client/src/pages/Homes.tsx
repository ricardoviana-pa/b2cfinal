/* ==========================================================================
   HOMES — V1.6 Redesign
   Property catalogue with filters, tiers, and modal
   ========================================================================== */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useFavorites } from '@/hooks/useFavorites';
import { IMAGES } from '@/lib/images';
import { SlidersHorizontal, X, Search, ChevronDown, ArrowRight, Users, Minus, Plus, AlertTriangle, MessageCircle, Heart } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { Property, FilterDestination, SortOption } from '@/lib/types';
import { filterProperties, sortProperties } from '@/lib/utils';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';

const BEDROOM_OPTIONS = ['1-2', '3-4', '5-6', '7+'];

export default function Homes() {
  const { t } = useTranslation();
  const { favorites } = useFavorites();
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

  const toFilterDestination = (value: string): FilterDestination => {
    if (value === 'minho' || value === 'porto' || value === 'algarve') return value;
    return 'all';
  };

  const { data: propsData, isLoading, isError, refetch } = trpc.properties.listForSite.useQuery();
  const allProperties = (propsData ?? []) as Property[];

  const [occasion, setOccasion] = useState(() => searchParams.get('occasion') || 'all');
  const [destination, setDestination] = useState<FilterDestination>(() => toFilterDestination(searchDestinationFromUrl));
  const [tier, setTier] = useState(() => searchParams.get('tier') || 'all');
  const [sort, setSort] = useState<SortOption>(() => (searchParams.get('sort') as SortOption) || 'recommended');
  const [bedrooms, setBedrooms] = useState<string | undefined>(() => searchParams.get('bedrooms') || undefined);
  const [price, setPrice] = useState<string | undefined>(() => searchParams.get('price') || undefined);
  const [style, setStyle] = useState<string | undefined>(() => searchParams.get('style') || undefined);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(() => searchParams.get('favorites') === 'true');
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

  useEffect(() => {
    setBookingDestination(searchDestinationFromUrl);
    setBookingCheckin(searchCheckin);
    setBookingCheckout(searchCheckout);
    setBookingGuests(searchGuests ? Math.max(1, Number(searchGuests) || 2) : 2);
    setDestination(toFilterDestination(searchDestinationFromUrl));
  }, [searchDestinationFromUrl, searchCheckin, searchCheckout, searchGuests]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const set = (k: string, v: string | undefined, fallback: string) => {
      if (v && v !== fallback) params.set(k, v);
      else params.delete(k);
    };
    set('occasion', occasion, 'all');
    set('destination', destination, 'all');
    set('tier', tier, 'all');
    set('sort', sort, 'recommended');
    set('bedrooms', bedrooms, '');
    set('price', price, '');
    set('style', style, '');
    if (showFavoritesOnly) params.set('favorites', 'true');
    else params.delete('favorites');
    const qs = params.toString();
    const newUrl = `/homes${qs ? `?${qs}` : ''}`;
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [occasion, destination, tier, sort, bedrooms, price, style, showFavoritesOnly, searchString]);

  const filtered = useMemo(() => {
    const f = filterProperties(allProperties, occasion, destination, bedrooms, price, style, tier);
    const withGuestCapacity =
      searchGuestsCount > 0
        ? f.filter((property) => (property.maxGuests ?? 0) >= searchGuestsCount)
        : f;
    const withFavorites = showFavoritesOnly
      ? withGuestCapacity.filter((property) => favorites.includes(property.slug))
      : withGuestCapacity;
    return sortProperties(withFavorites, sort);
  }, [allProperties, occasion, destination, sort, bedrooms, price, style, tier, searchGuestsCount, showFavoritesOnly, favorites]);

  const hasActiveFilters = occasion !== 'all' || destination !== 'all' || tier !== 'all' || bedrooms || price || style || showFavoritesOnly;

  const clearFilters = () => {
    setOccasion('all');
    setDestination('all');
    setTier('all');
    setBedrooms(undefined);
    setPrice(undefined);
    setStyle(undefined);
    setShowFavoritesOnly(false);
  };

  const applyBookingSearch = () => {
    const params = new URLSearchParams(searchString);
    if (bookingDestination) params.set('destination', bookingDestination);
    else params.delete('destination');
    if (bookingCheckin) params.set('checkin', bookingCheckin);
    else params.delete('checkin');
    if (bookingCheckout) params.set('checkout', bookingCheckout);
    else params.delete('checkout');
    if (bookingGuests > 1) params.set('guests', String(bookingGuests));
    else params.delete('guests');
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
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <div className="container py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
                <div className="pt-3.5 space-y-2">
                  <div className="skeleton-shimmer h-3 w-24 rounded" />
                  <div className="skeleton-shimmer h-5 w-48 rounded" />
                  <div className="skeleton-shimmer h-3 w-36 rounded" />
                  <div className="skeleton-shimmer h-4 w-28 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <section className="section-padding">
          <div className="container max-w-lg text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F1EB]">
              <AlertTriangle className="w-6 h-6 text-[#9E9A90]" />
            </div>
            <h2 className="headline-md text-[#1A1A18] mb-3">{t('homes.loadErrorTitle', 'Something went wrong')}</h2>
            <p className="body-md mb-8">{t('homes.loadErrorBody', 'We couldn\'t load the properties. Please try again.')}</p>
            <button onClick={() => refetch()} className="btn-primary">{t('homes.retry', 'RETRY')}</button>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero — editorial only; search lives in sticky toolbar below (less empty white, clearer PLP hierarchy) */}
      <section className="relative min-h-[300px] md:min-h-[340px] h-[38vh] max-h-[520px] overflow-hidden">
        <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-homes-NBdFZGmwXL2AoxvceMgjMy.webp" alt="Collection of luxury private villas across Portugal" className="absolute inset-0 w-full h-full object-cover" width={1600} height={900} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-black/20" />
        <div className="relative z-10 container flex flex-col justify-end h-full min-h-[inherit] pt-28 md:pt-32 pb-10 md:pb-14">
          <h1 className="headline-xl text-white mb-3 max-w-2xl">{t('homes.title')}</h1>
          <p className="body-lg max-w-xl pb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {t('homes.subtitle')}
          </p>
        </div>
      </section>

      {/* Sticky: homepage-style search + filters in one dense band */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container py-2.5 md:py-3">
          {/* Desktop — pill (same as homepage) */}
          <div className="hidden lg:flex justify-center mb-2.5 md:mb-3">
            <div
              className="flex items-center w-full max-w-[780px] rounded-full bg-white shadow-[0_6px_32px_rgba(0,0,0,0.08)] overflow-hidden border border-[#E8E4DC]/60"
              style={{ height: '56px' }}
            >
              <div className="flex-1 relative h-full min-w-0">
                <select
                  value={bookingDestination}
                  onChange={e => {
                    const v = e.target.value;
                    setBookingDestination(v);
                    setDestination(toFilterDestination(v || 'all'));
                  }}
                  className="w-full h-full pl-6 pr-8 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer appearance-none truncate"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
                >
                  <option value="">{t('home.searchDestination')}</option>
                  <option value="minho">{t('home.searchMinhoCoast')}</option>
                  <option value="porto">{t('home.searchPortoDouro')}</option>
                  <option value="algarve">{t('home.searchAlgarve')}</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9E9A90] pointer-events-none" />
              </div>
              <div className="w-px h-6 bg-[#E8E4DC] shrink-0" />
              <div
                className="flex-1 min-w-0 h-full cursor-pointer"
                onClick={e => { const inp = (e.currentTarget as HTMLElement).querySelector('input'); (inp as HTMLInputElement | null)?.showPicker?.(); }}
              >
                <input
                  ref={checkInRef}
                  type="date"
                  min={today}
                  value={bookingCheckin}
                  onChange={e => {
                    setBookingCheckin(e.target.value);
                    if (bookingCheckout && bookingCheckout <= e.target.value) setBookingCheckout('');
                    setTimeout(() => checkOutRef.current?.showPicker?.(), 50);
                  }}
                  className="w-full h-full px-3 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
                />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#9E9A90] flex-shrink-0" aria-hidden />
              <div
                className="flex-1 min-w-0 h-full cursor-pointer"
                onClick={e => { const inp = (e.currentTarget as HTMLElement).querySelector('input'); (inp as HTMLInputElement | null)?.showPicker?.(); }}
              >
                <input
                  ref={checkOutRef}
                  type="date"
                  min={minCheckOut}
                  value={bookingCheckout}
                  onChange={e => setBookingCheckout(e.target.value)}
                  className="w-full h-full px-3 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
                />
              </div>
              <div className="w-px h-6 bg-[#E8E4DC] shrink-0" />
              <div className="flex items-center h-full px-3 gap-2 shrink-0">
                <Users className="w-3.5 h-3.5 text-[#9E9A90] flex-shrink-0" aria-hidden />
                <button
                  type="button"
                  onClick={() => setBookingGuests(g => Math.max(1, g - 1))}
                  disabled={bookingGuests <= 1}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
                  aria-label={t('home.decreaseGuests', 'Decrease guests')}
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span className="text-[13px] text-[#1A1A18] tabular-nums whitespace-nowrap" style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}>
                  {bookingGuests} <span className="text-[#9E9A90] lowercase">{t('home.searchGuests')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setBookingGuests(g => Math.min(30, g + 1))}
                  disabled={bookingGuests >= 30}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
                  aria-label={t('home.increaseGuests', 'Increase guests')}
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={applyBookingSearch}
                className="flex-shrink-0 h-[44px] mr-1.5 px-6 rounded-full bg-[#1A1A18] text-white text-[11px] font-semibold hover:bg-[#333330] transition-colors flex items-center gap-2"
                style={{ letterSpacing: '1.5px' }}
              >
                {t('home.searchButton')}
              </button>
            </div>
          </div>

          {/* Mobile — card stack (homepage style), then filter row */}
          <div className="lg:hidden mb-3">
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-[#E8E4DC]/80 p-4 space-y-3">
              <div className="relative">
                <select
                  value={bookingDestination}
                  onChange={e => {
                    const v = e.target.value;
                    setBookingDestination(v);
                    setDestination(toFilterDestination(v || 'all'));
                  }}
                  className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-white pl-3 pr-9 text-[13px] text-[#1A1A18] focus:ring-2 focus:ring-[#8B7355] focus:outline-none cursor-pointer appearance-none"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <option value="">{t('home.searchDestination')}</option>
                  <option value="minho">{t('home.searchMinhoCoast')}</option>
                  <option value="porto">{t('home.searchPortoDouro')}</option>
                  <option value="algarve">{t('home.searchAlgarve')}</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9A90] pointer-events-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="relative"
                  onClick={e => { const inp = (e.currentTarget as HTMLElement).querySelector('input'); (inp as HTMLInputElement | null)?.showPicker?.(); }}
                >
                  <input
                    type="date"
                    min={today}
                    value={bookingCheckin}
                    onChange={e => {
                      setBookingCheckin(e.target.value);
                      if (bookingCheckout && bookingCheckout <= e.target.value) setBookingCheckout('');
                      setTimeout(() => checkOutRef.current?.showPicker?.(), 50);
                    }}
                    className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-white px-3 text-[13px] text-[#1A1A18] focus:ring-2 focus:ring-[#8B7355] focus:outline-none cursor-pointer"
                    style={{ fontFamily: 'var(--font-body)' }}
                  />
                </div>
                <div
                  className="relative"
                  onClick={e => { const inp = (e.currentTarget as HTMLElement).querySelector('input'); (inp as HTMLInputElement | null)?.showPicker?.(); }}
                >
                  <input
                    ref={checkOutRef}
                    type="date"
                    min={minCheckOut}
                    value={bookingCheckout}
                    onChange={e => setBookingCheckout(e.target.value)}
                    className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-white px-3 text-[13px] text-[#1A1A18] focus:ring-2 focus:ring-[#8B7355] focus:outline-none cursor-pointer"
                    style={{ fontFamily: 'var(--font-body)' }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 h-[48px] rounded-lg border border-[#E8E4DC] bg-white px-3">
                  <Users className="w-4 h-4 text-[#9E9A90] shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setBookingGuests(g => Math.max(1, g - 1))}
                    disabled={bookingGuests <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] disabled:opacity-30"
                    aria-label={t('home.decreaseGuests', 'Decrease guests')}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-[13px] text-[#1A1A18] tabular-nums flex-1 text-center">{bookingGuests} {t('home.searchGuests')}</span>
                  <button
                    type="button"
                    onClick={() => setBookingGuests(g => Math.min(30, g + 1))}
                    disabled={bookingGuests >= 30}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] disabled:opacity-30"
                    aria-label={t('home.increaseGuests', 'Increase guests')}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={applyBookingSearch}
                  className="shrink-0 h-[48px] px-5 rounded-full bg-[#1A1A18] text-white text-[11px] font-semibold hover:bg-[#333330] transition-colors flex items-center justify-center"
                  style={{ letterSpacing: '1.5px' }}
                >
                  {t('home.searchButton')}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile filter + sort */}
          <div className="lg:hidden flex items-center justify-between gap-2">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="flex items-center gap-2 text-[13px] font-medium text-[#1A1A18] border border-[#E8E4DC] px-4 py-2.5 flex-1"
              style={{ minHeight: '44px', minWidth: 'auto' }}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {t('filters.mobileFilter')}{hasActiveFilters ? ` (${filtered.length})` : ''}
            </button>
            {favorites.length > 0 && (
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`flex items-center gap-1.5 text-[13px] font-medium px-3 py-2.5 border rounded-full transition-all ${
                  showFavoritesOnly
                    ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
                    : 'text-[#6B6860] border-[#E8E4DC] hover:border-[#1A1A18] hover:text-[#1A1A18]'
                }`}
                style={{ minHeight: '44px', minWidth: 'auto' }}
                title={t('filters.favorites', 'Favorites')}
              >
                <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-white' : ''}`} />
                <span>{favorites.length}</span>
              </button>
            )}
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map(o => (
                  <Chip key={o.value} active={occasion === o.value} onClick={() => setOccasion(o.value)}>{o.label}</Chip>
                ))}
                <div className="w-px h-8 bg-[#E8E4DC] self-center mx-1" />
                {TIERS.map(t => (
                  <Chip key={t.value} active={tier === t.value} onClick={() => setTier(t.value)}>{t.label}</Chip>
                ))}
                <div className="w-px h-8 bg-[#E8E4DC] self-center mx-1" />
                <Chip
                  active={showFavoritesOnly}
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                >
                  <Heart className="w-3 h-3 mr-1 inline" />
                  {t('filters.favorites', 'Favorites')} {favorites.length > 0 && `(${favorites.length})`}
                </Chip>
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

              {favorites.length > 0 && (
                <div className="mb-6">
                  <p className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90] mb-3">{t('filters.favorites', 'Favorites')}</p>
                  <Chip
                    active={showFavoritesOnly}
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  >
                    <Heart className="w-3 h-3 mr-1 inline" />
                    {t('filters.showFavorites', 'Show favorites')} ({favorites.length})
                  </Chip>
                </div>
              )}

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
      <section className="pt-6 pb-12 md:pt-8 md:pb-16 lg:pb-20" aria-live="polite" aria-atomic="true">
        <div className="container">
          <p className="text-[13px] text-[#78756F] mb-4">
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
                  guests={searchGuestsCount || undefined}
                />
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 md:py-24 max-w-md mx-auto">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F1EB]">
                <Search className="w-5 h-5 text-[#9E9A90]" />
              </div>
              <h3 className="headline-sm text-[#1A1A18] mb-2">{t('homes.noMatch', 'No homes match your criteria')}</h3>
              <p className="body-md mb-8">{t('homes.noMatchHint', 'Try adjusting your filters or contact our team for help.')}</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <button onClick={clearFilters} className="btn-primary">{t('filters.clearAll')}</button>
                <a
                  href="https://wa.me/351927161771?text=Hi%2C%20I%27m%20looking%20for%20a%20property%20but%20can%27t%20find%20the%20right%20match.%20Can%20you%20help%3F"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost inline-flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('homes.talkConcierge', 'Talk to concierge')}
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
