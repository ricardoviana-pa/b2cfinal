/* ==========================================================================
   DESTINATION — 12-SECTION TEMPLATE COMPONENTS (Pass 3 editorial redesign)
   ========================================================================

   Implements the 12-section template defined by the destinations strategy
   doc (May 2026, hub-and-spoke editorial). This file went through three
   passes:

     v1 — text-only scaffolding, basic card grids.
     v2 — adds Cowork editorial deliverable (primaryAccolade, intro
          paragraphs, EventsAndPlanning, schema graph for Events).
     v3 — Pass 3 redesign: every chapter rendered through <SectionChapter />
          (numeral + overline + serif heading + scroll-fade), Ken Burns
          hero with a gold-bordered award seal, zigzag layouts where the
          data has imagery (When-to-visit, Eat-Drink, Things-to-do, Events),
          full-bleed editorial interludes from DestinationPage, sticky TOC
          via DestinationTOC, sticky bottom CTA via StickyBookingBar.

   Reference benchmarks: Aman Journal, Six Senses Stories, Mr & Mrs Smith.
   ========================================================================== */

import { Link } from 'wouter';
import { useTranslation, Trans } from 'react-i18next';
import { ArrowRight, Plane, Train, Car, Globe, Plus, Calendar, Bike } from 'lucide-react';
import type { Destination, Property, Product } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import PropertyCard from '@/components/property/PropertyCard';
import { SectionChapter } from './SectionChapter';

/** Chapters published in this template, in render order. Used by
 *  DestinationPage.tsx to feed both <DestinationTOC /> and the inline
 *  EditorialInterludes. */
export const CHAPTERS = [
  { number: 1,  id: 'chapter-hero',     label: 'Welcome'         },
  { number: 2,  id: 'chapter-why',      label: 'Why this place'  },
  { number: 3,  id: 'chapter-stay',     label: 'Where to stay'   },
  { number: 4,  id: 'chapter-journal',  label: 'The journal'     },
  { number: 5,  id: 'chapter-do',       label: 'What to see'     },
  { number: 6,  id: 'chapter-when',     label: 'When to visit'   },
  { number: 7,  id: 'chapter-getting',  label: 'Getting here'    },
  { number: 8,  id: 'chapter-eat',      label: 'Eat & experience' },
  { number: 9,  id: 'chapter-events',   label: 'Events'          },
  { number: 10, id: 'chapter-press',    label: 'Press'           },
  { number: 11, id: 'chapter-faq',      label: 'FAQ'             },
  { number: 12, id: 'chapter-related',  label: 'Keep exploring'  },
] as const;

/* ─────────────────────────────────────────────────────────────────────── */
/* 1. HERO EDITORIAL                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

interface HeroEditorialProps {
  destination: Destination;
}

export function HeroEditorial({ destination: d }: HeroEditorialProps) {
  const { t } = useTranslation();
  return (
    <section
      id="chapter-hero"
      data-chapter={1}
      className="relative h-[88vh] min-h-[620px] flex items-end overflow-hidden bg-[#1A1A18]"
    >
      <div className="absolute inset-0 editorial-ken-burns">
        {d.coverImage ? (
          <img
            src={d.coverImage}
            alt={`${d.name}, Portugal — luxury villa destination`}
            className="w-full h-full object-cover"
            width={1920}
            height={1280}
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full placeholder-image" />
        )}
      </div>
      {/* Two stops + a subtle scrim from the right edge — gives the H1
          dramatic contrast without flattening the photograph. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0A]/85 via-[#0B0B0A]/35 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0A]/25 to-transparent" />

      <div className="relative container pb-14 lg:pb-20 z-10">
        <Link
          href="/destinations"
          className="inline-flex items-center gap-2 text-[12px] tracking-[0.14em] uppercase text-white/55 hover:text-white/85 transition-colors mb-6"
        >
          <span className="block w-6 h-px bg-current" />
          {t('destinationsPage.backToDestinations')}
        </Link>
        <p className="text-[11px] tracking-[0.22em] uppercase text-[#C4A87C] mb-4">
          A Portugal Active destination
        </p>
        <h1
          className="text-white tracking-[-0.015em] leading-[0.96] mb-6"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 300,
            fontSize: 'clamp(48px, 8vw, 104px)',
          }}
        >
          {d.name}
        </h1>
        {(d.heroSubtitle || d.tagline) && (
          <p
            className="max-w-2xl text-white/80 mb-8"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 'clamp(16px, 1.6vw, 20px)',
              lineHeight: 1.5,
            }}
          >
            {d.heroSubtitle ?? d.tagline}
          </p>
        )}
        {d.primaryAccolade && (
          <div className="editorial-award-seal">
            <p className="text-[10px] tracking-[0.22em] uppercase text-[#C4A87C] mb-2">
              Awarded
            </p>
            <p
              className="text-white leading-[1.18] mb-3"
              style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 400 }}
            >
              {d.primaryAccolade.text}
            </p>
            <p className="text-[11px] tracking-[0.04em] text-white/65">
              {d.primaryAccolade.source}
            </p>
            {d.primaryAccolade.note && (
              <p className="text-[11px] text-white/45 italic mt-1">
                {d.primaryAccolade.note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Soft scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:block z-10">
        <span className="block w-px h-10 bg-white/40 mx-auto" />
        <span className="block text-[10px] tracking-[0.22em] uppercase text-white/45 mt-3">
          Scroll
        </span>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 2. WHY THIS PLACE                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

export function WhyThisPlace({ destination: d }: { destination: Destination }) {
  if (!d.whyDescription) return null;
  const paragraphs = d.whyDescription.split('\n\n');
  return (
    <SectionChapter
      id="chapter-why"
      number={2}
      overline={d.whyOverline ?? 'Why this place'}
      heading={`Why ${d.name}`}
      background="white"
      maxWidth="3xl"
    >
      <div className="text-[#1A1A18]">
        {paragraphs.map((para, i) => (
          <p
            key={i}
            className="mb-6 last:mb-0"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 17,
              lineHeight: 1.7,
              fontWeight: 300,
              color: '#2A2A26',
            }}
          >
            {/* Drop cap on the first paragraph — magazine register. */}
            {i === 0 ? (
              <>
                <span
                  className="float-left mr-3 mt-1"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 74,
                    lineHeight: 0.85,
                    fontWeight: 300,
                    color: '#B8985A',
                  }}
                >
                  {para.charAt(0)}
                </span>
                {para.slice(1)}
              </>
            ) : (
              para
            )}
          </p>
        ))}

        {d.pullQuote && (
          <blockquote className="mt-14 mx-auto max-w-2xl text-center">
            <span
              className="block text-[40px] leading-none text-[#B8985A] mb-3"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300 }}
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <p
              className="text-[#1A1A18] italic"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                lineHeight: 1.4,
                fontWeight: 400,
              }}
            >
              {d.pullQuote.text}
            </p>
            <footer className="mt-5 text-[11px] tracking-[0.14em] uppercase text-[#8B7355]">
              {d.pullQuote.source}
              {d.pullQuote.year ? ` · ${d.pullQuote.year}` : ''}
            </footer>
          </blockquote>
        )}
      </div>
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 3. WHERE TO STAY                                                        */
/* ─────────────────────────────────────────────────────────────────────── */

interface WhereToStayProps {
  destination: Destination;
  properties: Property[];
}

export function WhereToStay({ destination: d, properties }: WhereToStayProps) {
  const { t } = useTranslation();
  if (properties.length === 0 && d.comingSoon) return null;

  return (
    <SectionChapter
      id="chapter-stay"
      number={3}
      overline="Where to stay"
      heading={t('destinationDetail.homesIn', { name: d.name })}
      kicker={d.whereToStayIntro}
      background="cream"
      maxWidth="6xl"
    >
      {properties.length === 0 ? (
        <div className="text-center max-w-xl mx-auto py-8">
          <p
            className="text-[17px] text-[#3A3A35] mb-6"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
          >
            {t('destinationDetail.newHomesComingSoon', { name: d.name })}
          </p>
          <p className="text-[14px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
            {t('destinationDetail.newHomesComingSoonSubtitle', { name: d.name })}
          </p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 mt-8 text-[12px] tracking-[0.14em] uppercase text-[#1A1A18] border-b border-[#8B7355] pb-1 hover:border-[#1A1A18] transition-colors"
          >
            Speak to the concierge <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {properties.map(p => <PropertyCard key={p.id} property={p} />)}
          </div>
          <div className="mt-10 text-center">
            <a
              href={`/homes?destination=${d.region}`}
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.14em] uppercase text-[#1A1A18] border-b border-[#8B7355] pb-1 hover:border-[#1A1A18] transition-colors"
            >
              {t('destinationDetail.viewAllHomes')} <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </>
      )}
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 4. THE JOURNAL                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

interface JournalArticle {
  slug: string;
  title: string;
  excerpt?: string;
  coverImage?: string;
  publishedAt?: string;
}

interface TheJournalProps {
  destination: Destination;
  articles: JournalArticle[];
}

export function TheJournal({ destination: d, articles }: TheJournalProps) {
  if (articles.length === 0) return null;
  return (
    <SectionChapter
      id="chapter-journal"
      number={4}
      overline="From the journal"
      heading={d.journalSectionTitle ?? `Stories from ${d.name}`}
      kicker="Editorial dispatches from our concierge team and the writers we publish."
      background="warm"
      maxWidth="6xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {articles.slice(0, 6).map(a => (
          <Link key={a.slug} href={`/blog/${a.slug}`} className="group block">
            <div
              className="relative overflow-hidden bg-[#E8E4DC] mb-4"
              style={{ aspectRatio: '4/3' }}
            >
              {a.coverImage ? (
                <img
                  src={a.coverImage}
                  alt={a.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  loading="lazy"
                  width={800}
                  height={600}
                />
              ) : (
                <div className="w-full h-full placeholder-image" />
              )}
            </div>
            <h3
              className="text-[19px] text-[#1A1A18] mb-2 group-hover:text-[#8B7355] transition-colors leading-snug"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
            >
              {a.title}
            </h3>
            {a.excerpt && (
              <p className="text-[14px] text-[#6B6860] leading-relaxed line-clamp-2" style={{ fontWeight: 300 }}>
                {a.excerpt}
              </p>
            )}
          </Link>
        ))}
      </div>
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 5. WHAT TO SEE AND DO                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

/** Curated item card — image-led when an image is present, text-only
 *  otherwise. The image variant uses a 4/3 aspect with a soft gradient
 *  scrim so the category badge sits over the photo. */
function CuratedCard({
  name,
  category,
  description,
  image,
  variant = 'standard',
}: {
  name: string;
  category?: string;
  description: string;
  image?: string;
  variant?: 'standard' | 'feature';
}) {
  const isFeature = variant === 'feature';
  if (image) {
    return (
      <article className="group">
        <div
          className="relative overflow-hidden bg-[#E8E4DC] mb-4"
          style={{ aspectRatio: isFeature ? '5/3' : '4/3' }}
        >
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
          {category && (
            <span className="absolute top-3 left-3 text-[10px] font-medium tracking-[0.14em] uppercase text-white bg-black/35 backdrop-blur-sm px-2.5 py-1">
              {category}
            </span>
          )}
        </div>
        <h4
          className={`text-[#1A1A18] mb-2 ${isFeature ? 'text-[22px]' : 'text-[17px]'}`}
          style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.25 }}
        >
          {name}
        </h4>
        <p
          className={`text-[#6B6860] leading-relaxed ${isFeature ? 'text-[15px]' : 'text-[13.5px]'}`}
          style={{ fontWeight: 300 }}
        >
          {description}
        </p>
      </article>
    );
  }
  return (
    <article className="bg-white border border-[#E8E4DC] p-6 h-full flex flex-col">
      {category && (
        <span className="text-[10px] font-medium tracking-[0.14em] uppercase text-[#9E9A90] mb-3">
          {category}
        </span>
      )}
      <h4
        className="text-[17px] text-[#1A1A18] mb-2"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.25 }}
      >
        {name}
      </h4>
      <p className="text-[13.5px] text-[#6B6860] leading-relaxed flex-1" style={{ fontWeight: 300 }}>
        {description}
      </p>
    </article>
  );
}

export function WhatToSeeAndDo({ destination: d }: { destination: Destination }) {
  if (!d.thingsToDo || d.thingsToDo.length === 0) {
    if (d.insiderRecommendations && d.insiderRecommendations.length > 0) {
      return (
        <SectionChapter
          id="chapter-do"
          number={5}
          overline="What to do"
          heading="What to see and do"
          background="sand"
          maxWidth="6xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.insiderRecommendations.map((rec, i) => (
              <CuratedCard key={i} {...rec} />
            ))}
          </div>
        </SectionChapter>
      );
    }
    return null;
  }
  return (
    <SectionChapter
      id="chapter-do"
      number={5}
      overline="What to do"
      heading={`What to see and do in ${d.name}`}
      kicker={d.thingsToDoIntro}
      background="sand"
      maxWidth="6xl"
    >
      <div className="space-y-16">
        {d.thingsToDo.map(group => {
          const [first, ...rest] = group.items;
          const restHasImages = rest.some(i => !!i.image);
          return (
            <div key={group.heading}>
              <div className="flex items-baseline gap-4 mb-7">
                <h3
                  className="text-[24px] text-[#1A1A18]"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}
                >
                  {group.heading}
                </h3>
                <span className="flex-1 h-px bg-[#1A1A18]/15" />
              </div>
              {first && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
                  <div className="md:col-span-7">
                    <CuratedCard {...first} variant="feature" />
                  </div>
                  {rest.length > 0 && (
                    <div className="md:col-span-5 grid grid-cols-1 gap-5">
                      {rest.slice(0, 2).map((item, i) => (
                        <CuratedCard key={item.name + i} {...item} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {rest.length > 2 && (
                <div
                  className={`grid gap-5 ${
                    restHasImages ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  {rest.slice(2).map((item, i) => (
                    <CuratedCard key={item.name + i} {...item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 6. WHEN TO VISIT — zigzag image+text per season                         */
/* ─────────────────────────────────────────────────────────────────────── */

const SEASON_META = [
  { key: 'spring' as const, label: 'Spring',  range: 'March – May'        },
  { key: 'summer' as const, label: 'Summer',  range: 'June – August'      },
  { key: 'autumn' as const, label: 'Autumn',  range: 'September – November' },
  { key: 'winter' as const, label: 'Winter',  range: 'December – February' },
];

export function WhenToVisit({ destination: d }: { destination: Destination }) {
  if (!d.seasons) {
    if (!d.bestTimeToVisit) return null;
    return (
      <SectionChapter
        id="chapter-when"
        number={6}
        overline="Plan the trip"
        heading="When to visit"
        background="white"
        maxWidth="3xl"
      >
        <p className="text-[17px] text-[#2A2A26] leading-relaxed" style={{ fontWeight: 300 }}>
          {d.bestTimeToVisit}
        </p>
      </SectionChapter>
    );
  }
  const seasons = SEASON_META.map(meta => ({
    ...meta,
    text: d.seasons![meta.key],
    image: d.imagery?.[`season${meta.label}` as keyof typeof d.imagery] as string | undefined,
  })).filter(s => !!s.text);
  if (seasons.length === 0 && !d.seasons.bestForFirstTime) return null;

  return (
    <SectionChapter
      id="chapter-when"
      number={6}
      overline="Plan the trip"
      heading={`When to visit ${d.name}`}
      kicker={d.bestTimeToVisit}
      background="white"
      maxWidth="6xl"
    >
      <div className="space-y-16 md:space-y-24">
        {seasons.map((s, i) => {
          const reversed = i % 2 === 1;
          return (
            <div
              key={s.key}
              className={`grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center ${
                reversed ? 'md:[direction:rtl]' : ''
              }`}
            >
              <div className="md:col-span-5 md:[direction:ltr]">
                <div
                  className="relative overflow-hidden bg-[#E8E4DC]"
                  style={{ aspectRatio: '4/5' }}
                >
                  {s.image ? (
                    <img
                      src={s.image}
                      alt={`${d.name} in ${s.label.toLowerCase()}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full placeholder-image" />
                  )}
                </div>
              </div>
              <div className="md:col-span-7 md:[direction:ltr]">
                <p className="text-[11px] tracking-[0.18em] uppercase text-[#8B7355] mb-2">
                  {s.range}
                </p>
                <h3
                  className="text-[32px] md:text-[40px] text-[#1A1A18] mb-5"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}
                >
                  {s.label}
                </h3>
                <p
                  className="text-[16px] text-[#2A2A26] leading-[1.7]"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                >
                  {s.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {d.seasons.bestForFirstTime && (
        <div className="mt-20 max-w-3xl mx-auto bg-[#0B4541] text-white p-8 md:p-10 relative">
          <span
            className="absolute -top-3 left-8 bg-[#B8985A] text-white text-[10px] tracking-[0.18em] uppercase px-3 py-1"
          >
            Concierge picks
          </span>
          <p className="text-[11px] tracking-[0.18em] uppercase text-white/55 mb-4">
            Best for first-time visitors
          </p>
          <p
            className="text-[18px] leading-[1.6]"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
          >
            {d.seasons.bestForFirstTime}
          </p>
        </div>
      )}
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 7. HOW TO GET HERE                                                      */
/* ─────────────────────────────────────────────────────────────────────── */

const TRANSPORT_META: Array<{
  key: 'byAir' | 'byTrain' | 'byCar' | 'fromSpain' | 'gettingAround';
  label: string;
  Icon: typeof Plane;
}> = [
  { key: 'byAir',         label: 'By air',          Icon: Plane },
  { key: 'byTrain',       label: 'By train',        Icon: Train },
  { key: 'byCar',         label: 'By car',          Icon: Car },
  { key: 'fromSpain',     label: 'From Spain',      Icon: Globe },
  { key: 'gettingAround', label: 'Getting around',  Icon: Bike },
];

export function HowToGetHere({ destination: d }: { destination: Destination }) {
  if (!d.transport) {
    if (!d.howToGetHere) return null;
    return (
      <SectionChapter
        id="chapter-getting"
        number={7}
        overline="Logistics"
        heading={`Getting to ${d.name}`}
        background="cream"
        maxWidth="3xl"
      >
        <p className="text-[17px] text-[#2A2A26] leading-relaxed" style={{ fontWeight: 300 }}>
          {d.howToGetHere}
        </p>
      </SectionChapter>
    );
  }
  const populated = TRANSPORT_META.filter(({ key }) => !!d.transport![key]);
  if (populated.length === 0) return null;

  return (
    <SectionChapter
      id="chapter-getting"
      number={7}
      overline="Logistics"
      heading={`Getting to ${d.name}`}
      background="cream"
      maxWidth="5xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {populated.map(({ key, label, Icon }) => (
          <div
            key={key}
            className="bg-white p-7 border-l-2 border-[#B8985A]"
          >
            <div className="flex items-center gap-3 mb-3">
              <Icon className="w-4 h-4 text-[#8B7355]" />
              <p
                className="text-[12px] tracking-[0.14em] uppercase text-[#1A1A18]"
                style={{ fontWeight: 500 }}
              >
                {label}
              </p>
            </div>
            <p
              className="text-[14.5px] text-[#3A3A35] leading-[1.7]"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            >
              {d.transport![key]}
            </p>
          </div>
        ))}
      </div>
      <p
        className="mt-10 text-[13px] text-[#6B6860] text-center italic"
        style={{ fontWeight: 300, fontFamily: 'var(--font-display)' }}
      >
        Our concierge arranges private transfers from any airport or station to your villa.
      </p>
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 8. EAT, DRINK, EXPERIENCE                                               */
/* ─────────────────────────────────────────────────────────────────────── */

interface EatDrinkExperienceProps {
  destination: Destination;
  adventures?: Product[];
  onAddToItinerary?: (product: Product) => void;
}

export function EatDrinkExperience({
  destination: d,
  adventures = [],
  onAddToItinerary,
}: EatDrinkExperienceProps) {
  const hasRestaurants = (d.restaurants?.length ?? 0) > 0;
  const hasSpecialties = (d.specialties?.length ?? 0) > 0;
  const hasExperiences = (d.experiences?.length ?? 0) > 0;
  if (!hasRestaurants && !hasSpecialties && !hasExperiences && adventures.length === 0) return null;

  return (
    <SectionChapter
      id="chapter-eat"
      number={8}
      overline="Concierge picks"
      heading="Eat, drink, experience"
      kicker={d.eatDrinkIntro}
      background="white"
      maxWidth="6xl"
    >
      {hasRestaurants && (
        <div className="mb-16">
          <div className="flex items-baseline gap-4 mb-7">
            <h3
              className="text-[22px] text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}
            >
              Where to eat
            </h3>
            <span className="flex-1 h-px bg-[#1A1A18]/15" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.restaurants!.map(r => <CuratedCard key={r.name} {...r} />)}
          </div>
        </div>
      )}

      {hasSpecialties && (
        <div className="mb-16 bg-[#F5F1EB] p-8 md:p-10">
          <div className="flex items-baseline gap-4 mb-6">
            <h3
              className="text-[22px] text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}
            >
              On the table
            </h3>
            <span className="flex-1 h-px bg-[#1A1A18]/15" />
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            {d.specialties!.map(s => (
              <div key={s.name} className="flex gap-5">
                <span
                  className="text-[#B8985A] text-[20px] mt-1"
                  style={{ fontFamily: 'var(--font-display)' }}
                  aria-hidden="true"
                >
                  &mdash;
                </span>
                <div>
                  {s.category && (
                    <span className="text-[10px] font-medium tracking-[0.14em] uppercase text-[#9E9A90] block mb-1">
                      {s.category}
                    </span>
                  )}
                  <dt
                    className="text-[16px] text-[#1A1A18] mb-1.5"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
                  >
                    {s.name}
                  </dt>
                  <dd className="text-[13.5px] text-[#3A3A35] leading-relaxed" style={{ fontWeight: 300 }}>
                    {s.description}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      )}

      {hasExperiences && (
        <div>
          <div className="flex items-baseline gap-4 mb-3">
            <h3
              className="text-[22px] text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}
            >
              What to do
            </h3>
            <span className="flex-1 h-px bg-[#1A1A18]/15" />
          </div>
          {d.experiencesIntro && (
            <p
              className="text-[15px] text-[#3A3A35] mb-7 max-w-3xl leading-relaxed"
              style={{ fontWeight: 300 }}
            >
              {d.experiencesIntro}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {d.experiences!.map(e => (
              <article key={e.name} className="group">
                <div
                  className="relative overflow-hidden bg-[#E8E4DC] mb-4"
                  style={{ aspectRatio: '4/3' }}
                >
                  {e.image ? (
                    <img
                      src={e.image}
                      alt={e.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full placeholder-image" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent" />
                  {(e.duration || e.season) && (
                    <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white tracking-[0.08em] uppercase">
                      {e.duration && <span>{e.duration}</span>}
                      {e.season && <span className="opacity-80">· {e.season}</span>}
                    </div>
                  )}
                </div>
                <h4
                  className="text-[18px] text-[#1A1A18] mb-2"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.25 }}
                >
                  {e.name}
                </h4>
                <p className="text-[13.5px] text-[#6B6860] leading-relaxed mb-3" style={{ fontWeight: 300 }}>
                  {e.description}
                </p>
                <p
                  className="text-[11px] tracking-[0.14em] uppercase text-[#8B7355]"
                  style={{ fontWeight: 500 }}
                >
                  Concierge arranged
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {adventures.length > 0 && (
        <div className="mt-16">
          <div className="flex items-baseline gap-4 mb-7">
            <h3
              className="text-[22px] text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}
            >
              Book online
            </h3>
            <span className="flex-1 h-px bg-[#1A1A18]/15" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {adventures.map(adv => (
              <div key={adv.id} className="group">
                <div
                  className="relative overflow-hidden bg-[#E8E4DC] mb-4"
                  style={{ aspectRatio: '3/2' }}
                >
                  {adv.image ? (
                    <img
                      src={adv.image}
                      alt={`${adv.name} — outdoor experience in ${d.name}, Portugal`}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      loading="lazy"
                      width={800}
                      height={600}
                    />
                  ) : (
                    <div className="w-full h-full placeholder-image" />
                  )}
                </div>
                <h4
                  className="text-[17px] text-[#1A1A18] mb-1.5"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
                >
                  {adv.name}
                </h4>
                <p
                  className="text-[13.5px] text-[#6B6860] mb-3 leading-relaxed line-clamp-2"
                  style={{ fontWeight: 300 }}
                >
                  {adv.description}
                </p>
                <div className="flex items-center justify-between">
                  {(adv.priceFrom ?? 0) > 0 && (
                    <p className="text-[12px] text-[#8B7355] tracking-[0.04em]">
                      from {formatEurEditorial(adv.priceFrom ?? 0)}
                    </p>
                  )}
                  {onAddToItinerary && (
                    <button
                      onClick={() => onAddToItinerary(adv)}
                      className="flex items-center gap-1.5 text-[11px] tracking-[0.14em] uppercase text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      <Plus className="w-3 h-3" /> Itinerary
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 9. EVENTS WORTH PLANNING AROUND                                         */
/* ─────────────────────────────────────────────────────────────────────── */

export function EventsAndPlanning({ destination: d }: { destination: Destination }) {
  if (!d.events || d.events.length === 0) return null;
  const hasImages = d.events.some(e => !!e.image);
  return (
    <SectionChapter
      id="chapter-events"
      number={9}
      overline="The calendar"
      heading="Events worth planning around"
      kicker={d.eventsIntro}
      background="cream"
      maxWidth="6xl"
    >
      {hasImages ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {d.events.map(ev => (
            <article key={ev.name} className="group">
              <div
                className="relative overflow-hidden bg-[#E8E4DC] mb-4"
                style={{ aspectRatio: '4/3' }}
              >
                {ev.image ? (
                  <img
                    src={ev.image}
                    alt={ev.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full placeholder-image" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-white" />
                  <span className="text-[10px] tracking-[0.14em] uppercase text-white">
                    {ev.dates}
                  </span>
                </div>
              </div>
              <h4
                className="text-[18px] text-[#1A1A18] mb-2"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
              >
                {ev.url ? (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#8B7355]">
                    {ev.name}
                  </a>
                ) : (
                  ev.name
                )}
              </h4>
              <p className="text-[13.5px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                {ev.description}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="border-l border-[#1A1A18]/12 pl-8 ml-3 space-y-8">
          {d.events.map(ev => (
            <article key={ev.name} className="relative">
              <span className="absolute -left-[35px] top-2 w-2.5 h-2.5 rounded-full bg-[#B8985A]" />
              <p className="text-[11px] tracking-[0.18em] uppercase text-[#8B7355] mb-1.5">
                {ev.dates}
              </p>
              <h4
                className="text-[20px] text-[#1A1A18] mb-2"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
              >
                {ev.url ? (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#8B7355]">
                    {ev.name}
                  </a>
                ) : (
                  ev.name
                )}
              </h4>
              <p className="text-[14.5px] text-[#3A3A35] leading-relaxed max-w-2xl" style={{ fontWeight: 300 }}>
                {ev.description}
              </p>
            </article>
          ))}
        </div>
      )}
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 10. PRESS & ACCOLADES                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

export function PressAccolades({ destination: d }: { destination: Destination }) {
  if (!d.pressQuotes || d.pressQuotes.length === 0) return null;
  return (
    <SectionChapter
      id="chapter-press"
      number={10}
      overline="As featured in"
      heading="Press & recognition"
      kicker={d.pressIntro}
      background="dark"
      maxWidth="6xl"
      centeredHeader
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {d.pressQuotes.map((q, i) => (
          <blockquote key={`${q.source}-${i}`} className="text-center">
            <span
              className="block text-[44px] leading-none text-[#C4A87C] mb-3"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300 }}
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <p
              className="text-white/90 italic mb-5 leading-relaxed"
              style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 400 }}
            >
              {q.quote}
            </p>
            <footer className="text-[11px] tracking-[0.18em] uppercase text-white/55">
              {q.url ? (
                <a href={q.url} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  {q.source}
                </a>
              ) : (
                q.source
              )}
              {q.year ? ` · ${q.year}` : ''}
            </footer>
          </blockquote>
        ))}
      </div>
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 11. FAQ                                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

export function FAQSection({ destination: d }: { destination: Destination }) {
  if (!d.faqs || d.faqs.length === 0) return null;
  return (
    <SectionChapter
      id="chapter-faq"
      number={11}
      overline="Practical answers"
      heading="Frequently asked questions"
      background="white"
      maxWidth="3xl"
    >
      <dl className="divide-y divide-[#E8E4DC]">
        {d.faqs.map((f, i) => (
          <div key={i} className="py-7 first:pt-0 last:pb-0">
            <dt
              className="text-[18px] text-[#1A1A18] mb-3"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.3 }}
            >
              {f.question}
            </dt>
            <dd className="text-[14.5px] text-[#3A3A35] leading-[1.7]" style={{ fontWeight: 300 }}>
              {f.answer}
            </dd>
          </div>
        ))}
      </dl>
    </SectionChapter>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 12. RELATED DESTINATIONS + OWNERS CTA                                   */
/* ─────────────────────────────────────────────────────────────────────── */

interface RelatedDestinationsAndOwnersCTAProps {
  destination: Destination;
  related: Destination[];
}

export function RelatedDestinationsAndOwnersCTA({
  destination: d,
  related,
}: RelatedDestinationsAndOwnersCTAProps) {
  const owners = d.ownersCTA ?? {
    headline: `Own a home in ${d.name}?`,
    body: `Portugal Active operates private homes across Portugal end-to-end: marketing, bookings, concierge, maintenance, revenue optimisation. We turn private homes into private hotels.`,
    cta: 'Speak to our team',
  };
  const ownersUrl =
    owners.url ??
    `https://management.portugalactive.com/?utm_source=destinations&utm_medium=banner&utm_campaign=${encodeURIComponent(d.slug)}`;

  return (
    <>
      {related.length > 0 && (
        <SectionChapter
          id="chapter-related"
          number={12}
          overline="The journey continues"
          heading="Keep exploring"
          background="cream"
          maxWidth="6xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {related.slice(0, 3).map(r => (
              <Link
                key={r.slug}
                href={`/destinations/${r.slug}`}
                className="group block relative overflow-hidden"
                style={{ aspectRatio: '4/5' }}
              >
                {r.coverImage ? (
                  <img
                    src={r.coverImage}
                    alt={r.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.05]"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 placeholder-image" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <div className="absolute top-5 left-5">
                  <span className="text-[10px] tracking-[0.18em] uppercase text-white/75">
                    {r.region === d.region ? 'Same region' : 'Nearby'}
                  </span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3
                    className="text-white text-[24px] mb-1"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.1 }}
                  >
                    {r.name}
                  </h3>
                  {r.tagline && (
                    <p className="text-[13px] text-white/75 line-clamp-2" style={{ fontWeight: 300 }}>
                      {r.tagline}
                    </p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] tracking-[0.14em] uppercase text-[#C4A87C]">
                    Read the guide <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </SectionChapter>
      )}

      <section className="relative overflow-hidden bg-[#0B4541] text-white py-20 md:py-24">
        <div className="absolute inset-0 opacity-15 mix-blend-overlay" aria-hidden="true">
          <div className="w-full h-full" style={{
            backgroundImage: 'radial-gradient(circle at 20% 30%, #C4A87C 0%, transparent 40%), radial-gradient(circle at 80% 70%, #C4A87C 0%, transparent 35%)',
          }} />
        </div>
        <div className="relative container max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-[11px] tracking-[0.22em] uppercase text-[#C4A87C] mb-4">
                For travellers
              </p>
              <h3
                className="text-[30px] md:text-[36px] text-white mb-5"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.15 }}
              >
                Plan your stay in {d.name}
              </h3>
              <p className="text-[15px] text-white/80 mb-7 leading-relaxed max-w-md" style={{ fontWeight: 300 }}>
                See every home we operate in {d.name} — with concierge, daily housekeeping,
                and private chef on call.
              </p>
              <Link
                href={`/homes?destination=${d.region}`}
                className="inline-flex items-center gap-3 text-[12px] tracking-[0.14em] uppercase text-white border-b border-white/40 pb-1.5 hover:border-white transition-colors"
              >
                See all villas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="md:border-l md:border-white/15 md:pl-12">
              <p className="text-[11px] tracking-[0.22em] uppercase text-[#C4A87C] mb-4">
                For owners
              </p>
              <h3
                className="text-[30px] md:text-[36px] text-white mb-5"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1.15 }}
              >
                {owners.headline}
              </h3>
              <p className="text-[15px] text-white/80 mb-7 leading-relaxed max-w-md" style={{ fontWeight: 300 }}>
                {owners.body}
              </p>
              <a
                href={ownersUrl}
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex items-center gap-3 text-[12px] tracking-[0.14em] uppercase text-white border-b border-white/40 pb-1.5 hover:border-white transition-colors"
              >
                {owners.cta} <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* SCHEMA GRAPH                                                            */
/* ─────────────────────────────────────────────────────────────────────── */

export function buildDestinationGraph(
  d: Destination,
  properties: Property[],
  baseUrl = 'https://www.portugalactive.com',
): Record<string, unknown>[] {
  const url = `${baseUrl}/destinations/${d.slug}`;
  const containsPlace = properties.map(p => ({
    '@type': 'VacationRental',
    name: p.name,
    url: `${baseUrl}/homes/${p.slug}`,
  }));

  const graph: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TouristDestination',
      name: d.name,
      description: d.heroSubtitle ?? d.description ?? d.tagline,
      url,
      image: d.coverImage || undefined,
      ...(d.geo && {
        geo: { '@type': 'GeoCoordinates', latitude: d.geo.latitude, longitude: d.geo.longitude },
      }),
      touristType: ['families', 'couples', 'groups'],
      ...(containsPlace.length > 0 && { containsPlace }),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: d.seoTitle || d.name,
      author: { '@type': 'Organization', name: 'Portugal Active' },
      publisher: {
        '@type': 'Organization',
        name: 'Portugal Active',
        logo: { '@type': 'ImageObject', url: `${baseUrl}/logo.svg` },
      },
      datePublished: '2026-05-23',
      dateModified: new Date().toISOString().split('T')[0],
      image: d.coverImage || undefined,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Destinations', item: `${baseUrl}/destinations` },
        { '@type': 'ListItem', position: 3, name: d.name },
      ],
    },
  ];

  if (d.faqs && d.faqs.length > 0) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: d.faqs.map(f => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  if (d.events && d.events.length > 0) {
    for (const ev of d.events) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.name,
        description: ev.description,
        ...(ev.url && { url: ev.url }),
        ...(ev.image && { image: ev.image }),
        location: {
          '@type': 'Place',
          name: d.name,
          ...(d.geo && {
            geo: { '@type': 'GeoCoordinates', latitude: d.geo.latitude, longitude: d.geo.longitude },
          }),
        },
        startDate: ev.dates,
      });
    }
  }

  return graph;
}

// Silence unused-import warning for Trans (used by ancestors via children
// in some destinations).
export const __ssrSilence = { Trans };
