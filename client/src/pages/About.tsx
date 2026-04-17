/* ==========================================================================
   ABOUT — V2.0 Complete Rewrite
   10 sections: Hero, Origin, Model, Standard, Social Proof,
   Regions, Values, Team, Owners CTA, Final CTA
   ========================================================================== */

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Bed, Sparkles, Phone, Shield, Gift, UtensilsCrossed } from 'lucide-react';
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

/* ── The Standard — 6 items (icons only, text comes from i18n) ─────────── */
const STANDARD_ICONS = [Bed, Sparkles, UtensilsCrossed, Phone, Shield, Gift];

/* ── Values — 4 items (text comes from i18n) ──────────────────────────── */
const VALUE_COUNT = 4;

/* ── Press logos (same as homepage) ──────────────────────────────────────── */
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
    description: 'From adventure tourism in Viana do Castelo to 50+ operated homes across Portugal. How Portugal Active transforms private homes into private hotels. Featured in Forbes.',
    url: '/about',
  });

  // JSON-LD: breadcrumb + Ricardo Viana Person schema (bundled via @graph).
  // Person is on the About page (not the homepage) because that's where the
  // biography / photo live — Google and LLMs use that context to confirm
  // the founder entity linked from index.html's Organization.
  const aboutGraph = [
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'About' },
    ]),
    buildPersonSchema({
      name: 'Ricardo Viana',
      jobTitle: 'CEO & Founder',
      description:
        'Founder and CEO of Portugal Active. Built the company from his home town of Viana do Castelo, starting in adventure tourism and scaling to 50+ operated private homes across Portugal.',
      image: 'https://www.portugalactive.com/team/ricardo-viana.webp',
      url: 'https://www.portugalactive.com/about#ricardo-viana',
      sameAs: [
        'https://www.linkedin.com/in/ricardo-viana-portugal-active',
      ],
    }),
  ];

  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <StructuredData id="about-graph" data={aboutGraph} />
      <Header />

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1: HERO
          Full-width image, left-aligned text, gradient overlay
          ══════════════════════════════════════════════════════════════════ */}
      <section className="relative h-[70vh] min-h-[440px] lg:min-h-[520px] flex items-center overflow-hidden">
        <img
          src={IMAGES.aboutStory}
          alt="Interior of a luxury private villa managed by Portugal Active"
          className="absolute inset-0 w-full h-full object-cover"
          width={1600} height={900}
          fetchPriority="high"
        />
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
            {t('about.heroSubtitle')}
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2: THE ORIGIN (Our Story)
          Two-column: text left, sticky image right
          ══════════════════════════════════════════════════════════════════ */}
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
                t('about.storyP3'),
                t('about.storyP4'),
                t('about.storyP5'),
                t('about.storyP6'),
                t('about.storyP7'),
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
              Ricardo Viana, Founder. Viana do Castelo.
            </p>
          </div>

          {/* Press logo strip — same logos as homepage */}
          <div className="border-t border-[#E8E4DC] pt-10 mt-4">
            <p
              className="text-center text-[11px] font-medium text-[#9E9A90] mb-8"
              style={{ letterSpacing: '0.14em', fontFamily: 'var(--font-body)' }}
            >
              {t('about.pressOverline')}
</p>
            <div className="flex items-center justify-center gap-10 lg:gap-14 flex-wrap">
              {PRESS_LOGOS.map((logo, i) => (
                <img key={i} src={logo.src} alt={logo.alt} className={`${logo.h} w-auto object-contain opacity-40`} loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3: WHAT WE ACTUALLY DO (The Model)
          Surface background, two-column reversed
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24 bg-[#F5F1EB]">
        <div className="container max-w-[1200px] mx-auto">
          <div className="lg:flex lg:gap-16 lg:items-start">
            {/* Text */}
            <div className="lg:w-[55%]">
              <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                {t('about.modelOverline')}
              </p>
              <h2
                className="text-[#1A1A18] mb-8"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                {t('about.modelTitle')}
              </h2>
              {[
                t('about.modelP1'),
                t('about.modelP2'),
                t('about.modelP3'),
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
            {/* Image */}
            <div className="lg:w-[45%] mt-8 lg:mt-0">
              <div className="overflow-hidden" style={{ aspectRatio: '4/3' }}>
                <img
                  src={IMAGES.aboutStory}
                  alt="Portugal Active team preparing a luxury villa for guest arrival"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4: THE STANDARD (What's Included)
          Icon grid, 3 columns
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="text-center max-w-[600px] mx-auto mb-14">
            <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
              {t('about.standardOverline')}
            </p>
            <h2
              className="text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
            >
              {t('about.standardTitle')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-[960px] mx-auto">
            {STANDARD_ICONS.map((Icon, idx) => {
              const num = idx + 1;
              return (
                <div key={idx}>
                  <Icon size={32} className="text-[#8B7355] mb-4" strokeWidth={1.5} />
                  <h3
                    className="text-[#1A1A18] mb-2"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '15px' }}
                  >
                    {t(`about.standard${num}Title`)}
                  </h3>
                  <p
                    className="text-[#6B6860]"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', lineHeight: 1.6 }}
                  >
                    {t(`about.standard${num}Body`)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 border border-[#1A1A18] text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('about.discoverExperiences')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5: SOCIAL PROOF
          Dark band with press logos + guest quote
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 bg-[#1A1A18]">
        <div className="container max-w-[1200px] mx-auto text-center">
          {/* Press logos — inverted for dark background */}
          <div className="flex items-center justify-center gap-10 lg:gap-14 flex-wrap">
            {PRESS_LOGOS.map((logo, i) => (
              <img key={i} src={logo.src} alt={logo.alt} className={`${logo.h} w-auto object-contain brightness-0 invert opacity-70`} loading="lazy" />
            ))}
          </div>

          {/* Divider */}
          <div className="mx-auto mt-8 mb-8 h-px bg-white/15 max-w-[400px]" />

          {/* Guest quote */}
          <blockquote
            className="text-white max-w-[680px] mx-auto italic"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(18px, 3vw, 22px)', lineHeight: 1.5 }}
          >
            "{t('about.socialProofQuote')}"
          </blockquote>
          <p
            className="text-white/60 mt-4"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px' }}
          >
            {t('about.socialProofAttribution')}
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6: VALUES
          Surface background, 2x2 grid
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24 bg-[#F5F1EB]">
        <div className="container max-w-[1200px] mx-auto">
          <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
            {t('about.valuesOverline')}
          </p>
          <h2
            className="text-[#1A1A18] mb-10"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
          >
            {t('about.valuesTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: VALUE_COUNT }, (_, idx) => (
              <div key={idx} className="bg-white border border-[#E8E4DC] p-8">
                <h3
                  className="text-[#1A1A18] mb-3"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '17px' }}
                >
                  {t(`about.value${idx + 1}Title`)}
                </h3>
                <p
                  className="text-[#6B6860]"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', lineHeight: 1.65 }}
                >
                  {t(`about.value${idx + 1}Body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8: THE TEAM
          Horizontal scroll carousel with one-liners
          ══════════════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 9: FOR PROPERTY OWNERS (Bridge to B2B)
          Surface background, centered
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 bg-[#F5F1EB]">
        <div className="container max-w-[640px] mx-auto text-center">
          <h2
            className="text-[#1A1A18] mb-4"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(26px, 4vw, 32px)', lineHeight: 1.2 }}
          >
            {t('about.ownersTitle')}
          </h2>
          <p
            className="text-[#6B6860] max-w-[520px] mx-auto mb-8"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
          >
            {t('about.ownersBody')}
          </p>
          <a
            href="https://management.portugalactive.com/?utm_source=b2c_site&utm_medium=about_page&utm_campaign=about_cta"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-[#1A1A18] text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors"
            style={{ letterSpacing: '1.5px' }}
          >
            {t('about.ownersCta')} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 10: FINAL CTA
          Dark band, two buttons
          ══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-20 lg:py-24 bg-[#1A1A18] overflow-hidden">
        {/* Subtle property image overlay */}
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

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
