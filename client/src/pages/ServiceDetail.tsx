/* ==========================================================================
   SERVICE DETAIL — V1.8 Single CTA
   One clear action: WhatsApp. No form, no itinerary complexity.
   ========================================================================== */

import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRoute, Link } from 'wouter';
import { Check, Clock, MapPin, ArrowLeft, MessageCircle } from 'lucide-react';
import servicesData from '@/data/services.json';
import destinationsData from '@/data/destinations.json';
import type { Destination } from '@/lib/types';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

const destinations = (destinationsData as unknown as Destination[]).filter(d => d.status === 'active' && !d.comingSoon);

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

            {/* Sidebar — single WhatsApp CTA */}
            <div className="lg:col-span-2">
              <div className="sticky top-28 space-y-6">
                <div className="border border-[#E8E4DC] p-8 text-center">
                  <h3 className="headline-sm mb-2 text-[#1A1A18]">
                    {isService
                      ? t('serviceDetail.bookService', 'Book this service')
                      : t('serviceDetail.bookExperience', 'Book this experience')}
                  </h3>
                  <p className="body-sm mb-6">{t('serviceDetail.whatsappSubtitle', 'Message our concierge team directly. We typically reply within minutes.')}</p>
                  <a
                    href={`https://wa.me/351927161771?text=${whatsappMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full bg-[#1A1A18] text-white text-[13px] tracking-[0.08em] font-semibold py-5 hover:bg-[#333330] transition-colors"
                    style={{ minHeight: '56px' }}
                  >
                    <MessageCircle className="w-5 h-5" />
                    {t('serviceDetail.chatOnWhatsApp', 'Chat on WhatsApp')}
                  </a>
                  <p className="text-[11px] text-[#9E9A90] mt-4">{t('serviceDetail.whatsappNote', 'Available every day, 9 am – 9 pm (Lisbon time)')}</p>
                </div>
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
