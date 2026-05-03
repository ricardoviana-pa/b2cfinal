/* ==========================================================================
   SERVICE DETAIL — V1.7 Simplified
   Two clear CTAs: inquiry form + WhatsApp. No itinerary complexity.
   ========================================================================== */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRoute, Link } from 'wouter';
import { Check, Clock, MapPin, ArrowLeft, MessageCircle, Send } from 'lucide-react';
import servicesData from '@/data/services.json';
import destinationsData from '@/data/destinations.json';
import type { Destination } from '@/lib/types';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

const destinations = (destinationsData as unknown as Destination[]).filter(d => d.status === 'active' && !d.comingSoon);

function InquiryForm({ serviceName }: { serviceName: string }) {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-[#F5F1EB] p-10 text-center">
        <div className="w-12 h-12 bg-[#8B7355] flex items-center justify-center mx-auto mb-4">
          <Check className="w-6 h-6 text-white" />
        </div>
        <h3 className="headline-sm mb-2 text-[#1A1A18]">{t('serviceDetail.thankYou', 'Thank you.')}</h3>
        <p className="body-md">{t('serviceDetail.inquiryReceived', 'We have received your inquiry for {{service}}. Our team will get back to you within 24 hours.', { service: serviceName })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">{t('form.name', 'Name')} *</label>
          <input type="text" required className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">{t('form.email', 'Email')} *</label>
          <input type="email" required className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">{t('form.phone', 'Phone')}</label>
          <input type="tel" className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block cursor-pointer">{t('form.preferredDate', 'Preferred date')}</label>
          <input type="date" min={new Date().toISOString().split("T")[0]} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors cursor-pointer" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
      </div>
      <div>
        <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">{t('form.message', 'Message')}</label>
        <textarea rows={4} className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors resize-none" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
      </div>
      <button type="submit" className="btn-primary flex items-center gap-2">
        <Send className="w-4 h-4" /> {t('serviceDetail.sendInquiry', 'Send inquiry')}
      </button>
    </form>
  );
}

export default function ServiceDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute('/services/:slug');
  const [, actParams] = useRoute('/activities/:slug');
  const [, expParams] = useRoute('/experiences/:slug');
  const slug = params?.slug || actParams?.slug || expParams?.slug;

  const allItems = [...servicesData.services, ...servicesData.activities];
  const item = allItems.find(s => s.slug === slug);

  usePageMeta({
    title: item ? `${item.name} | Portugal Active` : 'Service Not Found',
    description: item ? `${item.tagline || item.name}. ${t('serviceDetail.metaSuffix', 'Book this experience with your Portugal Active villa stay.')}`.slice(0, 155) : undefined,
    image: item?.image,
    url: item ? (item.category === 'activity' ? `/experiences/${item.slug}` : `/services/${item.slug}`) : undefined,
  });

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <h1 className="headline-lg mb-4 text-[#1A1A18]">{t('serviceDetail.notFound', 'Not found')}</h1>
          <Link href="/experiences" className="btn-ghost">{t('serviceDetail.backToExperiences')}</Link>
        </div>
      </div>
    );
  }

  const isService = item.category === 'service';
  const otherItems = allItems.filter(s => s.slug !== slug).slice(0, 4);
  const whatsappMsg = encodeURIComponent(`Hi, I'm interested in ${item.name}. Can you tell me more?`);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[55vh] min-h-[380px] flex items-end overflow-hidden">
        <img src={item.image} alt={`${item.name} – Portugal Active`} className="absolute inset-0 w-full h-full object-cover" width={1600} height={900} fetchPriority="high" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/15" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#C4A87C] mb-4">
            {isService ? t('serviceDetail.conciergeService', 'Concierge service') : t('serviceDetail.experience', 'Experience')}
          </p>
          <h1 className="headline-xl text-white mb-3">{item.name}</h1>
          <p className="body-lg max-w-lg text-white/95">{item.tagline}</p>
        </div>
      </section>

      {/* Back link */}
      <div className="container py-5 border-b border-[#E8E4DC]">
        <Link href={isService ? '/concierge' : '/experiences'} className="inline-flex items-center gap-2 text-[13px] font-medium text-[#9E9A90] hover:text-[#1A1A18] transition-colors">
          <ArrowLeft className="w-4 h-4" /> {isService ? t('serviceDetail.allServices', 'All concierge services') : t('serviceDetail.allExperiences', 'All experiences')}
        </Link>
      </div>

      {/* Content + Sidebar */}
      <section className="section-padding">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
            {/* Main content */}
            <div className="lg:col-span-3">
              <div className="mb-10">
                <h2 className="headline-md mb-6 text-[#1A1A18]">
                  {isService
                    ? t('serviceDetail.aboutService', 'About this service')
                    : t('serviceDetail.aboutExperience', 'About this experience')}
                </h2>
                {item.description.split('\n\n').map((para: string, i: number) => (
                  <p key={i} className="body-lg mb-4">{para}</p>
                ))}
                <p className="body-lg mb-4">
                  {t('serviceDetail.availableAcross', 'Available across all our destinations including')}{' '}
                  {destinations.slice(0, 3).map((d, i) => (
                    <span key={d.slug}>
                      {i > 0 && (i === Math.min(destinations.length, 3) - 1 ? ` ${t('common.and', 'and')} ` : ', ')}
                      <Link href={`/destinations/${d.slug}`} className="text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4 decoration-[#E8E4DC]">{d.name}</Link>
                    </span>
                  ))}.
                </p>
              </div>

              <div className="mb-10">
                <h3 className="text-[11px] font-medium tracking-[0.02em] text-[#8B7355] mb-5">{t('serviceDetail.whatIsIncluded')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {item.details.map((detail: string, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Check className="w-4 h-4 shrink-0 text-[#8B7355]" />
                      <span className="text-[15px] text-[#1A1A18]" style={{ fontWeight: 300 }}>{detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-10 py-8 border-t border-b border-[#E8E4DC]">
                <div>
                  <p className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-1">{t('serviceDetail.price', 'Price')}</p>
                  <p className="text-[18px] text-[#1A1A18]">{item.price}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-1">{t('serviceDetail.duration', 'Duration')}</p>
                  <p className="text-[18px] text-[#1A1A18] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#8B7355]" /> {item.duration}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-1">{t('serviceDetail.availability', 'Availability')}</p>
                  <p className="text-[18px] text-[#1A1A18] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#8B7355]" /> {item.availability}
                  </p>
                </div>
              </div>
            </div>

            {/* Sidebar — 2 CTAs: Form (primary) + WhatsApp (secondary) */}
            <div className="lg:col-span-2">
              <div className="sticky top-28 space-y-4">
                {/* Inquiry form — primary CTA */}
                <div className="border border-[#E8E4DC] p-8">
                  <h3 className="headline-sm mb-2 text-[#1A1A18]">
                    {isService
                      ? t('serviceDetail.bookService', 'Book this service')
                      : t('serviceDetail.bookExperience', 'Book this experience')}
                  </h3>
                  <p className="body-sm mb-6">{t('serviceDetail.formSubtitle', 'Fill in the form and our team will get back to you within 24 hours.')}</p>
                  <InquiryForm serviceName={item.name} />
                </div>

                {/* WhatsApp — secondary CTA */}
                <a
                  href={`https://wa.me/351927161771?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 w-full bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium py-4 hover:bg-[#333330] transition-colors"
                  style={{ minHeight: '52px' }}
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('serviceDetail.contactWhatsApp', 'Or contact us on WhatsApp')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {item.reviews && item.reviews.length > 0 && (
        <section className="section-padding bg-[#F5F1EB]">
          <div className="container">
            <div className="text-center mb-12">
              <h2 className="headline-lg text-[#1A1A18]">{t('serviceDetail.whatGuestsSay')}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[900px] mx-auto">
              {item.reviews.map((review: any, i: number) => (
                <div key={i} className="bg-white p-10 border-l-[1.5px] border-[#8B7355]">
                  <p className="font-display text-[1.25rem] leading-snug mb-6 text-[#1A1A18]">"{review.text}"</p>
                  <p className="text-[11px] tracking-[0.12em] uppercase text-[#8B7355]">{review.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Cross-sell */}
      <section className="section-padding">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="headline-lg text-[#1A1A18]">{t('serviceDetail.otherExperiences')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {otherItems.map((other) => (
              <Link key={other.slug} href={`/${other.category === 'service' ? 'services' : 'experiences'}/${other.slug}`} className="group">
                <div className="relative overflow-hidden mb-4" style={{ aspectRatio: '3/4' }}>
                  <img src={other.image} alt={`${other.name} – Portugal Active`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
                <h3 className="headline-sm mb-1 text-[#1A1A18] group-hover:text-[#8B7355] transition-colors">{other.name}</h3>
                <p className="text-[13px] text-[#6B6860]" style={{ fontWeight: 300 }}>{other.tagline}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
