/* ==========================================================================
   SERVICE DETAIL — V1.6 Redesign
   Individual service/activity page with itinerary integration
   ========================================================================== */

import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRoute, Link } from 'wouter';
import { Check, Clock, MapPin, ArrowLeft, Plus, MessageCircle } from 'lucide-react';
import servicesData from '@/data/services.json';
import productsData from '@/data/products.json';
import destinationsData from '@/data/destinations.json';
import type { Product, Destination } from '@/lib/types';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));

const allProducts = productsData as unknown as Product[];
const destinations = (destinationsData as unknown as Destination[]).filter(d => d.status === 'active' && !d.comingSoon);

function InquiryForm({ serviceName }: { serviceName: string }) {
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
        <h3 className="headline-sm mb-2 text-[#1A1A18]">Thank you.</h3>
        <p className="body-md">We have received your inquiry for {serviceName}. Our team will get back to you within 24 hours.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">Name *</label>
          <input type="text" required className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">Email *</label>
          <input type="email" required className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">Phone</label>
          <input type="tel" className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block cursor-pointer">Preferred date</label>
          <input type="date" min={new Date().toISOString().split("T")[0]} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors cursor-pointer" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
        </div>
      </div>
      <div>
        <label className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-2 block">Message</label>
        <textarea rows={4} className="w-full bg-transparent border border-[#E8E4DC] px-4 py-3.5 text-[15px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors resize-none" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }} />
      </div>
      <button type="submit" className="btn-primary">Send inquiry</button>
    </form>
  );
}

export default function ServiceDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute('/services/:slug');
  const [, actParams] = useRoute('/activities/:slug');
  const [, expParams] = useRoute('/experiences/:slug');
  const slug = params?.slug || actParams?.slug || expParams?.slug;
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const allItems = [...servicesData.services, ...servicesData.activities];
  const item = allItems.find(s => s.slug === slug);

  usePageMeta({
    title: item ? `${item.name} | Luxury Experience in Portugal` : 'Service Not Found',
    description: item ? `${item.tagline || item.name}. Book this experience with your Portugal Active villa stay.`.slice(0, 155) : undefined,
    image: item?.image,
    url: item ? (item.category === 'activity' ? `/experiences/${item.slug}` : `/services/${item.slug}`) : undefined,
  });

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <h1 className="headline-lg mb-4 text-[#1A1A18]">Not found</h1>
          <Link href="/experiences" className="btn-ghost">{t('serviceDetail.backToExperiences')}</Link>
        </div>
      </div>
    );
  }

  const isService = item.category === 'service';
  const otherItems = allItems.filter(s => s.slug !== slug).slice(0, 4);
  const itineraryProduct = allProducts.find(p => p.slug === slug);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[55vh] min-h-[380px] flex items-end overflow-hidden">
        <img src={item.image} alt={`${item.name} – luxury experience in Portugal`} className="absolute inset-0 w-full h-full object-cover" width={1600} height={900} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/15" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#C4A87C] mb-4">{isService ? 'Concierge service' : 'Experience'}</p>
          <h1 className="headline-xl text-white mb-3">{item.name}</h1>
          <p className="body-lg max-w-lg text-white/95">{item.tagline}</p>
        </div>
      </section>

      {/* Back link */}
      <div className="container py-5 border-b border-[#E8E4DC]">
        <Link href={isService ? '/concierge' : '/experiences'} className="inline-flex items-center gap-2 text-[13px] font-medium text-[#9E9A90] hover:text-[#1A1A18] transition-colors">
          <ArrowLeft className="w-4 h-4" /> {isService ? 'All concierge services' : 'All experiences'}
        </Link>
      </div>

      {/* Content + Form */}
      <section className="section-padding">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
            <div className="lg:col-span-3">
              <div className="mb-10">
                <h2 className="headline-md mb-6 text-[#1A1A18]">About this {isService ? 'service' : 'experience'}</h2>
                {item.description.split('\n\n').map((para: string, i: number) => (
                  <p key={i} className="body-lg mb-4">{para}</p>
                ))}
                <p className="body-lg mb-4">
                  This {isService ? 'service' : 'experience'} is available across all our destinations including{' '}
                  {destinations.slice(0, 3).map((d, i) => (
                    <span key={d.slug}>
                      {i > 0 && (i === Math.min(destinations.length, 3) - 1 ? ' and ' : ', ')}
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
                  <p className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-1">Price</p>
                  <p className="text-[18px] text-[#1A1A18]">{item.price}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-1">Duration</p>
                  <p className="text-[18px] text-[#1A1A18] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#8B7355]" /> {item.duration}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.02em] font-medium text-[#9E9A90] mb-1">Availability</p>
                  <p className="text-[18px] text-[#1A1A18] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#8B7355]" /> {item.availability}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="sticky top-28">
                {itineraryProduct && (
                  <div className="bg-[#1A1A18] p-6 mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-white text-[18px] font-display">{item.price}</p>
                        <p className="text-white/40 text-[12px]">{item.duration}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setModalProduct(itineraryProduct)}
                      className="w-full flex items-center justify-center gap-2 bg-white text-[#1A1A18] text-[12px] tracking-[0.02em] font-medium py-3 hover:bg-[#F5F1EB] transition-colors mb-3"
                      style={{ minHeight: '48px' }}
                    >
                      <Plus className="w-4 h-4" /> Add to itinerary
                    </button>
                    <a
                      href={`https://wa.me/351927161771?text=${encodeURIComponent(itineraryProduct.whatsappMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 border border-white/20 text-white/60 text-[12px] tracking-[0.02em] font-medium py-3 hover:text-white hover:border-white/40 transition-colors"
                      style={{ minHeight: '48px' }}
                    >
                      <MessageCircle className="w-4 h-4" /> Book via WhatsApp
                    </a>
                  </div>
                )}

                <div className="border border-[#E8E4DC] p-8">
                  <h3 className="headline-sm mb-2 text-[#1A1A18]">Book this {isService ? 'service' : 'experience'}</h3>
                  <p className="body-sm mb-6">Fill in the form and our team will get back to you within 24 hours.</p>
                  <InquiryForm serviceName={item.name} />
                </div>
                <div className="mt-4 text-center">
                  <p className="text-[13px] text-[#9E9A90]" style={{ fontWeight: 300 }}>{t('serviceDetail.orContactDirectly')}</p>
                  <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="inline-block mt-1 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors">
                    WhatsApp: +351 927 161 771
                  </a>
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
                  <img src={other.image} alt={`${other.name} – luxury experience in Portugal`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
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

      {modalProduct && (
        <Suspense fallback={null}>
          <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
        </Suspense>
      )}
    </div>
  );
}
