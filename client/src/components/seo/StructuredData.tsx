/* ==========================================================================
   StructuredData — reusable JSON-LD injector
   ========================================================================

   Wraps a <script type="application/ld+json"> element and appends it to
   document.head on mount. On unmount the element is removed, so SPA
   navigation never leaves stale schemas behind.

   Two call patterns:
     <StructuredData id="vacation-rental" data={buildVacationRentalSchema(p)} />
     <StructuredData id="home" data={[orgSchema, faqSchema]} />

   When `data` is an array, the output is a single <script> whose payload is
   a @graph containing the individual schemas. That is the Google-recommended
   way to bundle multiple schemas for the same page instead of emitting many
   separate <script> tags.

   ALWAYS pair an `id` with exactly one schema purpose. The effect uses
   `sd-${id}` as the DOM id and re-running the effect replaces the element,
   so two mount points sharing the same id will step on each other.
   ========================================================================== */

import { useEffect } from 'react';

export type JsonLd = Record<string, unknown>;

interface StructuredDataProps {
  /** Unique identifier for this script tag. Prevents duplicates on re-render. */
  id: string;
  /** Single JSON-LD object or an array to combine under one <script> tag. */
  data: JsonLd | JsonLd[];
}

/** @context is redundant inside a @graph — Google parses it at the root only. */
function stripContext(obj: JsonLd): JsonLd {
  if (!obj || typeof obj !== 'object') return obj;
  const clone: JsonLd = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '@context') continue;
    clone[k] = v;
  }
  return clone;
}

export function StructuredData({ id, data }: StructuredDataProps) {
  useEffect(() => {
    const domId = `sd-${id}`;
    const payload: JsonLd = Array.isArray(data)
      ? { '@context': 'https://schema.org', '@graph': data.map(stripContext) }
      : data;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = domId;
    script.text = JSON.stringify(payload);

    document.getElementById(domId)?.remove();
    document.head.appendChild(script);

    return () => {
      document.getElementById(domId)?.remove();
    };
    // Serialize data so deep-equal updates don't cause unnecessary re-injections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, JSON.stringify(data)]);

  return null;
}

/* ============================================================================
   Typed schema builders
   ========================================================================= */

const BASE_URL = 'https://www.portugalactive.com';
const BRAND = {
  '@type': 'Organization' as const,
  name: 'Portugal Active',
  url: BASE_URL,
};
const PUBLISHER = {
  '@type': 'Organization' as const,
  name: 'Portugal Active',
  url: BASE_URL,
  logo: {
    '@type': 'ImageObject' as const,
    url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/portugal-active-logo-white_cbdf5c3f.webp',
    width: 600,
    height: 60,
  },
};

/* ── VacationRental (per-property) ──────────────────────────────────────── */

export interface BuildVacationRentalInput {
  name: string;
  slug: string;
  description?: string | null;
  images?: string[] | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  maxGuests?: number | null;
  priceFrom?: number | null;
  locality?: string | null;
  region?: string | null;
  amenities?: string[];
  petsAllowed?: boolean | null;
  smokingAllowed?: boolean | null;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  aggregateRating?: { ratingValue: number; reviewCount: number } | null;
}

/** VacationRental is a Google-recognized subtype of LodgingBusiness tailored
 *  for short-term rentals. Emits the fields that drive rich results and AI
 *  Overviews citations (numberOfBedrooms, occupancy, amenityFeature, offers). */
export function buildVacationRentalSchema(i: BuildVacationRentalInput): JsonLd {
  const url = `${BASE_URL}/homes/${i.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    '@id': url,
    name: i.name,
    ...(i.description && { description: i.description.slice(0, 500) }),
    url,
    ...(i.images && i.images.length > 0 && { image: i.images.slice(0, 6) }),
    ...(i.bedrooms != null && { numberOfBedrooms: i.bedrooms }),
    ...(i.bathrooms != null && { numberOfBathroomsTotal: i.bathrooms }),
    ...(i.maxGuests != null && {
      occupancy: {
        '@type': 'QuantitativeValue',
        maxValue: i.maxGuests,
        unitCode: 'C62', // UN/CEFACT "one" — a count of people
      },
    }),
    ...(i.amenities && i.amenities.length > 0 && {
      amenityFeature: i.amenities.map((a) => ({
        '@type': 'LocationFeatureSpecification',
        name: a,
        value: true,
      })),
    }),
    ...(i.petsAllowed != null && { petsAllowed: i.petsAllowed }),
    ...(i.smokingAllowed != null && { smokingAllowed: i.smokingAllowed }),
    ...(i.checkinTime && { checkinTime: i.checkinTime }),
    ...(i.checkoutTime && { checkoutTime: i.checkoutTime }),
    address: {
      '@type': 'PostalAddress',
      ...(i.locality && { addressLocality: i.locality }),
      ...(i.region && { addressRegion: i.region }),
      addressCountry: 'PT',
    },
    ...(i.latitude != null && i.longitude != null && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: i.latitude,
        longitude: i.longitude,
      },
    }),
    ...(i.priceFrom != null && i.priceFrom > 0 && {
      priceRange: `From €${i.priceFrom} per night`,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: i.priceFrom,
        availability: 'https://schema.org/InStock',
        url,
        // Valid for ~12 months from now — avoids Google "stale price" warnings
        priceValidUntil: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      },
    }),
    ...(i.aggregateRating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: i.aggregateRating.ratingValue,
        reviewCount: i.aggregateRating.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    brand: BRAND,
  };
}

/* ── Article (blog posts) ────────────────────────────────────────────── */

export interface BuildArticleInput {
  title: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  publishDate?: string | null;
  modifiedDate?: string | null;
  authorName?: string | null;
  authorUrl?: string | null;
  articleBody?: string | null;
  readTimeMinutes?: number | null;
  wordCount?: number | null;
}

/** Article subtype BlogPosting is the richer choice for blog content — it
 *  feeds Google Discover cards and is the type Google's Article rich result
 *  looks for. */
export function buildArticleSchema(i: BuildArticleInput): JsonLd {
  const url = `${BASE_URL}/blog/${i.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': url,
    headline: i.title.slice(0, 110),
    ...(i.description && { description: i.description.slice(0, 250) }),
    ...(i.image && { image: [i.image] }),
    ...(i.publishDate && { datePublished: i.publishDate }),
    ...(i.modifiedDate || i.publishDate ? {
      dateModified: i.modifiedDate || i.publishDate,
    } : {}),
    author: {
      '@type': 'Person',
      name: i.authorName || 'Portugal Active',
      ...(i.authorUrl && { url: i.authorUrl }),
    },
    publisher: PUBLISHER,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(i.articleBody && { articleBody: i.articleBody.slice(0, 5000) }),
    ...(i.wordCount != null && { wordCount: i.wordCount }),
    ...(i.readTimeMinutes != null && { timeRequired: `PT${i.readTimeMinutes}M` }),
  };
}

/* ── Person (team, author pages) ─────────────────────────────────────── */

export interface BuildPersonInput {
  name: string;
  jobTitle?: string | null;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  sameAs?: string[];
  worksFor?: string;
}

export function buildPersonSchema(i: BuildPersonInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: i.name,
    ...(i.jobTitle && { jobTitle: i.jobTitle }),
    ...(i.description && { description: i.description.slice(0, 500) }),
    ...(i.image && { image: i.image }),
    ...(i.url && { url: i.url }),
    ...(i.sameAs && i.sameAs.length > 0 && { sameAs: i.sameAs }),
    worksFor: {
      '@type': 'Organization',
      name: i.worksFor || 'Portugal Active',
      url: BASE_URL,
    },
  };
}

/* ── FAQPage ─────────────────────────────────────────────────────────── */

export interface FaqItem {
  question: string;
  answer: string;
}

export function buildFaqPageSchema(items: FaqItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  };
}

/* ── BreadcrumbList ──────────────────────────────────────────────────── */

export interface BreadcrumbItem {
  name: string;
  /** Absolute or relative path — relative paths are resolved against BASE_URL. */
  item?: string;
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((b, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: b.name,
      ...(b.item && {
        item: b.item.startsWith('http') ? b.item : `${BASE_URL}${b.item}`,
      }),
    })),
  };
}
