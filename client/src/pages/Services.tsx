/* ==========================================================================
   EXPERIENCES — V1.6 Redesign
   4 sections: Gastronomy, Wellness, Adventure, Mobility + Additional Services
   ========================================================================== */

import { useState } from 'react';
import { Plus, MessageCircle, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import productsData from '@/data/products.json';
import type { Product } from '@/lib/types';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import AddToItineraryModal from '@/components/itinerary/AddToItineraryModal';

const allProducts = productsData as unknown as Product[];
const services = allProducts.filter(p => p.type === 'service' && p.isActive);
const adventures = allProducts.filter(p => p.type === 'adventure' && p.isActive);

const getService = (slug: string) => services.find(s => s.slug === slug);
const getAdventure = (slug: string) => adventures.find(a => a.slug === slug);

const GASTRONOMY_SLUGS = ['private-chef'];
const WELLNESS_SLUGS = ['in-villa-spa', 'yoga', 'personal-training'];
const MOBILITY_SLUGS = ['airport-shuttle'];
const ADDITIONAL_SLUGS = ['grocery-setup', 'babysitter', 'daily-housekeeping'];

const ADVENTURE_SLUGS = [
  'canyoning', 'stand-up-paddle', 'horseback-riding', 'hike-dive-dine',
  'can-am-buggy', 'sailing-boat-tours', 'e-bike-fat-bike', 'surf-lessons'
];

const WHATSAPP_BASE = 'https://wa.me/351927161771?text=';

interface ServiceRowProps {
  product: Product | undefined;
  onAdd: (p: Product) => void;
}

function ServiceRow({ product, onAdd }: ServiceRowProps) {
  const { t } = useTranslation();
  if (!product) return null;
  const waMsg = encodeURIComponent(`Hi, I'd like to book ${product.name}. Can you help me plan this?`);
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-[#E8E4DC] last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display text-[17px] text-[#1A1A18]">{product.name}</span>
          {product.priceFrom && (
            <span className="text-[13px] text-[#6B6860]">From €{product.priceFrom}{product.priceSuffix ? ` ${product.priceSuffix}` : ''}</span>
          )}
        </div>
        {product.tagline && (
          <p className="text-[13px] text-[#9E9A90] mt-0.5 font-light">{product.tagline}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => onAdd(product)}
          className="flex items-center gap-1.5 rounded-full bg-[#1A1A18] text-white text-[11px] tracking-[0.08em] font-medium px-3 py-2 hover:bg-[#333330] transition-colors whitespace-nowrap"
          style={{ minHeight: '36px' }}
        >
          <Plus className="w-3 h-3" /> {t('services.addToItinerary')}
        </button>
        <a
          href={`${WHATSAPP_BASE}${waMsg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-[#E8E4DC] text-[#6B6860] text-[11px] tracking-[0.08em] font-medium px-3 py-2 hover:border-[#8B7355] hover:text-[#8B7355] transition-colors whitespace-nowrap"
          style={{ minHeight: '36px' }}
        >
          <MessageCircle className="w-3 h-3" /> {t('services.bookViaWhatsapp')}
        </a>
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
          <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
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
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

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
          <p className="text-[11px] font-medium text-white/60 mb-3 tracking-[0.08em]">{t('services.experiencesLabel')}</p>
          <h1 className="headline-xl text-white mb-4">{t('services.heroTitle')}</h1>
          <p className="body-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('services.heroSubtitle')}
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
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.gastronomyLabel')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.gastronomyTitle')}</h2>
          <p className="body-lg mb-8">
            {t('services.gastronomyDesc')}
          </p>
          <div className="border-t border-[#E8E4DC]">
            {gastronomyProducts.map(p => (
              <ServiceRow key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Wellness */}
      <section id="wellness" className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.wellnessLabel')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.wellnessTitle')}</h2>
          <p className="body-lg mb-8">
            {t('services.wellnessDesc')}
          </p>
          <div className="border-t border-[#E8E4DC]">
            {wellnessProducts.map(p => (
              <ServiceRow key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Adventure */}
      <section id="adventure" className="section-padding bg-white">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.adventureLabel')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.adventureTitle')}</h2>
            <p className="body-lg">
              {t('services.adventureDesc')}
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
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.mobilityLabel')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.mobilityTitle')}</h2>
          <p className="body-lg mb-8">
            {t('services.mobilityDesc')}
          </p>
          <div className="border-t border-[#E8E4DC]">
            {mobilityProducts.map(p => (
              <ServiceRow key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Additional Services */}
      <section id="additional" className="section-padding bg-white">
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('services.additionalLabel')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.additionalTitle')}</h2>
          <p className="body-lg mb-8">
            {t('services.additionalDesc')}
          </p>
          <div className="border-t border-[#E8E4DC]">
            {additionalProducts.map(p => (
              <ServiceRow key={p.slug} product={p} onAdd={setModalProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#1A1A18]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-lg text-white mb-4">{t('services.ctaTitle')}</h2>
          <p className="body-lg mb-8" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {t('services.ctaDescription')}
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
        <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
