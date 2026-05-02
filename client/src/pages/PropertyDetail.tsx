/* ==========================================================================
   PROPERTY DETAIL — Full page view (not modal)
   Hero gallery, two-column layout, sticky booking card, Le Collectionist-style amenities
   ========================================================================== */

import { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useParams, Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
  ChevronLeft, ChevronRight, MapPin, BedDouble, Bath, Users, Award, BadgeCheck,
  Sparkles, Gem, Clock, UtensilsCrossed, Headphones, Plus, X, AlertTriangle,
  Wifi, Tv, Coffee, Car, Waves, Wind, Shirt, Flame, TreePine, Mountain,
  Sun, Monitor, Utensils, Sofa, ArrowRight, Lock, ShieldCheck, Bed, type LucideIcon
} from 'lucide-react';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));
import productsData from '@/data/products.json';
import destinationsData from '@/data/destinations.json';
import type { Product, Destination, Property } from '@/lib/types';
import { getPropertyImages } from '@/lib/images';
const BookingWidget = lazy(() => import('@/components/booking/BookingWidget'));
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';
import ReviewsSection from '@/components/property/ReviewsSection';
import { trpc } from '@/lib/trpc';
import { pushEcommerce } from '@/lib/datalayer';
import { sanitizePropertyName } from '@/lib/format';
import {
  StructuredData,
  buildVacationRentalSchema,
  buildBreadcrumbSchema,
} from '@/components/seo/StructuredData';
import AnswerCapsule from '@/components/seo/AnswerCapsule';

const allProducts = productsData as unknown as Product[];
const destinations = destinationsData as unknown as Destination[];

/** ── Amenity Categorization & Deduplication ── */

/** Categories for grouping amenities — order determines display order */
const AMENITY_CATEGORIES: { key: string; label: string; icon: LucideIcon; keywords: string[] }[] = [
  { key: 'outdoor', label: 'Outdoor & Pool', icon: Waves, keywords: [
    'pool', 'swimming', 'infinity', 'heated pool', 'outdoor pool', 'private pool', 'hot tub', 'jacuzzi',
    'garden', 'backyard', 'terrace', 'patio', 'balcony', 'outdoor seating',
    'bbq', 'grill', 'barbecue', 'pool table', 'tennis', 'table tennis',
  ]},
  { key: 'views', label: 'Views & Location', icon: Mountain, keywords: [
    'ocean view', 'sea view', 'beach', 'beachfront', 'mountain', 'garden view', 'lake', 'river', 'town',
  ]},
  { key: 'comfort', label: 'Comfort & Climate', icon: Wind, keywords: [
    'air conditioning', 'heating', 'indoor fireplace', 'fireplace',
  ]},
  { key: 'kitchen', label: 'Kitchen & Dining', icon: Utensils, keywords: [
    'kitchen', 'fully equipped', 'oven', 'microwave', 'stove', 'refrigerator',
    'coffee', 'nespresso', 'espresso', 'kettle', 'toaster', 'blender', 'dining',
  ]},
  { key: 'entertainment', label: 'Entertainment', icon: Tv, keywords: [
    'tv', 'cable tv', 'smart tv', 'sound system', 'board games', 'books',
  ]},
  { key: 'connectivity', label: 'Connectivity & Work', icon: Wifi, keywords: [
    'wifi', 'internet', 'wireless', 'workspace', 'desk', 'laptop', 'home office', 'monitor',
  ]},
  { key: 'wellness', label: 'Wellness & Fitness', icon: Mountain, keywords: [
    'gym', 'fitness', 'workout', 'sauna', 'spa', 'yoga', 'horseback',
  ]},
  { key: 'parking', label: 'Parking & Access', icon: Car, keywords: [
    'parking', 'garage', 'ev charging', 'private entrance',
  ]},
  { key: 'laundry', label: 'Laundry & Housekeeping', icon: Shirt, keywords: [
    'washer', 'washing machine', 'clothes dryer', 'laundry', 'iron',
  ]},
  { key: 'bathroom', label: 'Bathroom', icon: Bath, keywords: [
    'bathtub', 'hair dryer',
  ]},
  { key: 'family', label: 'Family Friendly', icon: BedDouble, keywords: [
    'crib', 'high chair', 'children', 'infants', 'baby',
  ]},
  { key: 'safety', label: 'Safety', icon: Award, keywords: [
    'smoke detector', 'fire extinguisher', 'first aid', 'security', 'safe',
  ]},
];

/** Amenities to completely hide — zero value to guests */
const AMENITY_BLACKLIST = new Set([
  'essentials', 'hot water', 'hangers', 'clothing storage', 'bed linens', 'towels provided',
  'cleaning disinfection', 'enhanced cleaning practices', 'high touch surfaces disinfected',
  'shampoo', 'shower gel', 'cookware', 'dishes and silverware', 'baking sheet', 'barbeque utensils',
  'wine glasses', 'wide hallway clearance', 'accessible-height bed',
  'freezer', 'babysitter recommendations', 'long term stays allowed',
]);

/** Deduplicate similar amenities — keep the most descriptive version */
function deduplicateAmenities(items: string[]): string[] {
  const normalized = items.map(a => ({ original: a, lower: a.toLowerCase().trim() }));
  const result: string[] = [];
  const seen = new Set<string>();

  // Group by root concept and keep the most descriptive
  const conceptGroups: Record<string, string[]> = {};
  for (const { original, lower } of normalized) {
    if (AMENITY_BLACKLIST.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);

    // Extract root concept (e.g., "pool" from "private pool", "swimming pool")
    let rootConcept = lower;
    const roots = ['pool', 'parking', 'tv', 'coffee', 'garden', 'kitchen', 'wifi', 'internet'];
    for (const root of roots) {
      if (lower.includes(root)) { rootConcept = root; break; }
    }

    if (!conceptGroups[rootConcept]) conceptGroups[rootConcept] = [];
    conceptGroups[rootConcept].push(original);
  }

  // For each concept group, pick the most descriptive (longest) name
  for (const group of Object.values(conceptGroups)) {
    const best = group.sort((a, b) => b.length - a.length)[0];
    result.push(best);
  }
  return result;
}

/** Categorize amenities into groups */
function categorizeAmenities(items: string[]): { category: string; label: string; icon: LucideIcon; items: string[] }[] {
  const deduplicated = deduplicateAmenities(items);
  const categorized: Record<string, string[]> = {};
  const uncategorized: string[] = [];

  for (const item of deduplicated) {
    const lower = item.toLowerCase().trim();
    let matched = false;
    for (const cat of AMENITY_CATEGORIES) {
      if (cat.keywords.some(kw => lower.includes(kw) || kw.includes(lower))) {
        if (!categorized[cat.key]) categorized[cat.key] = [];
        categorized[cat.key].push(item);
        matched = true;
        break;
      }
    }
    if (!matched) uncategorized.push(item);
  }

  const groups: { category: string; label: string; icon: LucideIcon; items: string[] }[] = [];
  for (const cat of AMENITY_CATEGORIES) {
    if (categorized[cat.key]?.length) {
      groups.push({ category: cat.key, label: cat.label, icon: cat.icon, items: categorized[cat.key] });
    }
  }
  if (uncategorized.length) {
    groups.push({ category: 'other', label: 'Other', icon: Sparkles, items: uncategorized });
  }
  return groups;
}


/** Humanize bed type names and get icon */
function getBedTypeDisplay(bedType: string): { label: string; icon: LucideIcon } {
  const normalized = (bedType || '').toUpperCase().replace(/ /g, '_');
  const iconMap: Record<string, { label: string; icon: LucideIcon }> = {
    'KING_BED': { label: 'King Bed', icon: BedDouble },
    'QUEEN_BED': { label: 'Queen Bed', icon: BedDouble },
    'DOUBLE_BED': { label: 'Double Bed', icon: BedDouble },
    'SINGLE_BED': { label: 'Single Bed', icon: Bed },
    'SOFA_BED': { label: 'Sofa Bed', icon: Sofa },
    'BUNK_BED': { label: 'Bunk Bed', icon: Bed },
    'COUCH': { label: 'Sofa Bed', icon: Sofa },
    'AIR_MATTRESS': { label: 'Air Mattress', icon: Bed },
  };
  return iconMap[normalized] || { label: bedType || 'Bed', icon: Bed };
}


/** Parse description: handle string, split by \n\n or \n */
function formatDescription(desc: unknown): string[] {
  if (!desc) return [];
  const s = typeof desc === 'string' ? desc : String(desc);
  const cleaned = cleanDescription(s);
  return cleaned.split(/\n\n+/).flatMap(p => p.split('\n').filter(Boolean));
}

/** Clean raw Guesty description for premium display */
function cleanDescription(raw: string): string {
  return raw
    // Remove dash separators: ------Title------
    .replace(/[-–—]{3,}[^-\n]*[-–—]{3,}/g, '')
    // Remove emoji bullets
    .replace(/[✔️✅☑️🔹🔸▪️•]/g, '')
    // Remove marketing CTAs
    .replace(/book your stay\.?/gi, '')
    .replace(/portugal active,?\s*your private hotel\.?/gi, '')
    // Remove "Enhance Your Stay with Our Exclusive Services:" header
    .replace(/enhance your stay with our exclusive services:?/gi, '')
    // Remove embedded promotional/upsell service lines
    .replace(/enjoy luxury transfers:?[^\n]*/gi, '')
    .replace(/personalized experience:?[^\n]*/gi, '')
    .replace(/daily cleaning\s*&\s*babysitting:?[^\n]*/gi, '')
    .replace(/local team available:?[^\n]*/gi, '')
    // Remove adventure activity promo blocks (heading + description pairs)
    .replace(/horseback riding:?\s*\n[^\n]*/gi, '')
    .replace(/guided hike[^\n]*:\s*\n[^\n]*/gi, '')
    .replace(/e-bike[^\n]*:\s*\n[^\n]*/gi, '')
    .replace(/surf[^\n]*:\s*\n[^\n]*/gi, '')
    .replace(/wine[^\n]*tasting[^\n]*:\s*\n[^\n]*/gi, '')
    // Remove "rest assured" concierge promo lines
    .replace(/rest assured[^\n]*/gi, '')
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function Lightbox({ images, initialIndex, propertyName, destName, onClose, t }: {
  images: string[];
  initialIndex: number;
  propertyName: string;
  destName: string;
  onClose: () => void;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}) {
  const [idx, setIdx] = useState(initialIndex);
  const total = images.length;
  const lbTouchStartX = useRef(0);
  const lbTouchDelta = useRef(0);
  const [lbDragOffset, setLbDragOffset] = useState(0);
  const lbRef = useRef<HTMLDivElement>(null);

  const prev = useCallback(() => setIdx(p => (p - 1 + total) % total), [total]);
  const next = useCallback(() => setIdx(p => (p + 1) % total), [total]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Tab' && lbRef.current) {
        const focusable = lbRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    const preload = [idx - 1, idx + 1].map(i => (i + total) % total);
    preload.forEach(i => {
      const img = new Image();
      img.src = images[i];
    });
  }, [idx, images, total]);

  const handleLbTouchStart = (e: React.TouchEvent) => {
    lbTouchStartX.current = e.touches[0].clientX;
    lbTouchDelta.current = 0;
  };
  const handleLbTouchMove = (e: React.TouchEvent) => {
    lbTouchDelta.current = e.touches[0].clientX - lbTouchStartX.current;
    setLbDragOffset(lbTouchDelta.current);
  };
  const handleLbTouchEnd = () => {
    if (Math.abs(lbTouchDelta.current) > 50) {
      if (lbTouchDelta.current < 0) next();
      else prev();
    }
    setLbDragOffset(0);
  };

  return (
    <div
      ref={lbRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${propertyName} photo gallery, image ${idx + 1} of ${total}`}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
    >
      {/* Top bar: counter + close */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div />
        <span className="text-white/70 text-[13px]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          {idx + 1} / {total}
        </span>
        <button
          onClick={onClose}
          className="touch-target rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          aria-label={t('propertyDetail.closeGallery', 'Close gallery')}
        >
          <X size={20} className="text-white" />
        </button>
      </div>

      {/* Main image area */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onTouchStart={handleLbTouchStart}
        onTouchMove={handleLbTouchMove}
        onTouchEnd={handleLbTouchEnd}
      >
        {/* Desktop arrows */}
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 touch-target rounded-full bg-white/10 hover:bg-white/20 transition-colors hidden md:flex items-center justify-center z-10"
          aria-label={t('propertyDetail.prevImage', 'Previous image')}
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 -translate-y-1/2 touch-target rounded-full bg-white/10 hover:bg-white/20 transition-colors hidden md:flex items-center justify-center z-10"
          aria-label={t('propertyDetail.nextImage', 'Next image')}
        >
          <ChevronRight size={24} className="text-white" />
        </button>

        <img
          src={images[idx]}
          alt={`${propertyName} – ${destName} – image ${idx + 1} of ${total}`}
          className="max-w-full max-h-full object-contain select-none"
          decoding="async"
          style={{
            transform: lbDragOffset ? `translateX(${lbDragOffset}px)` : 'translateX(0)',
            transition: lbDragOffset ? 'none' : 'transform 300ms ease',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

/** Description with "Read more" truncation for long Guesty copy */
function DescriptionSection({ description, propertyName, locality, destName, t }: {
  description: unknown;
  propertyName: string;
  locality: string;
  destName: string;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = formatDescription(description);
  const MAX_VISIBLE = 3;
  const needsTruncation = paragraphs.length > MAX_VISIBLE;
  const visible = expanded ? paragraphs : paragraphs.slice(0, MAX_VISIBLE);

  return (
    <section>
      <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18] mb-5">{t('propertyDetail.aboutTitle')}</h2>
      <div className="body-lg space-y-4 relative">
        {visible.length > 0 ? (
          <>
            {visible.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            {needsTruncation && !expanded && (
              <div className="relative pt-2">
                <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-[#FAFAF7] to-transparent pointer-events-none" />
                <button
                  onClick={() => setExpanded(true)}
                  className="text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4"
                >
                  {t('common.readMore', 'Read more')}
                </button>
              </div>
            )}
            {expanded && needsTruncation && (
              <button
                onClick={() => setExpanded(false)}
                className="text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4"
              >
                {t('common.readLess', 'Read less')}
              </button>
            )}
          </>
        ) : (
          <p>{t('propertyDetail.welcomeFallback', { name: propertyName, locality, destination: destName })}</p>
        )}
      </div>
    </section>
  );
}

export default function PropertyDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: property, isLoading, error, refetch } = trpc.properties.getBySlugForSite.useQuery(
    { slug: slug ?? '' },
    { enabled: !!slug }
  );
  const pdpTitle = useMemo(() => {
    if (!property) return undefined;
    const dest = destinations.find(d => d.slug === property.destination);
    const beds = property.bedrooms ? `${property.bedrooms}-Bed` : '';
    const loc = dest?.name || property.region || '';
    const clean = sanitizePropertyName(property.name);
    return `${clean} — ${beds} Luxury Villa ${loc}`.replace(/\s+/g, ' ').trim();
  }, [property]);
  const pdpDesc = useMemo(() => {
    if (!property) return undefined;
    const dest = destinations.find(d => d.slug === property.destination);
    const beds = property.bedrooms ? `${property.bedrooms}-bedroom` : '';
    const loc = dest?.name || property.region || 'Portugal';
    const tag = property.tagline || '';
    return `${beds} luxury villa in ${loc}. ${tag} Book direct with Portugal Active.`.replace(/\s+/g, ' ').trim().slice(0, 155);
  }, [property]);
  usePageMeta({
    title: pdpTitle,
    description: pdpDesc,
    image: property?.images?.[0],
    url: property ? `/homes/${property.slug}` : undefined,
    type: 'place',
  });

  // VacationRental + Breadcrumb JSON-LD (bundled via @graph by StructuredData).
  // VacationRental is Google's dedicated subtype for short-term rentals; it
  // surfaces richer fields (numberOfBedrooms, occupancy, amenityFeature as
  // LocationFeatureSpecification) that AI Overviews quote directly.
  const propertyGraph = useMemo(() => {
    if (!property) return null;
    const dest = destinations.find(d => d.slug === property.destination);
    const amenityNames = Object.values(property.amenities || {})
      .flatMap((items) => (Array.isArray(items) ? (items as string[]) : []));

    return [
      buildVacationRentalSchema({
        name: property.name,
        slug: property.slug,
        description: property.tagline || property.description?.slice(0, 500),
        images: property.images,
        bedrooms: property.bedrooms,
        bathrooms: (property as any).bathrooms ?? null,
        maxGuests: (property as any).maxGuests ?? null,
        priceFrom: property.priceFrom,
        locality: property.locality || dest?.name,
        region: dest?.name,
        amenities: amenityNames,
        checkinTime: (property as any).checkInTime ?? null,
        checkoutTime: (property as any).checkOutTime ?? null,
        // Guesty doesn't currently expose these — leave null until wired.
        petsAllowed: (property as any).petsAllowed ?? null,
        latitude: (property as any).latitude ?? null,
        longitude: (property as any).longitude ?? null,
        aggregateRating:
          (property as any).averageRating && (property as any).reviewCount
            ? {
                ratingValue: Number((property as any).averageRating),
                reviewCount: Number((property as any).reviewCount),
              }
            : null,
        reviews: (property as any).reviews || null,
      }),
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Homes', item: '/homes' },
        { name: property.name },
      ]),
    ];
  }, [property]);

  const whatsIncluded = useMemo(
    () => [
      { icon: Sparkles, text: t('propertyDetail.included1') },
      { icon: BedDouble, text: t('propertyDetail.included2') },
      { icon: Bath, text: t('propertyDetail.included3') },
      { icon: UtensilsCrossed, text: t('propertyDetail.included4') },
      { icon: Gem, text: t('propertyDetail.included5') },
      { icon: Clock, text: t('propertyDetail.included6') },
      { icon: Headphones, text: t('propertyDetail.included7') },
      { icon: MapPin, text: t('propertyDetail.included8') },
      { icon: Award, text: t('propertyDetail.included9') },
      { icon: BadgeCheck, text: t('propertyDetail.included10') },
    ],
    [t]
  );
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const initialCheckin = searchParams.get('checkin') || '';
  const initialCheckout = searchParams.get('checkout') || '';
  const initialGuests = Number(searchParams.get('guests')) || 0;

  const [currentImage, setCurrentImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(0);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const touchStartTime = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  // Viewport tracking refs for related properties view_item_list
  const relatedCardDataRef = useRef<Map<string, { property: Property; index: number }>>(new Map());
  const relatedSlugToElementRef = useRef<Map<string, Element>>(new Map());
  const relatedElementToSlugRef = useRef<Map<Element, string>>(new Map());
  const relatedPendingRef = useRef<Map<string, { property: Property; index: number }>>(new Map());
  const relatedFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relatedObserverRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (property) setCurrentImage(0);
  }, [property?.slug]);

  // GA4: view_item — fires once per property load
  useEffect(() => {
    if (!property) return;
    const nights = initialCheckin && initialCheckout
      ? Math.max(1, Math.ceil((new Date(initialCheckout).getTime() - new Date(initialCheckin).getTime()) / 86400000))
      : 1;
    pushEcommerce({
      event: 'view_item',
      ecommerce: {
        currency: 'EUR',
        value: (property.priceFrom || 0) * nights,
        items: [
          {
            item_id: `PROP-${property.id}`,
            item_name: property.name,
            item_category: 'villa',
            item_category2: property.locality || property.destination || '',
            item_category3: 'Portugal',
            item_variant: property.tier || '',
            price: property.priceFrom || 0,
            quantity: nights,
            checkin_date: initialCheckin || undefined,
            checkout_date: initialCheckout || undefined,
            guests_adults: initialGuests || undefined,
            max_guests: property.maxGuests || undefined,
            bedrooms: property.bedrooms || undefined,
          },
        ],
      },
    });
  }, [property?.id]);

  const services = useMemo(() => allProducts.filter(p => p.type === 'service' && p.isActive), []);
  const adventures = useMemo(() => {
    if (!property) return [];
    return allProducts.filter(p =>
      p.type === 'adventure' && p.isActive &&
      (Array.isArray(p.destinations) ? (p.destinations.length === 0 || p.destinations.includes(property.destination)) : true)
    );
  }, [property]);

  const destObj = useMemo(() => {
    if (!property) return null;
    // Prefer match by destination slug
    const bySlug = destinations.find(d => d.slug === property.destination);
    if (bySlug) {
      // Defensive: if locality is in a known Minho town list but slug is wrong, override
      const minhoLocalities = ['Carreço', 'Viana do Castelo', 'Âncora', 'Vila Praia de Âncora', 'Afife', 'Moledo', 'Caminha'];
      if (property.locality && minhoLocalities.some(l => (property.locality || '').toLowerCase().includes(l.toLowerCase()))) {
        return destinations.find(d => d.slug === 'minho') || bySlug;
      }
      return bySlug;
    }
    return null;
  }, [property]);
  const destName = destObj?.name || property?.destination || '';

  const { data: allPropsData } = trpc.properties.listForSite.useQuery();
  const relatedProperties = useMemo(() => {
    if (!property || !allPropsData) return [];
    return (allPropsData as Property[])
      .filter(p => p.isActive !== false && p.destination === property.destination && p.slug !== property.slug)
      .slice(0, 3);
  }, [property, allPropsData]);

  // GA4: view_item_list for related properties — fires when cards enter the viewport
  useEffect(() => {
    relatedObserverRef.current?.disconnect();
    relatedPendingRef.current.clear();

    if (!relatedProperties.length) return;

    relatedObserverRef.current = new IntersectionObserver((entries) => {
      let hasNew = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slug = relatedElementToSlugRef.current.get(entry.target);
          if (slug) {
            const data = relatedCardDataRef.current.get(slug);
            if (data) {
              relatedPendingRef.current.set(slug, data);
              hasNew = true;
            }
          }
        }
      }
      if (!hasNew) return;
      if (relatedFlushTimerRef.current) clearTimeout(relatedFlushTimerRef.current);
      relatedFlushTimerRef.current = setTimeout(() => {
        if (relatedPendingRef.current.size === 0) return;
        const items = Array.from(relatedPendingRef.current.values())
          .sort((a, b) => a.index - b.index)
          .map(({ property: rp, index }) => ({
            item_id: `PROP-${rp.id}`,
            item_name: rp.name,
            item_category: 'villa',
            item_category2: rp.locality || rp.destination || '',
            item_category3: 'Portugal',
            item_variant: rp.tier || '',
            price: rp.priceFrom || 0,
            quantity: 1,
            index,
          }));
        pushEcommerce({
          event: 'view_item_list',
          ecommerce: { item_list_id: 'related_properties', item_list_name: 'Related Homes', items },
        });
        relatedPendingRef.current.clear();
      }, 200);
    }, { threshold: 0.5 });

    relatedSlugToElementRef.current.forEach((el) => relatedObserverRef.current!.observe(el));

    return () => {
      relatedObserverRef.current?.disconnect();
      relatedObserverRef.current = null;
      if (relatedFlushTimerRef.current) clearTimeout(relatedFlushTimerRef.current);
      relatedPendingRef.current.clear();
    };
  }, [relatedProperties]);

  const amenityGroups = useMemo(() => {
    if (!property?.amenities || typeof property.amenities !== 'object') return [];
    const all = Object.values(property.amenities).flat().filter((x): x is string => typeof x === 'string' && x.length > 0);
    return categorizeAmenities(all);
  }, [property?.amenities]);

  const handleGalleryTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    touchStartTime.current = Date.now();
    isDragging.current = false;
    setDragOffset(0);
  }, []);
  const handleGalleryTouchMove = useCallback((e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    isDragging.current = true;
    setDragOffset(touchDeltaX.current);
  }, []);
  const handleGalleryTouchEnd = useCallback(() => {
    const total = (property?.images?.length || getPropertyImages(property?.slug ?? '').length) || 1;
    const velocity = Math.abs(touchDeltaX.current) / Math.max(Date.now() - touchStartTime.current, 1);
    const threshold = velocity > 0.3 ? 20 : 60;
    if (Math.abs(touchDeltaX.current) > threshold) {
      if (touchDeltaX.current < 0) setCurrentImage(p => Math.min(p + 1, total - 1));
      else setCurrentImage(p => Math.max(p - 1, 0));
    }
    setDragOffset(0);
    isDragging.current = false;
  }, [property]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        {/* Hero image skeleton */}
        <div className="skeleton-shimmer w-full" style={{ aspectRatio: '16/7' }} />
        <div className="container py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Content column */}
            <div className="lg:col-span-2 space-y-5">
              <div className="skeleton-shimmer h-3 w-28 rounded" />
              <div className="skeleton-shimmer h-8 w-72 rounded" />
              <div className="skeleton-shimmer h-4 w-56 rounded" />
              <div className="flex gap-4 pt-2">
                <div className="skeleton-shimmer h-4 w-16 rounded" />
                <div className="skeleton-shimmer h-4 w-16 rounded" />
                <div className="skeleton-shimmer h-4 w-16 rounded" />
              </div>
              <div className="space-y-2 pt-6">
                <div className="skeleton-shimmer h-3 w-full rounded" />
                <div className="skeleton-shimmer h-3 w-full rounded" />
                <div className="skeleton-shimmer h-3 w-4/5 rounded" />
              </div>
            </div>
            {/* Sidebar skeleton */}
            <div className="space-y-4">
              <div className="border border-[#E8E4DC] p-6 space-y-4">
                <div className="skeleton-shimmer h-8 w-40 rounded" />
                <div className="skeleton-shimmer h-3 w-32 rounded" />
                <div className="skeleton-shimmer h-12 w-full rounded-full" />
                <div className="skeleton-shimmer h-12 w-full rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <div className="container max-w-lg py-24 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F1EB]">
            <AlertTriangle className="w-6 h-6 text-[#9E9A90]" />
          </div>
          <h1 className="headline-md mb-3">{t('propertyDetail.errorTitle', 'Something went wrong')}</h1>
          <p className="body-lg mb-8">{t('propertyDetail.errorBody', 'We couldn\'t load this property. Please try again.')}</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => refetch()} className="btn-primary">{t('propertyDetail.retry', 'RETRY')}</button>
            <Link href="/homes" className="btn-ghost">{t('propertyDetail.browseHomes')}</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const images = property.images?.length ? property.images : getPropertyImages(property.slug);
  const totalImages = Math.max(images.length, 1);
  const whatsappUrl = `https://wa.me/351927161771?text=${encodeURIComponent(property.whatsappMessage || `Hi, I am interested in ${property.name}`)}`;

  return (
    <>
      {propertyGraph && <StructuredData id={`property-${property.slug}`} data={propertyGraph} />}
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />

        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="container pt-20 pb-3">
          <ol className="flex items-center gap-0.5 text-[12px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
            <li><Link href="/" className="inline-flex items-center min-h-[44px] px-1.5 hover:text-[#1A1A18] transition-colors">Home</Link></li>
            <li className="text-[#E8E4DC]">/</li>
            <li><Link href="/homes" className="inline-flex items-center min-h-[44px] px-1.5 hover:text-[#1A1A18] transition-colors">Homes</Link></li>
            {destObj && (
              <>
                <li className="text-[#E8E4DC]">/</li>
                <li><Link href={`/destinations/${destObj.slug}`} className="inline-flex items-center min-h-[44px] px-1.5 hover:text-[#1A1A18] transition-colors">{destObj.name}</Link></li>
              </>
            )}
            <li className="text-[#E8E4DC]">/</li>
            <li className="text-[#6B6860] truncate max-w-[220px] inline-flex items-center min-h-[44px] px-1.5">{sanitizePropertyName(property.name)}</li>
          </ol>
        </nav>

        {/* Hero gallery — mobile carousel + desktop grid */}
        {/* Mobile: swipeable carousel */}
        <div
          className="lg:hidden group relative w-full overflow-hidden bg-[#F5F1EB] aspect-[4/3] cursor-pointer select-none"
          onTouchStart={handleGalleryTouchStart}
          onTouchMove={handleGalleryTouchMove}
          onTouchEnd={handleGalleryTouchEnd}
          onClick={() => { if (!isDragging.current) { setLightboxImage(currentImage); setLightboxOpen(true); } }}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(-${(currentImage / totalImages) * 100}% + ${dragOffset}px))`,
              transition: dragOffset ? 'none' : 'transform 300ms ease',
              width: `${totalImages * 100}%`,
              willChange: 'transform',
            }}
          >
            {(images.length ? images : ['']).map((img: string, idx: number) => (
              <div key={idx} className="relative shrink-0 h-full bg-[#E8E4DC] img-fallback" style={{ width: `${100 / totalImages}%` }}>
                {img ? (
                  <img src={img} alt={`${property.name} – luxury villa in ${destName}, Portugal – image ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" width={1200} height={900} loading={idx === 0 ? 'eager' : 'lazy'} decoding="async" {...(idx === 0 ? { fetchPriority: 'high' as const } : {})} draggable={false} onError={e => { (e.currentTarget.parentElement as HTMLElement)?.setAttribute('data-broken', 'true'); e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#9E9A90] text-sm">{t('propertyDetail.noImage')}</div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
            <span className="text-white/80 text-[12px] bg-black/30 backdrop-blur-sm px-2.5 py-1 rounded-sm pointer-events-auto" style={{ fontFamily: 'var(--font-body)' }}>
              {currentImage + 1} / {totalImages}
            </span>
            <button
              onClick={e => { e.stopPropagation(); setLightboxImage(currentImage); setLightboxOpen(true); }}
              className="pointer-events-auto rounded-full bg-white/90 backdrop-blur-sm text-[#1A1A18] px-5 py-2.5 min-h-[44px] hover:bg-white transition-colors text-[11px] font-medium tracking-[0.12em] uppercase"
            >
              {t('propertyDetail.viewAll')}
            </button>
          </div>
        </div>

        {/* Desktop: Bento gallery grid (1 large + 4 small) */}
        <div className="hidden lg:block container pt-4">
          <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden" style={{ height: '480px' }}>
            {/* Main large image — left half */}
            <div
              className="col-span-2 row-span-2 relative cursor-pointer group bg-[#E8E4DC]"
              onClick={() => { setLightboxImage(0); setLightboxOpen(true); }}
            >
              {images[0] && (
                <img src={images[0]} alt={`${property.name} – luxury villa in ${destName}, Portugal`} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" loading="eager" fetchPriority="high" draggable={false} />
              )}
            </div>
            {/* 4 smaller images — right half */}
            {[1, 2, 3, 4].map(idx => (
              <div
                key={idx}
                className="relative cursor-pointer group bg-[#E8E4DC]"
                onClick={() => { if (images[idx]) { setLightboxImage(idx); setLightboxOpen(true); } }}
              >
                {images[idx] ? (
                  <img src={images[idx]} alt={`${property.name} – image ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" loading="lazy" decoding="async" draggable={false} />
                ) : (
                  <div className="absolute inset-0 bg-[#F5F1EB]" />
                )}
                {/* "View all" button on last image */}
                {idx === 4 && totalImages > 5 && (
                  <button
                    onClick={e => { e.stopPropagation(); setLightboxImage(0); setLightboxOpen(true); }}
                    className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-[#1A1A18] px-4 py-2 text-[11px] font-medium tracking-[0.08em] uppercase rounded-full hover:bg-white transition-colors z-10"
                  >
                    {t('propertyDetail.viewAll')} ({totalImages})
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Title, location, key stats — below hero */}
        <div className="container pt-8 lg:pt-10 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8B7355] uppercase">{destName}</p>
            <span className="h-px flex-1 max-w-[60px] bg-[#E8E4DC]" />
            {property.tier === 'signature' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.04em] uppercase text-[#1A1A18] bg-[#F5F1EB] px-2.5 py-1 rounded-full">
                <Flame size={11} className="text-[#8B7355]" /> {t('urgency.highDemand', 'High demand')}
              </span>
            )}
            {(property as any).averageRating >= 4.8 && ((property as any).reviewCount || 0) >= 5 && property.tier !== 'signature' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.04em] uppercase text-[#8B7355] bg-[#F5F1EB] px-2.5 py-1 rounded-full">
                <Award size={11} /> {t('urgency.guestFavourite', 'Guest favourite')}
              </span>
            )}
          </div>
          <h1 className="font-display text-[clamp(1.75rem,4vw,3rem)] font-light leading-[1.08] text-[#1A1A18] mb-3">
            {sanitizePropertyName(property.name)}
          </h1>
          {property.tagline && (
            <p className="text-[15px] text-[#6B6860] italic mb-4 max-w-2xl leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{property.tagline}</p>
          )}
          <div className="flex items-center gap-2 text-[#6B6860] mb-8">
            <MapPin size={14} className="text-[#9E9A90]" />
            <span className="text-[13px]" style={{ fontWeight: 300 }}>{property.locality}, Portugal</span>
          </div>

          {/* Key stats — pill badges */}
          <div className="flex flex-wrap items-center gap-3 pb-6 border-b border-[#E8E4DC]">
            {[
              { icon: Users, value: `${property.maxGuests} ${t('property.guests')}` },
              { icon: BedDouble, value: `${property.bedrooms} ${t('property.bedrooms')}` },
              { icon: Bath, value: `${property.bathrooms} ${t('property.bathrooms')}` },
              ...(property.areaSquareFeet && property.areaSquareFeet > 0 ? [{ icon: MapPin, value: `${Math.round(property.areaSquareFeet * 0.0929)} m²` }] : []),
              ...((property.checkInTime || property.checkOutTime) ? [{ icon: Clock, value: `${property.checkInTime || '16:00'} / ${property.checkOutTime || '11:00'}` }] : []),
            ].map((stat, i) => (
              <span key={i} className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5F1EB] rounded-full text-[13px] text-[#6B6860]" style={{ fontWeight: 400 }}>
                <stat.icon size={14} className="text-[#8B7355]" />
                {stat.value}
              </span>
            ))}
          </div>
        </div>

        {/* Two-column layout: main content (left 2/3) + sticky booking (right 1/3) */}
        <div className={property.guestyId ? "container pb-8 lg:pb-16" : "container pb-24 lg:pb-16"}>
          <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-12">
            {/* Main content — left 2/3 */}
            <div className="order-2 lg:order-1 lg:col-span-2 space-y-10 lg:space-y-12 pt-6">
              {/* Answer capsule — citable summary for AI engines & search, inside the content column */}
              <AnswerCapsule
                question={`What is ${sanitizePropertyName(property.name)}?`}
                answer={(() => {
                  const name = sanitizePropertyName(property.name);
                  const loc = property.locality || destName;
                  const guests = property.maxGuests;
                  const beds = property.bedrooms;
                  const baths = property.bathrooms;
                  const price = property.priceFrom;
                  const tag = property.tagline;
                  const parts: string[] = [];
                  parts.push(`${name} is a private hotel in ${loc}, Portugal, operated by Portugal Active.`);
                  parts.push(`It accommodates up to ${guests} guests across ${beds} bedrooms and ${baths} bathrooms.`);
                  if (price) parts.push(`Rates start from €${price} per night.`);
                  if (tag) parts.push(tag + (tag.endsWith('.') ? '' : '.'));
                  parts.push(`Unlike a standard rental, every stay is fully managed: dedicated concierge, daily housekeeping, and access to private chef, spa, and curated local experiences.`);
                  parts.push(`Book direct for the best rate and complimentary concierge planning.`);
                  return parts.join(' ');
                })()}
                lastUpdated="2026-04-17"
                author="Portugal Active concierge team"
                emitSchema
                schemaId={`qa-${property.slug}`}
                cite={[
                  { label: 'All properties', href: '/homes' },
                  destObj ? { label: `${destObj.name} guide`, href: `/destinations/${destObj.slug}` } : null,
                  { label: 'Concierge services', href: '/concierge' },
                ].filter(Boolean) as { label: string; href: string }[]}
              />

              {/* Bedrooms & Sleeping Arrangement */}
              {property.rooms && property.rooms.length > 0 && (
                <section>
                  <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18] mb-6">Bedrooms & Sleeping Arrangements</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {property.rooms.map((room: any, roomIdx: number) => (
                      <div key={roomIdx} className="bg-white border border-[#E8E4DC] p-5 rounded-lg">
                        <h3 className="text-[13px] font-medium text-[#1A1A18] mb-4">{room.name}</h3>
                        <div className="space-y-3">
                          {room.beds && room.beds.length > 0 ? (
                            room.beds.map((bed: any, bedIdx: number) => {
                              const { label, icon: BedIcon } = getBedTypeDisplay(bed.type);
                              return (
                                <div key={bedIdx} className="flex items-center gap-3">
                                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F5F1EB] shrink-0">
                                    <BedIcon size={16} className="text-[#8B7355]" />
                                  </div>
                                  <span className="text-[12px] text-[#6B6860]">
                                    {bed.quantity > 1 ? `${bed.quantity} × ${label}` : label}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-[12px] text-[#9E9A90]">{t('bedConfig.notAvailable')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 1. What's included */}
              <section className="p-6 lg:p-8 bg-[#F5F1EB] rounded-lg">
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18]">{t('propertyDetail.includedTitle')}</h2>
                  <span className="h-px flex-1 bg-[#E8E4DC]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {whatsIncluded.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <item.icon size={16} className="text-[#8B7355] shrink-0" />
                      <span className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>{item.text}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Editorial description with Read more */}
              <DescriptionSection
                description={property.description}
                propertyName={property.name}
                locality={property.locality}
                destName={destName}
                t={t}
              />

              {/* 3. Amenities — Le Collectionist style icon grid with expandable sections */}
              <section>
                <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18] mb-6">{t('propertyDetail.amenitiesTitle')}</h2>
                {amenityGroups.length > 0 ? (
                  <div className="space-y-6">
                    {amenityGroups.map((group) => (
                      <div key={group.category}>
                        <div className="flex items-center gap-2 mb-3">
                          <group.icon size={16} className="text-[#8B7355]" />
                          <h3 className="text-[13px] font-medium tracking-[0.04em] text-[#1A1A18]">{group.label}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.items.map((item, idx) => (
                            <span
                              key={idx}
                              className="text-[12px] text-[#6B6860] bg-[#F5F1EB] px-3 py-1.5 rounded-full"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="body-md text-[#9E9A90]">{t('propertyDetail.amenitiesContact')}</p>
                )}
              </section>

              {/* 4. Services (add-on) */}
              <section>
                <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18] mb-2">{t('propertyDetail.servicesTitle')}</h2>
                <p className="body-md text-[#9E9A90] mb-5">{t('propertyDetail.servicesSubtitle')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map(service => (
                    <div key={service.slug} className="border border-[#E8E4DC] rounded-lg p-5 flex items-start justify-between gap-3 hover:border-[#8B7355]/40 hover:shadow-sm transition-all duration-200">
                      <div className="min-w-0">
                        <h3 className="font-display text-[15px] text-[#1A1A18] mb-1">{service.name}</h3>
                        <p className="text-[12px] text-[#6B6860] leading-relaxed mb-2 line-clamp-2" style={{ fontWeight: 300 }}>{service.tagline}</p>
                        <p className="text-[12px] text-[#8B7355] font-medium">
                          {service.priceFrom ? t('propertyDetail.fromPrice', { price: String(service.priceFrom) }) : t('bookingWidget.included')} <span className="text-[10px] text-[#9E9A90] font-normal">{service.priceSuffix}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setModalProduct(service)}
                        className="flex items-center gap-1.5 rounded-full bg-[#1A1A18] text-white text-[11px] tracking-[0.06em] font-medium px-4 py-2.5 hover:bg-[#333] transition-colors shrink-0"
                        style={{ minHeight: '44px', minWidth: '44px' }}
                      >
                        <Plus className="w-3.5 h-3.5" /> {t('propertyDetail.add')}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Adventures nearby */}
              {adventures.length > 0 && (
                <section>
                  <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18] mb-2">{t('propertyDetail.adventuresTitle')}</h2>
                  <p className="body-md text-[#9E9A90] mb-5">{t('propertyDetail.adventuresSubtitle', { destination: destName })}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {adventures.map(adventure => (
                      <Link key={adventure.slug} href={`/experiences/${adventure.slug}`} className="border border-[#E8E4DC] rounded-lg p-5 flex items-start justify-between gap-3 hover:border-[#8B7355]/40 hover:shadow-sm transition-all duration-200 group">
                        <div className="min-w-0">
                          <h3 className="font-display text-[15px] text-[#1A1A18] mb-1 group-hover:text-[#8B7355] transition-colors">{adventure.name}</h3>
                          <p className="text-[11px] text-[#6B6860] font-light leading-relaxed mb-2 line-clamp-2">{adventure.tagline}</p>
                          <p className="text-[12px] text-[#9E9A90]">
                            {adventure.priceFrom ? t('propertyDetail.fromPrice', { price: String(adventure.priceFrom) }) : t('propertyDetail.custom')} <span className="text-[10px]">{adventure.priceSuffix}</span>
                          </p>
                        </div>
                        <span className="flex items-center gap-1.5 rounded-full bg-[#1A1A18] text-white text-[11px] tracking-[0.06em] font-medium px-4 py-2.5 group-hover:bg-[#333] transition-colors shrink-0" style={{ minHeight: '44px', minWidth: '44px' }}>
                          <ArrowRight className="w-3.5 h-3.5" /> {t('propertyDetail.viewDetails', 'View')}
                        </span>
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/experiences"
                    className="inline-flex items-center gap-2 mt-4 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors"
                  >
                    {t('propertyDetail.viewAllExperiences', 'View all experiences')} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </section>
              )}

              {/* 6. Location map */}
              <section>
                <h2 className="font-display text-[clamp(1.1rem,2vw,1.4rem)] font-light text-[#1A1A18] mb-2">{t('propertyDetail.locationTitle', 'Location')}</h2>
                <p className="text-[13px] font-medium text-[#8B7355] mb-4">{property.locality}</p>
                <div className="rounded-xl overflow-hidden border border-[#E8E4DC]">
                  <iframe
                    title={`${property.name} — ${property.locality}`}
                    className="w-full h-[300px] lg:h-[360px] border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={
                      property.address?.lat && property.address?.lng
                        ? `https://maps.google.com/maps?q=${property.address.lat},${property.address.lng}&z=15&output=embed`
                        : `https://maps.google.com/maps?q=${encodeURIComponent(`${property.locality}, Portugal`)}&z=13&output=embed`
                    }
                    allowFullScreen
                  />
                </div>
              </section>

              {/* 10. Guest Reviews (from Guesty sync) */}
              <ReviewsSection
                propertyName={property.name}
                propertySlug={property.slug}
                reviews={(property as any).reviews}
                averageRating={(property as any).averageRating}
                reviewCount={(property as any).reviewCount}
              />

            </div>

            {/* Sticky booking card — right 1/3 */}
            <aside id="property-booking" className="order-1 lg:order-2 lg:col-span-1 pt-6 lg:pt-0">
              <div className="property-sticky-card lg:sticky lg:top-[100px]">
                {property.guestyId ? (
                  <>
                    <Suspense fallback={<div className="h-[300px] bg-[#F5F1EB] animate-pulse border border-[#E8E4DC]" />}>
                    <BookingWidget
                      guestyId={property.guestyId}
                      propertyName={property.name}
                      pricePerNight={(property as any).pricePerNight || property.priceFrom || 0}
                      maxGuests={property.maxGuests || 10}
                      minNights={(property as any).minNights}
                      cleaningFee={(property as any).cleaningFee}
                      destination={property.destination}
                      initialCheckIn={initialCheckin}
                      initialCheckOut={initialCheckout}
                      initialGuests={initialGuests}
                    />
                    </Suspense>
                  </>
                ) : (
                  <div className="bg-[#FAFAF7] border border-[#E8E4DC] p-6">
                    {property.priceFrom > 0 && (
                      <p className="font-display text-[32px] font-light text-[#1A1A18] mb-2">
                        {t('property.fromPerNight', { price: String(property.priceFrom) })} <span className="text-[18px] text-[#9E9A90]">{t('property.perNight')}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mb-4">
                      <BadgeCheck size={14} className="text-[#8B7355]" />
                      <span className="text-[11px] tracking-[0.02em] text-[#9E9A90] font-medium">{t('property.directConcierge')}</span>
                    </div>
                    <div className="space-y-3">
                      <Link
                        href={`/contact?property=${encodeURIComponent(property.slug)}&intent=availability`}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {t('property.checkAvailability')}
                      </Link>
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">
                        {t('property.askAboutHome')}
                      </a>
                    </div>
                  </div>
                )}

                {/* Concierge CTA — secondary, doesn't compete with primary Reserve */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost w-full mt-4 flex items-center justify-center gap-2 text-[#8B7355]"
                >
                  {t('property.needHelpConcierge')}
                </a>

                {/* Trust strip */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-6 pt-5 border-t border-[#E8E4DC]">
                  {([
                    { icon: Lock, label: t('trust.secureBooking', 'Secure booking') },
                    { icon: ShieldCheck, label: t('trust.bestRate', 'Best rate guaranteed') },
                    { icon: Clock, label: t('trust.flexibleOptions', 'Flexible cancellation options') },
                    { icon: Headphones, label: t('trust.conciergeIncluded', 'Concierge included') },
                  ] as const).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <item.icon size={14} className="text-[#9E9A90] shrink-0" />
                      <span className="text-[12px] text-[#9E9A90] leading-tight" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Mobile: sticky booking bar at bottom */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E8E4DC] px-4 pt-3 z-40"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {property.priceFrom > 0 && (
                <p className="font-display text-[18px] font-light text-[#1A1A18]">
                  {t('property.fromPerNight', { price: String(property.priceFrom) })} <span className="text-[12px] text-[#9E9A90]">{t('property.perNight')}</span>
                </p>
              )}
              <p className="text-[11px] text-[#9E9A90] flex items-center gap-1">
                <BadgeCheck size={12} className="text-[#8B7355]" /> {t('property.conciergeShort')}
              </p>
            </div>
            {property.guestyId ? (
              <button
                type="button"
                onClick={() => document.getElementById('property-booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="btn-primary shrink-0"
              >
                {t('property.checkAvailability')}
              </button>
            ) : (
              <Link
                href={`/contact?property=${encodeURIComponent(property.slug)}&intent=availability`}
                className="btn-primary shrink-0"
              >
                {t('property.checkAvailability')}
              </Link>
            )}
          </div>
        </div>

        {/* Why book direct */}
        <section className="py-16 lg:py-20 bg-[#F5F1EB]">
          <div className="container max-w-4xl mx-auto text-center">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[#8B7355] uppercase mb-3">{t('whyBookDirect.overline', 'Why book with us')}</p>
            <h2 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-light text-[#1A1A18] mb-10">{t('whyBookDirect.headline', 'Book direct. Save more.')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
              {[
                { icon: ShieldCheck, title: t('whyBookDirect.bestRate', 'Best rate guaranteed'), desc: t('whyBookDirect.bestRateDesc', 'Always the lowest price — no middleman markup.') },
                { icon: Headphones, title: t('whyBookDirect.concierge', 'Dedicated concierge'), desc: t('whyBookDirect.conciergeDesc', 'Personal support from booking to checkout.') },
                { icon: Clock, title: t('whyBookDirect.flexible', 'Flexible cancellation'), desc: t('whyBookDirect.flexibleDesc', 'Change of plans? We make it easy.') },
                { icon: Sparkles, title: t('whyBookDirect.curated', 'Curated by locals'), desc: t('whyBookDirect.curatedDesc', 'Every home hand-picked and operated by our team.') },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4">
                    <item.icon size={20} className="text-[#8B7355]" />
                  </div>
                  <h3 className="text-[13px] font-medium text-[#1A1A18] mb-1.5">{item.title}</h3>
                  <p className="text-[12px] text-[#9E9A90] leading-relaxed" style={{ fontWeight: 300 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related properties from same region */}
        {relatedProperties.length > 0 && (
          <section className="section-padding bg-white border-t border-[#E8E4DC]">
            <div className="container">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.08em] text-[#8B7355] mb-2 uppercase">{t('propertyDetail.moreIn', { destination: destName, defaultValue: `More in ${destName}` })}</p>
                  <h2 className="headline-lg text-[#1A1A18]">{t('propertyDetail.relatedHomes', 'Related homes')}</h2>
                </div>
                {destObj && (
                  <Link href={`/destinations/${destObj.slug}`} className="hidden md:flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors">
                    {t('propertyDetail.allDestHomes', { destination: destName, defaultValue: `All ${destName} homes` })} <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedProperties.map((rp, i) => (
                  <div
                    key={rp.id}
                    ref={(el) => {
                      const slug = rp.slug;
                      if (el) {
                        relatedCardDataRef.current.set(slug, { property: rp, index: i + 1 });
                        relatedElementToSlugRef.current.set(el, slug);
                        relatedSlugToElementRef.current.set(slug, el);
                        relatedObserverRef.current?.observe(el);
                      } else {
                        const existing = relatedSlugToElementRef.current.get(slug);
                        if (existing) {
                          relatedObserverRef.current?.unobserve(existing);
                          relatedElementToSlugRef.current.delete(existing);
                          relatedSlugToElementRef.current.delete(slug);
                        }
                        relatedCardDataRef.current.delete(slug);
                      }
                    }}
                  >
                    <PropertyCard
                      property={rp}
                      checkin={initialCheckin || undefined}
                      checkout={initialCheckout || undefined}
                      guests={initialGuests > 1 ? initialGuests : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Bottom spacer for mobile sticky booking bar */}
        <div className="lg:hidden h-[100px]" />

        <Footer />
      </div>

      {/* Fullscreen lightbox */}
      {lightboxOpen && (
        <Lightbox
          images={images}
          initialIndex={lightboxImage}
          propertyName={property.name}
          destName={destName}
          onClose={() => setLightboxOpen(false)}
          t={t}
        />
      )}

      {modalProduct && (
        <Suspense fallback={null}>
          <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
        </Suspense>
      )}
    </>
  );
}
