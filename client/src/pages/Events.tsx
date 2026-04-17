/* ==========================================================================
   EVENTS — V2.0 Luxury Redesign
   Reflects PA reality: private villas, in-house team, Portugal as destination
   6 event types with curated imagery + social proof + venue showcase
   ========================================================================== */

import { useMemo } from 'react';
import { ArrowRight, Check, Users, MapPin, Star } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';

const EVENT_TYPES_SCHEMA = [
  { type: 'Corporate Retreats', description: 'Host corporate retreats and team offsites in private Portuguese villas with full concierge' },
  { type: 'Weddings', description: 'Intimate destination weddings in private villa gardens overlooking the Atlantic coast' },
  { type: 'Brand Activations', description: 'Exclusive product launches and brand experiences at private venues across Portugal' },
  { type: 'Private Celebrations', description: 'Birthdays, anniversaries and milestone celebrations in luxury Portuguese villas' },
  { type: 'Wellness Retreats', description: 'Yoga, meditation and wellness programs in private villas surrounded by nature' },
  { type: 'Creative Workshops', description: 'Artist residencies, team-building and creative experiences in inspiring Portuguese settings' },
];

const EVENTS_GRAPH = [
  {
    '@context': 'https://schema.org',
    '@type': 'EventVenue',
    name: 'Portugal Active Private Events',
    url: 'https://www.portugalactive.com/events',
    description: 'Host private events in luxury Portuguese villas with full event planning and concierge services',
    areaServed: { '@type': 'AdministrativeArea', name: 'Portugal' },
    acceptsReservations: true,
    events: EVENT_TYPES_SCHEMA.map((e) => ({
      '@type': 'Event',
      name: e.type,
      description: e.description,
      location: { '@type': 'Place', name: 'Portugal', address: { '@type': 'PostalAddress', addressCountry: 'PT' } },
    })),
  },
  buildBreadcrumbSchema([
    { name: 'Home', item: '/' },
    { name: 'Events' },
  ]),
];

export default function Events() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Private Events Portugal | Weddings, Retreats, Celebrations', description: 'Host weddings, corporate retreats, and private celebrations in luxury Portuguese villas. Full event planning and concierge.', url: '/events' });

  /* ---- Event types data ---- */
  const EVENT_TYPES = useMemo(() => [
    {
      id: 'corporate',
      title: t('events.typeCorporate'),
      subtitle: t('events.subtitleCorporate'),
      guestCount: 80,
      image: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80',
    },
    {
      id: 'weddings',
      title: t('events.typeWeddings'),
      subtitle: t('events.subtitleWeddings'),
      guestCount: 120,
      image: 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=800&q=80',
    },
    {
      id: 'brand',
      title: t('events.typeBrand'),
      subtitle: t('events.subtitleBrand'),
      guestCount: 50,
      image: 'https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=800&q=80',
    },
    {
      id: 'celebrations',
      title: t('events.typeCelebrations'),
      subtitle: t('events.subtitleCelebrations'),
      guestCount: 60,
      image: 'https://images.unsplash.com/photo-1529636798458-92182e662485?w=800&q=80',
    },
    {
      id: 'wellness',
      title: t('events.typeWellness'),
      subtitle: t('events.subtitleWellness'),
      guestCount: 40,
      image: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800&q=80',
    },
    {
      id: 'creative',
      title: t('events.typeCreative'),
      subtitle: t('events.subtitleCreative'),
      guestCount: 30,
      image: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&q=80',
    },
  ], [t]);

  const enquireMsg = (title: string) =>
    encodeURIComponent(`Hi, I'd like to enquire about hosting a ${title} with Portugal Active. Can you help me plan this?`);

  /* ---- Trust signals ---- */
  const TRUST_ITEMS = [
    { label: t('events.trustVenues'), value: '15+' },
    { label: t('events.trustEvents'), value: '200+' },
    { label: t('events.trustRegions'), value: '5' },
    { label: t('events.trustTeam'), value: t('events.trustTeamValue') },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData id="events-graph" data={EVENTS_GRAPH} />
      <Header />

      {/* ================================================================
          HERO — Cinematic full-bleed with villa imagery
          ================================================================ */}
      <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1600&q=80"
          alt="Private villa event setting in Portugal"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/5" />
        <div className="relative container pb-14 lg:pb-20 z-10">
          <p className="text-[11px] font-medium tracking-[0.14em] text-white/50 mb-4">{t('events.heroOverline')}</p>
          <h1 className="font-display text-[2.8rem] md:text-[3.8rem] lg:text-[4.5rem] text-white leading-[1.05] mb-5 max-w-3xl">
            {t('events.heroTitle')}
          </h1>
          <p className="text-[15px] max-w-xl mb-8 font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('events.heroBody')}
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-white text-[#1A1A18] text-[11px] tracking-[0.14em] font-medium px-8 py-4 hover:bg-[#F5F1EB] transition-colors"
          >
            {t('events.heroCta')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ================================================================
          TRUST BAR — Quick metrics
          ================================================================ */}
      <section className="bg-[#1A1A18] py-6">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {TRUST_ITEMS.map(item => (
              <div key={item.label}>
                <p className="font-display text-[1.6rem] text-white mb-1">{item.value}</p>
                <p className="text-[11px] text-white/40 tracking-[0.06em]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          EVENT TYPES — Curated grid with real descriptions
          ================================================================ */}
      <section className="section-padding bg-white">
        <div className="container">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium text-[#8B7355] mb-3 tracking-[0.14em]">{t('events.typesOverline')}</p>
            <h2 className="font-display text-[2rem] md:text-[2.5rem] text-[#1A1A18] mb-3">{t('events.typesTitle')}</h2>
            <p className="text-[14px] text-[#6B6860] font-light max-w-lg mx-auto">{t('events.typesSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {EVENT_TYPES.map(event => (
              <div key={event.id} className="group bg-[#FAFAF7] border border-[#E8E4DC] overflow-hidden flex flex-col">
                <div className="relative overflow-hidden" style={{ aspectRatio: '3/2' }}>
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5">
                    <h3 className="font-display text-[1.4rem] text-white leading-tight">{event.title}</h3>
                  </div>
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <p className="text-[13px] text-[#6B6860] font-light leading-relaxed mb-4 flex-1">
                    {event.subtitle}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9E9A90]">
                      <Users className="w-3.5 h-3.5" />
                      {t('events.upToGuests', { count: event.guestCount })}
                    </span>
                    <a
                      href={`https://wa.me/351927161771?text=${enquireMsg(event.title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#1A1A18] text-[11px] tracking-[0.08em] font-medium hover:text-[#8B7355] transition-colors"
                    >
                      {t('events.enquire')} <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          VENUE SHOWCASE — Split image + text
          ================================================================ */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1510076857177-7470076d4098?w=1000&q=80"
                alt="Luxury villa terrace set for a private dinner in Portugal"
                className="w-full object-cover"
                style={{ aspectRatio: '4/3' }}
                loading="lazy"
              />
              <div className="absolute -bottom-4 -right-4 bg-[#1A1A18] text-white px-6 py-4 hidden lg:block">
                <p className="font-display text-[1.1rem]">15+ {t('events.venueLabel')}</p>
                <p className="text-[11px] text-white/50 mt-0.5">{t('events.venueRegions')}</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.14em]">{t('events.venueOverline')}</p>
              <h2 className="font-display text-[2rem] md:text-[2.3rem] text-[#1A1A18] mb-6 leading-tight">{t('events.venueTitle')}</h2>
              <p className="text-[14px] text-[#6B6860] font-light leading-relaxed mb-8">
                {t('events.venueBody')}
              </p>
              <div className="space-y-4">
                {[
                  t('events.venueBullet1'),
                  t('events.venueBullet2'),
                  t('events.venueBullet3'),
                  t('events.venueBullet4'),
                ].map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-[#6B8E4E] mt-0.5 flex-shrink-0" />
                    <p className="text-[13px] text-[#1A1A18] font-light">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          HOW WE WORK — Process steps
          ================================================================ */}
      <section className="section-padding bg-white">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium text-[#8B7355] mb-3 tracking-[0.14em]">{t('events.processOverline')}</p>
            <h2 className="font-display text-[2rem] md:text-[2.3rem] text-[#1A1A18]">{t('events.processTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: t('events.step1Title'), desc: t('events.step1Desc') },
              { step: '02', title: t('events.step2Title'), desc: t('events.step2Desc') },
              { step: '03', title: t('events.step3Title'), desc: t('events.step3Desc') },
              { step: '04', title: t('events.step4Title'), desc: t('events.step4Desc') },
            ].map(item => (
              <div key={item.step} className="text-center md:text-left">
                <p className="font-display text-[2rem] text-[#E8E4DC] mb-3">{item.step}</p>
                <h4 className="font-display text-[16px] text-[#1A1A18] mb-2">{item.title}</h4>
                <p className="text-[13px] text-[#6B6860] font-light leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          TESTIMONIAL — Social proof
          ================================================================ */}
      <section className="section-padding bg-[#FAFAF7]">
        <div className="container max-w-3xl mx-auto text-center">
          <Star className="w-5 h-5 text-[#8B7355] mx-auto mb-6" />
          <blockquote className="font-display text-[1.4rem] md:text-[1.7rem] text-[#1A1A18] leading-relaxed mb-6 italic">
            {t('events.testimonialQuote')}
          </blockquote>
          <p className="text-[13px] text-[#6B6860]">{t('events.testimonialAuthor')}</p>
          <p className="text-[11px] text-[#9E9A90] mt-1">{t('events.testimonialRole')}</p>
        </div>
      </section>

      {/* ================================================================
          FINAL CTA
          ================================================================ */}
      <section className="relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80"
          alt="Elegant outdoor dining setup"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#1A1A18]/80" />
        <div className="relative section-padding">
          <div className="container max-w-2xl mx-auto text-center">
            <h2 className="font-display text-[2rem] md:text-[2.5rem] text-white mb-4 leading-tight">{t('events.ctaTitle')}</h2>
            <p className="text-[14px] mb-8 font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {t('events.ctaBody')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-white text-[#1A1A18] text-[11px] tracking-[0.14em] font-medium px-8 py-4 hover:bg-[#F5F1EB] transition-colors"
              >
                {t('events.ctaButton')} <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20discuss%20hosting%20a%20private%20event%20with%20Portugal%20Active."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-white/30 text-white text-[11px] tracking-[0.14em] font-medium px-8 py-4 hover:bg-white/10 transition-colors"
              >
                {t('events.ctaWhatsapp')} <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
