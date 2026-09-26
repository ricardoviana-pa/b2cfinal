/* ==========================================================================
   HOMES — V1.6 Redesign
   Property catalogue with filters, tiers, and modal
   ========================================================================== */

import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { getDisplayName } from '@/lib/format';
import { Link, useSearch, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useMeasurementConsent } from '@/hooks/useMeasurementConsent';
import { IMAGES } from '@/lib/images';
import { SlidersHorizontal, Search, ChevronDown, ArrowRight, Users, Minus, Plus, AlertTriangle, MessageCircle, Map as MapIcon } from 'lucide-react';

const HomesMap = lazy(() => import('@/components/property/HomesMap'));
import collectionsData from '@/data/collections.json';
import { matchesCollection } from '@/lib/collectionFilters';
import heatedPoolData from '@/data/heatedPool.json';
const HEATED_POOL_SLUGS = new Set<string>((heatedPoolData as any).slugs || []);
import { trpc } from '@/lib/trpc';
import type { Property, FilterDestination, SortOption } from '@/lib/types';
import { filterProperties, getUniqueLocalities } from '@/lib/utils';
import { isChildUnit } from '@/config/propertyGroups';
import { hasConfirmedQuote, hasSwimmingPool, hasHeatedPool, parseHomeFilters, searchPrice, sortSearchResults } from '@/lib/homeSearch';
import { openDatePickerWithin } from '@/lib/datePicker';
import { pushDL, pushEcommerce } from '@/lib/datalayer';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { parseDestinationSelection } from '@/lib/homeSearch';
import { usePartnerPrices } from '@/hooks/usePartnerPrices';
import StayCollections from '@/components/property/StayCollections';

interface LiveQuote {
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  nights: number;
  source?: string;
  fallbackMessage?: string;
  available?: boolean;
  feesKnown?: boolean;
}

export default function Homes() {
  const measurementAllowed = useMeasurementConsent();
  const { t, i18n } = useTranslation();
  usePageMeta({ title: 'Luxury Holiday Homes in Portugal | Private Villas & Premium Rentals', description: 'Handpicked luxury holiday homes across Portugal. Each property managed to five-star hotel standards. Porto, Lisbon, Algarve, Douro and Minho.', image: IMAGES.heroHomes, url: '/homes' });
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const facets = parseHomeFilters(searchParams);
  const collection = collectionsData.find(c => c.slug === searchParams.get('collection'));
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchString);
    if (!value || value === 'all' || (key === 'sort' && value === 'recommended')) params.delete(key);
    else params.set(key, value);
    navigate(`/homes${params.size ? `?${params}` : ''}`, { replace: true });
  };

  const { data: propsData, isLoading, isError, refetch } = trpc.properties.catalogForSite.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const allProperties = (propsData ?? []) as Property[];

  // ── PLP filters (type · budget · pool · heated pool · pet-friendly) + map ──
  const typeFilter = facets.type;
  const budgetFilter = facets.budget;
  const bedroomFilter = facets.bedrooms;
  const poolOnly = facets.pool;
  const heatedPoolOnly = facets.heatedPool;
  const petFriendlyOnly = facets.pets;
  const setTypeFilter = (v: string) => updateFilter('type', v);
  const setBudgetFilter = (v: string) => updateFilter('budget', v);
  const setBedroomFilter = (v: string) => updateFilter('bedrooms', v);
  const setPoolOnly = (v: boolean) => updateFilter('pool', v ? '1' : '');
  const setHeatedPoolOnly = (v: boolean) => updateFilter('heatedPool', v ? '1' : '');
  const setPetFriendlyOnly = (v: boolean) => updateFilter('pets', v ? '1' : '');
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // SSR-prefetched tiny query (see Home.tsx) so the destination picker is
  // populated immediately; falls back to deriving from the full list.
  const { data: localityOptions } = trpc.properties.localities.useQuery();
  const derivedCities = (localityOptions?.length
    ? localityOptions
    : getUniqueLocalities(allProperties)) as Array<{ label: string; value: string; group?: string; groupSlug?: string }>;
  const cities = derivedCities;

  // Same region grouping as the homepage picker (see Home.tsx).
  const cityOptions = useMemo(() => {
    const groups: Array<[string, typeof cities]> = [];
    for (const c of cities) {
      const g = c.groupSlug || c.group || '';
      const last = groups[groups.length - 1];
      if (last && last[0] === g) last[1].push(c);
      else groups.push([g, [c]]);
    }
    return groups.map(([g, items], gi) =>
      g ? (
        <optgroup key={`g-${g}-${gi}`} label={t(`destinations.${g}`, { defaultValue: items[0]?.group || g })}>
          <option value={`region:${g}`}>{t(`destinations.${g}`, { defaultValue: items[0]?.group || g })}</option>
          {items.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </optgroup>
      ) : (
        items.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
      ),
    );
  }, [cities, t]);
  // "From €X" per card (lowest real bookable nightly), when no dates are picked.
  const fromListingIds = useMemo(
    () => allProperties.filter(p => p.guestyId).map(p => p.guestyId!),
    [allProperties],
  );
  const { data: guestyFromPrices } = trpc.booking.lowestNightlyBatch.useQuery(
    { listingIds: fromListingIds },
    { enabled: fromListingIds.length > 0, staleTime: 5 * 60 * 1000 },
  );

  // ItemList + BreadcrumbList JSON-LD for the catalogue page
  const homesGraph = useMemo(() => {
    if (!allProperties.length) return null;
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: t('nav.homes'),
        description: t('conversion.homesIntro'),
        url: `https://www.portugalactive.com/${i18n.language.split('-')[0]}/homes`,
        numberOfItems: allProperties.length,
        itemListElement: allProperties.slice(0, 30).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: getDisplayName(p),
          url: `https://www.portugalactive.com/${i18n.language.split('-')[0]}/homes/${p.slug}`,
          ...(p.images?.[0] && { image: p.images[0] }),
        })),
      },
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Homes' },
      ]),
    ];
  }, [allProperties, t, i18n.language]);

  const SORT_OPTIONS = useMemo(
    (): { label: string; value: SortOption }[] => [
      { label: t('filters.recommended'), value: 'recommended' },
      { label: t('filters.sortPriceAsc'), value: 'price-asc' },
      { label: t('filters.sortPriceDesc'), value: 'price-desc' },
      { label: t('filters.sortNewest'), value: 'newest' },
    ],
    [t]
  );
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
    if (value === 'minho' || value === 'porto' || value === 'lisbon' || value === 'alentejo' || value === 'algarve') return value;
    return 'all';
  };

  const destination = toFilterDestination(searchDestinationFromUrl);
  const location = searchLocationFromUrl || 'all';
  const sort = facets.sort;
  const setSort = (v: SortOption) => updateFilter('sort', v);
  const [bookingDestination, setBookingDestination] = useState(searchDestinationFromUrl);
  const [bookingLocation, setBookingLocation] = useState(searchLocationFromUrl);
  const [bookingCheckin, setBookingCheckin] = useState(searchCheckin);
  const [bookingCheckout, setBookingCheckout] = useState(searchCheckout);
  const [bookingGuests, setBookingGuests] = useState(searchGuests ? Number(searchGuests) : 2);
  const [guestyQuotes, setQuotes] = useState<Record<string, LiveQuote | null>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  // Which search (dates + party) the quotes in state answer. Until it matches
  // the URL — on the server render, on the first client render and in the
  // render between a date change and the fetch starting — counts would read
  // "0 com disponibilidade confirmada" (auditoria set/2026).
  const [quotesFor, setQuotesFor] = useState('');
  const [showAll, setShowAll] = useState(false);
  const utils = trpc.useUtils();
  const effectiveGuests = searchGuestsCount > 0 ? searchGuestsCount : bookingGuests;
  // Why an empty dated search came back empty (season rules, party size, length)
  // — so we can answer with the rule and the nearest dates instead of a dead end.
  /** "2027-07-03" → "3 Jul" in the active language. Raw ISO in a call to
   *  action reads like a system error, not an invitation. */
  const fmtHintDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(iso + 'T00:00:00Z'));
  // Dead-end capture: a guest whose dates we genuinely can't serve used to
  // leave with no trace. WhatsApp alone filters out anyone not on WhatsApp or
  // on desktop, so offer a two-field form as well — the enquiry is the lead.
  const createLead = trpc.leads.create.useMutation();
  const [leadEmail, setLeadEmail] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadSent, setLeadSent] = useState(false);
  const [leadError, setLeadError] = useState('');
  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadEmail) return;
    setLeadError('');
    try {
      await createLead.mutateAsync({
        email: leadEmail,
        name: leadName || undefined,
        source: 'search-no-availability',
        message: `Looking for ${searchCheckin} → ${searchCheckout}, ${effectiveGuests} guests. Nothing matched on the site.`,
        metadata: {
          checkin: searchCheckin,
          checkout: searchCheckout,
          guests: String(effectiveGuests),
          nights: String(searchNights),
          locale: i18n.language,
        },
      });
      setLeadSent(true);
      pushDL({ event: 'generate_lead', lead_source: 'search-no-availability', lead_type: 'availability_request' });
    } catch {
      setLeadError(t('homes.leadError', 'Could not send — please try WhatsApp below.'));
    }
  };

  const { data: searchHint } = trpc.booking.searchHint.useQuery(
    { checkIn: searchCheckin, checkOut: searchCheckout, guests: effectiveGuests },
    { enabled: !!searchCheckin && !!searchCheckout, staleTime: 60 * 60 * 1000 },
  );
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
  }, [searchDestinationFromUrl, searchLocationFromUrl, searchCheckin, searchCheckout, searchGuests]);

  const candidateProperties = useMemo(() => {
    const f = filterProperties(allProperties, 'all', destination, bedroomFilter === 'all' ? undefined : bedroomFilter, undefined, undefined, 'all', location);
    const withGuestCapacity =
      searchGuestsCount > 0
        ? f.filter((property) => (property.maxGuests ?? 0) >= searchGuestsCount)
        : f;
    // Hide listings that are child units of a multi-unit group — they show up
    // inside the parent's PDP, not as standalone PLP cards. The parent listing
    // stays in the list and renders with "X units" treatment.
    const withoutChildUnits = withGuestCapacity.filter((p) => !isChildUnit(p.guestyId));
    const amenityList = (p: Property): string[] =>
      Object.values((p.amenities || {}) as Record<string, string[]>).flat().filter((a) => typeof a === 'string');
    const facetted = withoutChildUnits.filter((p) => {
      if (collection && !matchesCollection(p, collection)) return false;
      if (typeFilter !== 'all' && (p.propertyType || '') !== typeFilter) return false;
      if (poolOnly && !HEATED_POOL_SLUGS.has(p.slug) && !hasSwimmingPool(amenityList(p))) return false;
      // "Heated pool" lives in names/taglines, not the amenity list.
      if (
        heatedPoolOnly &&
        !HEATED_POOL_SLUGS.has(p.slug) &&
        !hasHeatedPool(`${p.name} ${(p as any).tagline || ''} ${amenityList(p).join(' ')}`)
      ) return false;
      if (petFriendlyOnly && !(p as any).petsAllowed) return false;
      return true;
    });
    return facetted;
  }, [allProperties, destination, location, searchGuestsCount, typeFilter, poolOnly, heatedPoolOnly, petFriendlyOnly, bedroomFilter, collection]);

  const partner = usePartnerPrices(candidateProperties, { checkIn: searchCheckin, checkOut: searchCheckout, guests: effectiveGuests || 2 });
  const fromPrices = useMemo(() => ({ ...guestyFromPrices, ...partner.prices }), [guestyFromPrices, partner.prices]);
  const quotes: Record<string, LiveQuote | null> = useMemo(() => ({ ...guestyQuotes, ...partner.quotes }), [guestyQuotes, partner.quotes]);
  const filtered = useMemo(() => {
    const facetted = candidateProperties.filter(p => {
      if (budgetFilter !== 'all') {
        const price = searchPrice(p, quotes, fromPrices, searchNights);
        if (price === null) return false;
        const nightly = searchNights > 0 ? price / searchNights : price;
        if (budgetFilter === 'b1' && nightly > 300) return false;
        if (budgetFilter === 'b2' && (nightly <= 300 || nightly > 500)) return false;
        if (budgetFilter === 'b3' && (nightly <= 500 || nightly > 800)) return false;
        if (budgetFilter === 'b4' && nightly <= 800) return false;
      }
      return true;
    });
    return sortSearchResults(facetted, sort, quotes, fromPrices, searchNights);
  }, [candidateProperties, budgetFilter, sort, quotes, fromPrices, searchNights]);

  // GA4: view_item_list — fires only for cards that enter the viewport
  useEffect(() => {
    observerRef.current?.disconnect();
    pendingItemsRef.current.clear();

    if (!measurementAllowed) return;

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
  }, [filtered, measurementAllowed]);

  // When dates are set, split into available (with live pricing) and unavailable properties
  const hasDates = searchNights > 0;
  const quotesKey = `${searchCheckin}|${searchCheckout}|${effectiveGuests || 2}`;
  const quotesPending = hasDates && (quotesLoading || quotesFor !== quotesKey);
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
    return { availableProperties: available, unavailableProperties: unavailable };
  }, [filtered, quotes, hasDates, searchNights, sort]);

  const clearFilters = () => {
    const params = new URLSearchParams(searchString);
    for (const key of ['collection', 'destination', 'location', 'type', 'budget', 'bedrooms', 'pool', 'heatedPool', 'pets', 'sort']) params.delete(key);
    setBookingLocation('');
    setBookingDestination('');
    navigate(`/homes${params.size ? `?${params}` : ''}`, { replace: true });
  };
  const activeFilterCount = [!!collection, typeFilter !== 'all', budgetFilter !== 'all', bedroomFilter !== 'all', poolOnly, heatedPoolOnly, petFriendlyOnly, destination !== 'all', location !== 'all'].filter(Boolean).length;
  const confirmedCount = availableProperties.filter(p => hasConfirmedQuote(quotes[p.slug])).length;
  const unconfirmedCount = availableProperties.length - confirmedCount;

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

    const key = `${searchCheckin}|${searchCheckout}|${effectiveGuests || 2}`;
    if (listings.length === 0) {
      setQuotes({});
      setQuotesLoading(false);
      setQuotesFor(key);
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
        setQuotesFor(key);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('[PLP] Batch quotes failed:', err);
        // Fallback: use catalogue base prices so cards aren't empty
        const computed: Record<string, LiveQuote | null> = {};
        for (const property of allProperties) {
          if (property.source === 'tripwix') continue;
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
        setQuotesFor(key);
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
    const qs = params.toString();
    navigate(`/homes${qs ? `?${qs}` : ''}`);
  };

  const filterControls = (
<div className="flex items-center gap-2 mb-5 flex-wrap" data-testid="plp-filters">
            {([
              [typeFilter, setTypeFilter, t('homes.filters.anyType', 'All types'), [
                ['House', t('homes.filters.house', 'House')],
                ['Villa', t('homes.filters.villa', 'Villa')],
                ['Apartment', t('homes.filters.apartment', 'Apartment')],
              ]],
              [bedroomFilter, setBedroomFilter, t('searchUx.bedrooms'), [
                ['1-2', '1–2'], ['3-4', '3–4'], ['5-6', '5–6'], ['7+', '7+'],
              ]],
              [budgetFilter, setBudgetFilter, t('homes.filters.anyBudget', 'Any budget'), [
                ['b1', t('homes.filters.b1', 'Up to €300 / night')],
                ['b2', t('homes.filters.b2', '€300 – €500 / night')],
                ['b3', t('homes.filters.b3', '€500 – €800 / night')],
                ['b4', t('homes.filters.b4', '€800+ / night')],
              ]],
            ] as Array<[string, (v: string) => void, string, Array<[string, string]>]>).map(([value, set, anyLabel, options], i) => (
              <span key={i} className="relative shrink-0">
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  aria-label={anyLabel}
                  className={`appearance-none h-11 rounded-lg border pl-4 pr-8 body-sm text-inherit font-sans cursor-pointer transition-colors ${
                    value !== 'all'
                      ? 'bg-pa-dark text-white border-pa-dark'
                      : 'bg-white text-pa-earth border-pa-sand hover:border-pa-gold'
                  }`}
                >
                  <option value="all">{anyLabel}</option>
                  {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <ChevronDown className={`w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${value !== 'all' ? 'text-white' : 'text-pa-gold'}`} />
              </span>
            ))}
            <span aria-hidden className="h-5 w-px bg-pa-sand shrink-0 mx-0.5 hidden md:block" />
            {([
              [poolOnly, setPoolOnly, t('homes.filters.pool', 'Pool')],
              [heatedPoolOnly, setHeatedPoolOnly, t('homes.filters.heatedPool', 'Heated pool')],
              [petFriendlyOnly, setPetFriendlyOnly, t('property.petFriendly', 'Pet-friendly')],
            ] as Array<[boolean, (v: boolean) => void, string]>).map(([active, set, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => set(!active)}
                aria-pressed={active}
                className={`pa-action h-11 px-4 rounded-full border body-sm text-inherit whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-pa-dark text-white border-pa-dark'
                    : 'bg-white text-pa-earth border-pa-sand hover:border-pa-gold'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              aria-pressed={showMap}
              className={`pa-action ml-auto inline-flex items-center gap-1.5 h-11 px-4 rounded-full border body-sm text-inherit whitespace-nowrap shrink-0 transition-colors ${
                showMap
                  ? 'bg-pa-dark text-white border-pa-dark'
                  : 'bg-white text-pa-earth border-pa-sand hover:border-pa-gold'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              {t('homes.filters.map', 'Map')}
            </button>
          </div>
  );

  const catalogueIntro = (
      <section className="container pt-24 md:pt-28 pb-6 md:pb-8">
        <h1 className="headline-lg text-pa-dark mb-3">{collection ? ((collection as any)[i18n.language]?.title ?? collection.en.title) : t('homes.title')}</h1>
        <p className="body-md max-w-2xl text-pa-earth">{t('conversion.homesIntro')}</p>
      </section>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pa-cream">
        <Header />
        {catalogueIntro}
        <div className="container py-6" aria-busy="true">
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
      <div className="min-h-screen bg-pa-cream">
        <Header />
        <section className="section-padding">
          <div className="container max-w-lg text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-pa-warm">
              <AlertTriangle className="w-6 h-6 text-pa-stone" />
            </div>
            <h2 className="headline-md text-pa-dark mb-3">{t('homes.loadErrorTitle', 'Something went wrong')}</h2>
            <p className="body-md mb-8">{t('homes.loadErrorBody', 'We couldn\'t load the properties. Please try again.')}</p>
            <button onClick={() => refetch()} className="btn-primary">{t('homes.retry', 'RETRY')}</button>
          </div>
        </section>
        <StayCollections />
      <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pa-cream">
      {homesGraph && <StructuredData id="homes-graph" data={homesGraph} />}
      <Header />

      {catalogueIntro}

      {/* Sticky: homepage-style search + filters in one dense band */}
      <div className="lg:sticky top-16 md:top-20 z-30 bg-pa-cream/95 backdrop-blur-md border-b border-pa-sand">
        <div className="container py-2.5 md:py-3">
          {/* Desktop — pill (same as homepage) */}
          <div className="hidden lg:flex justify-center mb-2.5 md:mb-3">
            <div
              className="flex items-center w-full max-w-[780px] rounded-xl bg-white shadow-[0_6px_32px_rgba(0,0,0,0.08)] overflow-hidden border border-pa-sand/60"
              style={{ height: '56px' }}
            >
              <div className="flex-1 relative h-full min-w-0">
                <select
                  aria-label={t('home.searchDestination')}
                  value={bookingLocation || (bookingDestination ? `region:${bookingDestination}` : '')}
                  onChange={e => {
                    const next = parseDestinationSelection(e.target.value);
                    setBookingLocation(next.location);
                    setBookingDestination(next.destination);
                  }}
                  className="w-full h-full pl-6 pr-8 bg-transparent text-pa-dark body-sm focus:outline-none cursor-pointer appearance-none truncate"

                >
                  <option value="">{t('home.searchDestination')}</option>
                  {cityOptions}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-pa-stone pointer-events-none" />
              </div>
              <div className="w-px h-6 bg-pa-sand shrink-0" />
              <div
                className="flex-1 min-w-0 h-full cursor-pointer"
                onClick={e => openDatePickerWithin(e.currentTarget)}
              >
                <input
                  ref={checkInRef}
                  type="date"
                  min={today}
                  aria-label={t('home.searchCheckin')}
                  value={bookingCheckin}
                  onInput={e => { setBookingCheckin(e.currentTarget.value); if (bookingCheckout && bookingCheckout <= e.currentTarget.value) setBookingCheckout(''); }}
                  onChange={e => {
                    setBookingCheckin(e.target.value);
                    if (bookingCheckout && bookingCheckout <= e.target.value) setBookingCheckout('');
                  }}
                  className="pa-date-hit w-full h-full px-3 bg-transparent text-pa-dark body-sm focus:outline-none cursor-pointer"

                />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-pa-stone flex-shrink-0" aria-hidden />
              <div
                className="flex-1 min-w-0 h-full cursor-pointer"
                onClick={e => openDatePickerWithin(e.currentTarget)}
              >
                <input
                  ref={checkOutRef}
                  type="date"
                  min={minCheckOut}
                  aria-label={t('home.searchCheckout')}
                  value={bookingCheckout}
                  onInput={e => setBookingCheckout(e.currentTarget.value)}
                  onChange={e => setBookingCheckout(e.target.value)}
                  className="pa-date-hit w-full h-full px-3 bg-transparent text-pa-dark body-sm focus:outline-none cursor-pointer"

                />
              </div>
              <div className="w-px h-6 bg-pa-sand shrink-0" />
              <div className="flex items-center h-full px-3 gap-2 shrink-0">
                <Users className="w-3.5 h-3.5 text-pa-stone flex-shrink-0" aria-hidden />
                <button
                  type="button"
                  onClick={() => setBookingGuests(g => Math.max(1, g - 1))}
                  disabled={bookingGuests <= 1}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-pa-sand text-pa-stone transition-colors hover:border-pa-gold hover:text-pa-gold disabled:opacity-30"
                  aria-label={t('home.decreaseGuests', 'Decrease guests')}
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span className="body-sm text-pa-dark tabular-nums whitespace-nowrap font-body font-normal" >
                  {bookingGuests} <span className="text-pa-stone lowercase">{t('home.searchGuests')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setBookingGuests(g => Math.min(30, g + 1))}
                  disabled={bookingGuests >= 30}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-pa-sand text-pa-stone transition-colors hover:border-pa-gold hover:text-pa-gold disabled:opacity-30"
                  aria-label={t('home.increaseGuests', 'Increase guests')}
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={applyBookingSearch}
                className="pa-action flex-shrink-0 h-[44px] mr-1.5 px-6 rounded-full bg-pa-dark text-white caption font-semibold hover:bg-[#333330] transition-colors flex items-center gap-2"
                style={{ letterSpacing: '1.5px' }}
              >
                {t('home.searchButton')}
              </button>
            </div>
          </div>

          {/* Mobile — card stack (homepage style), then filter row */}
          <div className="lg:hidden mb-3">
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-pa-sand/80 p-4 space-y-3">
              <div className="relative">
                <select
                  aria-label={t('home.searchDestination')}
                  value={bookingLocation || (bookingDestination ? `region:${bookingDestination}` : '')}
                  onChange={e => {
                    const next = parseDestinationSelection(e.target.value);
                    setBookingLocation(next.location);
                    setBookingDestination(next.destination);
                  }}
                  className="w-full h-[48px] rounded-lg border border-pa-sand bg-white pl-3 pr-9 body-sm text-pa-dark focus:ring-2 focus:ring-pa-gold focus:outline-none cursor-pointer appearance-none"

                >
                  <option value="">{t('home.searchDestination')}</option>
                  {cityOptions}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pa-stone pointer-events-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="relative"
                  onClick={e => openDatePickerWithin(e.currentTarget)}
                >
                  <input
                    type="date"
                    min={today}
                    aria-label={t('home.searchCheckin')}
                  value={bookingCheckin}
                  onInput={e => { setBookingCheckin(e.currentTarget.value); if (bookingCheckout && bookingCheckout <= e.currentTarget.value) setBookingCheckout(''); }}
                    onChange={e => {
                      setBookingCheckin(e.target.value);
                      if (bookingCheckout && bookingCheckout <= e.target.value) setBookingCheckout('');
                      }}
                    className="pa-date-hit w-full h-[48px] rounded-lg border border-pa-sand bg-white px-3 body-sm text-pa-dark focus:ring-2 focus:ring-pa-gold focus:outline-none cursor-pointer"

                  />
                </div>
                <div
                  className="relative"
                  onClick={e => openDatePickerWithin(e.currentTarget)}
                >
                  <input
                    ref={checkOutRef}
                    type="date"
                    min={minCheckOut}
                    aria-label={t('home.searchCheckout')}
                  value={bookingCheckout}
                  onInput={e => setBookingCheckout(e.currentTarget.value)}
                    onChange={e => setBookingCheckout(e.target.value)}
                    className="pa-date-hit w-full h-[48px] rounded-lg border border-pa-sand bg-white px-3 body-sm text-pa-dark focus:ring-2 focus:ring-pa-gold focus:outline-none cursor-pointer"

                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 h-[48px] rounded-lg border border-pa-sand bg-white px-3">
                  <Users className="w-4 h-4 text-pa-stone shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setBookingGuests(g => Math.max(1, g - 1))}
                    disabled={bookingGuests <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-pa-sand text-pa-stone disabled:opacity-30"
                    aria-label={t('home.decreaseGuests', 'Decrease guests')}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="body-sm text-pa-dark tabular-nums flex-1 text-center">{bookingGuests} {t('home.searchGuests')}</span>
                  <button
                    type="button"
                    onClick={() => setBookingGuests(g => Math.min(30, g + 1))}
                    disabled={bookingGuests >= 30}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-pa-sand text-pa-stone disabled:opacity-30"
                    aria-label={t('home.increaseGuests', 'Increase guests')}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={applyBookingSearch}
                  className="pa-action shrink-0 h-[48px] px-5 rounded-full bg-pa-dark text-white caption font-semibold hover:bg-[#333330] transition-colors flex items-center justify-center"
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
      <section className="pt-6 pb-12 md:pt-8 md:pb-16 lg:pb-20" >
        <div className="container">
          {/* Status line */}
          {/* ── Filters — type · budget · pool · heated pool · pet-friendly · map ──
              One row of equal-height pills; selects are restyled to match the
              chips (appearance-none + own chevron) and go dark when active,
              so the whole row reads as one system. Scrolls sideways on mobile. */}
          <div className="hidden md:block">{filterControls}</div>
          <div className="md:hidden flex items-center gap-3 mb-4">
            <button type="button" onClick={() => setFiltersOpen(true)} className="pa-action inline-flex items-center gap-2 min-h-11 rounded-full border border-pa-dark px-4 body-sm text-pa-dark">
              <SlidersHorizontal size={16} /> {t('conversion.filters')}{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            <button type="button" onClick={() => setShowMap(v => !v)} aria-pressed={showMap} className="pa-action inline-flex items-center gap-2 min-h-11 rounded-full border border-pa-sand px-4 body-sm text-pa-earth">
              <MapIcon size={16} /> {t('homes.filters.map')}
            </button>
          </div>
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto bg-pa-cream rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{t('conversion.filters')}</DialogTitle>
                <DialogDescription>{t('conversion.filterIntro')}</DialogDescription>
              </DialogHeader>
              {filterControls}
              <div className="flex items-center justify-between gap-4 border-t border-pa-sand pt-4">
                <button type="button" onClick={clearFilters} className="min-h-11 body-sm underline">{t('searchUx.clearFilters', { count: activeFilterCount })}</button>
                <button type="button" onClick={() => setFiltersOpen(false)} className="btn-primary">{t('conversion.seeHomes', { count: filtered.length })}</button>
              </div>
            </DialogContent>
          </Dialog>

          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="mb-4 min-h-11 body-sm text-pa-earth underline underline-offset-4 hover:text-pa-dark">
              {t('searchUx.clearFilters', { count: activeFilterCount })}
            </button>
          )}
          <p className="body-sm text-pa-earth mb-4">{t(hasDates ? 'searchUx.datedPrices' : 'searchUx.fromPrices')}</p>

          {showMap && (
            <Suspense fallback={<div className="h-[340px] lg:h-[420px] rounded-xl bg-pa-warm animate-pulse mb-8" />}>
              <HomesMap
                properties={hasDates && !quotesPending ? availableProperties : filtered}
                fromPrices={fromPrices}
                quotes={quotes}
                checkin={searchCheckin}
                checkout={searchCheckout}
                guests={searchGuestsCount || undefined}
                lang={i18n.language}
              />
            </Suspense>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="body-sm text-pa-stone-aa" role="status">
              {hasDates && !quotesPending ? (
                <>
                  <span className="font-medium text-pa-dark">{confirmedCount}</span> {t('searchUx.confirmed')}
                  {unconfirmedCount > 0 && <span> · {t('searchUx.toConfirm', { count: unconfirmedCount })}</span>}
                  {unavailableProperties.length > 0 && (
                    <span> · {unavailableProperties.length} {t('homes.unavailableCount', 'unavailable')}</span>
                  )}
                </>
              ) : (
                t('searchUx.results', { count: filtered.length })
              )}
              {searchGuestsCount > 0 && (
                <span> · {t('homes.guestsPlus', { count: searchGuestsCount })}</span>
              )}
              {searchNights > 0 && (
                <span> · {t('homes.nightsCount', { count: searchNights })}</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              {quotesPending && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-pa-gold border-t-transparent animate-spin" />
                  <span className="caption text-pa-gold font-medium">{t('homes.checkingAvailability', 'Checking live availability...')}</span>
                </div>
              )}
              <select
                aria-label={t('searchUx.sort')}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                /* min-w keeps the longest option ("Recommended") from being
                   clipped on narrow screens; shrink-0 stops the status line
                   from squeezing it. */
                className="body-sm text-pa-earth bg-transparent border border-pa-sand px-3 py-2 font-sans min-w-[150px] shrink-0"
              >
                {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* All unavailable — nudge user */}
          {hasDates && !quotesPending && availableProperties.length === 0 && unavailableProperties.length > 0 && (
            <div className="text-center py-8 mb-8 bg-pa-warm rounded-lg">
              <p className="body-sm font-display text-pa-dark mb-2">
                {t('homes.noneAvailable', 'No homes available for these dates')}
              </p>
              {/* Say WHY, and offer the nearest dates that satisfy the rule —
                  "no availability" alone sent a real enquiry to a competitor. */}
              {searchHint?.reason === 'tooLong' ? (
                <p className="body-sm text-pa-stone mb-4">
                  {t('homes.hintTooLong', {
                    count: searchHint.nights,
                    defaultValue: 'That search covers {{count}} nights. Here are the stays available in that period:',
                  })}
                </p>
              ) : searchHint?.reason === 'arrivalRestricted' ? (
                <p className="body-sm text-pa-stone mb-4">
                  {t('homes.hintArrival', {
                    days: (searchHint.arrivalWeekdays ?? [])
                      .map(w => new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' })
                        .format(new Date(Date.UTC(2024, 0, 7 + w))))
                      .join(', '),
                    count: searchHint.minNights ?? 0,
                    defaultValue: 'In this season stays start on {{days}} and run at least {{count}} nights.',
                  })}
                </p>
              ) : searchHint?.reason === 'minStay' ? (
                <p className="body-sm text-pa-stone mb-4">
                  {t('homes.hintMinStay', {
                    count: searchHint.minNights ?? 0,
                    defaultValue: 'These dates need a minimum stay of {{count}} nights.',
                  })}
                </p>
              ) : (
                <p className="body-sm text-pa-stone mb-4">
                  {t('homes.noneAvailableHint', 'Try adjusting your dates or speak with our concierge')}
                </p>
              )}

              {(() => {
                const opts = searchHint?.options?.length
                  ? searchHint.options
                  : searchHint?.suggestion
                    ? [searchHint.suggestion]
                    : [];
                if (!opts.length) return null;
                const goTo = (w: { checkIn: string; checkOut: string }) => {
                  const p = new URLSearchParams(searchString);
                  p.set('checkin', w.checkIn);
                  p.set('checkout', w.checkOut);
                  navigate(`/homes?${p.toString()}`);
                };
                const label = (w: { checkIn: string; checkOut: string }) =>
                  `${fmtHintDate(w.checkIn)} → ${fmtHintDate(w.checkOut)}`;
                return (
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                    {/* First option is the primary action; the rest are equal
                        alternatives, so a guest who meant "sometime that month"
                        picks a week instead of re-typing dates. */}
                    <button
                      type="button"
                      onClick={() => goTo(opts[0])}
                      className="btn-primary inline-flex items-center gap-2 min-h-[44px]"
                    >
                      {t('homes.hintTryDates', {
                        from: fmtHintDate(opts[0].checkIn),
                        to: fmtHintDate(opts[0].checkOut),
                        defaultValue: 'Try {{from}} → {{to}}',
                      })}
                    </button>
                    {opts.slice(1).map(w => (
                      <button
                        key={w.checkIn}
                        type="button"
                        onClick={() => goTo(w)}
                        className="pa-action min-h-[44px] px-4 border border-pa-sand bg-white body-sm text-pa-dark hover:border-pa-gold transition-colors"
                      >
                        {label(w)}
                      </button>
                    ))}
                  </div>
                );
              })()}
              {/* Even when no dates work, the enquiry is worth having. */}
              {leadSent ? (
                <p className="body-sm text-pa-dark mb-4 max-w-md mx-auto">
                  {t('homes.leadThanks', "Thank you — we'll come back to you with options for these dates.")}
                </p>
              ) : (
                <form onSubmit={submitLead} className="max-w-md mx-auto mb-4" noValidate data-nl-suppress="search-no-availability">
                  <p className="caption text-pa-stone mb-2">
                    {t('homes.leadPrompt', 'Want us to check these exact dates for you?')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={leadName}
                      onChange={e => setLeadName(e.target.value)}
                      placeholder={t('homes.leadName', 'Name')}
                      autoComplete="name"
                      className="h-[44px] px-3 border border-pa-sand bg-white body-sm text-inherit sm:w-1/3 focus:outline-none focus:border-pa-gold"
                    />
                    <input
                      type="email"
                      required
                      value={leadEmail}
                      onChange={e => { setLeadEmail(e.target.value); setLeadError(''); }}
                      placeholder={t('homes.leadEmail', 'Email')}
                      autoComplete="email"
                      inputMode="email"
                      className="h-[44px] px-3 border border-pa-sand bg-white body-sm text-inherit flex-1 focus:outline-none focus:border-pa-gold"
                    />
                    <button
                      type="submit"
                      disabled={createLead.isPending}
                      className="btn-primary h-[44px] px-5 whitespace-nowrap disabled:opacity-50"
                    >
                      {createLead.isPending ? '…' : t('homes.leadSend', 'Send')}
                    </button>
                  </div>
                  {leadError && <p className="caption text-inherit text-red-600 mt-1.5" role="alert">{leadError}</p>}
                </form>
              )}

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

          {/* Batch error banner */}
          {batchFailed && hasDates && (
            <div className="flex items-center gap-3 bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-lg px-4 py-3 mb-6">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
              <p className="body-sm text-[#92400E]">
                {t('homes.batchError', 'Live pricing is temporarily unavailable. See each property page for final pricing.')}
              </p>
            </div>
          )}

          {/* SECTION 1: Available properties (with confirmed or estimated pricing) */}
          {availableProperties.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 md:gap-x-6 md:gap-y-10">
                {(showAll ? availableProperties : availableProperties.slice(0, 12)).map((property, index) => (
                  <div
                    key={property.id}
                    className="w-full"
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
                      quoteLoading={property.source === 'tripwix' ? partner.isFetching : quotesPending}
                      batchFailed={batchFailed}
                      fromPrice={fromPrices?.[property.guestyId ?? property.supplierUid ?? '']}
                      listId="search_results"
                      listName="Search Results"
                      itemIndex={index + 1}
                    />
                  </div>
                ))}
              </div>
              {!showAll && availableProperties.length > 12 && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setShowAll(true)}
                    className="pa-action px-6 py-3 border border-pa-sand rounded-full body-sm font-medium text-pa-dark hover:bg-pa-warm transition-colors"
                  >
                    {t('homes.showAll', 'Show all properties')} ({availableProperties.length})
                  </button>
                </div>
              )}
              {/* The grid shows 12 cards until "show all"; the rest are named
                  here as plain links, so every home has a crawlable path from
                  the catalogue in the served HTML (only 12 of 93 did,
                  auditoria set/2026). Gone once the full grid is open. */}
              {!showAll && availableProperties.length > 12 && (
                <nav aria-labelledby="more-homes-index" className="mt-10 border-t border-pa-sand pt-6">
                  <h2 id="more-homes-index" className="caption uppercase tracking-wider text-pa-stone-aa mb-3">
                    {t('homes.moreHomesIndex', 'More homes')}
                  </h2>
                  <ul className="columns-1 sm:columns-2 lg:columns-3 gap-x-8 body-sm">
                    {availableProperties.slice(12).map((property) => (
                      <li key={property.id} className="break-inside-avoid py-1">
                        <Link
                          href={`/homes/${property.slug}`}
                          className="text-pa-dark underline-offset-4 hover:underline"
                        >
                          {getDisplayName(property)}
                        </Link>
                        {property.locality && <span className="text-pa-stone-aa"> · {property.locality}</span>}
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </>
          )}

          {/* SECTION 2: Unavailable properties (portfolio visibility — "try other dates") */}
          {hasDates && !quotesPending && unavailableProperties.length > 0 && (
            <div className="mt-12 md:mt-16">
              <div className="border-t border-pa-sand pt-8 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-pa-stone" />
                  <h2 className="body-sm font-semibold tracking-[0.06em] uppercase text-pa-stone">
                    {t('homes.unavailableSection', 'Unavailable for selected dates')}
                  </h2>
                </div>
                <p className="caption text-pa-stone ml-4">
                  {t('homes.unavailableHint', 'These homes may be available for different dates. Contact our concierge for alternatives.')}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 md:gap-x-6 md:gap-y-10 opacity-75">
                {unavailableProperties.map((property, idx) => (
                  <div
                    key={property.id}
                    className="w-full"
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
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {filtered.length === 0 && (
            <div className="text-center py-16 md:py-24 max-w-md mx-auto">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-pa-warm">
                <Search className="w-5 h-5 text-pa-stone" />
              </div>
              <h3 className="headline-sm text-pa-dark mb-2">{t('homes.noMatch', 'No homes match your criteria')}</h3>
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

      <section className="py-10 bg-pa-cream">
        <div className="container max-w-3xl text-center">
          <h2 className="headline-sm text-pa-dark mb-3">{t('conversion.helpTitle')}</h2>
          <p className="body-md text-pa-earth mb-5">{t('conversion.helpBody')}</p>
          <Link href="/contact" className="btn-ghost">{t('homes.talkConcierge')}</Link>
        </div>
      </section>

      <StayCollections />
      <Footer />
    </div>
  );
}
