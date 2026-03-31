/* ==========================================================================
   EXPERIENCES — V1.6 Redesign
   4 sections: Gastronomy, Wellness, Adventure, Mobility + Additional Services
   ========================================================================== */

import { useState, lazy, Suspense, useEffect } from 'react';
import { Plus, MessageCircle, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import productsData from '@/data/products.json';
import type { Product } from '@/lib/types';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));

const allProducts = productsData as unknown as Product[];
const services = allProducts.filter(p => p.type === 'service' && p.isActive);
const adventures = allProducts.filter(p => p.type === 'adventure' && p.isActive);

const getService = (slug: string) => services.find(s => s.slug === slug);
const getAdventure = (slug: string) => adventures.find(a => a.slug === slug);

const GASTRONOMY_SLUGS = ['private-chef'];
const WELLNESS_SLUGS = ['in-villa-spa', 'private-yoga', 'personal-training'];
const MOBILITY_SLUGS = ['airport-shuttle'];
const ADDITIONAL_SLUGS = ['grocery-delivery', 'babysitter', 'daily-housekeeping'];

const ADVENTURE_SLUGS = [
  'canyoning', 'stand-up-paddle', 'horseback-riding', 'hike-dive-dine',
  'canam-buggy', 'sailing', 'ebike-tours', 'surf-lessons'
];

const WHATSAPP_BASE = 'https://wa.me/351927161771?text=';

interface ServiceRowProps {
  product: Product | undefined;
  onAdd: (p: Product) => void;
}

function ServiceCard({ product, onAdd }: ServiceRowProps) {
  const { t } = useTranslation();
  if (!product) return null;
  const waMsg = encodeURIComponent(`Hi, I'd like to book ${product.name}. Can you help me plan this?`);
  return (
    <div className="bg-white border border-[#E8E4DC] overflow-hidden group">
      <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {product.image ? (
          <img src={product.image} alt={`${product.name} – concierge service at luxury villa in Portugal`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-[#E8E4DC]" />
        )}
      </div>
      <div className="p-4">
        <h4 className="font-display text-[16px] text-[#1A1A18] mb-1">{product.name}</h4>
        {product.tagline && (
          <p className="text-[12px] text-[#6B6860] font-light mb-3 line-clamp-2">{product.tagline}</p>
        )}
        {product.priceFrom && (
          <p className="text-[13px] text-[#1A1A18] font-medium mb-3">From €{product.priceFrom} <span className="text-[#9E9A90] font-normal">{product.priceSuffix}</span></p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onAdd(product)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A1A18] text-white text-[10px] tracking-[0.08em] font-medium py-2.5 hover:bg-[#333330] transition-colors"
            style={{ minHeight: '38px' }}
          >
            <Plus className="w-3 h-3" /> {t('services.addToItinerary')}
          </button>
          <a
            href={`${WHATSAPP_BASE}${waMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-10 border border-[#E8E4DC] text-[#6B6860] hover:text-[#8B7355] hover:border-[#8B7355] transition-colors"
            style={{ minHeight: '38px' }}
            aria-label={t('services.bookViaWhatsapp')}
          >
            <MessageCircle className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

interface AdventureCardProps {
  product: Product | undefined;
  onAdd: (p: Product) => void;
}

function AdventureCard({ product, onAdd }: AdventureCardProps) {
  const { t } = useTranslation();
  if (!product) return null;
  const waMsg = encodeURIComponent(`Hi, I'd like to book ${product.name}. Can you help me plan this?`);
  const destLabels = product.destinations.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
  return (
    <div className="bg-white border border-[#E8E4DC] overflow-hidden group">
      <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
        {product.image ? (
          <img src={product.image} alt={`${product.name} – concierge service at luxury villa in Portugal`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-[#E8E4DC]" />
        )}
        {destLabels && (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-[10px] font-medium text-[#6B6860] px-2 py-1">{destLabels}</span>
        )}
      </div>
      <div className="p-4">
        <h4 className="font-display text-[16px] text-[#1A1A18] mb-1">{product.name}</h4>
        <p className="text-[12px] text-[#6B6860] font-light mb-3 line-clamp-2">{product.tagline}</p>
        {product.priceFrom && (
          <p className="text-[13px] text-[#1A1A18] font-medium mb-3">From €{product.priceFrom} <span className="text-[#9E9A90] font-normal">{product.priceSuffix}</span></p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onAdd(product)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A1A18] text-white text-[10px] tracking-[0.08em] font-medium py-2.5 hover:bg-[#333330] transition-colors"
            style={{ minHeight: '38px' }}
          >
            <Plus className="w-3 h-3" /> {t('services.addToItinerary')}
          </button>
          <a
            href={`${WHATSAPP_BASE}${encodeURIComponent(`Hi, I'd like to book ${product.name}. Can you help me plan this?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-10 border border-[#E8E4DC] text-[#6B6860] hover:text-[#8B7355] hover:border-[#8B7355] transition-colors"
            style={{ minHeight: '38px' }}
            aria-label={t('services.bookViaWhatsapp')}
          >
            <MessageCircle className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Experiences() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Luxury Concierge Services | Private Chef, Spa, Transfers', description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.', url: '/services' });
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  // Add Service schema markup for SEO
  useEffect(() => {
    const gastronomyProducts = GASTRONOMY_SLUGS.map(getService).filter(Boolean) as Product[];
    const wellnessProducts = WELLNESS_SLUGS.map(getService).filter(Boolean) as Product[];
    const mobilityProducts = MOBILITY_SLUGS.map(getService).filter(Boolean) as Product[];
    const additionalProducts = ADDITIONAL_SLUGS.map(getService).filter(Boolean) as Product[];
    const adventureProducts = ADVENTURE_SLUGS.map(getAdventure).filter(Boolean) as Product[];

    const allServices = [...gastronomyProducts, ...wellnessProducts, ...mobilityProducts, ...additionalProducts, ...adventureProducts];

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Portugal Active",
      "url": "https://portugalactive.com/services",
      "hasService": allServices.map(service => ({
        "@type": "Service",
        "name": service.name,
        "description": service.tagline || service.name,
        "areaServed": {
          "@type": "AdministrativeArea",
          "name": "Portugal"
        },
        ...(service.priceFrom && {
          "priceRange": `€${service.priceFrom}${service.priceSuffix ? ` ${service.priceSuffix}` : ''}`
        })
      }))
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(jsonLd);
    script.id = "services-schema";
    document.querySelector("#services-schema")?.remove();
    document.head.appendChild(script);

    return () => { document.querySelector("#services-schema")?.remove(); };
  }, []);

  const gastronomyProducts = GASTRONOMY_SLUGS.map(getService).filter(Boolean) as Product[];
  const wellnessProducts = WELLNESS_SLUGS.map(getService).filter(Boolean) as Product[];
  const mobilityProducts = MOBILITY_SLUGS.map(getService).filter(Boolean) as Product[];
  const additionalProducts = ADDITIONAL_SLUGS.map(getService).filter(Boolean) as Product[];
  const adventureProducts = ADVENTURE_SLUGS.map(getAdventure).filter(Boolean) as Product[];

  const waConciergeMsgEncoded = encodeURIComponent("Hi, I'd like to talk to your concierge about planning my stay and experiences.");

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1400&q=80"
          alt="Portugal Active experiences"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <p className="text-[11px] font-medium text-white/60 mb-3 tracking-[0.08em]">{t('services.heroOverline')}</p>
          <h1 className="headline-xl text-white mb-4">{t('services.heroTitle')}</h1>
          <p className="body-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('services.heroBody')}
          </p>
        </div>
      </section>

      {/* Section Nav */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container">
          <div className="flex gap-6 overflow-x-auto scrollbar-hide py-3">
            {[
              { label: t('services.navGastronomy'), href: '#gastronomy' },
              { label: t('services.navWellness'), href: '#wellness' },
              { label: t('services.navAdventure'), href: '#adventure' },
              { label: t('services.navMobility'), href: '#mobility' },
              { label: t('services.navAdditional'), href: '#additional' },
            ].map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13px] font-medium text-[#6B6860] hover:text-[#1A1A18] transition-colors whitespace-nowrap py-1"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Gastronomy */}
      <section id="gastronomy" className="section-padding bg-white">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.gastronomyOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.gastronomyTitle')}</h2>
            <p className="body-lg">
              {t('services.gastronomyBody')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {gastronomyProducts.map(p => (
              <ServiceCard key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Wellness */}
      <section id="wellness" className="section-padding bg-[#F5F1EB]">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.wellnessOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.wellnessTitle')}</h2>
            <p className="body-lg">
              {t('services.wellnessBody')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {wellnessProducts.map(p => (
              <ServiceCard key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Adventure */}
      <section id="adventure" className="section-padding bg-white">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.adventureOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.adventureTitle')}</h2>
            <p className="body-lg">
              {t('services.adventureBody')}
            </p>
          </div>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5 sm:overflow-visible">
            {adventureProducts.map(p => (
              <div key={p.slug} className="flex-shrink-0 w-[220px] sm:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <AdventureCard product={p} onAdd={setModalProduct} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobility */}
      <section id="mobility" className="section-padding bg-[#F5F1EB]">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.mobilityOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.mobilityTitle')}</h2>
            <p className="body-lg">
              {t('services.mobilityBody')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {mobilityProducts.map(p => (
              <ServiceCard key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Additional Services */}
      <section id="additional" className="section-padding bg-white">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.additionalOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.additionalTitle')}</h2>
            <p className="body-lg">
              {t('services.additionalBody')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalProducts.map(p => (
              <ServiceCard key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#1A1A18]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-lg text-white mb-4">{t('services.ctaTitle')}</h2>
          <p className="body-lg mb-8" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {t('services.ctaBody')}
          </p>
          <a
            href={`${WHATSAPP_BASE}${waConciergeMsgEncoded}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#8B7355] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#7A6548] transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> {t('services.ctaButton')} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Add to Itinerary Modal */}
      {modalProduct && (
        <Suspense fallback={null}>
          <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
        </Suspense>
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
