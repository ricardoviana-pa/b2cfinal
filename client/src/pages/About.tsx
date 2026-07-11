/* ==========================================================================
   ABOUT — V3.0 Lean rewrite
   5 sections: Hero, Origin Story, Social Proof, Team, Final CTA
   ========================================================================== */

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ArrowRight, Play, X } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import {
  StructuredData,
  buildBreadcrumbSchema,
  buildPersonSchema,
} from '@/components/seo/StructuredData';
import AnswerCapsule from '@/components/seo/AnswerCapsule';

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
   Single source of truth for the home count so the hero, story, answer
   capsule and metadata never drift apart (they previously read 50 / 60+ /
   sixty). Bump this one number when the portfolio grows. */
const HOME_COUNT = 70;
const YOUTUBE_ID = 'OUgTpL2E15U'; // PA Cleaning — 147-point preparation

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
    title: 'About Portugal Active | Private Hotels in Portugal Since 2017',
    description: `From adventure tourism in Viana do Castelo to ${HOME_COUNT} operated homes across Portugal. How Portugal Active transforms private homes into private hotels. Featured in Forbes.`,
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

  // Behind-the-scenes video — opens in a clean modal so the page itself never
  // shows YouTube chrome (play badge, channel avatar, "Watch on YouTube").
  const [videoOpen, setVideoOpen] = useState(false);
  useEffect(() => {
    if (!videoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setVideoOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [videoOpen]);

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
      <section className="relative h-[62vh] min-h-[460px] flex items-center overflow-hidden">
        <picture className="absolute inset-0 w-full h-full">
          {/* Portrait crop on phones keeps both team members in frame */}
          <source media="(max-width: 767px)" srcSet={IMAGES.aboutHeroMobile} />
          <img
            src={IMAGES.aboutHero}
            alt="Portugal Active housekeeping team preparing a luxury private villa"
            className="absolute inset-0 w-full h-full object-cover"
            width={1600} height={1067}
            fetchPriority="high"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-transparent" />
        <div className="relative container z-10 max-w-[1200px] mx-auto">
          <p className="text-[13px] font-medium uppercase tracking-[2px] text-white/70 mb-5" style={{ fontFamily: 'var(--font-body)' }}>
            {t('about.heroOverline')}
          </p>
          <h1
            className="text-white leading-[1.15] mb-5 max-w-[600px]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(32px, 5vw, 48px)' }}
          >
            {t('about.heroTitle')}
          </h1>
          <p
            className="text-white/85 max-w-[480px]"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'clamp(15px, 2vw, 17px)', lineHeight: 1.6 }}
          >
            {t('about.heroSubtitle', { count: HOME_COUNT })}
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2: OUR STORY (condensed)
          Two-column: text left, sticky photo right + press strip
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="lg:flex lg:gap-16">
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
                t('about.storyP2'),
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
                <div className="overflow-hidden" style={{ aspectRatio: '3/4' }}>
                  <img
                    src="/team/ricardo-viana.webp"
                    alt="Ricardo Viana, CEO and Founder of Portugal Active"
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <p className="text-[13px] text-[#9E9A90] mt-3" style={{ fontFamily: 'var(--font-body)' }}>
                  {t('about.founderCaption')}
                </p>
              </div>
            </div>
          </div>

          {/* Mobile: Ricardo photo */}
          <div className="lg:hidden mt-8 mb-8">
            <div className="overflow-hidden" style={{ aspectRatio: '3/4', maxWidth: '360px' }}>
              <img
                src="/team/ricardo-viana.webp"
                alt="Ricardo Viana, CEO and Founder of Portugal Active"
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
            </div>
            <p className="text-[13px] text-[#9E9A90] mt-3" style={{ fontFamily: 'var(--font-body)' }}>
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
            <p className="text-center text-[10px] tracking-[0.22em] uppercase text-[#9E9A90] mb-7" style={{ fontFamily: 'var(--font-body)' }}>
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
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                aria-label={t('about.behindScenesWatch', 'Watch the film')}
                className="group relative block aspect-video w-full rounded-sm overflow-hidden bg-[#1A1A18]"
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
              </button>
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
                {t('about.behindScenesTitle', 'The 147-point checklist')}
              </h2>
              <p
                className="text-[#6B6860] mb-5"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
              >
                {t('about.behindScenesP1', 'Before every guest arrives, our in-house team runs a 147-point preparation checklist. Linens pressed, amenities restocked, every surface inspected. This is what hotel-grade service looks like when applied to a private home.')}
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
            className="text-[#9E9A90] mt-6 text-[12px] tracking-[0.14em] uppercase"
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
                className="w-10 h-10 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-10 h-10 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
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
                  <div className="relative overflow-hidden mb-4" style={{ aspectRatio: '3/4' }}>
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
                    <h4 className="text-[15px] font-display text-[#1A1A18] mb-0.5 tracking-wide">{member.name}</h4>
                    <p className="text-[12px] text-[#8B7355] tracking-wider uppercase">{member.role}</p>
                    {member.oneLiner && (
                      <p
                        className="text-[#9E9A90] mt-1"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', lineHeight: 1.4 }}
                      >
                        {member.oneLiner}
                      </p>
                    )}
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
      <section className="bg-[#FDFBF7] pt-4 pb-16 lg:pb-20">
        <div className="container max-w-2xl">
          <div className="scale-[0.92] origin-top opacity-90">
            <AnswerCapsule
              question="Who runs Portugal Active and what do they do?"
              answer={`Portugal Active was founded in 2017 by Ricardo Viana in Viana do Castelo, Minho. The company operates ${HOME_COUNT} private hotels across Portugal, each managed to five-star standards with a dedicated concierge, private chefs, housekeeping, and curated local experiences. Every property is run by an in-house team, not through third-party intermediaries. Guests book direct for the best rate and a fully managed stay.`}
              lastUpdated="2026-04-17"
              author="Ricardo Viana, CEO"
              cite={[
                { label: 'Founder on LinkedIn', href: 'https://www.linkedin.com/in/ricardo-viana-portugalactive/' },
                { label: 'Concierge services', href: '/concierge' },
                { label: 'Contact the team', href: '/contact' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5: FINAL CTA
          Dark band, two buttons
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-20 lg:py-24 bg-[#1A1A18] overflow-hidden">
        <img
          src={IMAGES.aboutStory}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none"
          aria-hidden="true"
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
              className="inline-flex items-center justify-center gap-2 bg-white text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#F5F1EB] transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('about.ctaExplore')} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 border border-white/40 text-white text-[12px] font-medium px-8 py-4 hover:border-white hover:bg-white/10 transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('about.ctaContact')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Behind-the-scenes video — clean modal (no inline YouTube chrome) */}
      {videoOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={() => setVideoOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Portugal Active — behind the scenes"
        >
          <button
            type="button"
            onClick={() => setVideoOpen(false)}
            aria-label={t('common.close', 'Close')}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>
          <div className="w-full max-w-4xl aspect-video" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1`}
              title="PA Cleaning — 147-point property preparation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full rounded-sm bg-black"
            />
          </div>
        </div>,
        document.body,
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
