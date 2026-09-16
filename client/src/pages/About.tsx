/* ==========================================================================
   ABOUT — V3.0 Lean rewrite
   5 sections: Hero, Origin Story, Social Proof, Team, Final CTA
   ========================================================================== */

import { useRef } from 'react';
import { HOME_COUNT_LABEL, CHECKLIST_POINTS } from '@shared/brandFacts';
import { ChevronLeft, ChevronRight, ArrowRight, Play } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import EditorialHero from '@/components/marketing/EditorialHero';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import {
  StructuredData,
  buildBreadcrumbSchema,
  buildPersonSchema,
} from '@/components/seo/StructuredData';

/* ── Team data ─────────────────────────────────────────────────────────── */
const TEAM = [
  {
    id: 'rv',
    name: 'Ricardo Viana',
    role: 'CEO & Founder',
    photo: '/team/ricardo-viana.webp',
    oneLiner: 'From adventure tourism to private hotels. Built PA on the coast he grew up on.',
  },
  {
    id: 'db',
    name: 'Diogo Boissel',
    role: 'Head of Staff',
    photo: '/team/diogoboissel.webp',
    oneLiner: 'Manages the in-house team across all regions.',
  },
  {
    id: 'sq',
    name: 'Susana Queirós',
    role: 'Head of Field Operations',
    photo: '/team/susana-queiros.webp',
    oneLiner: 'Runs the daily operations that guests never see but always feel.',
  },
  {
    id: 'tm',
    name: 'Tomás Matos',
    role: 'Manager of Field Operations',
    photo: '/team/tomas-matos.webp',
    oneLiner: 'On the ground, every day, in every property.',
  },
  {
    id: 'jd',
    name: 'João Dinis',
    role: 'Head of Reservations',
    photo: '/team/joao-dinis.webp',
    oneLiner: 'Your first point of contact. Knows every property personally.',
  },
  {
    id: 'jf',
    name: 'Joana Ferreira',
    role: 'Concierge Manager',
    photo: '/team/joana-ferreira.webp',
    oneLiner: 'The person who finds the restaurant before it makes the guide.',
  },
  {
    id: 'dl',
    name: 'Daniel Lima',
    role: 'B2B Sales Manager',
    photo: '/team/daniel-lima.webp',
    oneLiner: '',
  },
  {
    id: 'tf',
    name: 'Teresa Ferrador',
    role: 'HR & Office Manager',
    photo: '/team/teresa-ferrador.webp',
    oneLiner: '',
  },
  {
    id: 'er',
    name: 'Emanuel R.',
    role: 'Executive Assistant',
    photo: '/team/emanuel-riboira.webp',
    oneLiner: '',
  },
  {
    id: 'jp',
    name: 'João Porto',
    role: 'Customer Support Specialist',
    photo: '',
    oneLiner: '',
  },
  {
    id: 'sr',
    name: 'Samuel Rodrigues',
    role: 'Customer Support Specialist',
    photo: '',
    oneLiner: '',
  },
  {
    id: 'bm',
    name: 'Bruno Monteiro',
    role: 'Finance Manager',
    photo: '',
    oneLiner: '',
  },
];

/* ── Brand facts ───────────────────────────────────────────────────────────
   The home count comes from shared/brandFacts.ts (derived from the data at
   build time), so the hero, story, answer capsule and metadata can never
   drift from the rest of the site again. */
const HOME_COUNT = HOME_COUNT_LABEL;
const YOUTUBE_ID = 'OUgTpL2E15U'; // PA Cleaning — the preparation checklist

/* Press — real outlet logos, same treatment as the homepage press bar
   (grayscale-ish PNGs at opacity-40, per-logo heights). */
const PRESS_LOGOS = [
  { src: IMAGES.pressForbes, alt: 'Featured in Forbes', h: 'h-5 md:h-6' },
  { src: IMAGES.pressTheTimes, alt: 'Featured in The Times', h: 'h-7 md:h-8' },
  { src: IMAGES.pressTheGuardian, alt: 'Featured in The Guardian', h: 'h-4 md:h-5' },
  { src: IMAGES.pressTimeOut, alt: 'Featured in Time Out', h: 'h-5 md:h-6' },
  { src: IMAGES.pressMensHealth, alt: "Featured in Men's Health", h: 'h-4 md:h-5' },
  { src: IMAGES.pressArquitectura, alt: 'Featured in Arquitectura y Diseño', h: 'h-4 md:h-5' },
];


export default function About() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('nav.about') + ' Portugal Active',
    description: t('about.heroSubtitle', { count: HOME_COUNT }),
    url: '/about',
  });

  const aboutGraph = [
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'About' },
    ]),
    buildPersonSchema({
      name: 'Ricardo Viana',
      jobTitle: 'CEO & Founder',
      description:
        `Founder and CEO of Portugal Active. Built the company from his home town of Viana do Castelo, starting in adventure tourism and scaling to ${HOME_COUNT} operated private homes across Portugal.`,
      image: 'https://www.portugalactive.com/team/ricardo-viana.webp',
      url: 'https://www.portugalactive.com/about#ricardo-viana',
      sameAs: [
        'https://www.linkedin.com/in/ricardo-viana-portugalactive/',
      ],
    }),
  ];

  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  const STATS = [
    { value: '2017', label: t('about.statFounded', 'Founded') },
    { value: `${HOME_COUNT}`, label: t('about.statHomes', 'Private hotels') },
    { value: '5', label: t('about.statRegions', 'Regions') },
    { value: '24/7', label: t('about.statConcierge', 'Concierge') },
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <StructuredData id="about-graph" data={aboutGraph} />
      <Header />

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1: HERO
          ═══════════════════════════════════════════════════════════════════ */}
      <EditorialHero image={IMAGES.aboutHero} mobileImage={IMAGES.aboutHeroMobile}
        alt={t('about.heroAlt')} eyebrow={t('about.heroOverline')} title={t('about.heroTitle')}
        description={t('about.heroSubtitle', { count: HOME_COUNT })}>
        <Link href="/homes" className="btn-white">{t('siteUx.findStay')} <ArrowRight className="h-4 w-4" /></Link>
        <a href="#our-story" className="hero-text-link">{t('about.storyOverline')} <ArrowRight className="h-4 w-4" /></a>
      </EditorialHero>
      <section className="editorial-proof" aria-label={t('about.valuesOverline')}>
        <div className="container grid md:grid-cols-3">
          {[['standard2Title', 'standard2Body'], ['standard4Title', 'standard4Body'], ['standard5Title', 'standard5Body']].map(([title, body], index) => (
            <div className="editorial-proof-item" key={title}>
              <span className="editorial-eyebrow text-pa-gold">0{index + 1}</span>
              <h2 className="font-display text-2xl mb-3">{t(`about.${title}`, { points: CHECKLIST_POINTS })}</h2>
              <p className="body-md">{t(`about.${body}`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2: OUR STORY (condensed)
          Two-column: text left, sticky photo right + press strip
          ═══════════════════════════════════════════════════════════════════ */}
      <section id="our-story" className="section-padding scroll-mt-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="lg:flex lg:gap-16" id="ricardo-viana">
            {/* Text column */}
            <div className="lg:w-[55%]">
              <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                {t('about.storyOverline')}
              </p>
              <h2
                className="text-[#1A1A18] mb-8"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                {t('about.storyTitle')}
              </h2>

              {[
                t('about.storyP1'),
                t('about.storyP2', { points: CHECKLIST_POINTS }),
                t('about.storyP3', { count: HOME_COUNT }),
              ].map((para, i) => (
                <p
                  key={i}
                  className="text-[#6B6860] mb-5"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
                >
                  {para}
                </p>
              ))}
            </div>

            {/* Sticky image column */}
            <div className="hidden lg:block lg:w-[45%]">
              <div className="sticky top-[120px]">
                <div className="overflow-hidden rounded-xl" style={{ aspectRatio: '3/4' }}>
                  <img
                    src="/team/ricardo-viana.webp"
                    alt="Ricardo Viana, CEO and Founder of Portugal Active"
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <p className="text-[13px] text-[#726D63] mt-3" style={{ fontFamily: 'var(--font-body)' }}>
                  {t('about.founderCaption')}
                </p>
              </div>
            </div>
          </div>

          {/* Mobile: Ricardo photo */}
          <div className="lg:hidden mt-8 mb-8">
            <div className="overflow-hidden rounded-xl" style={{ aspectRatio: '4/3', maxWidth: '360px' }}>
              <img
                src="/team/ricardo-viana.webp"
                alt="Ricardo Viana, CEO and Founder of Portugal Active"
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
            </div>
            <p className="text-[13px] text-[#726D63] mt-3" style={{ fontFamily: 'var(--font-body)' }}>
              {t('about.founderCaption')}
            </p>
          </div>

        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          STATS + PRESS — quiet credibility band. Gives visual weight to the
          numbers the story only mentions in prose, plus the press the brand
          earned. Restrained: hairline-separated figures, wordmark press strip.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#F5F1EB] py-14 lg:py-16 border-y border-[#E8E4DC]">
        <div className="container max-w-[1200px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6 divide-x divide-[#E1DACE]">
            {STATS.map((s, i) => (
              <div key={i} className="text-center px-2">
                <p
                  className="text-[#1A1A18]"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px, 4vw, 44px)', lineHeight: 1 }}
                >
                  {s.value}
                </p>
                <p className="mt-2 text-[11px] tracking-[0.18em] uppercase text-[#8B7355]" style={{ fontFamily: 'var(--font-body)' }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-10 border-t border-[#E1DACE]">
            <p className="text-center text-[10px] tracking-[0.22em] uppercase text-[#726D63] mb-7" style={{ fontFamily: 'var(--font-body)' }}>
              {t('about.pressOverline', 'As featured in')}
            </p>
            {/* Mobile: marquee scroll (same as homepage press bar) */}
            <div className="overflow-hidden md:hidden">
              <div className="flex items-center gap-12 w-max" style={{ animation: 'marquee 25s linear infinite' }}>
                {[...PRESS_LOGOS, ...PRESS_LOGOS].map((logo, i) => (
                  <img key={i} src={logo.src} alt={logo.alt} className={`${logo.h} w-auto object-contain opacity-40 shrink-0`} loading="lazy" />
                ))}
              </div>
            </div>
            {/* Desktop: static, centred */}
            <div className="hidden md:flex items-center justify-center gap-10 lg:gap-14">
              {PRESS_LOGOS.map((logo, i) => (
                <img key={i} src={logo.src} alt={logo.alt} className={`${logo.h} w-auto object-contain opacity-40`} loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BEHIND THE SCENES — Operational proof: PA Cleaning video
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="container max-w-[1200px] mx-auto">
          <div className="lg:flex lg:items-center lg:gap-16">
            {/* Video */}
            <div className="lg:w-[55%] mb-10 lg:mb-0">
              <a
                href={`https://www.youtube.com/watch?v=${YOUTUBE_ID}`}
                target="_blank" rel="noopener noreferrer"
                aria-label={t('about.behindScenesWatch', 'Watch the film')}
                className="group relative block aspect-video w-full rounded-xl overflow-hidden bg-[#1A1A18]"
              >
                <img
                  src={`https://img.youtube.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
                  loading="lazy"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="grid place-items-center w-16 h-16 rounded-full bg-white/95 text-[#1A1A18] shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <Play size={22} className="ml-0.5 fill-current" />
                  </span>
                </span>
                <span className="absolute bottom-4 left-4 text-white text-[11px] tracking-[0.12em] uppercase font-medium">
                  {t('about.behindScenesWatch', 'Watch the film')}
                </span>
              </a>
            </div>
            {/* Copy */}
            <div className="lg:w-[45%]">
              <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                {t('about.behindScenesOverline', 'BEHIND THE SCENES')}
              </p>
              <h2
                className="text-[#1A1A18] mb-5"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                {t('about.behindScenesTitle', { points: CHECKLIST_POINTS, defaultValue: 'The {{points}}-point checklist' })}
              </h2>
              <p
                className="text-[#6B6860] mb-5"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
              >
                {t('about.behindScenesP1', { points: CHECKLIST_POINTS, defaultValue: 'Before every guest arrives, our in-house team runs a {{points}}-point preparation checklist. Linens pressed, amenities restocked, every surface inspected. This is what hotel-grade service looks like when applied to a private home.' })}
              </p>
              <p
                className="text-[#6B6860]"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
              >
                {t('about.behindScenesP2', 'No third-party cleaning crews. No shortcuts. Our team manages every property personally, so the standard never slips.')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3: SOCIAL PROOF
          Dark band — guest quote only (press logos already above)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-[#FDFBF7]">
        <div className="container max-w-[760px] mx-auto text-center">
          <span className="mx-auto block h-px w-10 bg-[#C9A876]/70 mb-8" />
          <blockquote
            className="text-[#2A2722]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(22px, 3.4vw, 30px)', lineHeight: 1.45 }}
          >
            &ldquo;{t('about.socialProofQuote')}&rdquo;
          </blockquote>
          <p
            className="text-[#726D63] mt-6 text-[12px] tracking-[0.14em] uppercase"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}
          >
            {t('about.socialProofAttribution')}
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4: THE TEAM
          Horizontal scroll carousel
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2
                className="text-[#1A1A18] mb-3"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                {t('about.teamTitle')}
              </h2>
              <p
                className="max-w-2xl text-[#6B6860]"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
              >
                {t('about.teamBody')}
              </p>
            </div>
            <div className="hidden md:flex gap-2 shrink-0 ml-8">
              <button
                onClick={() => scroll('left')}
                className="pa-action w-11 h-11 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="pa-action w-11 h-11 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0 snap-x snap-mandatory"
          >
            {TEAM.map(member => {
              const initials = member.name
                .split(' ')
                .map(w => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <div key={member.id} className="group flex-shrink-0 w-[260px] snap-start cursor-default">
                  <div className="relative overflow-hidden rounded-xl mb-4" style={{ aspectRatio: '3/4' }}>
                    {member.photo ? (
                      <>
                        <img
                          src={member.photo}
                          alt={member.name}
                          className="w-full h-full object-cover object-top grayscale transition-all duration-700 ease-out group-hover:grayscale-0 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-[#8B7355]/10 mix-blend-multiply transition-opacity duration-700 group-hover:opacity-0 pointer-events-none" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#F0ECE4] to-[#E8E0D4] flex items-center justify-center">
                        <span className="font-display text-[3.5rem] text-[#8B7355]/30 select-none tracking-wide">{initials}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-[15px] font-display text-[#1A1A18] mb-0.5 tracking-wide">{member.name}</h3>
                    <p className="text-[12px] text-[#8B7355] tracking-wider uppercase">{member.role}</p>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ANSWER CAPSULE — citable founder/company summary. Kept for AEO (it
          stays in the DOM with role=doc-abstract + cites) but moved down here
          and rendered small, so it reads as a quiet footnote rather than a
          headline beat right under the hero. */}


      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5: FINAL CTA
          Dark band, two buttons
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-20 lg:py-24 bg-[#1A1A18] overflow-hidden">
        <img
          src={IMAGES.aboutStory}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none"
          aria-hidden="true" loading="lazy"
        />
        <div className="relative container max-w-[640px] mx-auto text-center z-10">
          <h2
            className="text-white mb-10"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.2 }}
          >
            {t('about.ctaTitle')}
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/homes"
              className="btn-white"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('about.ctaExplore')} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/concierge"
              className="btn-ghost-light"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('about.ctaContact')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
