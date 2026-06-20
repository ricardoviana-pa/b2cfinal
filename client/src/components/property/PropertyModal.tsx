/* ==========================================================================
   PROPERTY MODAL — V2.0 Redesign
   Drawer from right, gallery, key stats with icons, proof strip,
   what's included, Google Maps, services, adventures, itinerary
   ========================================================================== */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X, MapPin, ChevronLeft, ChevronRight, Check, Star, ExternalLink,
  Plus, BadgeCheck, Shield, Headphones, BedDouble, Bath, Users,
  Maximize, Sparkles, Award, Clock, UtensilsCrossed
} from 'lucide-react';
import { useItinerary } from '@/contexts/ItineraryContext';
import AddToItineraryModal from '@/components/itinerary/AddToItineraryModal';
import { MapView } from '@/components/Map';
import productsData from '@/data/products.json';
import destinationsData from '@/data/destinations.json';
import type { Product, Destination } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/types';
import { getPropertyImages } from '@/lib/images';

const allProducts = productsData as unknown as Product[];
const destinations = destinationsData as unknown as Destination[];

interface PropertyModalProps {
  property: Property | null;
  onClose: () => void;
}

/* Coordinates for geocoding fallback by destination */
const DEST_COORDS: Record<string, { lat: number; lng: number }> = {
  minho: { lat: 41.6946, lng: -8.8300 },
  porto: { lat: 41.1579, lng: -8.6291 },
  lisbon: { lat: 38.7223, lng: -9.1393 },
  alentejo: { lat: 38.5700, lng: -7.9100 },
  algarve: { lat: 37.0194, lng: -7.9304 },
  brazil: { lat: -22.9068, lng: -43.1729 },
};

const PROOF_STRIP = [
  { icon: BadgeCheck, text: 'Best rate guaranteed' },
  { icon: Award, text: '5-Star service' },
  { icon: Headphones, text: 'Concierge included' },
  { icon: Shield, text: '24/7 support' },
];

const WHATS_INCLUDED = [
  { icon: Sparkles, text: 'Home prepared with 47 point checklist' },
  { icon: BedDouble, text: 'Premium linens, robes, and pool towels' },
  { icon: Bath, text: 'Luxury bathroom amenities' },
  { icon: UtensilsCrossed, text: 'Fully stocked essentials (coffee, spices, basics)' },
  { icon: Star, text: 'Welcome kit with curated local products' },
  { icon: Clock, text: 'Daily housekeeping available as an add on' },
  { icon: Headphones, text: 'Dedicated concierge available 24/7' },
  { icon: MapPin, text: 'Local team minutes away' },
  { icon: Award, text: 'Access to all in house services and experiences' },
  { icon: BadgeCheck, text: 'Best rate guarantee when booking direct' },
];

export default function PropertyModal({ property, onClose }: PropertyModalProps) {
  const [currentImage, setCurrentImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    if (property) {
      setCurrentImage(0);
      document.body.style.overflow = 'hidden';
      window.history.pushState(null, '', `/homes/${property.slug}`);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [property]);

  const handleClose = useCallback(() => {
    window.history.pushState(null, '', '/homes');
    onClose();
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) handleClose();
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxOpen) setLightboxOpen(false);
        else handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [handleClose, lightboxOpen]);

  const handleGalleryTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleGalleryTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.touches[0].clientX; };
  const handleGalleryTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) setCurrentImage(p => Math.min(p + 1, totalImages - 1));
      else setCurrentImage(p => Math.max(p - 1, 0));
    }
  };

  const services = useMemo(() => allProducts.filter(p => p.type === 'service' && p.isActive), []);
  const adventures = useMemo(() => {
    if (!property) return [];
    return allProducts.filter(p =>
      p.type === 'adventure' && p.isActive &&
      (p.destinations.length === 0 || p.destinations.includes(property.destination))
    );
  }, [property]);

  const destName = useMemo(() => {
    if (!property) return '';
    const d = destinations.find(d => d.slug === property.destination);
    return d?.name || property.destination;
  }, [property]);

  const mapCenter = useMemo(() => {
    if (!property) return { lat: 39.3999, lng: -8.2245 };
    return DEST_COORDS[property.destination] || { lat: 39.3999, lng: -8.2245 };
  }, [property]);

  if (!property) return null;

  const images = property.images && property.images.length > 0 ? property.images : getPropertyImages(property.slug);
  const totalImages = images.length;
  const whatsappUrl = `https://wa.me/351927161771?text=${encodeURIComponent(property.whatsappMessage)}`;

  return (
    <>
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
      >
        <div
          className={cn(
            'absolute right-0 top-0 h-full bg-[#FAFAF7] overflow-y-auto',
            'w-full lg:w-[65%] lg:max-w-[900px]',
            'animate-in slide-in-from-right duration-300'
          )}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={handleClose}
            className="fixed top-3 right-3 lg:top-4 lg:right-4 z-[110] touch-target bg-white/90 backdrop-blur-sm hover:bg-white transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-[#1A1A18]" />
          </button>

          {/* Gallery */}
          <div
            className="relative aspect-[4/3] lg:aspect-[16/9] overflow-hidden bg-[#F5F1EB]"
            onTouchStart={handleGalleryTouchStart}
            onTouchMove={handleGalleryTouchMove}
            onTouchEnd={handleGalleryTouchEnd}
          >
            <div
              className="flex h-full transition-transform duration-400 ease-out"
              style={{ transform: `translateX(-${currentImage * 100}%)`, width: `${totalImages * 100}%` }}
            >
              {images.map((img, idx) => (
                <div key={idx} className="relative shrink-0 h-full" style={{ width: `${100 / totalImages}%` }}>
                  <img src={img} alt={`${property.name} - ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" loading={idx === 0 ? 'eager' : 'lazy'} />
                </div>
              ))}
            </div>
            {totalImages > 1 && (
              <>
                <button onClick={() => setCurrentImage(p => Math.max(p - 1, 0))} className="absolute left-4 top-1/2 -translate-y-1/2 touch-target bg-white/80 backdrop-blur-sm hover:bg-white transition-colors hidden md:flex"><ChevronLeft size={20} /></button>
                <button onClick={() => setCurrentImage(p => Math.min(p + 1, totalImages - 1))} className="absolute right-4 top-1/2 -translate-y-1/2 touch-target bg-white/80 backdrop-blur-sm hover:bg-white transition-colors hidden md:flex"><ChevronRight size={20} /></button>
              </>
            )}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
              <span className="text-white/80 text-[12px] bg-black/30 backdrop-blur-sm px-2.5 py-1">{currentImage + 1} / {totalImages}</span>
              <button onClick={() => setLightboxOpen(true)} className="bg-white/90 backdrop-blur-sm text-[#1A1A18] px-3 py-1.5 hover:bg-white transition-colors text-[11px] font-medium">View all</button>
            </div>
          </div>

          {/* ─── KEY STATS BAR ─── */}
          <div className="border-b border-[#E8E4DC] bg-white">
            <div className="px-5 lg:px-10 py-4">
              <div className="grid grid-cols-4 gap-0">
                {/* Bedrooms */}
                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                    <BedDouble size={18} className="text-[#8B7355]" />
                  </div>
                  <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{property.bedrooms}</span>
                  <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">Bedrooms</span>
                </div>

                {/* Bathrooms */}
                <div className="flex flex-col items-center text-center py-2 border-l border-[#E8E4DC]">
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                    <Bath size={18} className="text-[#8B7355]" />
                  </div>
                  <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{property.bathrooms}</span>
                  <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">Bathrooms</span>
                </div>

                {/* Guests */}
                <div className="flex flex-col items-center text-center py-2 border-l border-[#E8E4DC]">
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                    <Users size={18} className="text-[#8B7355]" />
                  </div>
                  <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{property.maxGuests}</span>
                  <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">Guests</span>
                </div>

                {/* Service Level */}
                <div className="flex flex-col items-center text-center py-2 border-l border-[#E8E4DC]">
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                    <Award size={18} className="text-[#8B7355]" />
                  </div>
                  <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>5-Star</span>
                  <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">Service</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── PROOF STRIP ─── */}
          <div className="px-5 lg:px-10 py-3 border-b border-[#E8E4DC] bg-[#F5F1EB]">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-0">
              {PROOF_STRIP.map(item => (
                <div key={item.text} className="flex items-center justify-center gap-2 lg:border-r last:border-r-0 border-[#E8E4DC]/50">
                  <item.icon size={14} className="text-[#8B7355] shrink-0" />
                  <span className="text-[11px] text-[#6B6860] font-light whitespace-nowrap">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── CONTENT ─── */}
          <div className="px-5 lg:px-10 py-6 lg:py-10 pb-28 lg:pb-10">
            <p className="text-[11px] font-medium tracking-[0.08em] text-[#8B7355] mb-2 uppercase">{destName}</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 300, color: '#1A1A18', marginBottom: '6px' }}>
              {property.name}
            </h2>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontStyle: 'italic', color: '#6B6860', marginBottom: '12px' }}>
              {property.tagline}
            </p>
            <div className="flex items-center gap-2 mb-6">
              <MapPin size={14} style={{ color: '#9E9A90' }} />
              <span className="text-[13px] text-[#6B6860]">{property.locality}, {destName}</span>
            </div>

            {/* Price & CTAs — desktop */}
            <div className="hidden lg:block border-t border-b border-[#E8E4DC] py-6 mb-8">
              <p className="text-[14px] text-[#6B6860] mb-2 font-medium">Select dates for price</p>
              <div className="flex items-center gap-1.5 mb-4">
                <BadgeCheck size={14} className="text-[#8B7355]" />
                <span className="text-[11px] tracking-[0.02em] text-[#9E9A90] font-medium">Best rate guaranteed. No booking fees.</span>
              </div>
              <div className="flex gap-3">
                <a href={property.bookingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary flex items-center gap-2">
                  CHECK AVAILABILITY <ExternalLink size={14} />
                </a>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">ASK ABOUT THIS HOME</a>
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, color: '#1A1A18', marginBottom: '12px' }}>About this home</h3>
              <div className="body-md leading-relaxed space-y-4">
                {property.description.split('\n').filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>

            {/* What's Included */}
            <div className="mb-8 p-5 lg:p-6 bg-[#F5F1EB]">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 400, color: '#1A1A18', marginBottom: '16px' }}>What's included in every stay</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {WHATS_INCLUDED.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 flex items-center justify-center shrink-0 mt-0.5 rounded-full bg-[#FAFAF7]">
                      <item.icon size={13} className="text-[#8B7355]" />
                    </div>
                    <span className="text-[12px] text-[#6B6860] font-light leading-relaxed pt-1">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Amenities */}
            {Object.values(property.amenities).some(items => (items as string[]).length > 0) && (
              <div className="mb-8">
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, color: '#1A1A18', marginBottom: '20px' }}>Amenities & features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                  {Object.entries(property.amenities).map(([category, items]) => {
                    const itemsList = items as string[];
                    if (itemsList.length === 0) return null;
                    return (
                      <div key={category}>
                        <h4 className="text-[10px] tracking-[0.05em] font-medium text-[#8B7355] mb-2.5 uppercase">{category}</h4>
                        <ul className="flex flex-col gap-1.5">
                          {itemsList.map((item: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-2">
                              <Check size={13} className="text-[#8B7355] shrink-0" />
                              <span className="text-[13px] text-[#6B6860]" style={{ fontWeight: 300 }}>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── LOCATION MAP ─── */}
            <div className="mb-8">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, color: '#1A1A18', marginBottom: '6px' }}>Location</h3>
              <p className="text-[13px] text-[#9E9A90] mb-4 font-light">{property.locality}, {destName}, Portugal</p>
              <div className="rounded-lg overflow-hidden border border-[#E8E4DC]">
                <MapView
                  className="h-[280px] lg:h-[320px]"
                  initialCenter={mapCenter}
                  initialZoom={13}
                  onMapReady={(map) => {
                    /* Geocode the locality for a more precise pin */
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode(
                      { address: `${property.locality}, ${destName}, Portugal` },
                      (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                          const pos = results[0].geometry.location;
                          map.setCenter(pos);
                          new google.maps.marker.AdvancedMarkerElement({
                            map,
                            position: pos,
                            title: property.name,
                          });
                        } else {
                          /* Fallback: place marker at destination center */
                          new google.maps.marker.AdvancedMarkerElement({
                            map,
                            position: mapCenter,
                            title: property.name,
                          });
                        }
                      }
                    );
                  }}
                />
              </div>
            </div>

            {/* Services */}
            <div className="mb-8">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, color: '#1A1A18', marginBottom: '6px' }}>Services available (add on)</h3>
              <p className="text-[13px] text-[#9E9A90] mb-5 font-light">Arranged by your concierge. Delivered by our in house team.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.map(service => (
                  <div key={service.slug} className="border border-[#E8E4DC] p-4 flex items-start justify-between gap-3 hover:border-[#8B7355]/30 transition-colors">
                    <div className="min-w-0">
                      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: '#1A1A18', marginBottom: '4px' }}>{service.name}</h4>
                      <p className="text-[11px] text-[#6B6860] font-light leading-relaxed mb-2 line-clamp-2">{service.tagline}</p>
                      <p className="text-[12px] text-[#9E9A90]">
                        {service.priceFrom ? `From \u20AC${service.priceFrom}` : 'Included'} <span className="text-[10px]">{service.priceSuffix}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setModalProduct(service)}
                      className="flex items-center gap-1 rounded-full bg-[#1A1A18] text-white text-[9px] tracking-[0.02em] font-medium px-2.5 py-1.5 hover:bg-[#333] transition-colors shrink-0"
                      style={{ minHeight: '32px' }}
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Adventures */}
            {adventures.length > 0 && (
              <div className="mb-8">
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, color: '#1A1A18', marginBottom: '6px' }}>Adventures nearby</h3>
                <p className="text-[13px] text-[#9E9A90] mb-5 font-light">Experiences available in {destName}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {adventures.map(adventure => (
                    <div key={adventure.slug} className="border border-[#E8E4DC] p-4 flex items-start justify-between gap-3 hover:border-[#8B7355]/30 transition-colors">
                      <div className="min-w-0">
                        <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: '#1A1A18', marginBottom: '4px' }}>{adventure.name}</h4>
                        <p className="text-[11px] text-[#6B6860] font-light leading-relaxed mb-2 line-clamp-2">{adventure.tagline}</p>
                        <p className="text-[12px] text-[#9E9A90]">
                          {adventure.priceFrom ? `From \u20AC${adventure.priceFrom}` : 'Custom'} <span className="text-[10px]">{adventure.priceSuffix}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setModalProduct(adventure)}
                        className="flex items-center gap-1 rounded-full bg-[#1A1A18] text-white text-[9px] tracking-[0.02em] font-medium px-2.5 py-1.5 hover:bg-[#333] transition-colors shrink-0"
                        style={{ minHeight: '32px' }}
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Mobile CTA */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E8E4DC] px-5 pt-3 pb-5 lg:hidden z-[105] safe-area-bottom">
            {/* Price row */}
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[13px] text-[#1A1A18] font-medium">Select dates for price</p>
              <span className="text-[10px] text-[#9E9A90] flex items-center gap-1">
                <BadgeCheck size={12} className="text-[#8B7355]" /> Best rate
              </span>
            </div>
            {/* Buttons row — full width, stacked on very small screens */}
            <div className="flex gap-2.5">
              <a
                href={property.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-[#1A1A18] text-white text-[11px] font-semibold py-3 hover:bg-[#333] transition-colors"
                style={{ letterSpacing: '1px' }}
              >
                CHECK AVAILABILITY
              </a>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-[#1A1A18] text-[#1A1A18] text-[11px] font-semibold py-3 hover:bg-[#F5F1EB] transition-colors"
                style={{ letterSpacing: '1px' }}
              >
                ASK CONCIERGE
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[200] bg-black/95 overflow-y-auto">
          <button onClick={() => setLightboxOpen(false)} className="fixed top-3 right-3 z-[210] touch-target bg-white/10 hover:bg-white/20 transition-colors" aria-label="Close gallery">
            <X size={20} className="text-white" />
          </button>
          <div className="container py-16 lg:py-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {images.map((img, idx) => (
                <img key={idx} src={img} alt={`${property.name} - ${idx + 1}`} className="w-full aspect-[4/3] object-cover" loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add to Itinerary Modal */}
      {modalProduct && (
        <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
      )}
    </>
  );
}
