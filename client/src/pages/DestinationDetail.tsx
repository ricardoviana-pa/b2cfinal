/* ==========================================================================
   DESTINATION DETAIL — V1.6 Mega-guide
   Hero, editorial "Why", info grid, properties, services, adventures
   ========================================================================== */

import { useState, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { BedDouble, Users, ArrowRight, MapPin, Sun, Plane, Plus } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import AddToItineraryModal from '@/components/itinerary/AddToItineraryModal';
import destinationsData from '@/data/destinations.json';
import productsData from '@/data/products.json';
import { trpc } from '@/lib/trpc';
import type { Destination, Property, Product } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];
const allProducts = productsData as unknown as Product[];

export default function DestinationDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const allProperties = ((propsData ?? []).filter((p: any) => p.isActive !== false)) as Property[];

  const dest = destinations.find(d => d.slug === slug);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const destProperties = useMemo(() => {
    if (!dest) return [];
    return allProperties.filter(p => p.destination === dest.slug);
  }, [dest]);

  const services = useMemo(() => allProducts.filter(p => p.type === 'service' && p.isActive), []);
  const adventures = useMemo(() => {
    if (!dest) return [];
    return allProducts.filter(p => p.type === 'adventure' && p.isActive && p.destinations.includes(dest.slug));
  }, [dest]);

  if (!dest) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header variant="solid" />
        <div className="container pt-32 pb-20 text-center">
          <h1 className="headline-lg text-[#1A1A18] mb-4">Destination not found</h1>
          <Link href="/destinations" className="text-[#8B7355] hover:underline">Back to destinations</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        {dest.coverImage ? (
          <img src={dest.coverImage} alt={dest.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 placeholder-image" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <Link href="/destinations" className="text-[13px] text-white/60 hover:text-white/80 transition-colors mb-3 inline-block">
            ← All destinations
          </Link>
          <h1 className="headline-xl text-white mb-3">{dest.name}</h1>
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>{dest.tagline}</p>
        </div>
      </section>

      {/* Editorial: Why */}
      <section className="section-padding bg-white">
        <div className="container max-w-3xl mx-auto">
          {(dest as any).whyOverline && (
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{(dest as any).whyOverline}</p>
          )}
          <h2 className="headline-lg text-[#1A1A18] mb-8">Why {dest.name}</h2>
          {dest.whyDescription ? (
            dest.whyDescription.split('\n\n').map((para: string, i: number) => (
              <p key={i} className="body-lg mb-5 last:mb-0">{para}</p>
            ))
          ) : (
            <p className="body-lg">{dest.description}</p>
          )}
        </div>
      </section>

      {/* Info grid */}
      <section className="py-10 bg-[#FAFAF7]">
        <div className="container max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-start gap-3 p-5 bg-white border border-[#E8E4DC]">
              <Plane className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1">How to get here</p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {dest.howToGetHere || 'Direct flights from major European cities. Transfer service available.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5 bg-white border border-[#E8E4DC]">
              <Sun className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1">Best time to visit</p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {dest.bestTimeToVisit || 'Year-round destination. Peak season June–September.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5 bg-white border border-[#E8E4DC]">
              <MapPin className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1">What to expect</p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {dest.whatToExpect || 'A unique blend of culture, gastronomy, and natural beauty.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Insider Recommendations */}
      {dest.insiderRecommendations && dest.insiderRecommendations.length > 0 && (
        <section className="section-padding bg-[#F5F1EB]">
          <div className="container">
            <h2 className="headline-lg text-[#1A1A18] mb-3">Our local picks</h2>
            <p className="body-lg text-[#6B6860] mb-8">Places, people, and experiences our team recommends in {dest.name}.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {dest.insiderRecommendations.map((rec: { name: string; category: string; description: string }, idx: number) => (
                <div key={idx} className="bg-white border border-[#E8E4DC] p-6">
                  <span className="text-[11px] font-medium tracking-[0.02em] text-[#9E9A90] mb-2 block">
                    {rec.category.replace('-', ' ')}
                  </span>
                  <h3 className="font-display text-lg text-[#1A1A18] mb-2">{rec.name}</h3>
                  <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>{rec.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Properties */}
      {destProperties.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container">
            <div className="flex items-end justify-between mb-8">
            <h2 className="headline-lg text-[#1A1A18]">Homes in {dest.name}</h2>
            <a href="/homes" className="hidden md:flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors">
              VIEW ALL HOMES <ArrowRight className="w-4 h-4" />
            </a>
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {destProperties.map(property => (
                <Link key={property.id} href={`/homes/${property.slug}`} className="group block">
                  <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '4/3' }}>
                    {property.images && property.images.length > 0 ? (
                      <img src={property.images[0]} alt={property.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
                    ) : (
                      <div className="w-full h-full placeholder-image" />
                    )}
                  </div>
                  <div className="pt-3">
                    <h3 className="text-[1rem] font-display text-[#1A1A18] group-hover:text-[#8B7355] transition-colors mb-1">{property.name}</h3>
                    <div className="flex items-center gap-3 text-[13px] text-[#6B6860] mb-1">
                      <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {property.bedrooms}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {property.maxGuests}</span>
                    </div>
                    <p className="text-[14px] text-[#1A1A18] font-medium">From €{property.priceFrom.toLocaleString()} <span className="text-[#9E9A90] font-normal">/ night</span></p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Email capture for destinations with no properties */}
      {destProperties.length === 0 && !dest.comingSoon && (
        <section className="section-padding bg-white">
          <div className="container max-w-xl text-center">
            <h2 className="headline-lg text-[#1A1A18] mb-4">New homes coming soon to {dest.name}</h2>
            <p className="body-lg mb-6">We're curating a collection of exceptional private homes in {dest.name}. Be the first to know when they're available.</p>
            <form onSubmit={(e) => { e.preventDefault(); }} className="flex gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Your email address"
                className="flex-1 px-4 py-3 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355]"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
              />
              <button type="submit" className="btn-primary px-6 whitespace-nowrap">Notify me</button>
            </form>
          </div>
        </section>
      )}

      {/* Services */}
      <section className="section-padding bg-[#FAFAF7]">
        <div className="container">
          <h2 className="headline-lg text-[#1A1A18] mb-3">Services available</h2>
          <p className="body-lg mb-8 max-w-xl">Arranged by your concierge. Delivered by our in house team.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {services.slice(0, 8).map(service => (
              <div key={service.id} className="bg-white border border-[#E8E4DC] p-5 flex flex-col">
                <h4 className="text-[15px] font-medium text-[#1A1A18] mb-2" style={{ fontFamily: 'var(--font-body)' }}>{service.name}</h4>
                <p className="text-[13px] text-[#6B6860] flex-1 mb-3 leading-relaxed line-clamp-2" style={{ fontWeight: 300 }}>{service.description}</p>
                {(service.priceFrom ?? 0) > 0 && <p className="text-[13px] text-[#8B7355] mb-3">From €{(service.priceFrom ?? 0).toLocaleString()}</p>}
                <button
                  onClick={() => setModalProduct(service)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                  style={{ minHeight: 'auto', minWidth: 'auto' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add to itinerary
                </button>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link href="/concierge" className="inline-flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors">
              See all services <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Adventures */}
      {adventures.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container">
            <h2 className="headline-lg text-[#1A1A18] mb-3">Adventures in {dest.name}</h2>
            <p className="body-lg mb-8 max-w-xl">Curated by our local team. Unique to this region.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {adventures.map(adv => (
                <div key={adv.id} className="group">
                  <div className="relative overflow-hidden bg-[#E8E4DC] mb-3" style={{ aspectRatio: '3/2' }}>
                    {adv.image ? (
                      <img src={adv.image} alt={adv.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
                    ) : (
                      <div className="w-full h-full placeholder-image" />
                    )}
                  </div>
                  <h4 className="text-[15px] font-medium text-[#1A1A18] mb-1" style={{ fontFamily: 'var(--font-body)' }}>{adv.name}</h4>
                  <p className="text-[13px] text-[#6B6860] mb-2 leading-relaxed line-clamp-2" style={{ fontWeight: 300 }}>{adv.description}</p>
                  <div className="flex items-center justify-between">
                    {(adv.priceFrom ?? 0) > 0 && <p className="text-[13px] text-[#8B7355]">From €{(adv.priceFrom ?? 0).toLocaleString()}</p>}
                    <button
                      onClick={() => setModalProduct(adv)}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add to itinerary
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Add to Itinerary Modal */}
      {modalProduct && (
        <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
