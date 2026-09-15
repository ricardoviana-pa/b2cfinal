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
import i18n from '@/i18n';
import { vacationRentalSchema, type VacationRentalInput } from '@shared/vacationRentalSchema';

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

/** Build a locale-aware absolute URL that matches the canonical URL pattern.
 *  Uses the current i18n language (falls back to 'en'). */
function localeUrl(path: string): string {
  const lang = i18n.language || 'en';
  return `${BASE_URL}/${lang}${path}`;
}

// Google's merchant-listing validator rejects an Organization here —
// "Tipo de objeto inválido para o campo brand". Product.brand takes a Brand.
const BRAND = {
  '@type': 'Brand' as const,
  name: 'Portugal Active',
  url: BASE_URL,
};
const PUBLISHER = {
  '@type': 'Organization' as const,
  name: 'Portugal Active',
  url: BASE_URL,
  logo: {
    '@type': 'ImageObject' as const,
    url: 'https://www.portugalactive.com/brand/pa-logo-white.webp',
    width: 600,
    height: 60,
  },
};

/* ── VacationRental (per-property) ──────────────────────────────────────── */

export type BuildVacationRentalInput = VacationRentalInput;

export function buildVacationRentalSchema(input: BuildVacationRentalInput): JsonLd {
  return vacationRentalSchema(input, (i18n.language || 'en').split('-')[0]);
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
  const url = localeUrl(`/blog/${i.slug}`);

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
        item: b.item.startsWith('http') ? b.item : localeUrl(b.item),
      }),
    })),
  };
}
