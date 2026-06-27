/* ==========================================================================
   DESTINATION — 11-SECTION TEMPLATE COMPONENTS
   ========================================================================

   Implements the 12-section template defined by the destinations strategy
   doc (May 2026, hub-and-spoke editorial) plus the Cowork editorial
   deliverable that adds `primaryAccolade`, intro paragraphs per section,
   a standalone `Events` block, and richer per-mode transport / seasonal
   copy. Each component renders its own slice of the Destination object
   and returns null when its data slice is missing — so the Viana pilot
   shows all twelve, while scaffolded spokes display only what has been
   written.

   The template is meant to read like Aman Journal / Six Senses Stories /
   Mr & Mrs Smith — editorial first, conversion second. Section 12 carries
   the dual funnel (guest CTA + owners CTA) per strategy doc §7.
   ========================================================================== */

import { Link } from 'wouter';
import { useTranslation, Trans } from 'react-i18next';
import { ArrowRight, Plane, Train, Car, Globe, Plus, Calendar, Award, Bike } from 'lucide-react';
import type { Destination, Property, Product } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import PropertyCard from '@/components/property/PropertyCard';

/* ── 1. HERO EDITORIAL ────────────────────────────────────────────────── */

interface HeroEditorialProps {
  destination: Destination;
}

export function HeroEditorial({ destination: d }: HeroEditorialProps) {
  const { t } = useTranslation();
  // `primaryAccolade` takes the hero overlay when present (it's the
  // ranked award — most-prominent trust signal). The `pullQuote` then
  // surfaces as a secondary inline blockquote so neither competes.
  return (
    <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
      {d.coverImage ? (
        <img
          src={d.coverImage}
          alt={`${d.name}, Portugal — luxury villa destination`}
          className="absolute inset-0 w-full h-full object-cover"
          width={1600}
          height={900}
          fetchPriority="high"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 placeholder-image" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <div className="relative container pb-12 lg:pb-16 z-10">
        <Link
          href="/destinations"
          className="text-[13px] text-white/60 hover:text-white/80 transition-colors mb-3 inline-block"
        >
          ← {t('destinationsPage.backToDestinations')}
        </Link>
        <h1 className="headline-xl text-white mb-3">{d.name}</h1>
        {d.heroSubtitle && (
          <p className="body-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {d.heroSubtitle}
          </p>
        )}
        {!d.heroSubtitle && d.tagline && (
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {d.tagline}
          </p>
        )}
        {d.primaryAccolade && (
          <div className="mt-6 inline-flex items-start gap-3 bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 max-w-xl">
            <Award className="w-4 h-4 text-white/80 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-white leading-snug">
                {d.primaryAccolade.text}
              </p>
              <p className="text-[11px] text-white/60 tracking-[0.04em] mt-1">
                {d.primaryAccolade.source}
              </p>
              {d.primaryAccolade.note && (
                <p className="text-[11px] text-white/50 italic mt-0.5">
                  {d.primaryAccolade.note}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── 2. WHY THIS PLACE ────────────────────────────────────────────────── */

export function WhyThisPlace({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  if (!d.whyDescription) return null;
  return (
    <section className="section-padding bg-white">
      <div className="container max-w-3xl mx-auto">
        {d.whyOverline && (
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">
            {d.whyOverline}
          </p>
        )}
        <h2 className="headline-lg text-[#1A1A18] mb-8">
          {t('destinationDetail.whyTitle', { name: d.name })}
        </h2>
        {d.whyDescription.split('\n\n').map((para, i) => (
          <p key={i} className="body-lg mb-5 last:mb-0">{para}</p>
        ))}
        {d.pullQuote && (
          <blockquote className="mt-10 pl-5 border-l-2 border-[#8B7355] max-w-xl">
            <p
              className="text-[#3A3A35] italic"
              style={{ fontFamily: 'var(--font-display)', fontSize: '19px', lineHeight: 1.45 }}
            >
              “{d.pullQuote.text}”
            </p>
            <footer className="text-[12px] text-[#6B6860] mt-3 tracking-[0.04em]">
              — {d.pullQuote.source}
              {d.pullQuote.year ? `, ${d.pullQuote.year}` : ''}
            </footer>
          </blockquote>
        )}
      </div>
    </section>
  );
}

/* ── 3. WHERE TO STAY ─────────────────────────────────────────────────── */

interface WhereToStayProps {
  destination: Destination;
  properties: Property[];
}

export function WhereToStay({ destination: d, properties }: WhereToStayProps) {
  const { t } = useTranslation();
  if (properties.length === 0) {
    if (d.comingSoon) return null;
    return (
      <section className="section-padding bg-white">
        <div className="container max-w-xl text-center">
          <h2 className="headline-lg text-[#1A1A18] mb-4">
            {t('destinationDetail.newHomesComingSoon', { name: d.name })}
          </h2>
          <p className="body-lg">
            {t('destinationDetail.newHomesComingSoonSubtitle', { name: d.name })}
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="section-padding bg-white">
      <div className="container">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <h2 className="headline-lg text-[#1A1A18]">
              {t('destinationDetail.homesIn', { name: d.name })}
            </h2>
            {d.whereToStayIntro && (
              <p
                className="body-lg text-[#3A3A35] mt-4 leading-relaxed"
                style={{ fontWeight: 300 }}
              >
                {d.whereToStayIntro}
              </p>
            )}
          </div>
          <a
            href={`/homes?destination=${d.region}`}
            className="hidden md:flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors flex-shrink-0"
          >
            {t('destinationDetail.viewAllHomes')} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map(p => <PropertyCard key={p.id} property={p} />)}
        </div>
      </div>
    </section>
  );
}

/* ── 4. THE JOURNAL ───────────────────────────────────────────────────── */

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
  const heading = d.journalSectionTitle ?? `From the journal — stories from ${d.name}`;
  return (
    <section className="section-padding bg-[#FAFAF7]">
      <div className="container">
        <h2 className="headline-lg text-[#1A1A18] mb-3">{heading}</h2>
        <p className="body-lg text-[#6B6860] mb-8">
          Editorial dispatches from our concierge team and the writers we publish.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.slice(0, 6).map(a => (
            <Link key={a.slug} href={`/blog/${a.slug}`} className="group block">
              <div
                className="relative overflow-hidden bg-[#E8E4DC] mb-3"
                style={{ aspectRatio: '4/3' }}
              >
                {a.coverImage ? (
                  <img
                    src={a.coverImage}
                    alt={a.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                    width={800}
                    height={600}
                  />
                ) : (
                  <div className="w-full h-full placeholder-image" />
                )}
              </div>
              <h3
                className="text-[16px] font-medium text-[#1A1A18] mb-1.5 group-hover:text-[#8B7355] transition-colors"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {a.title}
              </h3>
              {a.excerpt && (
                <p className="text-[13px] text-[#6B6860] leading-relaxed line-clamp-2" style={{ fontWeight: 300 }}>
                  {a.excerpt}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 5. WHAT TO SEE AND DO ────────────────────────────────────────────── */

export function WhatToSeeAndDo({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  const intro = d.thingsToDoIntro;
  if (!d.thingsToDo || d.thingsToDo.length === 0) {
    if (d.insiderRecommendations && d.insiderRecommendations.length > 0) {
      return (
        <section className="section-padding bg-[#F5F1EB]">
          <div className="container">
            <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationDetail.guide.seeAndDoTitle')}</h2>
            <p className="body-lg text-[#6B6860] mb-8">{t('destinationDetail.guide.conciergePicks', { name: d.name })}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {d.insiderRecommendations.map((rec, i) => (
                <div key={i} className="bg-white border border-[#E8E4DC] p-6">
                  {rec.category && (
                    <span className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90] mb-2 block">
                      {rec.category.replace('-', ' ')}
                    </span>
                  )}
                  <h3 className="font-display text-lg text-[#1A1A18] mb-2">{rec.name}</h3>
                  <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                    {rec.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }
    return null;
  }
  return (
    <section className="section-padding bg-[#F5F1EB]">
      <div className="container">
        <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationDetail.guide.seeAndDoTitleNamed', { name: d.name })}</h2>
        <p
          className="body-lg text-[#3A3A35] mb-10 max-w-3xl leading-relaxed"
          style={{ fontWeight: 300 }}
        >
          {intro ?? t('destinationDetail.guide.seeAndDoIntroFallback')}
        </p>
        <div className="space-y-12">
          {d.thingsToDo.map(group => (
            <div key={group.heading}>
              <h3
                className="text-[18px] font-medium text-[#1A1A18] mb-5 tracking-[0.01em]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {group.heading}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(item => (
                  <div key={item.name} className="bg-white border border-[#E8E4DC] p-5">
                    {item.category && (
                      <span className="text-[11px] font-medium tracking-[0.04em] text-[#9E9A90] mb-2 block uppercase">
                        {item.category}
                      </span>
                    )}
                    <h4
                      className="text-[15px] font-medium text-[#1A1A18] mb-2"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {item.name}
                    </h4>
                    <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 6. WHEN TO VISIT ─────────────────────────────────────────────────── */

const SEASON_LABEL_KEY: Record<string, string> = {
  spring: 'seasonSpring',
  summer: 'seasonSummer',
  autumn: 'seasonAutumn',
  winter: 'seasonWinter',
};

export function WhenToVisit({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  // No structured seasons → fall back to the single-line bestTimeToVisit.
  if (!d.seasons) {
    if (!d.bestTimeToVisit) return null;
    return (
      <section className="py-12 bg-white">
        <div className="container max-w-3xl mx-auto">
          <h2 className="headline-lg text-[#1A1A18] mb-6">{t('destinationDetail.guide.whenToVisitTitle')}</h2>
          <p className="body-lg">{d.bestTimeToVisit}</p>
        </div>
      </section>
    );
  }
  const seasons: Array<{ key: string; label: string; text: string }> = [];
  for (const key of ['spring', 'summer', 'autumn', 'winter'] as const) {
    const text = d.seasons[key];
    if (text) seasons.push({ key, label: t('destinationDetail.guide.' + SEASON_LABEL_KEY[key]), text });
  }
  if (seasons.length === 0 && !d.seasons.bestForFirstTime) return null;

  return (
    <section className="section-padding bg-white">
      <div className="container max-w-5xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationDetail.guide.whenToVisitTitleNamed', { name: d.name })}</h2>
        {d.bestTimeToVisit && (
          <p className="body-lg text-[#6B6860] mb-10 max-w-2xl">{d.bestTimeToVisit}</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {seasons.map(s => (
            <div key={s.key} className="border-l-2 border-[#8B7355] pl-5 py-1">
              <h3
                className="text-[15px] font-medium text-[#1A1A18] mb-2 tracking-[0.02em]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {s.label}
              </h3>
              <p className="text-[14px] text-[#3A3A35] leading-relaxed" style={{ fontWeight: 300 }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
        {d.seasons.bestForFirstTime && (
          <div className="mt-10 max-w-3xl mx-auto bg-[#FAFAF7] border border-[#E8E4DC] p-6">
            <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#8B7355] mb-3">
              {t('destinationDetail.guide.bestForFirstTime')}
            </p>
            <p className="text-[14px] text-[#1A1A18] leading-relaxed" style={{ fontWeight: 300 }}>
              {d.seasons.bestForFirstTime}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── 7. HOW TO GET HERE ───────────────────────────────────────────────── */

const TRANSPORT_META: Array<{ key: 'byAir' | 'byTrain' | 'byCar' | 'fromSpain' | 'gettingAround'; Icon: typeof Plane }> = [
  { key: 'byAir', Icon: Plane },
  { key: 'byTrain', Icon: Train },
  { key: 'byCar', Icon: Car },
  { key: 'fromSpain', Icon: Globe },
  { key: 'gettingAround', Icon: Bike },
];

export function HowToGetHere({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  if (!d.transport) {
    if (!d.howToGetHere) return null;
    return (
      <section className="py-12 bg-[#FAFAF7]">
        <div className="container max-w-3xl mx-auto">
          <h2 className="headline-lg text-[#1A1A18] mb-6">{t('destinationDetail.guide.getHereTitleNamed', { name: d.name })}</h2>
          <p className="body-lg">{d.howToGetHere}</p>
        </div>
      </section>
    );
  }
  const populated = TRANSPORT_META.filter(({ key }) => !!d.transport![key]);
  if (populated.length === 0) return null;

  return (
    <section className="section-padding bg-[#FAFAF7]">
      <div className="container max-w-4xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-8">{t('destinationDetail.guide.getHereTitleNamed', { name: d.name })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {populated.map(({ key, Icon }) => (
            <div
              key={key}
              className="flex items-start gap-4 p-5 bg-white border border-[#E8E4DC]"
            >
              <Icon className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1.5">{t('destinationDetail.guide.' + key)}</p>
                <p
                  className="text-[13px] text-[#6B6860] leading-relaxed"
                  style={{ fontWeight: 300 }}
                >
                  {d.transport![key]}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-[13px] text-[#6B6860] text-center" style={{ fontWeight: 300 }}>
          {t('destinationDetail.guide.transferNote')}
        </p>
      </div>
    </section>
  );
}

/* ── 8. EAT, DRINK, EXPERIENCE ────────────────────────────────────────── */

interface EatDrinkExperienceProps {
  destination: Destination;
  /** Optional dynamic adventures pulled from products.json. */
  adventures?: Product[];
  onAddToItinerary?: (product: Product) => void;
}

export function EatDrinkExperience({
  destination: d,
  adventures = [],
  onAddToItinerary,
}: EatDrinkExperienceProps) {
  const { t } = useTranslation();
  const hasRestaurants = (d.restaurants?.length ?? 0) > 0;
  const hasSpecialties = (d.specialties?.length ?? 0) > 0;
  const hasExperiences = (d.experiences?.length ?? 0) > 0;
  if (!hasRestaurants && !hasSpecialties && !hasExperiences && adventures.length === 0)
    return null;
  return (
    <section className="section-padding bg-white">
      <div className="container max-w-6xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationDetail.guide.eatDrinkTitle')}</h2>
        <p
          className="body-lg text-[#3A3A35] mb-10 max-w-3xl leading-relaxed"
          style={{ fontWeight: 300 }}
        >
          {d.eatDrinkIntro ?? t('destinationDetail.guide.eatDrinkIntroFallback')}
        </p>

        {hasRestaurants && (
          <div className="mb-12">
            <h3
              className="text-[17px] font-medium text-[#1A1A18] mb-5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t('destinationDetail.guide.whereToEat')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {d.restaurants!.map(r => (
                <div key={r.name} className="bg-[#FAFAF7] border border-[#E8E4DC] p-5">
                  {r.category && (
                    <span className="text-[11px] font-medium tracking-[0.04em] text-[#9E9A90] mb-2 block uppercase">
                      {r.category}
                    </span>
                  )}
                  <h4
                    className="text-[15px] font-medium text-[#1A1A18] mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {r.name}
                  </h4>
                  <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                    {r.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasSpecialties && (
          <div className="mb-12">
            <h3
              className="text-[17px] font-medium text-[#1A1A18] mb-5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t('destinationDetail.guide.localSpecialties')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {d.specialties!.map(s => (
                <div key={s.name} className="border-l-2 border-[#8B7355] pl-5 py-2">
                  {s.category && (
                    <span className="text-[11px] font-medium tracking-[0.04em] text-[#9E9A90] mb-1.5 block uppercase">
                      {s.category}
                    </span>
                  )}
                  <h4
                    className="text-[15px] font-medium text-[#1A1A18] mb-1.5"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {s.name}
                  </h4>
                  <p className="text-[13px] text-[#3A3A35] leading-relaxed" style={{ fontWeight: 300 }}>
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasExperiences && (
          <div>
            <h3
              className="text-[17px] font-medium text-[#1A1A18] mb-3"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t('destinationDetail.guide.whatToDo')}
            </h3>
            {d.experiencesIntro && (
              <p
                className="text-[14px] text-[#3A3A35] mb-6 max-w-3xl leading-relaxed"
                style={{ fontWeight: 300 }}
              >
                {d.experiencesIntro}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {d.experiences!.map(e => (
                <div key={e.name} className="bg-[#FAFAF7] border border-[#E8E4DC] p-5">
                  <h4
                    className="text-[15px] font-medium text-[#1A1A18] mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {e.name}
                  </h4>
                  <p
                    className="text-[13px] text-[#6B6860] leading-relaxed mb-3"
                    style={{ fontWeight: 300 }}
                  >
                    {e.description}
                  </p>
                  {(e.duration || e.season) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8B7355] tracking-[0.02em]">
                      {e.duration && <span>{e.duration}</span>}
                      {e.season && <span>· {e.season}</span>}
                    </div>
                  )}
                  <p className="mt-3 text-[12px] text-[#8B7355] italic" style={{ fontWeight: 300 }}>
                    {t('destinationDetail.guide.conciergeArrange')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {adventures.length > 0 && (
          <div className="mt-12">
            <h3
              className="text-[17px] font-medium text-[#1A1A18] mb-5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t('destinationDetail.guide.bookOnline')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adventures.map(adv => (
                <div key={adv.id} className="group">
                  <div
                    className="relative overflow-hidden bg-[#E8E4DC] mb-3"
                    style={{ aspectRatio: '3/2' }}
                  >
                    {adv.image ? (
                      <img
                        src={adv.image}
                        alt={`${adv.name} — outdoor experience in ${d.name}, Portugal`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                        width={800}
                        height={600}
                      />
                    ) : (
                      <div className="w-full h-full placeholder-image" />
                    )}
                  </div>
                  <h4
                    className="text-[15px] font-medium text-[#1A1A18] mb-1"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {adv.name}
                  </h4>
                  <p
                    className="text-[13px] text-[#6B6860] mb-2 leading-relaxed line-clamp-2"
                    style={{ fontWeight: 300 }}
                  >
                    {adv.description}
                  </p>
                  <div className="flex items-center justify-between">
                    {(adv.priceFrom ?? 0) > 0 && (
                      <p className="text-[13px] text-[#8B7355]">
                        from {formatEurEditorial(adv.priceFrom ?? 0)}
                      </p>
                    )}
                    {onAddToItinerary && (
                      <button
                        onClick={() => onAddToItinerary(adv)}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                        style={{ minHeight: 'auto', minWidth: 'auto' }}
                      >
                        <Plus className="w-3.5 h-3.5" /> {t('destinationDetail.guide.addToItinerary')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── 9. EVENTS WORTH PLANNING AROUND (added in Cowork editorial pass) ── */

export function EventsAndPlanning({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  if (!d.events || d.events.length === 0) return null;
  return (
    <section className="section-padding bg-[#FAFAF7]">
      <div className="container max-w-5xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationDetail.guide.eventsTitle')}</h2>
        {d.eventsIntro && (
          <p
            className="body-lg text-[#3A3A35] mb-10 max-w-3xl leading-relaxed"
            style={{ fontWeight: 300 }}
          >
            {d.eventsIntro}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {d.events.map(ev => (
            <div
              key={ev.name}
              className="flex items-start gap-4 p-5 bg-white border border-[#E8E4DC]"
            >
              <Calendar className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3
                  className="text-[15px] font-medium text-[#1A1A18] mb-1"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {ev.url ? (
                    <a href={ev.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#8B7355]">
                      {ev.name}
                    </a>
                  ) : (
                    ev.name
                  )}
                </h3>
                <p className="text-[11px] font-medium tracking-[0.04em] uppercase text-[#8B7355] mb-2">
                  {ev.dates}
                </p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {ev.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 10. PRESS & ACCOLADES ────────────────────────────────────────────── */

export function PressAccolades({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  if (!d.pressQuotes || d.pressQuotes.length === 0) return null;
  return (
    <section className="py-16 bg-[#1A1A18] text-white">
      <div className="container max-w-5xl mx-auto">
        <h2 className="text-[11px] font-medium tracking-[0.14em] uppercase text-white/60 mb-3 text-center">
          {t('destinationDetail.guide.pressTitle')}
        </h2>
        {d.pressIntro && (
          <p
            className="text-[13px] text-white/70 max-w-2xl mx-auto mb-10 text-center leading-relaxed"
            style={{ fontWeight: 300 }}
          >
            {d.pressIntro}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {d.pressQuotes.map((q, i) => (
            <blockquote key={`${q.source}-${i}`} className="text-center">
              <p
                className="text-white/90 italic mb-3 leading-relaxed"
                style={{ fontFamily: 'var(--font-display)', fontSize: '17px' }}
              >
                “{q.quote}”
              </p>
              <footer className="text-[11px] tracking-[0.08em] uppercase text-white/50">
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
      </div>
    </section>
  );
}

/* ── 11. FAQ SECTION (FAQPage schema is emitted by DestinationPage) ──── */

export function FAQSection({ destination: d }: { destination: Destination }) {
  const { t } = useTranslation();
  if (!d.faqs || d.faqs.length === 0) return null;
  return (
    <section className="section-padding bg-white">
      <div className="container max-w-3xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-8">{t('destinationDetail.guide.faqsTitle')}</h2>
        <dl className="space-y-6">
          {d.faqs.map((f, i) => (
            <div key={i} className="border-b border-[#E8E4DC] pb-6 last:border-b-0">
              <dt
                className="text-[16px] font-medium text-[#1A1A18] mb-3"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {f.question}
              </dt>
              <dd className="text-[14px] text-[#3A3A35] leading-relaxed" style={{ fontWeight: 300 }}>
                {f.answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ── 12. RELATED DESTINATIONS + OWNERS CTA (DUAL FUNNEL) ──────────────── */

interface RelatedDestinationsAndOwnersCTAProps {
  destination: Destination;
  related: Destination[];
}

export function RelatedDestinationsAndOwnersCTA({
  destination: d,
  related,
}: RelatedDestinationsAndOwnersCTAProps) {
  const { t } = useTranslation();
  const owners = d.ownersCTA ?? {
    headline: t('destinationDetail.guide.ownersHeadline', { name: d.name }),
    body: t('destinationDetail.guide.ownersBody'),
    cta: t('destinationDetail.guide.ownersCta'),
  };
  // Per-destination override takes priority; default builds a UTM-tagged
  // link so booking-vs-owner attribution stays clean in Pipedrive.
  const ownersUrl =
    owners.url ??
    `https://management.portugalactive.com/?utm_source=destinations&utm_medium=banner&utm_campaign=${encodeURIComponent(d.slug)}`;

  return (
    <>
      {related.length > 0 && (
        <section className="section-padding bg-[#FAFAF7]">
          <div className="container max-w-5xl mx-auto">
            <h2 className="headline-lg text-[#1A1A18] mb-8">{t('destinationDetail.guide.relatedTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 placeholder-image" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <h3 className="text-white text-[18px] font-medium" style={{ fontFamily: 'var(--font-display)' }}>
                      {r.name}
                    </h3>
                    {r.tagline && (
                      <p className="text-[12px] text-white/70 line-clamp-2" style={{ fontWeight: 300 }}>
                        {r.tagline}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 bg-[#0B4541] text-white">
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-white/60 mb-3">
                For travellers
              </p>
              <h3
                className="text-[22px] font-medium text-white mb-3"
                style={{ fontFamily: 'var(--font-display)', lineHeight: 1.25 }}
              >
                Plan your stay in {d.name}
              </h3>
              <p className="text-[14px] text-white/80 mb-5 leading-relaxed" style={{ fontWeight: 300 }}>
                See every home we operate in {d.name} — with concierge, daily housekeeping,
                and private chef on call.
              </p>
              <Link
                href={`/homes?destination=${d.region}`}
                className="inline-flex items-center gap-2 text-[13px] font-medium text-white border-b border-white/40 pb-1 hover:border-white transition-colors"
              >
                See all villas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="md:border-l md:border-white/15 md:pl-10">
              <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-white/60 mb-3">
                For owners
              </p>
              <h3
                className="text-[22px] font-medium text-white mb-3"
                style={{ fontFamily: 'var(--font-display)', lineHeight: 1.25 }}
              >
                {owners.headline}
              </h3>
              <p className="text-[14px] text-white/80 mb-5 leading-relaxed" style={{ fontWeight: 300 }}>
                {owners.body}
              </p>
              <a
                href={ownersUrl}
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-white border-b border-white/40 pb-1 hover:border-white transition-colors"
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

/* ── Schema graph builder ─────────────────────────────────────────────── */

/** Build the @graph for a destination page: TouristDestination + Article +
 *  FAQPage (when faqs present) + BreadcrumbList + Event nodes when events
 *  are populated. Returned as a flat array so it can be passed directly
 *  to <StructuredData data={...} /> which wraps it in a single @context
 *  root. */
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

  // Event nodes — surfaced separately rather than under @graph[0] because
  // Google reads top-level Event schema for the events knowledge panel.
  if (d.events && d.events.length > 0) {
    for (const ev of d.events) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.name,
        description: ev.description,
        ...(ev.url && { url: ev.url }),
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

// Silence unused-import warnings when Trans is bundled but unused per call
// site. Trans is exported by react-i18next and may be used by future
// editorial additions to the legacy "services" section.
export const __ssrSilence = { Trans };
