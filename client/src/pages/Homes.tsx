/* ==========================================================================
   HOMES — V1.6 Redesign
   Property catalogue with filters, tiers, and modal
   ========================================================================== */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearch, useLocation, useRouter } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import { Search, ChevronDown, ArrowRight, Users, Minus, Plus, AlertTriangle, MessageCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { Property, FilterDestination, SortOption } from '@/lib/types';
import { filterProperties, sortProperties, getUniqueLocalities } from '@/lib/utils';
import { pushDL, pushEcommerce } from '@/lib/datalayer';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';

interface LiveQuote {
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  nights: number;
  source?: string;
  fallbackMessage?: string;
  available?: boolean;
}

export default function Homes() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Luxury Holiday Homes in Portugal | Private Villas & Premium Rentals', description: 'Handpicked luxury holiday homes across Portugal. Each property managed to five-star hotel standards. Porto, Lisbon, Algarve, Douro and Minho.', image: IMAGES.heroHomes, url: '/homes' });
  const [, navigate] = useLocation();
  const router = useRouter();

  const { data: propsData, isLoading, isError, refetch } = trpc.properties.listForSite.useQuery();
  const allProperties = (propsData ?? []) as Property[];
  const cities = useMemo(() => getUniqueLocalities(allProperties), [allProperties]);

  // ItemList + BreadcrumbList JSON-LD for the catalogue page
  const homesGraph = useMemo(() => {
    if (!allProperties.length) return null;
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Private Villas in Portugal',
        description: 'Browse 60+ handpicked private villas across Portugal, each managed like a luxury hotel.',
        url: 'https://www.portugalactive.com/homes',
        numberOfItems: allProperties.length,
        itemListElement: allProperties.slice(0, 30).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: `https://www.portugalactive.com/homes/${p.slug}`,
          ...(p.images?.[0] && { image: p.images[0] }),
        })),
      },
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Homes' },
      ]),
    ];
  }, [allProperties]);

  const SORT_OPTIONS = useMemo(
    (): { label: string; value: SortOption }[] => [
      { label: t('filters.recommended'), value: 'recommended' },
      { label: t('filters.sortPriceAsc'), value: 'price-asc' },
      { label: t('filters.sortPriceDesc'), value: 'price-desc' },
      { label: t('filters.sortNewest'), value: 'newest' },
    ],
    [t]
  );
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const searchCheckin = searchParams.get('checkin') || '';
  const searchCheckout = searchParams.get('checkout') || '';
  const searchGuests = searchParams.get('guests') || '';
  const searchDestinationFromUrl = searchParams.get('destination') || '';
  const searchLocationFromUrl = searchParams.get('location') || '';
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

  const [destination, setDestination] = useState<FilterDestination>(() => toFilterDestination(searchDestinationFromUrl));
  const [location, setLocation] = useState(() => searchLocationFromUrl || 'all');
  // Default to price-desc (premium positioning) — always show most expensive first
  const [sort, setSort] = useState<SortOption>(() => (searchParams.get('sort') as SortOption) || 'price-desc');
  const [bookingDestination, setBookingDestination] = useState(searchDestinationFromUrl);
  const [bookingLocation, setBookingLocation] = useState(searchLocationFromUrl);
  const [bookingCheckin, setBookingCheckin] = useState(searchCheckin);
  const [bookingCheckout, setBookingCheckout] = useState(searchCheckout);
  const [bookingGuests, setBookingGuests] = useState(searchGuests ? Number(searchGuests) : 2);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote | null>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const utils = trpc.useUtils();
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
    setBookingLocation(searchLocationFromUrl);
    setBookingCheckin(searchCheckin);
    setBookingCheckout(searchCheckout);
    setBookingGuests(searchGuests ? Math.max(1, Number(searchGuests) || 2) : 2);
    setDestination(toFilterDestination(searchDestinationFromUrl));
    setLocation(searchLocationFromUrl || 'all');
  }, [searchDestinationFromUrl, searchLocationFromUrl, searchCheckin, searchCheckout, searchGuests]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const set = (k: string, v: string | undefined, fallback: string) => {
      if (v && v !== fallback) params.set(k, v);
      else params.delete(k);
    };
    set('destination', destination, 'all');
    set('location', location, 'all');
    set('sort', sort, 'price-desc');
    const qs = params.toString();
    const newUrl = `${router.base}/homes${qs ? `?${qs}` : ''}`;
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [destination, location, sort, searchString]);

  const filtered = useMemo(() => {
    const f = filterProperties(allProperties, 'all', destination, undefined, undefined, undefined, 'all', location);
    const withGuestCapacity =
      searchGuestsCount > 0
        ? f.filter((property) => (property.maxGuests ?? 0) >= searchGuestsCount)
        : f;
    return sortProperties(withGuestCapacity, sort);
  }, [allProperties, destination, location, sort, searchGuestsCount]);

  // GA4: view_item_list — fires only for cards that enter the viewport
  useEffect(() => {
    observerRef.current?.disconnect();
    pendingItemsRef.current.clear();

    observerRef.current = new IntersectionObserver((entries) => {
      let hasNew = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slug = elementToSlugRef.current.get(entry.target);
          if (slug) {
            const data = cardDataRef.current.get(slug);
            if (data) {
              pendingItemsRef.current.set(slug, data);
              hasNew = true;
            }
          }
        }
      }
      if (!hasNew) return;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        if (pendingItemsRef.current.size === 0) return;
        const { location, destination, searchNights } = observerContextRef.current;
        const listName = location !== 'all'
          ? `Search Results – ${location}`
          : destination !== 'all'
            ? `Search Results – ${destination}`
            : 'All Properties';
        const items = Array.from(pendingItemsRef.current.values())
          .sort((a, b) => a.index - b.index)
          .map(({ property, index }) => ({
            item_id: `PROP-${property.id}`,
            item_name: property.name,
            item_category: 'villa',
            item_category2: property.locality || property.destination || '',
            item_category3: 'Portugal',
            item_variant: property.tier || '',
            price: property.priceFrom || 0,
            quantity: searchNights || 1,
            index,
          }));
        pushEcommerce({
          event: 'view_item_list',
          ecommerce: { item_list_id: 'search_results', item_list_name: listName, items },
        });
        pendingItemsRef.current.clear();
      }, 200);
    }, { threshold: 0.5 });

    // Observe all currently registered card elements
    slugToElementRef.current.forEach((el) => observerRef.current!.observe(el));

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      pendingItemsRef.current.clear();
    };
  }, [filtered]);

  // When dates are set, split into available (with live pricing) and unavailable properties
  const hasDates = searchNights > 0;
  const { availableProperties, unavailableProperties } = useMemo(() => {
    if (!hasDates || Object.keys(quotes).length === 0) {
      return { availableProperties: filtered, unavailableProperties: [] as Property[] };
    }
    const available: Property[] = [];
    const unavailable: Property[] = [];
    for (const p of filtered) {
      const q = quotes[p.slug];
      if (q && q.available !== false && (q.source === 'live' || q.source === 'cached')) {
        available.push(p);
      } else if (q && q.available === false) {
        unavailable.push(p);
      } else {
        // Base price or no quote — show in available section with estimate
        available.push(p);
      }
    }
    // Sort available by live total price descending (premium positioning)
    available.sort((a, b) => {
      const qa = quotes[a.slug];
      const qb = quotes[b.slug];
      const ta = qa?.total ?? (a.priceFrom * searchNights);
      const tb = qb?.total ?? (b.priceFrom * searchNights);
      return tb - ta; // Descending — most expensive first
    });
    // Sort unavailable by base price descending too
    unavailable.sort((a, b) => b.priceFrom - a.priceFrom);
    return { availableProperties: available, unavailableProperties: unavailable };
  }, [filtered, quotes, hasDates, searchNights]);

  const clearFilters = () => {
    setDestination('all');
    setLocation('all');
    setBookingLocation('');
  };

  // PLP pricing: fetch LIVE Guesty quotes via batch endpoint when dates are set.
  // Provides real availability + pricing for every property in the catalogue.
  const [batchFailed, setBatchFailed] = useState(false);
  const batchAbortRef = useRef<AbortController | null>(null);

  // Viewport tracking refs for view_item_list
  const cardDataRef = useRef<Map<string, { property: Property; index: number }>>(new Map());
  const slugToElementRef = useRef<Map<string, Element>>(new Map());
  const elementToSlugRef = useRef<Map<Element, string>>(new Map());
  const pendingItemsRef = useRef<Map<string, { property: Property; index: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observerContextRef = useRef({ location: 'all', destination: 'all', searchNights: 0 });
  // Keep context ref fresh for use inside the IntersectionObserver callback
  observerContextRef.current = { location, destination, searchNights };

  useEffect(() => {
    if (!searchCheckin || !searchCheckout || searchNights <= 0 || allProperties.length === 0) {
      setQuotes({});
      setQuotesLoading(false);
      setBatchFailed(false);
      return;
    }

    // Build listing map from all active properties (not just filtered — we need quotes for sorting/splitting)
    const listings = allProperties
      .filter(p => p.isActive && p.guestyId)
      .map(p => ({ listingId: p.guestyId!, slug: p.slug }));

    if (listings.length === 0) {
      setQuotes({});
      setQuotesLoading(false);
      return;
    }

    // Abort previous in-flight batch if dates changed
    if (batchAbortRef.current) batchAbortRef.current.abort();
    const controller = new AbortController();
    batchAbortRef.current = controller;

    setQuotesLoading(true);
    setBatchFailed(false);

    utils.booking.getBatchQuotes
      .fetch(
        { listings, checkIn: searchCheckin, checkOut: searchCheckout, guests: effectiveGuests || 2 },
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        const mapped: Record<string, LiveQuote | null> = {};
        for (const [slug, q] of Object.entries(data)) {
          mapped[slug] = {
            total: q.pricing.total,
            nightlyRate: q.pricing.nightlyRate,
            cleaningFee: q.pricing.cleaningFee,
            nights: q.nights,
            source: q.source,
            fallbackMessage: q.fallbackMessage,
            available: q.available,
          };
        }
        setQuotes(mapped);
        setQuotesLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('[PLP] Batch quotes failed:', err);
        // Fallback: use catalogue base prices so cards aren't empty
        const computed: Record<string, LiveQuote | null> = {};
        for (const property of allProperties) {
          const nightlyRate = property.pricePerNight ?? property.priceFrom ?? 0;
          const cleaningFee = property.cleaningFee ?? 0;
          if (nightlyRate > 0) {
            computed[property.slug] = {
              total: nightlyRate * searchNights + cleaningFee,
              nightlyRate,
              cleaningFee,
              nights: searchNights,
              source: 'base',
              available: true,
            };
          }
        }
        setQuotes(computed);
        setQuotesLoading(false);
        setBatchFailed(true);
      });

    return () => { controller.abort(); };
  }, [searchCheckin, searchCheckout, searchNights, allProperties, effectiveGuests, utils]);

  const applyBookingSearch = () => {
    const params = new URLSearchParams(searchString);
    if (bookingLocation) { params.set('location', bookingLocation); params.delete('destination'); }
    else if (bookingDestination) { params.set('destination', bookingDestination); params.delete('location'); }
    else { params.delete('destination'); params.delete('location'); }
    if (bookingCheckin) params.set('checkin', bookingCheckin);
    else params.delete('checkin');
    if (bookingCheckout) params.set('checkout', bookingCheckout);
    else params.delete('checkout');
    if (bookingGuests > 1) params.set('guests', String(bookingGuests));
    else params.delete('guests');

    // GA4: search
    const nights = bookingCheckin && bookingCheckout
      ? Math.round((new Date(bookingCheckout).getTime() - new Date(bookingCheckin).getTime()) / 86400000)
      : null;
    pushDL({
      event: 'search',
      search_location: bookingLocation || bookingDestination || 'All Destinations',
      search_location_type: bookingLocation ? 'city' : bookingDestination ? 'region' : 'all',
      search_checkin: bookingCheckin || null,
      search_checkout: bookingCheckout || null,
      search_nights: nights,
      search_adults: bookingGuests,
      search_children: 0,
      search_source: 'listing_page',
    });
    // Auto-switch to price-desc when dates are set (premium positioning)
    if (bookingCheckin && bookingCheckout) {
      setSort('price-desc');
      params.set('sort', 'price-desc');
    }
    const qs = params.toString();
    navigate(`/homes${qs ? `?${qs}` : ''}`);
  };

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
      {homesGraph && <StructuredData id="homes-graph" data={homesGraph} />}
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
                  value={bookingLocation}
                  onChange={e => {
                    const v = e.target.value;
                    setBookingLocation(v);
                    setLocation(v || 'all');
                  }}
                  className="w-full h-full pl-6 pr-8 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer appearance-none truncate"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
                >
                  <option value="">{t('home.searchDestination')}</option>
                  {cities.map(city => (
                    <option key={city.value} value={city.value}>{city.label}</option>
                  ))}
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
                  value={bookingLocation}
                  onChange={e => {
                    const v = e.target.value;
                    setBookingLocation(v);
                    setLocation(v || 'all');
                  }}
                  className="w-full h-[48px] rounded-lg border border-[#E8E4DC] bg-white pl-3 pr-9 text-[13px] text-[#1A1A18] focus:ring-2 focus:ring-[#8B7355] focus:outline-none cursor-pointer appearance-none"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <option value="">{t('home.searchDestination')}</option>
                  {cities.map(city => (
                    <option key={city.value} value={city.value}>{city.label}</option>
                  ))}
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

        </div>
      </div>

      {/* Results */}
      <section className="pt-6 pb-12 md:pt-8 md:pb-16 lg:pb-20" aria-live="polite" aria-atomic="true">
        <div className="container">
          {/* Status line */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-[#78756F]">
              {hasDates && !quotesLoading ? (
                <>
                  <span className="font-medium text-[#1A1A18]">{availableProperties.length}</span> {t('homes.availableForDates', 'homes available')}
                  {unavailableProperties.length > 0 && (
                    <span> · {unavailableProperties.length} {t('homes.unavailableCount', 'unavailable')}</span>
                  )}
                </>
              ) : (
                t('homes.available', { count: filtered.length })
              )}
              {searchGuestsCount > 0 && (
                <span> · {t('homes.guestsPlus', { count: searchGuestsCount })}</span>
              )}
              {searchNights > 0 && (
                <span> · {t('homes.nightsCount', { count: searchNights })}</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              {quotesLoading && hasDates && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-[#8B7355] border-t-transparent animate-spin" />
                  <span className="text-[12px] text-[#8B7355] font-medium">{t('homes.checkingAvailability', 'Checking live availability...')}</span>
                </div>
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

          {/* Batch error banner */}
          {batchFailed && hasDates && (
            <div className="flex items-center gap-3 bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-lg px-4 py-3 mb-6">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
              <p className="text-[13px] text-[#92400E]">
                {t('homes.batchError', 'Live pricing is temporarily unavailable. Showing estimated rates — confirm final price on the property page.')}
              </p>
            </div>
          )}

          {/* SECTION 1: Available properties (with confirmed or estimated pricing) */}
          {availableProperties.length > 0 && (
            <>
              {hasDates && !quotesLoading && unavailableProperties.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                  <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[#1A1A18]">
                    {t('homes.availableSection', 'Available for your dates')}
                  </h2>
                </div>
              )}
              <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-6 md:gap-y-10 md:overflow-visible">
                {availableProperties.map((property, index) => (
                  <div
                    key={property.id}
                    className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-auto"
                    style={{ scrollSnapAlign: 'start' }}
                    ref={(el) => {
                      const slug = property.slug;
                      if (el) {
                        cardDataRef.current.set(slug, { property, index: index + 1 });
                        elementToSlugRef.current.set(el, slug);
                        slugToElementRef.current.set(slug, el);
                        observerRef.current?.observe(el);
                      } else {
                        const existing = slugToElementRef.current.get(slug);
                        if (existing) {
                          observerRef.current?.unobserve(existing);
                          elementToSlugRef.current.delete(existing);
                          slugToElementRef.current.delete(slug);
                        }
                        cardDataRef.current.delete(slug);
                      }
                    }}
                  >
                    <PropertyCard
                      property={property}
                      nights={searchNights}
                      checkin={searchCheckin}
                      checkout={searchCheckout}
                      guests={searchGuestsCount || undefined}
                      liveQuote={quotes[property.slug] || undefined}
                      quoteLoading={quotesLoading}
                      batchFailed={batchFailed}
                      listId="search_results"
                      listName="Search Results"
                      itemIndex={index + 1}
                      hidePrice
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* SECTION 2: Unavailable properties (portfolio visibility — "try other dates") */}
          {hasDates && !quotesLoading && unavailableProperties.length > 0 && (
            <div className="mt-12 md:mt-16">
              <div className="border-t border-[#E8E4DC] pt-8 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-[#9E9A90]" />
                  <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[#9E9A90]">
                    {t('homes.unavailableSection', 'Unavailable for selected dates')}
                  </h2>
                </div>
                <p className="text-[12px] text-[#9E9A90] ml-4">
                  {t('homes.unavailableHint', 'These homes may be available for different dates. Contact our concierge for alternatives.')}
                </p>
              </div>
              <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-6 md:gap-y-10 md:overflow-visible opacity-75">
                {unavailableProperties.map((property, idx) => (
                  <div
                    key={property.id}
                    className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-auto"
                    style={{ scrollSnapAlign: 'start' }}
                    ref={(el) => {
                      const slug = property.slug;
                      const itemIndex = availableProperties.length + idx + 1;
                      if (el) {
                        cardDataRef.current.set(slug, { property, index: itemIndex });
                        elementToSlugRef.current.set(el, slug);
                        slugToElementRef.current.set(slug, el);
                        observerRef.current?.observe(el);
                      } else {
                        const existing = slugToElementRef.current.get(slug);
                        if (existing) {
                          observerRef.current?.unobserve(existing);
                          elementToSlugRef.current.delete(existing);
                          slugToElementRef.current.delete(slug);
                        }
                        cardDataRef.current.delete(slug);
                      }
                    }}
                  >
                    <PropertyCard
                      property={property}
                      nights={searchNights}
                      checkin={searchCheckin}
                      checkout={searchCheckout}
                      guests={searchGuestsCount || undefined}
                      liveQuote={quotes[property.slug] || undefined}
                      quoteLoading={false}
                      hidePrice
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
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

          {/* All unavailable — nudge user */}
          {hasDates && !quotesLoading && availableProperties.length === 0 && unavailableProperties.length > 0 && (
            <div className="text-center py-8 mb-8 bg-[#F5F1EB] rounded-lg">
              <p className="text-[15px] font-display text-[#1A1A18] mb-2">
                {t('homes.noneAvailable', 'No homes available for these dates')}
              </p>
              <p className="text-[13px] text-[#9E9A90] mb-4">
                {t('homes.noneAvailableHint', 'Try adjusting your dates or speak with our concierge')}
              </p>
              <a
                href={`https://wa.me/351927161771?text=${encodeURIComponent(`Hi, I'm looking for a property from ${searchCheckin} to ${searchCheckout} for ${effectiveGuests} guests but nothing seems available. Can you help?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost inline-flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                {t('homes.talkConcierge', 'Talk to concierge')}
              </a>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
