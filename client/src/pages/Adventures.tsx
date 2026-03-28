/* ==========================================================================
   ADVENTURES — V1.6 Redesign
   Adventure catalogue filtered by destination, with itinerary integration
   ========================================================================== */

import { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Plus, MessageCircle, MapPin } from 'lucide-react';
import productsData from '@/data/products.json';
import type { Product, DestinationSlug } from '@/lib/types';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));

const allProducts = productsData as unknown as Product[];
const adventures = allProducts.filter(p => p.type === 'adventure' && p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

export default function Adventures() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Outdoor Adventures Portugal | Surf, Hike, Wine Tours', description: "Guided adventures across Portugal — surf lessons, hiking trails, wine tastings, coasteering. Book with your villa stay.", url: '/adventures' });
  const [destination, setDestination] = useState('all');
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const DESTINATIONS = useMemo(() => [
    { label: t('adventures.allDestinations'), value: 'all' },
    { label: t('destinations.minho'), value: 'minho' },
    { label: t('destinations.porto'), value: 'porto' },
    { label: t('destinations.lisbon'), value: 'lisbon' },
    { label: t('destinations.alentejo'), value: 'alentejo' },
    { label: t('destinations.algarve'), value: 'algarve' },
  ], [t]);

  const filtered = useMemo(() => {
    if (destination === 'all') return adventures;
    return adventures.filter(a => a.destinations.includes(destination as DestinationSlug));
  }, [destination]);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&q=80" alt="Golden beach on the Portuguese Atlantic coast – adventure experiences" className="absolute inset-0 w-full h-full object-cover" width={1400} height={933} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white mb-4">{t('adventures.title')}</h1>
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('adventures.subtitle')}
          </p>
        </div>
      </section>

      {/* Filter Bar */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container py-3 md:py-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
            <MapPin className="w-4 h-4 text-[#9E9A90] shrink-0" />
            {DESTINATIONS.map(d => (
              <button
                key={d.value}
                onClick={() => setDestination(d.value)}
                className={`px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all border shrink-0 ${
                  destination === d.value
                    ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
                    : 'bg-transparent text-[#6B6860] border-[#E8E4DC] hover:border-[#1A1A18] hover:text-[#1A1A18]'
                }`}
                style={{ minHeight: '44px', minWidth: 'auto' }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Adventures Grid */}
      <section className="section-padding">
        <div className="container">
          <p className="text-[13px] text-[#9E9A90] mb-6">
            {t('adventures.available', { count: filtered.length })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((adventure) => (
              <div key={adventure.id} className="bg-white border border-[#E8E4DC] overflow-hidden group">
                {/* Image */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  {adventure.image ? (
                    <img src={adventure.image} alt={`${adventure.name} – guided adventure in Portugal`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="w-full h-full placeholder-image" />
                  )}
                  {adventure.destinations.length > 0 && (
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {adventure.destinations.map(d => (
                        <span key={d} className="bg-white/90 backdrop-blur-sm px-2.5 py-1 text-[10px] tracking-[0.02em] font-medium text-[#6B6860]">
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-display text-lg text-[#1A1A18] mb-1 group-hover:text-[#8B7355] transition-colors">
                    {adventure.name}
                  </h3>
                  <p className="text-[13px] text-[#6B6860] font-light mb-3 line-clamp-2">{adventure.tagline}</p>

                  {(adventure.priceFrom ?? 0) > 0 && (
                    <p className="text-[14px] text-[#1A1A18] font-medium mb-4">
                      From €{(adventure.priceFrom ?? 0).toLocaleString()} <span className="text-[12px] text-[#9E9A90] font-light">{adventure.priceSuffix}</span>
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModalProduct(adventure)}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[12px] tracking-[0.02em] font-medium py-3 hover:bg-[#333] transition-colors"
                      style={{ minHeight: '44px' }}
                    >
                      <Plus className="w-4 h-4" /> {t('adventures.addToItinerary')}
                    </button>
                    <a
                      href={`https://wa.me/351927161771?text=${encodeURIComponent(adventure.whatsappMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-11 border border-[#E8E4DC] text-[#6B6860] hover:text-[#8B7355] hover:border-[#8B7355] transition-colors"
                      style={{ minHeight: '44px' }}
                      aria-label="Book via WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-[#6B6860] text-lg mb-6">
                {t('adventures.noAdventures')}
              </p>
              <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
                {t('adventures.talkToTeam')}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding text-center bg-[#F5F1EB]">
        <div className="container max-w-lg mx-auto">
          <h3 className="headline-md mb-4 text-[#1A1A18]">{t('adventures.customTitle')}</h3>
          <p className="body-md mb-8">
            {t('adventures.customBody')}
          </p>
          <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
            {t('adventures.customCta')}
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
