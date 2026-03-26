/* ==========================================================================
   EVENTS — V1.6 Redesign
   6 event types, exact copy per Prompt 2 spec, final CTA
   ========================================================================== */

import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

export default function Events() {
  const { t } = useTranslation();

  const EVENT_TYPES = useMemo(() => [
    {
      id: 'corporate',
      title: t('events.corporateTitle'),
      capacity: t('events.corporateCapacity'),
      timing: t('events.corporateTiming'),
      regions: t('events.corporateRegions'),
      description: t('events.corporateDesc'),
      image: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&q=80',
    },
    {
      id: 'weddings',
      title: t('events.weddingsTitle'),
      capacity: t('events.weddingsCapacity'),
      timing: t('events.weddingsTiming'),
      regions: t('events.weddingsRegions'),
      description: t('events.weddingsDesc'),
      image: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&q=80',
    },
    {
      id: 'brand',
      title: t('events.brandTitle'),
      capacity: t('events.brandCapacity'),
      timing: t('events.brandTiming'),
      regions: t('events.brandRegions'),
      description: t('events.brandDesc'),
      image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    },
    {
      id: 'celebrations',
      title: t('events.celebrationsTitle'),
      capacity: t('events.celebrationsCapacity'),
      timing: t('events.celebrationsTiming'),
      regions: t('events.celebrationsRegions'),
      description: t('events.celebrationsDesc'),
      image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80',
    },
    {
      id: 'wellness',
      title: t('events.wellnessTitle'),
      capacity: t('events.wellnessCapacity'),
      timing: t('events.wellnessTiming'),
      regions: t('events.wellnessRegions'),
      description: t('events.wellnessDesc'),
      image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    },
    {
      id: 'creative',
      title: t('events.creativeTitle'),
      capacity: t('events.creativeCapacity'),
      timing: t('events.creativeTiming'),
      regions: t('events.creativeRegions'),
      description: t('events.creativeDesc'),
      image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
    },
  ], [t]);

  const enquireMsg = (title: string) =>
    encodeURIComponent(`Hi, I'd like to enquire about hosting a ${title} with Portugal Active. Can you help me plan this?`);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[65vh] min-h-[440px] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1600&q=80"
          alt="Private event venue in Portugal"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
        <div className="relative container pb-12 lg:pb-20 z-10">
          <h1 className="headline-xl text-white mb-4">
            {t('events.heroTitle')}
          </h1>
          <p className="body-lg max-w-xl mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {t('events.heroSubtitle')}
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-white text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-7 py-4 hover:bg-[#F5F1EB] transition-colors"
          >
            {t('events.heroCta')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Event Types Grid */}
      <section className="section-padding bg-white">
        <div className="container">
          <div className="text-center mb-12">
            <p className="text-[11px] font-medium text-[#8B7355] mb-3 tracking-[0.08em]">{t('events.hostLabel')}</p>
            <h2 className="headline-lg text-[#1A1A18]">{t('events.hostTitle')}</h2>
          </div>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-visible">
            {EVENT_TYPES.map(event => (
              <div key={event.id} className="group bg-[#FAFAF7] border border-[#E8E4DC] overflow-hidden flex flex-col flex-shrink-0 w-[300px] sm:w-[340px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="font-display text-[20px] text-[#1A1A18] mb-2">{event.title}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
                    <span className="text-[11px] text-[#9E9A90]">{event.capacity}</span>
                    <span className="text-[11px] text-[#9E9A90]">{event.timing}</span>
                    <span className="text-[11px] text-[#9E9A90]">{event.regions}</span>
                  </div>
                  <p className="text-[13px] text-[#6B6860] font-light leading-relaxed flex-1 mb-5">{event.description}</p>
                  <a
                    href={`https://wa.me/351927161771?text=${enquireMsg(event.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[#1A1A18] text-[#1A1A18] text-[11px] tracking-[0.08em] font-medium px-5 py-3 hover:bg-[#1A1A18] hover:text-white transition-colors self-start"
                  >
                    ENQUIRE ABOUT THIS EVENT <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Us */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('events.whyLabel')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-8">{t('events.whyTitle')}</h2>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible">
            {[
              { label: t('events.whyVenueLabel'), desc: t('events.whyVenueDesc') },
              { label: t('events.whyTeamLabel'), desc: t('events.whyTeamDesc') },
              { label: t('events.whyExpLabel'), desc: t('events.whyExpDesc') },
            ].map(item => (
              <div key={item.label} className="bg-white border border-[#E8E4DC] p-5 flex-shrink-0 w-[260px] sm:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <h4 className="font-display text-[18px] text-[#1A1A18] mb-2">{item.label}</h4>
                <p className="text-[13px] text-[#6B6860] font-light leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#1A1A18]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-lg text-white mb-4">{t('events.finalCtaTitle')}</h2>
          <p className="body-lg mb-8" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {t('events.finalCtaDesc')}
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-[#8B7355] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#7A6548] transition-colors"
          >
            {t('events.finalCtaButton')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
