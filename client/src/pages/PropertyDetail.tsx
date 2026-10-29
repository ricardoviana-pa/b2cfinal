/* ==========================================================================
   PROPERTY DETAIL — Full page view (not modal)
   Hero gallery, two-column layout, sticky booking card, Le Collectionist-style amenities
   ========================================================================== */

import { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useMeasurementConsent } from '@/hooks/useMeasurementConsent';
import { localizeDuration, localizeRoomName } from '@/lib/duration';
import { useParams, Link, useSearch, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { loadPropertyOverrides, mergePropertyOverrides, propertyOverridesQueryKey } from '@/lib/localizeProperty';
import { SSR_FROM_PRICES_KEY, pickLowestNightly, type SsrFromPrices } from '@/lib/ssrFromPrices';
import { noPriceLabelKey } from '@/lib/partnerPriceLabel';
import { countVars } from '@/lib/plural';
import { propertyKindInline } from '@shared/propertyMeta';
import { propertyPageMetaOpts } from '@/lib/propertyPageMeta';
import { buildPdpFaq, faqPageNode } from '@shared/pdpFaq';
import { placeKey, placePhrases, placeVars } from '@shared/regionPhrases';
import { localizeProduct } from '@/lib/localizeProduct';
import { usePageMeta } from '@/hooks/usePageMeta';
import { PartnerBookingPanel } from '@/components/booking/PartnerBookingPanel';
import { BookingCardSlotContext } from '@/components/booking/bookingCardSlot';
import { ChevronLeft, ChevronRight, MapPin, BadgeCheck, Clock, Headphones, X, AlertTriangle, ArrowRight, ShieldCheck, Bed, ChevronDown, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { amenityIcon, bedLine, bedTypeOf, categorizeAmenities, countBeds, pickKeyAmenities } from '@/lib/amenities';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));
import productsData from '@/data/products.json';
import destinationsData from '@/data/destinations.json';
import type { Product, Destination, Property } from '@/lib/types';
import { getPropertyImages, optimizeGuestyImage, guestySrcSet } from '@/lib/images';
const BookingWidget = lazy(() => import('@/components/booking/BookingWidget'));
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';
import PropertyUnitsSection from '@/components/property/PropertyUnitsSection';
import ReviewsSection from '@/components/property/ReviewsSection';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { getGroupByParentGuestyId } from '@/config/propertyGroups';
import { trpc } from '@/lib/trpc';
import { propertyCatalogId, pushEcommerce } from '@/lib/datalayer';
import { hasSwimmingPool } from '@/lib/homeSearch';
import type { BookingSelection } from '@/components/booking/BookingWidget';
import { formatQuotedEur, formatBookingDate, getDisplayName, intlLocale } from '@/lib/format';
import { RISE_ABOVE_COOKIE_BANNER, publishBottomBarHeight } from '@/lib/fixedBottom';
import {
  StructuredData,
  buildVacationRentalSchema,
  buildBreadcrumbSchema,
} from '@/components/seo/StructuredData';

const allProducts = productsData as unknown as Product[];
const destinations = destinationsData as unknown as Destination[];

/** Parse description: handle string, split by \n\n or \n */
/** Google Maps embed, mounted only when the visitor scrolls near it. The
 *  embed pulls ~400 KB of Maps JS; `loading="lazy"` alone still fetched it
 *  on mobile page load (Chrome's lazy-iframe distance is thousands of px),
 *  roughly doubling the PDP's script weight. */
function LazyMapFrame({ title, src }: { title: string; src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === 'undefined') { setShow(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} className="w-full h-[300px] lg:h-[360px] bg-pa-sand/40">
      {show && (
        <iframe
          title={title}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src}
          allowFullScreen
        />
      )}
    </div>
  );
}

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

const LIGHTBOX_SLIDE_MS = 300;
const LIGHTBOX_WIDTHS = [1080, 1600, 2560];

/** The hero photo appears twice in the markup: the phone carousel (slide 1)
 *  and the desktop grid (big tile). Both are eager + fetchpriority=high, and
 *  the hidden one is fetched too, so they used different srcsets and every
 *  visitor downloaded two files of the same photo (auditoria out/2026,
 *  performance-12-pdp-double-hero). Same srcset + same sizes = the browser
 *  picks the same URL for both, React writes one preload, one download. */
const HERO_WIDTHS = [640, 828, 1080, 1440];
// Desktop: the large tile is half the container (≈46vw at 1440 px).
const HERO_SIZES = '(min-width: 1024px) 46vw, 100vw';

function Lightbox({ images, rawImages, initialIndex, propertyName, destName, onClose, t }: {
  images: string[];
  rawImages?: string[];
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
  // Slide in flight: the three-slot track animates one slot sideways, then
  // `idx` catches up and the track snaps back to the centre without animating.
  const [slideDir, setSlideDir] = useState<-1 | 0 | 1>(0);
  const [loaded, setLoaded] = useState<Record<number, true>>({});
  const lbRef = useRef<HTMLDivElement>(null);

  const go = useCallback((dir: -1 | 1) => {
    if (total < 2) return;
    setSlideDir(current => current || dir);
  }, [total]);
  const prev = useCallback(() => go(-1), [go]);
  const next = useCallback(() => go(1), [go]);

  useEffect(() => {
    if (!slideDir) return;
    const timer = window.setTimeout(() => {
      setIdx(p => (p + slideDir + total) % total);
      setSlideDir(0);
    }, LIGHTBOX_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [slideDir, total]);

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

  // The neighbours are real <img> slots (below), so they download with the
  // same srcset candidate the browser will show when they slide in. Warm two
  // further out the same way — a bare 2560px preload the <img> never used
  // only competed with the visible photo for the phone's bandwidth.
  useEffect(() => {
    if (total < 4) return;
    [idx - 2, idx + 2].forEach(i => {
      const j = (i + total) % total;
      const img = new Image();
      const srcSet = guestySrcSet(rawImages?.[j], LIGHTBOX_WIDTHS);
      if (srcSet) { img.sizes = '100vw'; img.srcset = srcSet; }
      img.src = images[j];
    });
  }, [idx, images, rawImages, total]);

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
    lbTouchDelta.current = 0;
    setLbDragOffset(0);
  };
  // The browser cancels the touch when it takes the gesture over (pinch,
  // system edge swipe); without this the track stayed frozen mid-drag.
  const handleLbTouchCancel = () => { lbTouchDelta.current = 0; setLbDragOffset(0); };

  // Previous / current / next. Keyed by photo index so a slide moves the
  // existing, already-decoded <img> nodes instead of re-creating them.
  const slots = total >= 3
    ? [(idx - 1 + total) % total, idx, (idx + 1) % total].map(i => ({ imgIdx: i, key: String(i) }))
    : [idx - 1, idx, idx + 1].map((i, pos) => ({ imgIdx: (i + total) % total, key: `${pos}-${(i + total) % total}` }));

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
        <span className="text-white/70 body-sm font-body font-light" >
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
        className="flex-1 relative overflow-hidden"
        style={{ touchAction: 'pan-y pinch-zoom' }}
        onTouchStart={handleLbTouchStart}
        onTouchMove={handleLbTouchMove}
        onTouchEnd={handleLbTouchEnd}
        onTouchCancel={handleLbTouchCancel}
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

        {/* Three-slot track. Each slot is its own <img>, so a swipe reveals a
            photo that is already downloading. Swapping `src` on one element
            kept the OLD photo on screen (counter moving, picture not) until
            the new 1600–2560px file had arrived over mobile data. */}
        <div
          className="flex h-full"
          style={{
            width: '300%',
            transform: `translateX(calc(${-(1 + slideDir) * (100 / 3)}% + ${lbDragOffset}px))`,
            transition: slideDir ? `transform ${LIGHTBOX_SLIDE_MS}ms ease` : 'none',
          }}
        >
          {slots.map(({ imgIdx, key }, pos) => (
            <div key={key} className="h-full flex items-center justify-center" style={{ width: `${100 / 3}%` }} aria-hidden={pos !== 1}>
              <img
                src={images[imgIdx]}
                srcSet={guestySrcSet(rawImages?.[imgIdx], LIGHTBOX_WIDTHS)}
                sizes="100vw"
                alt={pos === 1 ? t('seoMeta.photoAltOf', { name: propertyName, place: destName, n: imgIdx + 1, total }) : ''}
                className="max-w-full max-h-full object-contain select-none"
                decoding="async"
                draggable={false}
                onLoad={() => setLoaded(l => (l[imgIdx] ? l : { ...l, [imgIdx]: true }))}
                onError={() => setLoaded(l => (l[imgIdx] ? l : { ...l, [imgIdx]: true }))}
              />
            </div>
          ))}
        </div>
        {!loaded[idx] && !slideDir && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Description with "Read more" truncation for long Guesty copy */
/** Ordered structured-description blocks. `summary` is the lead (no heading);
 *  the rest get a titled block. `interaction` is intentionally excluded from
 *  the default render — it's usually generic concierge boilerplate that
 *  duplicates "What's included". */
const DESCRIPTION_BLOCKS: { key: string; labelKey: string; fallback: string; lead?: boolean }[] = [
  { key: 'summary', labelKey: '', fallback: '', lead: true },
  { key: 'space', labelKey: 'propertyDetail.sectionSpace', fallback: 'The space' },
  { key: 'access', labelKey: 'propertyDetail.sectionAccess', fallback: 'Guest access' },
  { key: 'neighborhood', labelKey: 'propertyDetail.sectionNeighbourhood', fallback: 'The neighbourhood' },
  { key: 'gettingAround', labelKey: 'propertyDetail.sectionGettingAround', fallback: 'Getting around' },
  { key: 'notes', labelKey: 'propertyDetail.sectionGoodToKnow', fallback: 'Good to know' },
];

/** Apply the empty / garbage / duplicate heuristics the content audit flagged.
 *  Returns the ordered, renderable blocks (each with cleaned paragraphs). */
function buildStructuredBlocks(sections: Record<string, string> | undefined) {
  if (!sections || typeof sections !== 'object') return [];
  const out: { key: string; label: string | null; paragraphs: string[] }[] = [];
  const shownOpenings: string[] = []; // first-80-chars of every block already shown

  const summaryClean = cleanDescription(String(sections.summary || '')).trim();

  // Content-quality filtering (upsell-in-notes, Summary/Space dedup, garbage)
  // now lives in the sync mapper (server/services/guesty-sync.ts —
  // buildDescriptionSections) so it's metric-tracked and the frontend stays
  // business-rule-agnostic. Here we only do presentation hygiene: skip empty
  // blocks and de-dup any opening that still slips through.
  for (const block of DESCRIPTION_BLOCKS) {
    const raw = String(sections[block.key] || '');
    const clean = cleanDescription(raw).trim();
    // Empty / garbage filter (catches "", "/", single words, stray punctuation)
    if (clean.replace(/[^a-zA-Z0-9]/g, '').length < 12) continue;
    // Duplicate filter: skip if this block just repeats the summary, or repeats
    // the opening of any block already shown (e.g. "The space" echoing Summary).
    const opening = clean.slice(0, 80).toLowerCase();
    if (!block.lead) {
      if (summaryClean && opening === summaryClean.slice(0, 80).toLowerCase()) continue;
      if (shownOpenings.some((o) => o === opening)) continue;
    }
    shownOpenings.push(opening);
    out.push({
      key: block.key,
      label: block.lead ? null : block.fallback, // label resolved with t() at render
      paragraphs: clean.split(/\n\n+/).flatMap((p) => p.split('\n')).map((p) => p.trim()).filter(Boolean),
    });
  }
  return out;
}

function DescriptionSection({ description, sections, propertyName, locality, destName, t }: {
  description: unknown;
  sections?: Record<string, string>;
  propertyName: string;
  locality: string;
  destName: string;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}) {
  const [expanded, setExpanded] = useState(false);

  // Prefer the structured sub-fields when the listing has clean content for
  // them; otherwise fall back to the legacy merged-blob rendering.
  const blocks = buildStructuredBlocks(sections);
  const useStructured = blocks.length >= 2; // need at least summary + 1 real block

  if (useStructured) {
    // Above the fold: lead + first titled block. The rest expand on "Read more".
    const ABOVE = 2;
    const visibleBlocks = expanded ? blocks : blocks.slice(0, ABOVE);
    const hasMore = blocks.length > ABOVE;
    const labelFor = (b: typeof blocks[number]) => {
      const def = DESCRIPTION_BLOCKS.find((d) => d.key === b.key);
      return def && def.labelKey ? t(def.labelKey, def.fallback) : null;
    };
    return (
      <section>
        <h2 className="font-display headline-sm font-light text-pa-dark mb-5">{t('propertyDetail.aboutTitle')}</h2>
        <div className="space-y-7">
          {visibleBlocks.map((b) => (
            <div key={b.key} className={b.label ? '' : 'body-lg'}>
              {b.label && (
                <h3 className="eyebrow font-semibold tracking-[0.12em] uppercase text-pa-stone mb-2.5">{labelFor(b)}</h3>
              )}
              <div className={b.label ? 'space-y-3 body-sm text-pa-earth leading-relaxed' : 'space-y-4'} style={b.label ? { fontWeight: 300 } : undefined}>
                {b.paragraphs.map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="body-sm font-medium text-pa-gold hover:text-pa-dark transition-colors underline underline-offset-4"
            >
              {expanded ? t('common.readLess', 'Read less') : t('common.readMore', 'Read more')}
            </button>
          )}
        </div>
      </section>
    );
  }

  // ── Legacy fallback: single merged blob with truncation ──
  const paragraphs = formatDescription(description);
  const MAX_VISIBLE = 3;
  const needsTruncation = paragraphs.length > MAX_VISIBLE;
  const visible = expanded ? paragraphs : paragraphs.slice(0, MAX_VISIBLE);

  return (
    <section>
      <h2 className="font-display headline-sm font-light text-pa-dark mb-5">{t('propertyDetail.aboutTitle')}</h2>
      <div className="body-lg space-y-4 relative">
        {visible.length > 0 ? (
          <>
            {visible.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            {needsTruncation && !expanded && (
              <div className="relative pt-2">
                <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-pa-cream to-transparent pointer-events-none" />
                <button
                  onClick={() => setExpanded(true)}
                  className="body-sm font-medium text-pa-gold hover:text-pa-dark transition-colors underline underline-offset-4"
                >
                  {t('common.readMore', 'Read more')}
                </button>
              </div>
            )}
            {expanded && needsTruncation && (
              <button
                onClick={() => setExpanded(false)}
                className="body-sm font-medium text-pa-gold hover:text-pa-dark transition-colors underline underline-offset-4"
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
  const measurementAllowed = useMeasurementConsent();
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: rawProperty, isLoading, error, refetch } = trpc.properties.getBySlugForSite.useQuery(
    { slug: slug ?? '' },
    { enabled: !!slug }
  );
  // Property descriptions come from Guesty in English; overlay per-locale
  // translations (guestyId-keyed) with English fallback. Only the active
  // language's overrides are fetched (code-split), so we load them async.
  // Until they arrive, the page uses the one override the server seeded for
  // this home (propertyOverridesQueryKey): the server HTML is already in the
  // page's language and the first client render must match it.
  const queryClient = useQueryClient();
  const [propOverrides, setPropOverrides] = useState<Record<string, any>>(
    () => (queryClient.getQueryData(propertyOverridesQueryKey(i18n.language, slug ?? '')) as Record<string, any> | undefined) ?? {},
  );
  useEffect(() => {
    let alive = true;
    loadPropertyOverrides(i18n.language).then(o => { if (alive) setPropOverrides(o); });
    return () => { alive = false; };
  }, [i18n.language]);
  const property = useMemo(
    () => mergePropertyOverrides(rawProperty, propOverrides),
    [rawProperty, propOverrides],
  );

  // When this listing is the parent of a multi-unit group, swap the visible
  // name for the group name (e.g. "Quinta de Parada do Vez" instead of
  // "Luxury and Nature Retreat w/ pool, jacuzzi & BBQ"). Internal references
  // (BookingWidget, structured data, GA4) keep the underlying property.name.
  const propertyGroup = useMemo(
    () => (property?.guestyId ? getGroupByParentGuestyId(property.guestyId) : null),
    [property?.guestyId],
  );
  const displayName = useMemo(
    () => propertyGroup?.name ?? (property ? getDisplayName(property) : ''),
    [propertyGroup, property],
  );

  // Title and description from the builder the server uses for the same page
  // (shared/propertyMeta.ts): localized, and built from facts the overrides
  // never change, so hydration and the late override load leave them as the
  // server wrote them.
  const pdpMeta = useMemo(
    () => (property ? propertyPageMetaOpts(property, i18n.language) : null),
    [property, i18n.language],
  );
  // Partner homes were kept out of the index while they carried the
  // supplier's copy. The rewrite shipped on 31 Aug 2026 (35 original
  // descriptions in nine languages), so they index like every other home
  // (auditoria set/2026, N19). Submit the URLs in Search Console once live.
  const PARTNER_HOMES_NOINDEX = false;
  const partnerNoindex = PARTNER_HOMES_NOINDEX && (property as any)?.source === 'tripwix';

  usePageMeta({ ...pdpMeta, type: 'place', noindex: partnerNoindex });

  // VacationRental + Breadcrumb JSON-LD (bundled via @graph by StructuredData).
  // VacationRental is Google's dedicated subtype for short-term rentals; it
  // surfaces richer fields (numberOfBedrooms, occupancy, amenityFeature as
  // LocationFeatureSpecification) that AI Overviews quote directly.
  /** Practical Q&A from the home's own data — rendered visibly in "Good to
   *  know" and mirrored into FAQPage JSON-LD (Google requires the answers to
   *  exist on the page). The server builds its FAQPage with the same function
   *  (shared/pdpFaq.ts), so the bot HTML says exactly what the page says. */
  const pdpFaq = useMemo(() => {
    if (!property) return [] as Array<{ q: string; a: string }>;
    return buildPdpFaq(
      {
        name: displayName || property.name,
        checkInTime: property.checkInTime,
        checkOutTime: property.checkOutTime,
        petsAllowed: (property as any).petsAllowed,
      },
      i18n.language,
      (key, fallback, vars) => t(key, fallback, vars as Record<string, unknown>) as string,
    );
  }, [property, displayName, t, i18n.language]);


  const propertyGraph = useMemo(() => {
    if (!property) return null;
    const dest = destinations.find(d => d.slug === property.destination);
    const amenityNames = Object.values(property.amenities || {})
      .flatMap((items) => (Array.isArray(items) ? (items as string[]) : []));

    return [
      buildVacationRentalSchema({
        id: property.id,
        guestyId: property.guestyId,
        supplierUid: property.supplierUid,
        propertyType: (property as any).propertyType,
        rooms: (property as any).rooms,
        areaSquareFeet: (property as any).areaSquareFeet,
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
        // Guesty doesn't currently expose this — leave null until wired.
        petsAllowed: (property as any).petsAllowed ?? null,
        licenseNumber: (property as any).licenseNumber ?? null,
        // Coordinates live under address.lat/lng in the sync output; the old
        // top-level fields never existed, so GeoCoordinates was always null.
        latitude: (property as any).address?.lat ?? null,
        longitude: (property as any).address?.lng ?? null,
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
      // Same Q&A the visible "Good to know" section renders.
      ...(pdpFaq.length
        ? [{ '@context': 'https://schema.org', ...faqPageNode(pdpFaq) }]
        : []),
    ];
  }, [property, pdpFaq]);

  const searchString = useSearch();
  const [, navigate] = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const initialCheckin = searchParams.get('checkin') || '';
  const initialCheckout = searchParams.get('checkout') || '';
  const initialGuests = Number(searchParams.get('guests')) || 0;

  const [currentImage, setCurrentImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(0);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [desktopBooking, setDesktopBooking] = useState(true);
  // Cartão fixo do computador: o cartão, a cujo fundo o widget prende o
  // RESERVE, e a parte que rola (bookingCardSlot.tsx). Null no servidor e no
  // primeiro render.
  const [bookingCardEl, setBookingCardEl] = useState<HTMLDivElement | null>(null);
  const [bookingScroller, setBookingScroller] = useState<HTMLDivElement | null>(null);
  const bookingCardSlot = useMemo(
    () => (bookingCardEl && bookingScroller ? { card: bookingCardEl, scroller: bookingScroller } : null),
    [bookingCardEl, bookingScroller],
  );
  const [bookingSelection, setBookingSelection] = useState<BookingSelection | null>(null);
  const [showAllServices, setShowAllServices] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktopBooking(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => { setBookingSelection(null); setBookingOpen(false); }, [slug]);
  const onBookingSelection = useCallback((next: BookingSelection) => setBookingSelection(prev =>
    prev && prev.checkIn === next.checkIn && prev.checkOut === next.checkOut && prev.guests === next.guests && prev.total === next.total && prev.loading === next.loading && prev.isPartial === next.isPartial ? prev : next
  ), []);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
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
    if (!property || !measurementAllowed) return;
    const nights = initialCheckin && initialCheckout
      ? Math.max(1, Math.ceil((new Date(initialCheckout).getTime() - new Date(initialCheckin).getTime()) / 86400000))
      : 1;
    pushEcommerce({
      event: 'view_item',
      // Id do catálogo Meta: o ViewContent do GTM usa-o nos content_ids
      property_id: propertyCatalogId(property),
      ecommerce: {
        currency: 'EUR',
        value: (property.priceFrom || 0) * nights,
        items: [
          {
            item_id: `PROP-${propertyCatalogId(property)}`,
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
  }, [property?.id, measurementAllowed]);

  const services = useMemo(
    () => allProducts.filter(p => p.type === 'service' && p.isActive).map(p => ({ ...localizeProduct(p, i18n.language)!, priceFrom: undefined, priceSuffix: '' })),
    [i18n.language],
  );
  const adventures = useMemo(() => {
    if (!property) return [];
    return allProducts.filter(p =>
      p.type === 'adventure' && p.isActive &&
      (Array.isArray(p.destinations) ? (p.destinations.length === 0 || p.destinations.includes(property.destination)) : true)
    ).map(p => localizeProduct(p, i18n.language)!);
  }, [property, i18n.language]);

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
  // The region in the page's language, and the phrases that put it in a
  // sentence ("no Minho", "en Algarve", "an der Algarve") — not the English
  // name after a fixed preposition (auditoria out/2026, i18n-copy-08).
  const destSlug = destObj?.slug ?? property?.destination ?? null;
  const destKnown = !!destSlug && !!placeKey(destSlug);
  const destName = destKnown
    ? placePhrases(destSlug, i18n.language).name
    : (destObj?.name || property?.locality || property?.region || '');
  const destVars = useMemo(
    () => (destKnown ? placeVars(destSlug, i18n.language) : placeVars(destName, i18n.language, destName)),
    [destKnown, destSlug, destName, i18n.language],
  );
  // "luxury villa in the Minho" / "casa de luxo no Minho" — photo alt text.
  const kindInPlace = useMemo(
    () => (property ? propertyKindInline(i18n.language, { propertyType: (property as any).propertyType, destination: destKnown ? destSlug : destName }) : ''),
    [property, i18n.language, destKnown, destSlug, destName],
  );

  // The whole catalogue (≈18 KB, 110 KB of JSON) is only needed for the related
  // homes at the bottom and, on a multi-unit home, for its units near the top.
  // It used to be fetched right after hydration in the same batched request as
  // the "from" price below, which then waited for it (auditoria out/2026,
  // performance-09-from-price-latency). Now: at once on a multi-unit home,
  // otherwise when the related-homes block comes within ~1.5 screens.
  const [catalogWanted, setCatalogWanted] = useState(false);
  const relatedSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (catalogWanted) return;
    const el = relatedSentinelRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setCatalogWanted(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setCatalogWanted(true); io.disconnect(); }
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [catalogWanted, property?.slug]);
  const { data: allPropsData } = trpc.properties.catalogForSite.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: catalogWanted || !!propertyGroup,
  });
  // "From €X per night" = lowest REAL bookable nightly (next 90 days), not the
  // Guesty basePrice placeholder. Cached server-side; lazy per viewed listing.
  // Partner (Tripwix) homes have no Guesty listing; they price off the
  // supplier's own calendar instead, through the same procedure.
  // Starts from the price the server put into the page (lib/ssrFromPrices.ts),
  // so the booking card and the mobile bar show it in the server HTML.
  const tripwixUid = (property as any)?.source === 'tripwix'
    ? ((property as any)?.supplierUid as string | undefined)
    : undefined;
  const seededNightly = pickLowestNightly(
    queryClient.getQueryData<SsrFromPrices>(SSR_FROM_PRICES_KEY),
    tripwixUid ? undefined : property?.guestyId,
  );
  const { data: lowestNightly } = trpc.booking.lowestNightly.useQuery(
    {
      listingId: property?.guestyId ?? tripwixUid ?? '',
      basePrice: (property?.priceFrom as number) || undefined,
      tripwixUid,
    },
    {
      enabled: !!property?.guestyId || !!tripwixUid,
      staleTime: 60_000,
      ...(seededNightly ? { initialData: seededNightly.data, initialDataUpdatedAt: seededNightly.updatedAt } : {}),
    },
  );

  // The header's RESERVE button on this page books THIS home (Header.tsx
  // dispatches `pa:reserve`; it used to send the guest back to the catalogue).
  // Desktop scrolls to the booking card, a phone opens the booking sheet; a
  // showcase-only home goes to the concierge with the home pre-filled.
  useEffect(() => {
    const open = () => {
      const canBookHere = !!tripwixUid || (!!property?.guestyId && !property?.isPortfolio);
      if (window.matchMedia('(min-width: 1024px)').matches) {
        document.getElementById('property-booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (canBookHere) {
        setBookingOpen(true);
      } else if (property?.slug) {
        navigate(`/contact?property=${encodeURIComponent(property.slug)}&intent=availability`);
      }
    };
    window.addEventListener('pa:reserve', open);
    return () => window.removeEventListener('pa:reserve', open);
  }, [tripwixUid, property?.guestyId, property?.isPortfolio, property?.slug, navigate]);
  const relatedProperties = useMemo(() => {
    if (!property || !allPropsData) return [];
    return (allPropsData as Property[])
      .filter(p => p.isActive !== false && p.destination === property.destination && p.slug !== property.slug)
      .slice(0, 3)
      .map(p => mergePropertyOverrides(p, propOverrides)!);
  }, [property, allPropsData, propOverrides]);

  // GA4: view_item_list for related properties — fires when cards enter the viewport
  useEffect(() => {
    relatedObserverRef.current?.disconnect();
    relatedPendingRef.current.clear();

    if (!measurementAllowed || !relatedProperties.length) return;

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
            item_id: `PROP-${propertyCatalogId(rp)}`,
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
  }, [relatedProperties, measurementAllowed]);

  const amenityItems = useMemo(() => {
    if (!property?.amenities || typeof property.amenities !== 'object') return [] as string[];
    return Object.values(property.amenities).flat().filter((x): x is string => typeof x === 'string' && x.length > 0);
  }, [property?.amenities]);
  const amenityGroups = useMemo(() => categorizeAmenities(amenityItems), [amenityItems]);
  const amenityTotal = useMemo(() => amenityGroups.reduce((n, g) => n + g.items.length, 0), [amenityGroups]);
  // The translated key amenities (icons + amenityHighlight.*): the first six
  // head the page under the facts, up to ten open the amenities section.
  const keyAmenities = useMemo(
    () => pickKeyAmenities(amenityItems, amenityGroups, t),
    [amenityItems, amenityGroups, t],
  );
  const bedTotal = useMemo(() => countBeds(property?.rooms), [property?.rooms]);

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
  // A cancelled touch (the browser took the gesture) left `dragOffset` stuck
  // and the strip parked between two photos; snap back instead.
  const handleGalleryTouchCancel = useCallback(() => {
    touchDeltaX.current = 0;
    setDragOffset(0);
    isDragging.current = false;
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pa-cream">
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
              <div className="border border-pa-sand p-6 space-y-4">
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
      <div className="min-h-screen bg-pa-cream">
        <Header />
        <div className="container max-w-lg py-24 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-pa-warm">
            <AlertTriangle className="w-6 h-6 text-pa-stone" />
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

  // Gallery images via Cloudinary transform (resize + WebP/AVIF). Two sizes:
  // 1600px for the hero/grid (crisp on retina without bloating LCP), and 2560px
  // for the full-screen lightbox where photos are scrutinised — the Guesty
  // masters are ≥2560px, so this is real detail, not upscaling. Serving 1200px
  // everywhere is what made photos look pixelated full-screen.
  const sourceImages = property.images?.length ? property.images : getPropertyImages(property.slug);
  const images = sourceImages.map((img: string) => optimizeGuestyImage(img, 1600));
  const lightboxImages = sourceImages.map((img: string) => optimizeGuestyImage(img, 2560));
  const totalImages = Math.max(images.length, 1);
  const whatsappUrl = `https://wa.me/351927161771?text=${encodeURIComponent(property.whatsappMessage || `Hi, I am interested in ${property.name}`)}`;

  // Casas de portfolio (isPortfolio, vindo do Guesty) são só montra: nunca se
  // reservam online, por isso usam o cartão do concierge em vez do widget —
  // o widget pedia preço ao Guesty, falhava e mostrava "não conseguimos
  // confirmar o preço" a quem só queria conhecer a casa.
  const bookableOnline = !!property.guestyId && !property.isPortfolio;

  // What the fixed mobile bar says before any dates: the real "from" nightly
  // when we have one. "Select dates for price" alone read as if the home could
  // not be booked online, and the number was already on the widget behind it.
  // Same figure the widget leads with: live lowest nightly first, and only
  // our own homes fall back to the imported rate (a partner home without a
  // live figure says "Price on request" on its panel, so the bar stays quiet).
  // Só o "desde" calculado (a noite mais barata reservável, lowest-nightly.ts).
  // O pricePerNight/priceFrom importado do Guesty é um valor de referência
  // errado nos dois sentidos: sem preço calculado, a barra pede as datas.
  const barNightly = lowestNightly?.from ?? 0;
  const barFromPrice = (bookableOnline || tripwixUid) && barNightly > 0
    ? `${t('property.fromPerNight', { price: Math.round(barNightly).toLocaleString(intlLocale(i18n.language)) })} ${t('partnerBooking.perNight', 'per night')}`
    : null;
  // A partner home with no "from" (no calendar yet): "Price on request", not
  // "Select dates for price" — dates will not price it either.
  const barNoPrice = t(noPriceLabelKey(!!tripwixUid, lowestNightly?.from));

  // The rating beside the title, the facts under the photos (what the stat
  // pills used to say, as one line) and the section links.
  const hasRating = !!(property.averageRating && property.reviewCount);
  const hasReviews = hasRating || (Array.isArray((property as any).reviews) && (property as any).reviews.length > 0);
  const facts: string[] = [
    // Plural-aware, with the language's decimal mark ("1 Chambre",
    // "7,5 Casas de Banho") — not "1 Chambres" / "7.5" (i18n-copy-08).
    // countVars: European Portuguese plurals ("1,5 Casas de Banho").
    t('seoMeta.guestCount', countVars(Number(property.maxGuests) || 0, i18n.language)),
    t('seoMeta.bedroomCount', countVars(Number(property.bedrooms) || 0, i18n.language)),
    t('seoMeta.bathroomCount', countVars(Number(property.bathrooms) || 0, i18n.language)),
    ...(property.areaSquareFeet && property.areaSquareFeet > 0
      ? [`${Math.round(property.areaSquareFeet * 0.0929).toLocaleString(intlLocale(i18n.language))} m²`]
      : []),
    ...((property.checkInTime || property.checkOutTime)
      ? [`${t('bookingWidget.checkInLabel')} ${property.checkInTime || '16:00'}`, `${t('bookingWidget.checkOutLabel')} ${property.checkOutTime || '11:00'}`]
      : []),
    ...((property as any).petsAllowed ? [t('property.petFriendly', 'Pet-friendly')] : []),
  ];
  const sectionLinks: [string, string][] = [
    ['property-about', t('propertyDetail.aboutTitle')],
    ...(property.rooms?.length ? [['property-bedrooms', t('pdpUx.bedrooms')] as [string, string]] : []),
    ['property-amenities', t('propertyDetail.amenitiesTitle')],
    ['property-location', t('propertyDetail.locationTitle')],
    ...(hasReviews ? [['property-reviews', t('reviews.title', 'Guest reviews')] as [string, string]] : []),
    ['property-good-to-know', t('pdpFaq.title')],
  ];

  // Booking panel — shared between the desktop sticky sidebar and the mobile
  // bottom-sheet drawer so the two stay in sync (single source of truth).
  const bookingPanel = (
    <>
      {bookableOnline ? (
        <Suspense fallback={<div className="h-[300px] bg-pa-warm animate-pulse border border-pa-sand" />}>
          <BookingWidget
            key={property.slug}
            onSelectionChange={onBookingSelection}
            guestyId={property.guestyId}
            propertyName={displayName}
            propertySlug={property.slug}
            pricePerNight={lowestNightly?.from ?? 0}
            maxGuests={property.maxGuests || 10}
            minNights={(property as any).minNights}
            cleaningFee={(property as any).cleaningFee}
            destination={property.destination}
            conciergeUrl={whatsappUrl}
            initialCheckIn={bookingSelection?.checkIn ?? initialCheckin}
            initialCheckOut={bookingSelection?.checkOut ?? initialCheckout}
            initialGuests={bookingSelection?.guests ?? initialGuests}
          />
        </Suspense>
      ) : tripwixUid ? (
        <PartnerBookingPanel
          tripwixUid={tripwixUid}
          propertyName={displayName}
          propertySlug={property.slug}
          fromPrice={lowestNightly?.from}
          maxGuests={property.maxGuests || 20}
          minNights={(property as any).minNights}
          initialCheckIn={bookingSelection?.checkIn ?? initialCheckin}
          initialCheckOut={bookingSelection?.checkOut ?? initialCheckout}
          initialGuests={bookingSelection?.guests ?? initialGuests}
          onSelectionChange={onBookingSelection}
          whatsappUrl={whatsappUrl}
        />
      ) : (
        <div className="bg-pa-cream border border-pa-sand p-6">
          {/* Partner homes cannot be booked instantly — the supplier confirms
              each stay before we can — but we do know the real nightly rate, so
              show it rather than hiding behind "price on request". */}
          {lowestNightly?.from ? (
            <p className="font-display text-[20px] font-light text-pa-dark mb-2">
              {t('property.fromPerNight', {
                price: Math.round(lowestNightly.from).toLocaleString('en-US'),
              })}
            </p>
          ) : (
            <p className="font-display text-[20px] font-light text-pa-dark mb-2">
              {t('property.priceOnRequest')}
            </p>
          )}
          <div className="flex items-center gap-1.5 mb-4">
            <BadgeCheck size={14} className="text-pa-gold" />
            <span className="caption tracking-[0.02em] text-pa-stone font-medium">{t('property.directConcierge')}</span>
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

      {/* Why book direct — the guest arrived from an OTA with that tab still
          open. Four generic badges ("best rate guaranteed") carried no weight;
          a claim only converts sceptics when it names its mechanism. Every line
          here is unconditionally true (F1 honesty rule). */}
      <div className="mt-5 pt-4 border-t border-pa-sand">
        <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold-aa mb-2.5">
          {t('trust.directHeadline', 'Why book direct')}
        </p>
        <div className="flex flex-col gap-2">
          {([
            // Two of these only hold on homes we price and operate ourselves.
            // On partner inventory we resell a supplier's rate and the supplier
            // adds cleaning and a deposit we do not control, so "the price is
            // the price" and a price-match promise are both undefendable — a
            // guest already arrived at the concierge holding a screenshot of
            // the first one against a quote EUR 1,194 higher.
            ...(tripwixUid
              ? []
              : [
                  { icon: ShieldCheck, label: t('trust.bestRateTeeth', 'Best rate online — find these dates cheaper on Airbnb or Booking.com and we match the price') },
                  { icon: Clock, label: t('trust.noServiceFees', 'No service fees — OTAs add 12–18% at checkout; here the price is the price') },
                ]),
            { icon: Headphones, label: t('trust.conciergeWhatsapp', 'WhatsApp concierge before, during and after your stay') },
          ] as const).map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <item.icon size={14} className="text-pa-gold-aa shrink-0 mt-0.5" />
              <span className="caption text-pa-dark leading-snug font-body font-light" >{item.label}</span>
            </div>
          ))}
        </div>
        {!tripwixUid && <Link href="/best-rate-guarantee" className="inline-flex items-center mt-1 caption text-pa-gold-aa underline underline-offset-2 hover:text-pa-dark">
          {t('trust.guaranteeTerms', 'How the guarantee works')}
        </Link>}
      </div>

      {/* Quem recebe é a Portugal Active, em todas as casas (próprias ou de
          parceiros): sem nome de pessoa nem "equipa local em X". O Ricardo,
          29 out 2026: "Portugal Active é Portugal Active". */}
      <p className="mt-4 pt-4 border-t border-pa-sand body-sm text-pa-dark leading-tight">
        {t('host.hostedBy', 'Hosted by Portugal Active')} ·{' '}
        <Link href="/about" className="caption text-pa-gold-aa hover:underline">
          {t('host.meetUs', 'Meet us')}
        </Link>
      </p>
    </>
  );

  return (
    <>
      {propertyGraph && <StructuredData id={`property-${property.slug}`} data={propertyGraph} />}
      <div className="min-h-screen bg-pa-cream">
        <Header />

        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="container pt-20 pb-1 lg:pb-0">
          <ol className="flex items-center gap-0.5 caption text-pa-stone font-light" >
            <li><Link href="/" className="inline-flex items-center min-h-[44px] lg:min-h-8 px-1.5 hover:text-pa-dark transition-colors">{t('propertyDetail.breadcrumbHome', 'Home')}</Link></li>
            <li className="text-pa-sand">/</li>
            <li><Link href="/homes" className="inline-flex items-center min-h-[44px] lg:min-h-8 px-1.5 hover:text-pa-dark transition-colors">{t('propertyDetail.breadcrumbHomes', 'Homes')}</Link></li>
            {destObj && (
              <>
                <li className="text-pa-sand">/</li>
                <li><Link href={`/destinations/${destObj.slug}`} className="inline-flex items-center min-h-[44px] lg:min-h-8 px-1.5 hover:text-pa-dark transition-colors">{destObj.name}</Link></li>
              </>
            )}
            <li className="text-pa-sand">/</li>
            <li className="text-pa-earth truncate max-w-[220px] inline-flex items-center min-h-[44px] lg:min-h-8 px-1.5">{displayName}</li>
          </ol>
        </nav>

        {/* Hero gallery — mobile carousel + desktop grid */}
        {/* Mobile: swipeable carousel */}
        <div
          className="lg:hidden group relative w-full overflow-hidden bg-pa-warm aspect-[4/3] cursor-pointer select-none"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={handleGalleryTouchStart}
          onTouchMove={handleGalleryTouchMove}
          onTouchEnd={handleGalleryTouchEnd}
          onTouchCancel={handleGalleryTouchCancel}
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
            {/* `loading="lazy"` never fires for a slide clipped by the
                overflow:hidden strip, so every photo only started downloading
                AFTER it slid into view — a beige box per swipe on mobile data.
                Keep the next photo (two once the guest is swiping) eager, at
                low priority so it never competes with the hero LCP. */}
            {(images.length ? images : ['']).map((img: string, idx: number) => (
              <div key={idx} className="relative shrink-0 h-full bg-pa-sand img-fallback" style={{ width: `${100 / totalImages}%` }}>
                {img ? (
                  <img src={img} srcSet={guestySrcSet(sourceImages[idx], idx === 0 ? HERO_WIDTHS : [640, 828, 1080, 1440])} sizes={idx === 0 ? HERO_SIZES : '100vw'} alt={t('seoMeta.photoAlt', { name: displayName, kind: kindInPlace, n: idx + 1 })} className="absolute inset-0 w-full h-full object-cover" width={1200} height={900} loading={Math.abs(idx - currentImage) <= (currentImage === 0 ? 1 : 2) ? 'eager' : 'lazy'} decoding="async" {...(idx === 0 ? { fetchPriority: 'high' as const } : Math.abs(idx - currentImage) <= 2 ? { fetchPriority: 'low' as const } : {})} draggable={false} onError={e => { (e.currentTarget.parentElement as HTMLElement)?.setAttribute('data-broken', 'true'); e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-pa-stone body-sm">{t('propertyDetail.noImage')}</div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
            <span className="text-white/80 caption bg-black/30 backdrop-blur-sm px-2.5 py-1 rounded-sm pointer-events-auto font-body" >
              {currentImage + 1} / {totalImages}
            </span>
            <button
              onClick={e => { e.stopPropagation(); setLightboxImage(currentImage); setLightboxOpen(true); }}
              className="pa-action pointer-events-auto rounded-full bg-white/90 backdrop-blur-sm text-pa-dark px-5 py-2.5 min-h-[44px] hover:bg-white transition-colors eyebrow font-medium tracking-[0.12em] uppercase"
            >
              {t('propertyDetail.viewAll')}
            </button>
          </div>
        </div>

        {/* Title row — compact. The name, the tagline and, on the right, the
            rating and the tier. The region eyebrow (the breadcrumb has it) and
            the stat pills moved down to the facts strip under the photos: on
            a 900 px screen the first photo used to start 503 px down, under
            five rows of text (auditoria 29 out 2026). */}
        <div className="container pt-5 lg:pt-1 pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
            <div className="min-w-0">
              <h1 className="font-display headline-md lg:text-[2.375rem] font-light leading-[1.1] text-pa-dark">
                {displayName}
              </h1>
              {property.tagline && (
                <p className="body-sm text-pa-earth italic mt-2 max-w-2xl leading-relaxed font-body font-light" >{property.tagline}</p>
              )}
            </div>
            {(hasRating || property.tier === 'signature') && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0 lg:pb-1">
                {hasRating && (
                  <a href="#property-reviews" className="inline-flex items-center gap-1.5 min-h-11 lg:min-h-0 body-sm text-pa-dark font-normal underline underline-offset-4 decoration-pa-sand hover:decoration-pa-dark transition-colors">
                    <Star size={14} className="text-pa-gold-aa fill-current" aria-hidden="true" />
                    {property.averageRating}/5 · {property.reviewCount} {t('reviews.plural')}
                  </a>
                )}
                {property.tier === 'signature' && (
                  <span className="inline-flex items-center eyebrow font-medium tracking-[0.04em] uppercase text-pa-dark bg-pa-warm px-2.5 py-1 rounded-full">
                    {t('filters.signature', 'Signature')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop: the photos first, full width — the sector's pattern
            (Airbnb, Le Collectionist): one large tile and four small ones,
            34vw tall (360–520 px). The facts and the booking card start right
            under it. The phone has its carousel above the title. */}
        <div className="hidden lg:block container">
          <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden h-[clamp(360px,34vw,520px)]">
            {/* Main large image — left half */}
            <div
              className="col-span-2 row-span-2 relative cursor-pointer group bg-pa-sand"
              onClick={() => { setLightboxImage(0); setLightboxOpen(true); }}
            >
              {images[0] && (
                <img src={images[0]} srcSet={guestySrcSet(sourceImages[0], HERO_WIDTHS)} sizes={HERO_SIZES} alt={t('seoMeta.photoAltHero', { name: displayName, kind: kindInPlace })} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" loading="eager" fetchPriority="high" draggable={false} />
              )}
            </div>
            {/* 4 smaller images — right half */}
            {[1, 2, 3, 4].map(idx => (
              <div
                key={idx}
                className="relative cursor-pointer group bg-pa-sand"
                onClick={() => { if (images[idx]) { setLightboxImage(idx); setLightboxOpen(true); } }}
              >
                {images[idx] ? (
                  <img src={images[idx]} srcSet={guestySrcSet(sourceImages[idx], [400, 640, 828])} sizes="(min-width: 1024px) 23vw, 0px" alt={t('seoMeta.photoAlt', { name: displayName, kind: kindInPlace, n: idx + 1 })} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" loading="lazy" decoding="async" draggable={false} />
                ) : (
                  <div className="absolute inset-0 bg-pa-warm" />
                )}
                {/* "Show all N photos" button on last image */}
                {idx === 4 && totalImages > 5 && (
                  <button
                    onClick={e => { e.stopPropagation(); setLightboxImage(0); setLightboxOpen(true); }}
                    className="pa-action absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-pa-dark px-4 py-2 eyebrow font-medium tracking-[0.08em] uppercase rounded-full hover:bg-white transition-colors z-10"
                  >
                    {t('propertyDetail.showAllPhotos', { count: totalImages })}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Two-column layout: main content (left 2/3) + sticky booking (right 1/3) */}
        <div className={bookableOnline ? "container pt-5 lg:pt-6 pb-8 lg:pb-16" : "container pt-5 lg:pt-6 pb-24 lg:pb-16"}>
          <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-12">
            {/* Main content — left 2/3 */}
            <div className="order-1 lg:order-1 lg:col-span-2 space-y-10 lg:space-y-12">
              {/* Facts strip — where it is, who it sleeps, then the six key
                  features with their icons and the section links. */}
              <div>
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-pa-gold shrink-0" aria-hidden="true" />
                  <span className="body-md text-pa-dark font-normal">{property.locality}, Portugal</span>
                </div>
                <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 body-sm text-pa-earth">
                  {facts.map((fact, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {i > 0 && <span className="text-pa-sand" aria-hidden="true">·</span>}
                      {fact}
                    </li>
                  ))}
                </ul>
                {keyAmenities.length > 0 && (
                  <ul className="mt-5 pt-5 border-t border-pa-sand grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                    {keyAmenities.slice(0, 6).map((a) => (
                      <li key={a.key} className="flex items-center gap-2.5 body-sm text-pa-dark min-w-0">
                        <a.icon size={18} strokeWidth={1.5} className="text-pa-gold shrink-0" aria-hidden="true" />
                        <span className="truncate">{a.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <nav aria-label={t('pdpUx.navigation')} className="mt-5 pt-5 border-t border-pa-sand flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap">
                  {sectionLinks.map(([id, label]) => (
                    <a key={id} href={`#${id}`} className="pa-action shrink-0 inline-flex items-center min-h-11 lg:min-h-9 rounded-full border border-pa-sand px-4 body-sm text-pa-earth hover:border-pa-gold hover:text-pa-dark whitespace-nowrap">{label}</a>
                  ))}
                </nav>
              </div>


              {/* Multi-unit Group: Units section (booking.com-style). When this
                  listing is the parent of a curated group, list every unit
                  (parent + children) with photo, specs, and live quote, each
                  linking to the unit's own PDP. Single-unit properties skip
                  this entirely. */}
              {propertyGroup && allPropsData && (
                <PropertyUnitsSection
                  group={propertyGroup}
                  allProperties={allPropsData as Property[]}
                  checkin={initialCheckin}
                  checkout={initialCheckout}
                  guests={initialGuests}
                />
              )}

              {/* 1. About this home — lead with the narrative. A luxury PDP
                  should open with the story, not a clinical bed inventory. */}
              <div id="property-about" style={{ scrollMarginTop: 112 }}>
                <DescriptionSection
                description={property.description}
                sections={(property as any).descriptionSections}
                propertyName={displayName}
                locality={property.locality}
                destName={destName}
                t={t}
              />
              </div>

              {/* 2. Bedrooms & sleeping — right after the story: the first
                  practical question is where everyone sleeps, so it comes
                  before the amenities. One card per bedroom with a pictogram
                  per bed (two single-bed glyphs read faster than "2 × Single
                  Bed") and the plural-aware line (beds.*); a snap-scrolling
                  row on a phone, a grid from 640 px. */}
              {property.rooms && property.rooms.length > 0 && (
                <section id="property-bedrooms" style={{ scrollMarginTop: '7rem' }}>
                  <h2 className="font-display headline-sm font-light text-pa-dark mb-1.5">{t('propertyDetail.bedroomsTitle', 'Bedrooms & Sleeping Arrangements')}</h2>
                  <p className="body-sm text-pa-earth mb-5">
                    {t('propertyDetail.sleepsSummary', { beds: property.bedrooms, guests: property.maxGuests, defaultValue: '{{beds}} bedrooms · sleeps {{guests}}' })}
                    {bedTotal > 0 && <> · {t('propertyDetail.bedTotal', { count: bedTotal })}</>}
                  </p>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-5 px-5 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
                    {property.rooms.map((room: any, roomIdx: number) => {
                      const beds: any[] = Array.isArray(room?.beds) ? room.beds : [];
                      return (
                        <div key={roomIdx} className="snap-start shrink-0 w-[68vw] max-w-[250px] sm:w-auto sm:max-w-none bg-white border border-pa-sand rounded-xl p-5">
                          <div className="flex flex-wrap items-center gap-1.5 text-pa-gold mb-4 min-h-[24px]" aria-hidden="true">
                            {beds.flatMap((bed: any, bedIdx: number) => {
                              const BedIcon = bedTypeOf(String(bed?.type || ''))?.icon ?? Bed;
                              return Array.from({ length: Math.min(Math.max(Number(bed?.quantity) || 1, 1), 4) }, (_, k) => (
                                <BedIcon key={`${bedIdx}-${k}`} size={22} strokeWidth={1.5} />
                              ));
                            })}
                          </div>
                          <h3 className="body-md text-pa-dark font-medium leading-tight">{localizeRoomName(room.name, t)}</h3>
                          <p className="body-sm text-pa-earth mt-1">
                            {beds.length > 0 ? beds.map((bed: any) => bedLine(bed, t)).join(', ') : t('bedConfig.notAvailable')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 3. Amenities — the key features with their icons (translated:
                  amenityHighlight.*), two columns, and the full raw list by
                  category behind "Show all N amenities" (a dialog). The old
                  page listed everything inline in three columns — 795 px of
                  "Grab-rails", "Wide doorway", "Water Parks" — a tag cloud. */}
              <section id="property-amenities" style={{ scrollMarginTop: '7rem' }}>
                <h2 className="font-display headline-sm font-light text-pa-dark mb-5">{t('propertyDetail.amenitiesTitle')}</h2>
                {keyAmenities.length > 0 ? (
                  <>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
                      {keyAmenities.map((a) => (
                        <li key={a.key} className="flex items-center gap-3 py-3 border-b border-pa-sand body-sm text-pa-dark">
                          <a.icon size={20} strokeWidth={1.5} className="text-pa-gold shrink-0" aria-hidden="true" />
                          <span>{a.label}</span>
                        </li>
                      ))}
                    </ul>
                    {amenityTotal > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmenitiesOpen(true)}
                        className="pa-action mt-6 inline-flex items-center justify-center rounded-lg border border-pa-dark px-6 min-h-11 body-sm font-medium text-pa-dark hover:bg-pa-dark hover:text-white transition-colors"
                      >
                        {t('propertyDetail.showAllAmenitiesCount', { count: amenityTotal })}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="body-md text-pa-stone">{t('propertyDetail.amenitiesContact')}</p>
                )}
              </section>

              {/* 6. Location map — approximate pin (3 decimals ≈ 100 m, z=12):
                  the exact address is only shared after booking. */}
              <section id="property-location" style={{ scrollMarginTop: '7rem' }}>
                <h2 className="font-display headline-sm font-light text-pa-dark mb-2">{t('propertyDetail.locationTitle', 'Location')}</h2>
                <p className="body-sm text-pa-stone mb-4">
                  <span className="font-medium text-pa-gold">{property.locality}</span>
                  {' · '}{t('location.approxNote', 'Approximate area — the exact address is shared after booking')}
                  {(property as any).licenseNumber && (
                    <> · {t('location.alLicense', 'AL registration {{number}}', { number: (property as any).licenseNumber })}</>
                  )}
                </p>
                <div className="rounded-xl overflow-hidden border border-pa-sand">
                  <LazyMapFrame
                    title={`${property.name} — ${property.locality}`}
                    src={
                      property.address?.lat && property.address?.lng
                        ? `https://maps.google.com/maps?q=${Number(property.address.lat).toFixed(3)},${Number(property.address.lng).toFixed(3)}&z=12&output=embed`
                        : `https://maps.google.com/maps?q=${encodeURIComponent(`${property.locality}, Portugal`)}&z=13&output=embed`
                    }
                  />
                </div>
              </section>

              {/* 10. Guest Reviews (from Guesty sync) */}
              <ReviewsSection
                propertyName={displayName}
                propertySlug={property.slug}
                reviews={(property as any).reviews}
                averageRating={(property as any).averageRating}
                reviewCount={(property as any).reviewCount}
              />

              {/* Good to know — the practical questions a guest actually asks
                  before paying four figures, answered from the home's own data.
                  Mirrors into FAQPage JSON-LD (see propertyGraph) so the same
                  answers are citable by Google and AI answer engines. Last of
                  the home's own sections: the fine print after the proof. */}
              <section id="property-good-to-know" style={{ scrollMarginTop: 112 }} className="py-6 lg:py-8 border-t border-pa-sand">
                <h2 className="font-display headline-sm font-light text-pa-dark mb-4">
                  {t('pdpFaq.title', 'Good to know')}
                </h2>
                <div className="flex flex-col divide-y divide-pa-sand border-y border-pa-sand">
                  {pdpFaq.map((f, i) => (
                    <details key={i} className="group py-3">
                      <summary className="flex items-center justify-between cursor-pointer list-none body-sm text-pa-dark font-medium min-h-[32px]">
                        {f.q}
                        <ChevronDown className="w-4 h-4 text-pa-stone transition-transform group-open:rotate-180 shrink-0 ml-3" />
                      </summary>
                      <p className="body-sm text-pa-earth leading-relaxed pt-2 pr-8 font-light" >{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>


              {/* In-house promise — establishes the hotel-chain model: every
                  service and experience below is delivered by Portugal Active's
                  own team, not a third-party marketplace. Framed as a quiet
                  centred editorial statement (a fine gold rule its only accent)
                  rather than a heavy filled banner — the brand "moment" between
                  the practical info above and the services below.

                  One team, one standard — on every home. */}
              <section className="py-6 lg:py-10 text-center">
                <span className="mx-auto block h-px w-10 bg-[#C9A876]/70 mb-7" />
                <p className="eyebrow font-semibold tracking-[0.2em] uppercase text-pa-gold mb-4">{t('propertyDetail.inHouseOverline', 'One team, one standard')}</p>
                <h2 className="font-display headline-md font-light leading-[1.3] text-pa-dark mb-5 max-w-[34rem] mx-auto">{t('conversion.helpTitle')}</h2>
                <p className="body-sm text-pa-earth leading-relaxed max-w-[40rem] mx-auto font-light" >{t('conversion.helpBody')}</p>
              </section>

              {/* 4. Services — in-house, delivered by our own team. Image-first
                  cards; whole card opens the request modal. */}
              <section>
                <h2 className="font-display headline-sm font-light text-pa-dark mb-2">{t('propertyDetail.servicesTitle')}</h2>
                {/* Homes booked on request say how fast the team confirms —
                    hotel tone, one promise (2 hours) site-wide. */}
                <p className="body-md text-pa-stone mb-6">
                  {t('conversion.extrasNote')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {(showAllServices ? services : services.slice(0, 3)).map(service => (
                    <button
                      key={service.slug}
                      type="button"
                      onClick={() => setModalProduct(service)}
                      className="group block text-left bg-white border border-pa-sand rounded-xl overflow-hidden hover:border-pa-gold/50 hover:shadow-[0_8px_24px_-12px_rgba(26,26,24,0.18)] transition-all duration-300"
                    >
                      <div className="relative aspect-[4/3] bg-pa-warm overflow-hidden">
                        {service.image ? (
                          <img
                            src={service.image}
                            alt={service.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                          />
                        ) : null}
                      </div>
                      <div className="p-5">
                        <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold mb-2">{t('propertyDetail.serviceOverline', 'Concierge service')}</p>
                        <h3 className="font-display body-lg text-pa-dark mb-1.5 group-hover:text-pa-gold transition-colors">{service.name}</h3>
                        <p className="body-sm text-pa-earth leading-relaxed mb-4 line-clamp-2 font-light" >{service.tagline}</p>
                        <div className="flex items-baseline justify-between pt-3 border-t border-pa-sand">
                          <p className="body-sm font-medium text-pa-dark">
                            {service.priceFrom ? t('propertyDetail.fromPrice', { price: Math.round(service.priceFrom).toLocaleString(intlLocale(i18n.language)) }) : t('property.priceOnRequest')}
                            <span className="caption text-pa-stone font-normal ml-1">{service.priceSuffix}</span>
                          </p>
                          <span className="inline-flex items-center gap-1.5 eyebrow font-medium tracking-[0.06em] uppercase text-pa-gold group-hover:text-pa-dark transition-colors">
                            {t('propertyDetail.requestService', 'Request')} <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {services.length > 3 && <button type="button" onClick={() => setShowAllServices(v => !v)} aria-expanded={showAllServices} className="min-h-11 mt-4 body-sm underline underline-offset-4 text-pa-dark">
                  {showAllServices ? t('reviews.showFewer') : t('bookingWidget.showAllServices')} ({services.length})
                </button>}
              </section>

              {/* 5. Experiences — in-house curated, image-first. Capped to 6 on
                  the PDP so the section stays focused; the rest live behind the
                  "View all experiences" link. */}
              {adventures.length > 0 && (
                <section>
                  <h2 className="font-display headline-sm font-light text-pa-dark mb-2">{t('propertyDetail.adventuresTitle')}</h2>
                  <p className="body-md text-pa-stone mb-6">{t('propertyDetail.adventuresSubtitle', { destination: destName, ...destVars })}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {adventures.slice(0, 6).map(adventure => {
                      const meta: string[] = [];
                      if ((adventure as any).duration) meta.push(localizeDuration(String((adventure as any).duration), t));
                      if ((adventure as any).difficulty) meta.push(String((adventure as any).difficulty));
                      return (
                        <Link
                          key={adventure.slug}
                          href={`/experiences/${adventure.slug}`}
                          className="group block bg-white border border-pa-sand rounded-xl overflow-hidden hover:border-pa-gold/50 hover:shadow-[0_8px_24px_-12px_rgba(26,26,24,0.18)] transition-all duration-300"
                        >
                          <div className="relative aspect-[4/3] bg-pa-warm overflow-hidden">
                            {adventure.image ? (
                              <img
                                src={adventure.image}
                                alt={adventure.name}
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                              />
                            ) : null}
                            {meta.length > 0 && (
                              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                                {meta.slice(0, 2).map((m, i) => (
                                  <span key={i} className="eyebrow tracking-[0.06em] uppercase font-medium px-2 py-1 bg-black/60 text-white backdrop-blur-sm rounded-full">
                                    {m}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="p-5">
                            <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold mb-2">{t('propertyDetail.adventureOverline', 'Curated experience')}</p>
                            <h3 className="font-display body-lg text-pa-dark mb-1.5 group-hover:text-pa-gold transition-colors">{adventure.name}</h3>
                            <p className="body-sm text-pa-earth leading-relaxed mb-4 line-clamp-2 font-light" >{adventure.tagline}</p>
                            <div className="flex items-baseline justify-between pt-3 border-t border-pa-sand">
                              <p className="body-sm font-medium text-pa-dark">
                                {adventure.priceFrom ? t('propertyDetail.fromPrice', { price: Math.round(adventure.priceFrom).toLocaleString(intlLocale(i18n.language)) }) : t('propertyDetail.custom')}
                                <span className="caption text-pa-stone font-normal ml-1">{adventure.priceSuffix}</span>
                              </p>
                              <span className="inline-flex items-center gap-1.5 eyebrow font-medium tracking-[0.06em] uppercase text-pa-gold group-hover:text-pa-dark transition-colors">
                                {t('propertyDetail.viewDetails', 'View')} <ArrowRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <Link
                    href="/experiences"
                    className="inline-flex items-center gap-2 mt-6 body-sm font-medium text-pa-gold hover:text-pa-dark transition-colors"
                  >
                    {t('propertyDetail.viewAllExperiences', 'View all experiences')} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </section>
              )}


            </div>

            {/* Booking — desktop only: a sticky sidebar on the right. On mobile
                the inline card is gone entirely; booking happens in a bottom
                sheet opened from the fixed bar (see below), so the page leads
                with the home's story, uninterrupted. */}
            <aside id="property-booking" className="hidden lg:block lg:order-2 lg:col-span-1 lg:pt-0">
              {/* Duas partes (index.css): a de cima rola por dentro; o RESERVE
                  do widget (ReserveCtaSlot) fica preso ao fundo do cartão,
                  nunca rola e nada passa por baixo dele. No HTML continua logo
                  a seguir às tarifas, a ordem do Tab e do leitor de ecrã. */}
              <div ref={setBookingCardEl} className="property-sticky-card lg:sticky lg:top-[100px]">
                <div ref={setBookingScroller} className="pa-booking-scroll">
                  <BookingCardSlotContext.Provider value={bookingCardSlot}>
                    {desktopBooking && bookingPanel}
                  </BookingCardSlotContext.Provider>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Mobile: sticky booking bar at bottom. Sits on the cookie banner while
            it is open (rising with it, same curve as its slide-in) and tells the
            footer its height, so the legal links scroll clear of it
            (lib/fixedBottom.ts). */}
        <div
          ref={publishBottomBarHeight}
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-pa-sand px-4 pt-3 z-40 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', transform: RISE_ABOVE_COOKIE_BANNER }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="body-sm text-pa-dark font-medium">
                {bookingSelection?.total ? formatQuotedEur(bookingSelection.total, i18n.language) : (bookingSelection?.checkIn || initialCheckin) && (bookingSelection?.checkOut || initialCheckout) ? t('conversion.datesSelected') : barFromPrice ?? barNoPrice}
              </p>
              <p className="caption text-pa-stone flex items-center gap-1 mt-0.5">
                {bookingSelection?.total ? (bookingSelection.isPartial ? t('partnerBooking.totalSoFar') : t('conversion.stayTotal')) : (bookingSelection?.checkIn || initialCheckin) ? formatBookingDate(bookingSelection?.checkIn || initialCheckin, i18n.language) : barFromPrice ? t('property.selectDatesForPrice') : t('property.conciergeShort')}
              </p>
            </div>
            {/* Partner homes open the same drawer: the request form lives on
                the property now, and sending the guest to the generic contact
                page threw away the dates they had just picked. */}
            {bookableOnline || tripwixUid ? (
              <button
                type="button"
                onClick={() => setBookingOpen(true)}
                className="btn-primary shrink-0"
              >
                {bookingSelection?.total ? t('conversion.viewBooking') : t('property.checkAvailability')}
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

        {/* Mobile: booking bottom-sheet — opened from the fixed bar. Keeps the
            full availability flow (calendar, guests, live quote) one tap away
            without an inline form blocking the content. Mobile only. */}
        {(bookableOnline || tripwixUid) && (
          <Drawer open={bookingOpen} onOpenChange={setBookingOpen}>
            <DrawerContent className="lg:hidden bg-white max-h-[92vh]">
              <DrawerHeader className="flex-row items-center justify-between gap-3 border-b border-pa-sand px-5 py-4 text-left">
                <DrawerTitle className="font-display body-lg font-light text-pa-dark truncate">
                  {displayName}
                </DrawerTitle>
                <DrawerClose aria-label={t('filters.close')} className="min-h-11 min-w-11 flex items-center justify-center shrink-0 text-pa-stone hover:text-pa-dark transition-colors">
                  <X size={20} />
                </DrawerClose>
              </DrawerHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
                {!desktopBooking && bookingPanel}
              </div>
            </DrawerContent>
          </Drawer>
        )}

        {/* Related properties from same region. The sentinel asks for the
            catalogue when this point comes near the screen (catalogWanted). */}
        <div ref={relatedSentinelRef} aria-hidden="true" />
        {relatedProperties.length > 0 && (
          <section className="section-padding bg-white border-t border-pa-sand">
            <div className="container">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="eyebrow font-medium tracking-[0.08em] text-pa-gold mb-2 uppercase">{t('propertyDetail.moreIn', { destination: destName, ...destVars, defaultValue: `More ${destVars.inPlace}` })}</p>
                  <h2 className="headline-lg text-pa-dark">{t('propertyDetail.relatedHomes', 'Related homes')}</h2>
                </div>
                {destObj && (
                  <Link href={`/destinations/${destObj.slug}`} className="hidden md:flex items-center gap-2 body-sm font-medium text-pa-gold hover:text-pa-dark transition-colors">
                    {t('propertyDetail.allDestHomes', { destination: destName, ...destVars, defaultValue: `All ${destName} homes` })} <ArrowRight className="w-4 h-4" />
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

        {/* No spacer here for the mobile bar: the footer keeps the bar's height
            free under its last row (FOOTER_BOTTOM_INSET). */}
        <Footer />
      </div>

      {/* Every amenity, by category — the raw Guesty list with a pictogram
          each; the page itself shows only the key ones. */}
      <Dialog open={amenitiesOpen} onOpenChange={setAmenitiesOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-[calc(100%-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0 rounded-xl border-pa-sand bg-pa-cream">
          <DialogHeader className="sticky top-0 z-10 bg-pa-cream/95 backdrop-blur-sm px-6 pt-6 pb-4 border-b border-pa-sand text-left">
            <DialogTitle className="font-display headline-sm font-light text-pa-dark">{t('propertyDetail.amenitiesTitle')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-7">
            {amenityGroups.map((group) => (
              <div key={group.category}>
                <h3 className="eyebrow font-semibold tracking-[0.14em] uppercase text-pa-stone mb-1">{t(group.label)}</h3>
                <ul className="divide-y divide-pa-sand">
                  {group.items.map((item) => {
                    const Icon = amenityIcon(item);
                    return (
                      <li key={item} className="flex items-center gap-3 py-2.5 body-sm text-pa-dark">
                        <Icon size={18} strokeWidth={1.5} className="text-pa-gold shrink-0" aria-hidden="true" />
                        {item}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen lightbox */}
      {lightboxOpen && (
        <Lightbox
          images={lightboxImages}
          rawImages={sourceImages}
          initialIndex={lightboxImage}
          propertyName={displayName}
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
