/* ==========================================================================
   ABOUT — V1.6 Redesign
   Hero, story, Private Hotel Model, 4 values, team carousel, dual CTA
   ========================================================================== */

import { useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

/**
 * Team members — Portugal Active leadership & operations.
 * Photos: replace placeholder URLs with CloudFront CDN links when available.
 * Use format: https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/team/{name}.webp
 */
const TEAM = [
  {
    id: 'rv',
    name: 'Ricardo Viana',
    role: 'CEO & Founder',
    photo: '',
  },
  {
    id: 'db',
    name: 'Diogo Boissel',
    role: 'Head of Staff',
    photo: '/team/diogoboissel.webp',
  },
  {
    id: 'sq',
    name: 'Susana Queirós',
    role: 'Head of Field Operations',
    photo: '/team/susana-queiros.webp',
  },
  {
    id: 'tm',
    name: 'Tomás Matos',
    role: 'Manager of Field Operations',
    photo: '',
  },
  {
    id: 'jd',
    name: 'João Dinis',
    role: 'Head of Reservations',
    photo: '/team/joao-dinis.webp',
  },
  {
    id: 'jf',
    name: 'Joana Ferreira',
    role: 'Concierge Manager',
    photo: '/team/joana-ferreira.webp',
  },
  {
    id: 'dl',
    name: 'Daniel Lima',
    role: 'B2B Sales Manager',
    photo: '/team/daniel-lima.webp',
  },
  {
    id: 'tf',
    name: 'Teresa Ferrador',
    role: 'HR & Office Manager',
    photo: '/team/teresa-ferrador.webp',
  },
  {
    id: 'er',
    name: 'Emanuel R.',
    role: 'Executive Assistant',
    photo: '/team/emanuel-riboira.webp',
  },
  {
    id: 'jp',
    name: 'João Porto',
    role: 'Customer Support Specialist',
    photo: '',
  },
  {
    id: 'sr',
    name: 'Samuel Rodrigues',
    role: 'Customer Support Specialist',
    photo: '',
  },
  {
    id: 'bm',
    name: 'Bruno Monteiro',
    role: 'Finance Manager',
    photo: '',
  },
];

export default function About() {
  const { t } = useTranslation();
  usePageMeta({ title: 'About Portugal Active | Luxury Villa Management Since 2017', description: 'Family-run villa management company since 2017. 50+ homes, hotel-standard service, local concierge across Portugal.', url: '/about' });
  const scrollRef = useRef<HTMLDivElement>(null);

  const values = useMemo(() => [
    {
      title: t('about.value1Title'),
      body: t('about.value1Body'),
    },
    {
      title: t('about.value2Title'),
      body: t('about.value2Body'),
    },
    {
      title: t('about.value3Title'),
      body: t('about.value3Body'),
    },
    {
      title: t('about.value4Title'),
      body: t('about.value4Body'),
    },
  ], [t]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[55vh] min-h-[380px] flex items-end overflow-hidden">
        <img src={IMAGES.aboutStory} alt="Aerial view of a luxury private villa managed by Portugal Active" className="absolute inset-0 w-full h-full object-cover" width={1600} height={900} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white max-w-2xl">
            {t('about.heroTitle')}
          </h1>
        </div>
      </section>

      {/* Our Story */}
      <section className="section-padding">
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('about.storyOverline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-8">{t('about.storyTitle')}</h2>
          <p className="body-lg mb-5">
            {t('about.storyP1')}
          </p>
          <p className="body-lg mb-5">
            {t('about.storyP2')}
          </p>
          <p className="body-lg mb-5">
            {t('about.storyP3')}
          </p>
          <p className="body-lg">
            {t('about.storyP4')}
          </p>
        </div>
      </section>

      {/* The Private Hotel Model */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('about.modelOverline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-8">{t('about.modelTitle')}</h2>
          <p className="body-lg mb-5">
            {t('about.modelP1')}
          </p>
          <p className="body-lg mb-5">
            {t('about.modelP2')}
          </p>
          <p className="body-lg mb-10">
            Explore our <Link href="/homes" className="text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4 decoration-[#E8E4DC]">portfolio of private homes</Link> or discover the <Link href="/services" className="text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4 decoration-[#E8E4DC]">concierge services</Link> that come with every stay.
          </p>

          {/* Stats bar */}
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible border-t border-[#E8E4DC] pt-8" role="region" aria-label="Portugal Active company statistics">
            {[
              { stat: '70+', label: t('about.statHomes') },
              { stat: '4.9/5', label: t('about.statRating') },
              { stat: '2017', label: t('about.statSince') },
            ].map(item => (
              <div key={item.label} className="text-center flex-shrink-0 w-[200px] sm:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <div className="font-display text-[2.5rem] lg:text-[3rem] text-[#1A1A18] leading-none mb-2" role="doc-statistic" aria-label={item.label}>{item.stat}</div>
                <div className="text-[11px] font-medium text-[#9E9A90] tracking-[0.06em]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-white">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('about.valuesOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18]">{t('about.valuesTitle')}</h2>
          </div>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-auto md:px-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible max-w-3xl">
            {values.map((value, idx) => (
              <div key={idx} className="bg-[#FAFAF7] border border-[#E8E4DC] p-8 flex-shrink-0 w-[280px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <h3 className="font-display text-[20px] text-[#1A1A18] mb-4">{value.title}</h3>
                <p className="text-[14px] text-[#6B6860] font-light leading-relaxed">{value.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Carousel */}
      <section className="section-padding bg-[#FAFAF7]">
        <div className="container">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="headline-lg text-[#1A1A18] mb-3">{t('about.teamTitle')}</h2>
              <p className="body-lg max-w-2xl">
                {t('about.teamBody')}
              </p>
            </div>
            <div className="hidden md:flex gap-2 shrink-0 ml-8">
              <button
                onClick={() => scroll('left')}
                className="w-10 h-10 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                style={{ minHeight: 'auto', minWidth: 'auto' }}
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-10 h-10 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                style={{ minHeight: 'auto', minWidth: 'auto' }}
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
                <div key={member.id} className="flex-shrink-0 w-[260px] snap-start">
                  <div className="relative overflow-hidden mb-3" style={{ aspectRatio: '3/4' }}>
                    {member.photo ? (
                      <img
                        src={member.photo}
                        alt={member.name}
                        className="w-full h-full object-cover grayscale-[20%]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#F0ECE4] flex items-center justify-center">
                        <span className="font-display text-[3rem] text-[#8B7355]/40 select-none">{initials}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-3">
                    <h4 className="text-[15px] font-display text-[#1A1A18] mb-0.5">{member.name}</h4>
                    <p className="text-[12px] font-medium text-[#8B7355]">{member.role}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#1A1A18]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-lg text-white mb-8">{t('about.ctaTitle')}</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/homes"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#8B7355] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#7A6548] transition-colors"
            >
              {t('about.ctaExplore')} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:border-white hover:bg-white/10 transition-colors"
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
