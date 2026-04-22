/* ==========================================================================
   EXPERIENCE DETAIL — V2 Redesign (Sprint 1 Enriched)
   GYG/Viator-inspired PDP with luxury brand overrides.
   Replaces ServiceDetail.tsx for /experiences/:slug route.
   Real content from TripAdvisor, Viator, GetYourGuide.
   ========================================================================== */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute, Link } from 'wouter';
import {
  Check,
  X,
  ArrowLeft,
  MapPin,
  MessageCircle,
  Share2,
  Heart,
  Award,
  TrendingUp,
  Shield,
  Play,
} from 'lucide-react';

import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

import ExperienceGallery from '@/components/experience/ExperienceGallery';
import ExperienceQuickFacts from '@/components/experience/ExperienceQuickFacts';
import ExperienceBookingCard from '@/components/experience/ExperienceBookingCard';
import ExperienceItinerary from '@/components/experience/ExperienceItinerary';
import ExperienceReviews from '@/components/experience/ExperienceReviews';
import ExperienceStickyNav from '@/components/experience/ExperienceStickyNav';
import ExperienceMobileBookingBar from '@/components/experience/ExperienceMobileBookingBar';
import ExperienceWhyBookDirect from '@/components/experience/ExperienceWhyBookDirect';
import ExperienceGuideProfile from '@/components/experience/ExperienceGuideProfile';
import ExperienceRelatedExperiences from '@/components/experience/ExperienceRelatedExperiences';

import experienceDetailsData from '@/data/experienceDetails.json';
import servicesData from '@/data/services.json';
import productsData from '@/data/products.json';
import destinationsData from '@/data/destinations.json';
import type { Destination } from '@/lib/types';
import { pushEcommerce } from '@/lib/datalayer';

/* ── Types ── */

interface RawExperience {
  slug: string;
  name: string;
  category?: string;
  experienceCategory?: string;
  tagline?: string;
  badges?: string[];
  destinations?: string[];
  locality?: string;
  price?: string;
  priceFrom?: number;
  priceOta?: number;
  duration?: string;
  difficultyLevel?: string;
  availability?: string;
  image: string;
  gallery?: string[];
  videoUrl?: string;
  description?: string;
  aboutParagraphs?: string[];
  highlights?: string[];
  included?: string[];
  notIncluded?: string[];
  notSuitableFor?: string[];
  whatToBring?: string[];
  notAllowed?: string[];
  itinerary?: Array<{
    stepNumber: number;
    time?: string;
    title: string;
    description: string;
    icon?: 'pickup' | 'hike' | 'swim' | 'dine' | 'ride' | 'rappel' | 'sail' | 'cycle' | 'photo' | 'brief';
  }>;
  meetingPoint?: {
    address: string;
    lat?: number;
    lng?: number;
    instructions: string;
    googleMapsUrl: string;
    pickupAvailable?: boolean;
    pickupNote?: string;
  };
  cancellationPolicy?: string;
  languages?: string[];
  groupSizeRange?: { min: number; max: number };
  freeCancellationHours?: number;
  reserveNowPayLater?: boolean;
  mobileTicket?: boolean;
  pickupIncluded?: boolean;
  bookingsLastMonth?: number;
  averageBookingLeadDays?: number;
  recommendedPercent?: number;
  guideName?: string;
  guideRole?: string;
  guideDescription?: string;
  guideLanguages?: string[];
  guidePhoto?: string;
  faq?: Array<{ q: string; a: string }>;
  reviewsList?: Array<{
    author: string;
    countryCode?: string;
    rating: number;
    date: string;
    title?: string;
    text: string;
    source: 'tripadvisor' | 'viator' | 'gyg' | 'direct';
    verified: boolean;
    hostResponse?: string;
  }>;
  aggregateRating?: {
    value: number;
    count: number;
    source: string;
    rank?: string;
    bestRating?: number;
    ratingBreakdown?: Record<string, number>;
    categoryRatings?: Record<string, number>;
    recommendedPercent?: number;
  };
  relatedSlugs?: string[];
  whatsappMessage?: string;
}

/* ── Constants ── */

const destinations = destinationsData as unknown as Destination[];

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'included', label: 'Included' },
  { id: 'guide', label: 'Your guide' },
  { id: 'meeting', label: 'Meeting point' },
  { id: 'faq', label: 'FAQ' },
  { id: 'reviews', label: 'Reviews' },
];

const WHATSAPP_NUMBER = '351927161771';

/* ── Data lookup ── */

function findExperience(slug: string): RawExperience | null {
  const rich = (experienceDetailsData.experiences as RawExperience[]).find(e => e.slug === slug);
  if (rich) {
    // Merge videoUrl from products.json if not set in experienceDetails
    if (!rich.videoUrl) {
      const prod = (productsData as any[]).find((p: any) => p.slug === slug);
      if (prod?.videoUrl) rich.videoUrl = prod.videoUrl;
    }
    return rich;
  }
  const legacy = servicesData.activities.find(a => a.slug === slug);
  if (!legacy) return null;
  const prod = (productsData as any[]).find((p: any) => p.slug === slug);
  return {
    slug: legacy.slug,
    name: legacy.name,
    category: legacy.category,
    tagline: legacy.tagline,
    description: legacy.description,
    image: legacy.image,
    gallery: [legacy.image],
    videoUrl: prod?.videoUrl || undefined,
    price: legacy.price,
    priceFrom: parseFloat(legacy.price.match(/\d+/)?.[0] || '0'),
    duration: legacy.duration,
    availability: legacy.availability,
    highlights: legacy.details,
    reviewsList: (legacy.reviews || []).map(r => ({
      author: r.name,
      rating: r.rating,
      date: '2023-01-01',
      text: r.text,
      source: 'direct' as const,
      verified: true,
    })),
  };
}

/* ── Component ── */

export default function ExperienceDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute('/experiences/:slug');
  const [, actParams] = useRoute('/activities/:slug');
  const slug = params?.slug || actParams?.slug || '';

  const exp = useMemo(() => (slug ? findExperience(slug) : null), [slug]);

  usePageMeta({
    title: exp
      ? `${exp.name} | Luxury Experience in Portugal`
      : 'Experience Not Found',
    description: exp
      ? `${exp.tagline || exp.name}. Book this experience with Portugal Active.`.slice(0, 155)
      : undefined,
    image: exp?.image,
    url: exp ? `/experiences/${exp.slug}` : undefined,
    type: 'article',
  });

  /* ── JSON-LD structured data ── */
  useEffect(() => {
    if (!exp) return;
    const scriptId = 'experience-jsonld';
    const existing = document.getElementById(scriptId);
    if (existing) existing.remove();

    const jsonld: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': ['Product', 'TouristTrip'],
      productID: `EXP-${exp.slug}`,
      name: exp.name,
      description: exp.tagline || exp.description,
      image: exp.gallery && exp.gallery.length ? exp.gallery : [exp.image],
      url: `https://www.portugalactive.com/experiences/${exp.slug}`,
      brand: { '@type': 'Brand', name: 'Portugal Active' },
      provider: {
        '@type': 'Organization',
        name: 'Portugal Active',
        url: 'https://www.portugalactive.com',
      },
      offers: {
        '@type': 'Offer',
        price: exp.priceFrom || 0,
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: `https://www.portugalactive.com/experiences/${exp.slug}`,
        validFrom: new Date().toISOString().split('T')[0],
      },
      ...(exp.duration && { duration: exp.duration }),
      ...(exp.category && { touristType: exp.category }),
      ...(exp.meetingPoint && {
        contentLocation: {
          '@type': 'Place',
          name: exp.meetingPoint.description || exp.meetingPoint.address,
          ...(exp.meetingPoint.lat && {
            geo: { '@type': 'GeoCoordinates', latitude: exp.meetingPoint.lat, longitude: exp.meetingPoint.lng },
          }),
        },
      }),
    };

    if (exp.aggregateRating) {
      jsonld.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: exp.aggregateRating.value,
        bestRating: exp.aggregateRating.bestRating || 5,
        reviewCount: exp.aggregateRating.count,
      };
    }

    if (exp.reviewsList && exp.reviewsList.length > 0) {
      jsonld.review = exp.reviewsList.slice(0, 10).map(r => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.author },
        datePublished: r.date,
        reviewBody: r.text,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: r.rating,
          bestRating: 5,
        },
      }));
    }

    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.portugalactive.com/' },
        { '@type': 'ListItem', position: 2, name: 'Experiences', item: 'https://www.portugalactive.com/experiences' },
        {
          '@type': 'ListItem',
          position: 3,
          name: exp.name,
          item: `https://www.portugalactive.com/experiences/${exp.slug}`,
        },
      ],
    };

    const script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.text = JSON.stringify([jsonld, breadcrumbs]);
    document.head.appendChild(script);

    return () => {
      const s = document.getElementById(scriptId);
      if (s) s.remove();
    };
  }, [exp?.slug]);

  // GA4: view_item — fires once per experience slug
  useEffect(() => {
    if (!exp) return;
    pushEcommerce({
      event: 'view_item',
      ecommerce: {
        currency: 'EUR',
        value: exp.priceOta || 0,
        items: [{
          item_id: `EXP-${exp.slug}`,
          item_name: exp.name,
          item_category: exp.experienceCategory || '',
          price: exp.priceOta || 0,
          quantity: 1,
        }],
      },
    });
  }, [exp?.slug]);

  /* ── 404 ── */
  if (!exp) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAF7]">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="headline-lg mb-4 text-[#1A1A18]">{t('experienceDetail.notFound')}</h1>
            <Link href="/experiences" className="btn-ghost">
              {t('experienceDetail.backToExperiences')}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ── Derived values ── */
  const destObj = destinations.find(d => exp.destinations?.includes(d.slug));
  const destName = destObj?.name || exp.locality || 'Portugal';
  const gallery = exp.gallery && exp.gallery.length > 0 ? exp.gallery : [exp.image];
  const paragraphs =
    exp.aboutParagraphs && exp.aboutParagraphs.length > 0
      ? exp.aboutParagraphs
      : (exp.description || '').split('\n\n').filter(Boolean);
  const priceFrom = exp.priceFrom || 0;

  const shareUrl = `https://www.portugalactive.com/experiences/${exp.slug}`;
  const shareText = `${exp.name} — Portugal Active`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, url: shareUrl });
      } catch {}
    } else {
      navigator.clipboard?.writeText(shareUrl);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* ── Breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="container pt-20 pb-3">
        <ol className="flex items-center gap-0.5 text-[12px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
          <li>
            <Link
              href="/"
              className="inline-flex items-center min-h-[44px] px-1.5 hover:text-[#1A1A18] transition-colors"
            >
              Home
            </Link>
          </li>
          <li className="text-[#E8E4DC]">/</li>
          <li>
            <Link
              href="/experiences"
              className="inline-flex items-center min-h-[44px] px-1.5 hover:text-[#1A1A18] transition-colors"
            >
              Experiences
            </Link>
          </li>
          {destObj && (
            <>
              <li className="text-[#E8E4DC]">/</li>
              <li>
                <Link
                  href={`/destinations/${destObj.slug}`}
                  className="inline-flex items-center min-h-[44px] px-1.5 hover:text-[#1A1A18] transition-colors"
                >
                  {destObj.name}
                </Link>
              </li>
            </>
          )}
          <li className="text-[#E8E4DC]">/</li>
          <li className="text-[#6B6860] truncate max-w-[260px] inline-flex items-center min-h-[44px] px-1.5">
            {exp.name}
          </li>
        </ol>
      </nav>

      {/* ── Gallery ── */}
      <ExperienceGallery images={gallery} alt={exp.name} />

      {/* ── Title + Social Proof + Actions ── */}
      <section className="container pt-8 lg:pt-10 pb-6">
        {/* Badges */}
        {exp.badges && exp.badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {exp.badges.map((badge, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] uppercase font-medium px-3 py-1.5 bg-[#F5F1EB] text-[#8B7355] border border-[#E8E4DC]"
              >
                {badge === 'Bestseller' && <TrendingUp className="w-3 h-3" />}
                {badge === 'Badge of Excellence' && <Award className="w-3 h-3" />}
                {badge === '100% recommended' && <Shield className="w-3 h-3" />}
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* Overline: destination + category */}
        <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">
          {destName}
          {exp.experienceCategory && <> · {exp.experienceCategory}</>}
        </p>

        {/* H1 */}
        <h1 className="headline-xl text-[#1A1A18] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          {exp.name}
        </h1>

        {/* Tagline */}
        {exp.tagline && (
          <p className="body-lg italic text-[#6B6860] max-w-3xl mb-5">{exp.tagline}</p>
        )}

        {/* Social proof row + actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {exp.aggregateRating && (
              <>
                <span className="italic text-[#1A1A18]" style={{ fontWeight: 300 }}>
                  <span className="font-display text-[20px] not-italic">
                    {exp.aggregateRating.value.toFixed(1)}
                  </span>{' '}
                  / 5
                </span>
                <span className="text-[#E8E4DC]">·</span>
                <span className="text-[#6B6860]" style={{ fontWeight: 300 }}>
                  {exp.aggregateRating.count} guest reviews
                </span>
                {exp.recommendedPercent && (
                  <>
                    <span className="text-[#E8E4DC]">·</span>
                    <span className="text-[#6B8E4E]" style={{ fontWeight: 300 }}>
                      Recommended by {exp.recommendedPercent}% of guests
                    </span>
                  </>
                )}
                {exp.aggregateRating.rank && (
                  <>
                    <span className="text-[#E8E4DC]">·</span>
                    <span className="text-[#8B7355]" style={{ fontWeight: 300 }}>
                      {exp.aggregateRating.rank}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Share + Save + Video buttons */}
          <div className="flex items-center gap-3">
            {exp.videoUrl && (
              <a
                href="#video"
                onClick={e => {
                  e.preventDefault();
                  document.getElementById('video')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase text-[#8B7355] hover:text-[#1A1A18] transition-colors font-medium"
              >
                <Play className="w-3.5 h-3.5" /> Watch video
              </a>
            )}
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase text-[#9E9A90] hover:text-[#1A1A18] transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button
              className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase text-[#9E9A90] hover:text-[#1A1A18] transition-colors"
            >
              <Heart className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>

        {/* Urgency / social proof signal */}
        {exp.bookingsLastMonth && exp.bookingsLastMonth > 3 && (
          <div className="mt-4 inline-flex items-center gap-2 text-[11px] text-[#8B7355] bg-[#F5F1EB] border border-[#E8E4DC] px-4 py-2">
            <TrendingUp className="w-3 h-3" />
            <span style={{ fontWeight: 300 }}>
              {exp.bookingsLastMonth}+ bookings last month
              {exp.averageBookingLeadDays && (
                <> · On average booked {exp.averageBookingLeadDays} days in advance</>
              )}
            </span>
          </div>
        )}
      </section>

      {/* ── Quick facts row ── */}
      <section className="container">
        <ExperienceQuickFacts
          duration={exp.duration}
          groupSize={exp.groupSizeRange}
          languages={exp.languages}
          freeCancellationHours={exp.freeCancellationHours}
          mobileTicket={exp.mobileTicket}
          pickupIncluded={exp.pickupIncluded}
        />
      </section>

      {/* ── Sticky section nav ── */}
      <ExperienceStickyNav sections={SECTIONS} />

      {/* ── Content + booking card ── */}
      <section className="container pb-12 lg:pb-20">
        <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-12 pt-10">
          {/* ───── LEFT COLUMN — main content ───── */}
          <div className="lg:col-span-2 space-y-12">
            {/* Overview */}
            <section id="overview">
              <h2 className="headline-md text-[#1A1A18] mb-5">{t('experienceDetail.aboutExperience')}</h2>
              <div className="body-lg space-y-4">
                {paragraphs.map((p, i) => (
                  <p key={i} className="text-[15px] text-[#1A1A18] leading-relaxed" style={{ fontWeight: 300 }}>
                    {p}
                  </p>
                ))}
              </div>

              {/* Difficulty level */}
              {exp.difficultyLevel && (
                <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-[#6B6860] bg-[#F5F1EB] px-4 py-2.5">
                  <span className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium">
                    Difficulty:
                  </span>
                  <span style={{ fontWeight: 300 }}>{exp.difficultyLevel}</span>
                </div>
              )}
            </section>

            {/* Video embed */}
            {exp.videoUrl && (
              <section id="video">
                <h2 className="headline-md text-[#1A1A18] mb-5">{t('experienceDetail.seeInAction')}</h2>
                <div
                  className="relative w-full overflow-hidden bg-[#1A1A18]"
                  style={{ aspectRatio: '16/9' }}
                >
                  <iframe
                    src={`https://player.vimeo.com/video/${exp.videoUrl.split('/').pop()}?title=0&byline=0&portrait=0&dnt=1`}
                    className="absolute inset-0 w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                    title={`${exp.name} — Portugal Active`}
                  />
                </div>
              </section>
            )}

            {/* Highlights */}
            {exp.highlights && exp.highlights.length > 0 && (
              <section id="highlights">
                <h2 className="headline-md text-[#1A1A18] mb-5">Highlights</h2>
                <ul className="space-y-3">
                  {exp.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-1 h-1 rounded-full bg-[#8B7355] mt-3 shrink-0" />
                      <span className="text-[15px] text-[#1A1A18] leading-relaxed" style={{ fontWeight: 300 }}>
                        {h}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Itinerary */}
            {exp.itinerary && exp.itinerary.length > 0 && (
              <section id="itinerary">
                <h2 className="headline-md text-[#1A1A18] mb-6">What to expect</h2>
                <ExperienceItinerary steps={exp.itinerary} />
              </section>
            )}

            {/* Included / Not included */}
            {(exp.included || exp.notIncluded) && (
              <section id="included">
                <h2 className="headline-md text-[#1A1A18] mb-6">What's included</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {exp.included && exp.included.length > 0 && (
                    <div>
                      <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-4">
                        Included
                      </p>
                      <ul className="space-y-2.5">
                        {exp.included.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <Check className="w-4 h-4 text-[#6B8E4E] shrink-0 mt-0.5" />
                            <span className="text-[14px] text-[#1A1A18]" style={{ fontWeight: 300 }}>
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {exp.notIncluded && exp.notIncluded.length > 0 && (
                    <div>
                      <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-4">
                        Not included
                      </p>
                      <ul className="space-y-2.5">
                        {exp.notIncluded.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <X className="w-4 h-4 text-[#9E9A90] shrink-0 mt-0.5" />
                            <span className="text-[14px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {exp.notSuitableFor && exp.notSuitableFor.length > 0 && (
                  <div className="mt-8 p-5 bg-[#F5F1EB]">
                    <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-3">
                      Not suitable for
                    </p>
                    <ul className="space-y-1.5">
                      {exp.notSuitableFor.map((item, i) => (
                        <li
                          key={i}
                          className="text-[13px] text-[#6B6860]"
                          style={{ fontWeight: 300 }}
                        >
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Guide profile */}
            {exp.guideName && exp.guideDescription && (
              <section id="guide">
                <h2 className="headline-md text-[#1A1A18] mb-6">Your guide</h2>
                <ExperienceGuideProfile
                  guideName={exp.guideName}
                  guideRole={exp.guideRole || 'Local Guide'}
                  guideDescription={exp.guideDescription}
                  guideLanguages={exp.guideLanguages || exp.languages || []}
                  guidePhoto={exp.guidePhoto}
                />
              </section>
            )}

            {/* Meeting point */}
            {exp.meetingPoint && (
              <section id="meeting">
                <h2 className="headline-md text-[#1A1A18] mb-5">Meeting point</h2>
                <div className="flex items-start gap-3 mb-4">
                  <MapPin className="w-5 h-5 text-[#8B7355] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[15px] text-[#1A1A18]" style={{ fontWeight: 300 }}>
                      {exp.meetingPoint.address}
                    </p>
                    {exp.meetingPoint.instructions && (
                      <p className="text-[13px] text-[#6B6860] mt-1.5" style={{ fontWeight: 300 }}>
                        {exp.meetingPoint.instructions}
                      </p>
                    )}
                  </div>
                </div>
                <a
                  href={exp.meetingPoint.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[11px] tracking-[0.12em] uppercase text-[#1A1A18] border border-[#E8E4DC] px-5 py-3 hover:border-[#1A1A18] transition-colors"
                >
                  Open in Google Maps
                </a>
                {exp.meetingPoint.pickupAvailable && exp.meetingPoint.pickupNote && (
                  <div className="mt-5 pt-5 border-t border-[#E8E4DC]">
                    <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-1">
                      Complimentary pickup
                    </p>
                    <p className="text-[14px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                      {exp.meetingPoint.pickupNote}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* What to bring / not allowed */}
            {(exp.whatToBring || exp.notAllowed) && (
              <section>
                <h2 className="headline-md text-[#1A1A18] mb-6">{t('experienceDetail.importantInfo')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {exp.whatToBring && exp.whatToBring.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-4">
                        What to bring
                      </h3>
                      <ul className="space-y-2">
                        {exp.whatToBring.map((item, i) => (
                          <li
                            key={i}
                            className="text-[14px] text-[#1A1A18]"
                            style={{ fontWeight: 300 }}
                          >
                            · {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {exp.notAllowed && exp.notAllowed.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-4">
                        Not allowed
                      </h3>
                      <ul className="space-y-2">
                        {exp.notAllowed.map((item, i) => (
                          <li
                            key={i}
                            className="text-[14px] text-[#6B6860]"
                            style={{ fontWeight: 300 }}
                          >
                            · {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Cancellation policy */}
            {exp.cancellationPolicy && (
              <section className="border-y border-[#E8E4DC] py-6">
                <h3 className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">
                  Cancellation policy
                </h3>
                <p className="text-[14px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {exp.cancellationPolicy}
                </p>
              </section>
            )}

            {/* FAQ */}
            {exp.faq && exp.faq.length > 0 && (
              <section id="faq">
                <h2 className="headline-md text-[#1A1A18] mb-6">{t('experienceDetail.faq')}</h2>
                <div className="space-y-0">
                  {exp.faq.map((f, i) => (
                    <details
                      key={i}
                      className="group border-b border-[#E8E4DC] py-5 first:pt-0 last:border-b-0"
                    >
                      <summary className="flex items-start justify-between gap-4 cursor-pointer list-none">
                        <h3 className="text-[15px] font-medium text-[#1A1A18] group-open:text-[#8B7355] transition-colors">
                          {f.q}
                        </h3>
                        <span className="text-[#8B7355] text-[20px] leading-none mt-0.5 group-open:rotate-45 transition-transform shrink-0">
                          +
                        </span>
                      </summary>
                      <p
                        className="text-[14px] text-[#6B6860] leading-relaxed mt-3 pr-10"
                        style={{ fontWeight: 300 }}
                      >
                        {f.a}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ───── RIGHT COLUMN — sticky booking ───── */}
          <aside className="lg:col-span-1 hidden lg:block lg:order-last mb-10 lg:mb-0">
            <div className="lg:sticky lg:top-[160px]">
              <ExperienceBookingCard
                experienceName={exp.name}
                priceFrom={priceFrom}
                priceLabel={exp.price}
                duration={exp.duration}
                freeCancellationHours={exp.freeCancellationHours}
                reserveNowPayLater={exp.reserveNowPayLater}
                whatsappMessage={exp.whatsappMessage || ''}
                maxGroupSize={exp.groupSizeRange?.max}
                bokunActivityId={(exp as any).bokunActivityId}
                experienceSlug={exp.slug}
                experienceCategory={exp.experienceCategory}
                priceOta={exp.priceOta}
              />

              {/* Mini review snippet — social proof near CTA */}
              {exp.reviewsList && exp.reviewsList.length > 0 && (() => {
                const topReview = exp.reviewsList
                  .filter(r => r.rating >= 4 && r.text.length >= 40)
                  .sort((a, b) => b.rating - a.rating || b.text.length - a.text.length)[0];
                if (!topReview) return null;
                const snippet = topReview.text.length > 120
                  ? topReview.text.slice(0, 120).replace(/\s\S*$/, '') + '…'
                  : topReview.text;
                return (
                  <div className="mt-4 p-4 border border-[#E8E4DC] bg-white">
                    <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-2">
                      Recent guest review
                    </p>
                    <p className="text-[13px] text-[#1A1A18] italic leading-relaxed" style={{ fontWeight: 300 }}>
                      "{snippet}"
                    </p>
                    <p className="text-[11px] text-[#9E9A90] mt-2" style={{ fontWeight: 300 }}>
                      — {topReview.author}{topReview.rating && `, ${topReview.rating.toFixed(1)}/5`}
                    </p>
                  </div>
                );
              })()}

              {/* OTA price comparison */}
              {exp.priceOta && exp.priceOta > priceFrom && (
                <div className="mt-3 p-4 bg-[#F5F1EB] border border-[#E8E4DC] text-center">
                  <p className="text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                    Same experience on GetYourGuide:{' '}
                    <span className="line-through text-[#9E9A90]">€{exp.priceOta}</span>
                  </p>
                  <p className="text-[13px] text-[#8B7355] font-medium mt-1">
                    You save €{exp.priceOta - priceFrom} per person booking direct
                  </p>
                </div>
              )}

              <div className="mt-4 text-center">
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[12px] text-[#8B7355] hover:text-[#1A1A18] transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> +351 927 161 771
                </a>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Why book direct ── */}
      <ExperienceWhyBookDirect
        priceDirect={priceFrom}
        priceOta={exp.priceOta}
      />

      {/* ── Reviews ── */}
      {exp.reviewsList && exp.reviewsList.length > 0 && (
        <section id="reviews" className="section-padding bg-[#F5F1EB]">
          <div className="container">
            <h2 className="headline-lg text-[#1A1A18] mb-10">What guests say</h2>
            <ExperienceReviews reviews={exp.reviewsList} aggregate={exp.aggregateRating} />
          </div>
        </section>
      )}

      {/* ── Related experiences ── */}
      {exp.relatedSlugs && exp.relatedSlugs.length > 0 && (
        <section className="section-padding">
          <div className="container">
            <ExperienceRelatedExperiences
              currentSlug={exp.slug}
              relatedSlugs={exp.relatedSlugs}
            />
          </div>
        </section>
      )}

      {/* ── Back to experiences ── */}
      <section className="container py-6 border-t border-[#E8E4DC]">
        <div className="flex items-center justify-end">
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[#9E9A90] hover:text-[#1A1A18] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> All experiences
          </Link>
        </div>
      </section>

      <Footer />
      {/* WhatsApp float hidden on mobile — MobileBookingBar already has WhatsApp CTA */}
      <div className="hidden lg:block">
        <WhatsAppFloat />
      </div>

      {/* Mobile booking bar */}
      <ExperienceMobileBookingBar
        experienceName={exp.name}
        priceFrom={priceFrom}
        whatsappMessage={exp.whatsappMessage || ''}
        maxGroupSize={exp.groupSizeRange?.max}
        bokunActivityId={(exp as any).bokunActivityId}
        experienceSlug={exp.slug}
        experienceCategory={exp.experienceCategory}
        priceOta={exp.priceOta}
      />

    </div>
  );
}
