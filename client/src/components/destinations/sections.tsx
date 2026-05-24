/* ==========================================================================
   DESTINATION — 11-SECTION TEMPLATE COMPONENTS
   ========================================================================

   Implements the 11 sections defined in `portugal_active_destinations_strategy.md`
   (May 2026, hub-and-spoke editorial). Each component renders its own slice
   of the Destination object and returns null when its data is missing — so
   the Viana pilot shows all eleven, while scaffolded spokes display only
   what has been written.

   The template is meant to read like Aman Journal / Six Senses Stories /
   Mr & Mrs Smith — editorial first, conversion second. Section 11 carries
   the dual funnel (guest CTA + owners CTA) per strategy doc §7.
   ========================================================================== */

import { Link } from 'wouter';
import { useTranslation, Trans } from 'react-i18next';
import { ArrowRight, Plane, Train, Car, Globe, Plus } from 'lucide-react';
import type { Destination, Property, Product } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import PropertyCard from '@/components/property/PropertyCard';

/* ── 1. HERO EDITORIAL ────────────────────────────────────────────────── */

interface HeroEditorialProps {
  destination: Destination;
}

export function HeroEditorial({ destination: d }: HeroEditorialProps) {
  const { t } = useTranslation();
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
        {d.pullQuote && (
          <blockquote className="mt-6 pl-4 border-l-2 border-white/40 max-w-xl">
            <p
              className="text-white/90 italic"
              style={{ fontFamily: 'var(--font-display)', fontSize: '17px', lineHeight: 1.45 }}
            >
              “{d.pullQuote.text}”
            </p>
            <footer className="text-[12px] text-white/60 mt-2 tracking-[0.04em]">
              — {d.pullQuote.source}
            </footer>
          </blockquote>
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
        <div className="flex items-end justify-between mb-8">
          <h2 className="headline-lg text-[#1A1A18]">
            {t('destinationDetail.homesIn', { name: d.name })}
          </h2>
          <a
            href="/homes"
            className="hidden md:flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors"
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
  return (
    <section className="section-padding bg-[#FAFAF7]">
      <div className="container">
        <h2 className="headline-lg text-[#1A1A18] mb-3">
          From the journal — stories from {d.name}
        </h2>
        <p className="body-lg text-[#6B6860] mb-8">
          Editorial dispatches from our concierge team and the writers we publish.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.slice(0, 6).map(a => (
            <Link
              key={a.slug}
              href={`/blog/${a.slug}`}
              className="group block"
            >
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
  if (!d.thingsToDo || d.thingsToDo.length === 0) {
    // Fall back to legacy insider recommendations if present
    if (d.insiderRecommendations && d.insiderRecommendations.length > 0) {
      return (
        <section className="section-padding bg-[#F5F1EB]">
          <div className="container">
            <h2 className="headline-lg text-[#1A1A18] mb-3">What to see and do</h2>
            <p className="body-lg text-[#6B6860] mb-8">Our concierge picks in {d.name}.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {d.insiderRecommendations.map((rec, i) => (
                <div key={i} className="bg-white border border-[#E8E4DC] p-6">
                  <span className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90] mb-2 block">
                    {rec.category.replace('-', ' ')}
                  </span>
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
        <h2 className="headline-lg text-[#1A1A18] mb-3">What to see and do in {d.name}</h2>
        <p className="body-lg text-[#6B6860] mb-10 max-w-2xl">
          A curated walk through the places, hills and bays we recommend to our guests — voice
          ours, ranking subjective.
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
                    <span className="text-[11px] font-medium tracking-[0.04em] text-[#9E9A90] mb-2 block uppercase">
                      {item.category}
                    </span>
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

export function WhenToVisit({ destination: d }: { destination: Destination }) {
  if (!d.seasons || d.seasons.length === 0) {
    if (!d.bestTimeToVisit) return null;
    return (
      <section className="py-12 bg-white">
        <div className="container max-w-3xl mx-auto">
          <h2 className="headline-lg text-[#1A1A18] mb-6">When to visit</h2>
          <p className="body-lg">{d.bestTimeToVisit}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="section-padding bg-white">
      <div className="container max-w-5xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-3">When to visit {d.name}</h2>
        {d.bestTimeToVisit && (
          <p className="body-lg text-[#6B6860] mb-10 max-w-2xl">{d.bestTimeToVisit}</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {d.seasons.map(s => (
            <div key={s.label} className="border-l-2 border-[#8B7355] pl-5 py-1">
              <h3
                className="text-[15px] font-medium text-[#1A1A18] mb-2 tracking-[0.02em]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {s.label}
              </h3>
              <p className="text-[14px] text-[#3A3A35] leading-relaxed" style={{ fontWeight: 300 }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 7. HOW TO GET HERE ───────────────────────────────────────────────── */

function transportIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes('air') || l.includes('fly') || l.includes('avi')) return Plane;
  if (l.includes('train') || l.includes('rail')) return Train;
  if (l.includes('car') || l.includes('road') || l.includes('drive')) return Car;
  return Globe;
}

export function HowToGetHere({ destination: d }: { destination: Destination }) {
  if (!d.transport || d.transport.length === 0) {
    if (!d.howToGetHere) return null;
    return (
      <section className="py-12 bg-[#FAFAF7]">
        <div className="container max-w-3xl mx-auto">
          <h2 className="headline-lg text-[#1A1A18] mb-6">Getting to {d.name}</h2>
          <p className="body-lg">{d.howToGetHere}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="section-padding bg-[#FAFAF7]">
      <div className="container max-w-4xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-8">Getting to {d.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {d.transport.map(t => {
            const Icon = transportIcon(t.label);
            return (
              <div
                key={t.label}
                className="flex items-start gap-4 p-5 bg-white border border-[#E8E4DC]"
              >
                <Icon className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-[#1A1A18] mb-1.5">{t.label}</p>
                  <p
                    className="text-[13px] text-[#6B6860] leading-relaxed"
                    style={{ fontWeight: 300 }}
                  >
                    {t.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-[13px] text-[#6B6860] text-center" style={{ fontWeight: 300 }}>
          Our concierge arranges private transfers from any airport or station to your villa.
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
  const hasRestaurants = (d.restaurants?.length ?? 0) > 0;
  const hasExperiences = (d.experiences?.length ?? 0) > 0;
  if (!hasRestaurants && !hasExperiences && adventures.length === 0) return null;
  return (
    <section className="section-padding bg-white">
      <div className="container max-w-6xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-3">Eat, drink, experience</h2>
        <p className="body-lg text-[#6B6860] mb-10 max-w-2xl">
          Restaurants we send our guests to, and experiences our concierge arranges. Not a
          directory — a personal list.
        </p>

        {hasRestaurants && (
          <div className="mb-12">
            <h3
              className="text-[17px] font-medium text-[#1A1A18] mb-5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Where to eat
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {d.restaurants!.map(r => (
                <div key={r.name} className="bg-[#FAFAF7] border border-[#E8E4DC] p-5">
                  <span className="text-[11px] font-medium tracking-[0.04em] text-[#9E9A90] mb-2 block uppercase">
                    {r.category}
                  </span>
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

        {hasExperiences && (
          <div>
            <h3
              className="text-[17px] font-medium text-[#1A1A18] mb-5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              What to do
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {d.experiences!.map(e => (
                <div key={e.name} className="bg-[#FAFAF7] border border-[#E8E4DC] p-5">
                  <span className="text-[11px] font-medium tracking-[0.04em] text-[#9E9A90] mb-2 block uppercase">
                    {e.category}
                  </span>
                  <h4
                    className="text-[15px] font-medium text-[#1A1A18] mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {e.name}
                  </h4>
                  <p className="text-[13px] text-[#6B6860] leading-relaxed mb-2" style={{ fontWeight: 300 }}>
                    {e.description}
                  </p>
                  <p className="text-[12px] text-[#8B7355] italic" style={{ fontWeight: 300 }}>
                    Our concierge can arrange.
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
              Book online
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
                        <Plus className="w-3.5 h-3.5" /> Add to itinerary
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

/* ── 9. PRESS & ACCOLADES ─────────────────────────────────────────────── */

export function PressAccolades({ destination: d }: { destination: Destination }) {
  if (!d.pressQuotes || d.pressQuotes.length === 0) return null;
  return (
    <section className="py-16 bg-[#1A1A18] text-white">
      <div className="container max-w-5xl mx-auto">
        <h2 className="text-[11px] font-medium tracking-[0.14em] uppercase text-white/60 mb-10 text-center">
          Press & recognition
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {d.pressQuotes.map(q => (
            <blockquote key={q.source} className="text-center">
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
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 10. FAQ SECTION (FAQPage schema is emitted separately by DestinationPage) ─ */

export function FAQSection({ destination: d }: { destination: Destination }) {
  if (!d.faqs || d.faqs.length === 0) return null;
  return (
    <section className="section-padding bg-white">
      <div className="container max-w-3xl mx-auto">
        <h2 className="headline-lg text-[#1A1A18] mb-8">Frequently asked questions</h2>
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

/* ── 11. RELATED DESTINATIONS + OWNERS CTA (DUAL FUNNEL) ──────────────── */

interface RelatedDestinationsAndOwnersCTAProps {
  destination: Destination;
  related: Destination[];
}

export function RelatedDestinationsAndOwnersCTA({
  destination: d,
  related,
}: RelatedDestinationsAndOwnersCTAProps) {
  // Owners CTA uses per-destination override when present, otherwise a default
  // that mirrors the strategy doc's §7.2 template.
  const owners = d.ownersCTA ?? {
    headline: `Own a home in ${d.name}?`,
    body: `Portugal Active operates private homes across Portugal end-to-end: marketing, bookings, concierge, maintenance, revenue optimisation. We turn private homes into private hotels.`,
    cta: 'Speak to our team',
  };
  const ownersUrl =
    `https://management.portugalactive.com/?utm_source=destinations&utm_medium=banner&utm_campaign=${encodeURIComponent(d.slug)}`;

  return (
    <>
      {/* Related destinations */}
      {related.length > 0 && (
        <section className="section-padding bg-[#FAFAF7]">
          <div className="container max-w-5xl mx-auto">
            <h2 className="headline-lg text-[#1A1A18] mb-8">Continue exploring</h2>
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

      {/* Dual CTA banner */}
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
                href={`/homes?destination=${d.slug}`}
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
 *  FAQPage (when faqs present) + BreadcrumbList. Returned as a flat array so
 *  it can be passed directly to <StructuredData data={...} /> which wraps it
 *  in a single @context root. */
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

  return graph;
}

// Silence unused-import warnings when Trans is bundled but unused per call
// site. Trans is exported by react-i18next and may be used by future
// editorial additions to the legacy "services" section.
export const __ssrSilence = { Trans };
