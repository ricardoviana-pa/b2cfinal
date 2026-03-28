/* ==========================================================================
   PROPERTY DETAIL — Full page view (not modal)
   Hero gallery, two-column layout, sticky booking card, Le Collectionist-style amenities
   ========================================================================== */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, ChevronRight, MapPin, BedDouble, Bath, Users, Award, BadgeCheck,
  Sparkles, Star, Clock, UtensilsCrossed, Headphones, ExternalLink, Plus, X,
  Wifi, Tv, Coffee, Car, Waves, Wind, Shirt, Flame, TreePine, Mountain,
  Sun, Monitor, Utensils, Sofa, type LucideIcon
} from 'lucide-react';
import AddToItineraryModal from '@/components/itinerary/AddToItineraryModal';
import productsData from '@/data/products.json';
import destinationsData from '@/data/destinations.json';
import type { Product, Destination, Property } from '@/lib/types';
import { getPropertyImages } from '@/lib/images';
import { BookingWidget } from '@/components/booking';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { trpc } from '@/lib/trpc';

const allProducts = productsData as unknown as Product[];
const destinations = destinationsData as unknown as Destination[];

/** Map amenity name (lowercase) to Lucide icon — Le Collectionist / Plum Guide style */
const AMENITY_ICON_MAP: Record<string, LucideIcon> = {
  wifi: Wifi, internet: Wifi, 'high speed wifi': Wifi, 'high-speed wifi': Wifi, 'wireless internet': Wifi,
  tv: Tv, television: Tv, 'smart tv': Tv,
  kitchen: Utensils, 'fully equipped kitchen': Utensils, 'full kitchen': Utensils,
  coffee: Coffee, 'nespresso': Coffee, 'coffee maker': Coffee, 'coffee machine': Coffee, espresso: Coffee,
  pool: Waves, swimming: Waves, 'infinity pool': Waves, 'heated pool': Waves, 'swimming pool': Waves, 'outdoor pool': Waves, 'private pool': Waves,
  parking: Car, garage: Car, 'free parking': Car, 'ev charging': Car, 'free parking on premises': Car,
  'air conditioning': Wind, ac: Wind, heating: Flame, climate: Wind,
  washer: Shirt, laundry: Shirt, dryer: Shirt, 'washing machine': Shirt, iron: Shirt,
  garden: TreePine, terrace: Sun, balcony: Sun, patio: Sun, 'garden view': TreePine, 'garden or backyard': TreePine,
  gym: Mountain, fitness: Mountain, workout: Mountain, 'horseback riding': Mountain,
  'ocean view': Waves, 'sea view': Waves, beach: Waves, beachfront: Waves, town: MapPin,
  workspace: Monitor, 'home office': Monitor, desk: Monitor, 'laptop friendly workspace': Monitor,
  bbq: Flame, grill: Flame, barbecue: Flame, 'bbq grill': Flame,
  'living room': Sofa, lounge: Sofa,
  dishwasher: Utensils, oven: Utensils, microwave: Utensils, stove: Utensils, refrigerator: Utensils,
  blender: Utensils, toaster: Utensils, kettle: Utensils,
  bathtub: Bath, 'hair dryer': Bath,
  crib: BedDouble, 'high chair': BedDouble, 'suitable for children (2-12 years)': BedDouble, 'suitable for infants (under 2 years)': BedDouble,
  'indoor fireplace': Flame, 'outdoor seating (furniture)': Sun,
  'dining table': Utensils, 'sound system': Tv,
  'private entrance': Car, 'outdoor kitchen': Utensils,
  'long term stays allowed': Clock,
  'smoke detector': Award, 'fire extinguisher': Award, 'first aid kit': Award,
};

/** Amenities to hide — low value, redundant, or clutter */
const AMENITY_BLACKLIST = new Set([
  'essentials', 'hot water', 'hangers', 'clothing storage', 'bed linens', 'towels provided',
  'cleaning disinfection', 'enhanced cleaning practices', 'high touch surfaces disinfected',
  'shampoo', 'shower gel', 'cookware', 'dishes and silverware', 'baking sheet', 'barbeque utensils',
  'wine glasses', 'wide hallway clearance', 'accessible-height bed',
  'freezer', 'babysitter recommendations', 'long term stays allowed',
  'smoke detector', 'fire extinguisher', 'first aid kit',
]);

function getAmenityIcon(name: string): LucideIcon {
  const key = name.toLowerCase().trim();
  return AMENITY_ICON_MAP[key] ?? Utensils;
}

function filterAmenities(items: string[]): string[] {
  return items.filter((x) => {
    const k = x.toLowerCase().trim();
    return !AMENITY_BLACKLIST.has(k) && x.length > 0;
  });
}

/** Parse description: handle string, split by \n\n or \n */
function formatDescription(desc: unknown): string[] {
  if (!desc) return [];
  const s = typeof desc === 'string' ? desc : String(desc);
  return s.split(/\n\n+/).flatMap(p => p.split('\n').filter(Boolean));
}

export default function PropertyDetail() {
  const { t } = useTranslation();
  const whatsIncluded = useMemo(
    () => [
      { icon: Sparkles, text: t('propertyDetail.included1') },
      { icon: BedDouble, text: t('propertyDetail.included2') },
      { icon: Bath, text: t('propertyDetail.included3') },
      { icon: UtensilsCrossed, text: t('propertyDetail.included4') },
      { icon: Star, text: t('propertyDetail.included5') },
      { icon: Clock, text: t('propertyDetail.included6') },
      { icon: Headphones, text: t('propertyDetail.included7') },
      { icon: MapPin, text: t('propertyDetail.included8') },
      { icon: Award, text: t('propertyDetail.included9') },
      { icon: BadgeCheck, text: t('propertyDetail.included10') },
    ],
    [t]
  );
  const { slug } = useParams<{ slug: string }>();
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const initialCheckin = searchParams.get('checkin') || '';
  const initialCheckout = searchParams.get('checkout') || '';
  const initialGuests = Number(searchParams.get('guests')) || 0;
  const { data: property, isLoading, error } = trpc.properties.getBySlugForSite.useQuery(
    { slug: slug ?? '' },
    { enabled: !!slug }
  );

  const [currentImage, setCurrentImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    if (property) setCurrentImage(0);
  }, [property?.slug]);

  const services = useMemo(() => allProducts.filter(p => p.type === 'service' && p.isActive), []);
  const adventures = useMemo(() => {
    if (!property) return [];
    return allProducts.filter(p =>
      p.type === 'adventure' && p.isActive &&
      (Array.isArray(p.destinations) ? (p.destinations.length === 0 || p.destinations.includes(property.destination)) : true)
    );
  }, [property]);

  const destName = useMemo(() => {
    if (!property) return '';
    const d = destinations.find(d => d.slug === property.destination);
    return d?.name || property.destination;
  }, [property]);

  const flatAmenities = useMemo(() => {
    if (!property?.amenities || typeof property.amenities !== 'object') return [];
    const all = Object.values(property.amenities).flat().filter((x): x is string => typeof x === 'string' && x.length > 0);
    return filterAmenities(all);
  }, [property?.amenities]);

  const handleGalleryTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleGalleryTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.touches[0].clientX; };
  const handleGalleryTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    const totalImages = (property?.images?.length || getPropertyImages(property?.slug ?? '').length) || 1;
    if (Math.abs(diff) > 40) {
      if (diff > 0) setCurrentImage(p => Math.min(p + 1, totalImages - 1));
      else setCurrentImage(p => Math.max(p - 1, 0));
    }
  }, [property]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="w-[320px] h-[180px] rounded-lg bg-[#F5F1EB] animate-pulse border border-[#E8E4DC]" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="headline-md mb-4">{t('propertyDetail.notFound')}</h1>
          <p className="body-lg mb-6">{t('propertyDetail.notFoundBody')}</p>
          <Link href="/homes" className="btn-primary inline-block">
            {t('propertyDetail.browseHomes')}
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const images = property.images?.length ? property.images : getPropertyImages(property.slug);
  const totalImages = Math.max(images.length, 1);
  const whatsappUrl = `https://wa.me/351927161771?text=${encodeURIComponent(property.whatsappMessage || `Hi, I am interested in ${property.name}`)}`;

  return (
    <>
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />

        {/* Hero gallery — full width, 4:3 or 16:9 */}
        <div
          className="relative w-full overflow-hidden bg-[#F5F1EB] aspect-[4/3] lg:aspect-[16/9]"
          onTouchStart={handleGalleryTouchStart}
          onTouchMove={handleGalleryTouchMove}
          onTouchEnd={handleGalleryTouchEnd}
        >
          <div
            className="flex h-full transition-transform duration-400 ease-out"
            style={{ transform: `translateX(-${currentImage * 100}%)`, width: `${totalImages * 100}%` }}
          >
            {(images.length ? images : ['']).map((img: string, idx: number) => (
              <div key={idx} className="relative shrink-0 h-full bg-[#E8E4DC]" style={{ width: `${100 / totalImages}%` }}>
                {img ? (
                  <img src={img} alt={`${property.name} - ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" loading={idx === 0 ? 'eager' : 'lazy'} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#9E9A90] text-sm">{t('propertyDetail.noImage')}</div>
                )}
              </div>
            ))}
          </div>
          {totalImages > 1 && (
            <>
              <button onClick={() => setCurrentImage(p => Math.max(p - 1, 0))} className="absolute left-4 top-1/2 -translate-y-1/2 touch-target rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors hidden md:flex"><ChevronLeft size={20} /></button>
              <button onClick={() => setCurrentImage(p => Math.min(p + 1, totalImages - 1))} className="absolute right-4 top-1/2 -translate-y-1/2 touch-target rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors hidden md:flex"><ChevronRight size={20} /></button>
            </>
          )}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
            <span className="text-white/80 text-[12px] bg-black/30 backdrop-blur-sm px-2.5 py-1">{currentImage + 1} / {totalImages}</span>
            <button onClick={() => setLightboxOpen(true)} className="rounded-full bg-white/90 backdrop-blur-sm text-[#1A1A18] px-6 py-3.5 min-h-[48px] hover:bg-white transition-colors text-[11px] font-medium tracking-[0.12em] uppercase">{t('propertyDetail.viewAll')}</button>
          </div>

        </div>

        {/* Title, location, key stats — below hero */}
        <div className="container pt-6 lg:pt-8 pb-4">
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#8B7355] mb-2 uppercase">{destName}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            {property.name}
          </h1>
          <p className="body-lg italic text-[#6B6860] mb-4">{property.tagline}</p>
          <div className="flex items-center gap-2 text-[#6B6860] mb-6">
            <MapPin size={14} className="text-[#9E9A90]" />
            <span className="text-[13px]">{property.locality}, {destName}</span>
          </div>

          {/* Key stats bar */}
          <div className="grid grid-cols-4 gap-0 border-y border-[#E8E4DC] py-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                <BedDouble size={18} className="text-[#8B7355]" />
              </div>
              <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{property.bedrooms}</span>
              <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">{t('property.bedrooms')}</span>
            </div>
            <div className="flex flex-col items-center text-center border-x border-[#E8E4DC]">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                <Bath size={18} className="text-[#8B7355]" />
              </div>
              <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{property.bathrooms}</span>
              <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">{t('property.bathrooms')}</span>
            </div>
            <div className="flex flex-col items-center text-center border-r border-[#E8E4DC]">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                <Users size={18} className="text-[#8B7355]" />
              </div>
              <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{property.maxGuests}</span>
              <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">{t('property.guests')}</span>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F1EB] mb-2">
                <Award size={18} className="text-[#8B7355]" />
              </div>
              <span className="text-[18px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>{t('property.fiveStar')}</span>
              <span className="text-[10px] text-[#9E9A90] tracking-[0.05em] uppercase mt-0.5">{t('property.serviceLabel')}</span>
            </div>
          </div>
        </div>


        {/* Two-column layout: main content (left 2/3) + sticky booking (right 1/3) */}
        <div className={property.guestyId ? "container pb-8 lg:pb-16" : "container pb-24 lg:pb-16"}>
          <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-12">
            {/* Main content — left 2/3 */}
            <div className="order-2 lg:order-1 lg:col-span-2 space-y-10 lg:space-y-12 pt-6">
              {/* 1. What's included */}
              <section className="p-5 lg:p-6 bg-[#F5F1EB]">
                <h2 className="headline-sm text-[#1A1A18] mb-4">{t('propertyDetail.includedTitle')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {whatsIncluded.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-7 h-7 flex items-center justify-center shrink-0 mt-0.5 rounded-full bg-[#FAFAF7]">
                        <item.icon size={13} className="text-[#8B7355]" />
                      </div>
                      <span className="text-[12px] text-[#6B6860] font-light leading-relaxed pt-1">{item.text}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Editorial description */}
              <section>
                <h2 className="headline-sm text-[#1A1A18] mb-4">{t('propertyDetail.aboutTitle')}</h2>
                <div className="body-lg space-y-4">
                  {formatDescription(property.description).length > 0 ? (
                    formatDescription(property.description).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))
                  ) : (
                    <p>{t('propertyDetail.welcomeFallback', { name: property.name, locality: property.locality, destination: destName })}</p>
                  )}
                </div>
              </section>

              {/* 3. Amenities — Le Collectionist style icon grid */}
              <section>
                <h2 className="headline-sm text-[#1A1A18] mb-6">{t('propertyDetail.amenitiesTitle')}</h2>
                {flatAmenities.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {flatAmenities.map((item, idx) => {
                      const Icon = getAmenityIcon(item);
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#F5F1EB]/50">
                          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#FAFAF7] shrink-0">
                            <Icon size={18} className="text-[#8B7355]" />
                          </div>
                          <span className="text-[13px] text-[#6B6860] font-light">{item}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="body-md text-[#9E9A90]">{t('propertyDetail.amenitiesContact')}</p>
                )}
              </section>

              {/* 4. Services (add-on) */}
              <section>
                <h2 className="headline-sm text-[#1A1A18] mb-2">{t('propertyDetail.servicesTitle')}</h2>
                <p className="body-md text-[#9E9A90] mb-5">{t('propertyDetail.servicesSubtitle')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map(service => (
                    <div key={service.slug} className="border border-[#E8E4DC] p-4 flex items-start justify-between gap-3 hover:border-[#8B7355]/30 transition-colors">
                      <div className="min-w-0">
                        <h3 className="font-display text-[15px] text-[#1A1A18] mb-1">{service.name}</h3>
                        <p className="text-[11px] text-[#6B6860] font-light leading-relaxed mb-2 line-clamp-2">{service.tagline}</p>
                        <p className="text-[12px] text-[#9E9A90]">
                          {service.priceFrom ? t('propertyDetail.fromPrice', { price: String(service.priceFrom) }) : t('bookingWidget.included')} <span className="text-[10px]">{service.priceSuffix}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setModalProduct(service)}
                        className="flex items-center gap-1 rounded-full bg-[#1A1A18] text-white text-[9px] tracking-[0.02em] font-medium px-2.5 py-1.5 hover:bg-[#333] transition-colors shrink-0"
                      >
                        <Plus className="w-3 h-3" /> {t('propertyDetail.add')}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Adventures nearby */}
              {adventures.length > 0 && (
                <section>
                  <h2 className="headline-sm text-[#1A1A18] mb-2">{t('propertyDetail.adventuresTitle')}</h2>
                  <p className="body-md text-[#9E9A90] mb-5">{t('propertyDetail.adventuresSubtitle', { destination: destName })}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {adventures.map(adventure => (
                      <div key={adventure.slug} className="border border-[#E8E4DC] p-4 flex items-start justify-between gap-3 hover:border-[#8B7355]/30 transition-colors">
                        <div className="min-w-0">
                          <h3 className="font-display text-[15px] text-[#1A1A18] mb-1">{adventure.name}</h3>
                          <p className="text-[11px] text-[#6B6860] font-light leading-relaxed mb-2 line-clamp-2">{adventure.tagline}</p>
                          <p className="text-[12px] text-[#9E9A90]">
                            {adventure.priceFrom ? t('propertyDetail.fromPrice', { price: String(adventure.priceFrom) }) : t('propertyDetail.custom')} <span className="text-[10px]">{adventure.priceSuffix}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => setModalProduct(adventure)}
                          className="flex items-center gap-1 rounded-full bg-[#1A1A18] text-white text-[9px] tracking-[0.02em] font-medium px-2.5 py-1.5 hover:bg-[#333] transition-colors shrink-0"
                        >
                          <Plus className="w-3 h-3" /> {t('propertyDetail.add')}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 6. Location map */}
              <section>
                <h2 className="headline-sm text-[#1A1A18] mb-2">{t('propertyDetail.locationTitle')}</h2>
                <p className="body-md text-[#9E9A90] mb-4">{t('propertyDetail.locationLine', { locality: property.locality, destination: destName })}</p>
                <div className="rounded-lg overflow-hidden border border-[#E8E4DC]">
                  <iframe
                    title={`${property.name} — ${property.locality}`}
                    className="w-full h-[280px] lg:h-[320px] border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(`${property.locality}, ${destName}, Portugal`)}&z=13&output=embed`}
                    allowFullScreen
                  />
                </div>
              </section>
            </div>

            {/* Sticky booking card — right 1/3 */}
            <aside id="property-booking" className="order-1 lg:order-2 lg:col-span-1 pt-6 lg:pt-0">
              <div className="property-sticky-card lg:sticky lg:top-[100px]">
                {property.guestyId ? (
                  <>
                    <BookingWidget
                      guestyId={property.guestyId}
                      propertyName={property.name}
                      pricePerNight={(property as any).pricePerNight || property.priceFrom || 0}
                      maxGuests={property.maxGuests || 10}
                      minNights={(property as any).minNights}
                      cleaningFee={(property as any).cleaningFee}
                      bookingUrl={property.bookingUrl}
                      destination={property.destination}
                      initialCheckIn={initialCheckin}
                      initialCheckOut={initialCheckout}
                      initialGuests={initialGuests}
                    />
                    <Link
                      href={`/booking/${property.guestyId}/summary`}
                      className="mt-4 block text-center text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] underline-offset-4 hover:underline"
                    >
                      {t('property.guidedFlow')}
                    </Link>
                  </>
                ) : (
                  <div className="bg-[#FAFAF7] border border-[#E8E4DC] p-6">
                    {property.priceFrom > 0 && (
                      <p className="font-display text-[32px] font-light text-[#1A1A18] mb-2">
                        {t('property.fromPerNight', { price: String(property.priceFrom) })} <span className="text-[18px] text-[#9E9A90]">{t('property.perNight')}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mb-4">
                      <BadgeCheck size={14} className="text-[#8B7355]" />
                      <span className="text-[11px] tracking-[0.02em] text-[#9E9A90] font-medium">{t('property.directConcierge')}</span>
                    </div>
                    <div className="space-y-3">
                      <a href={property.bookingUrl || whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full flex items-center justify-center gap-2">
                        {t('property.checkAvailability')} <ExternalLink size={14} />
                      </a>
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">
                        {t('property.askAboutHome')}
                      </a>
                    </div>
                  </div>
                )}

                {/* Concierge CTA — secondary, doesn't compete with primary Reserve */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost w-full mt-4 flex items-center justify-center gap-2 text-[#8B7355]"
                >
                  {t('property.needHelpConcierge')}
                </a>
              </div>
            </aside>
          </div>
        </div>

        {/* Mobile: sticky booking card at bottom when scrolling */}
        {!property.guestyId && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E8E4DC] p-4 z-40 safe-area-bottom">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {property.priceFrom > 0 && (
                <p className="font-display text-[18px] font-light text-[#1A1A18]">
                  {t('property.fromPerNight', { price: String(property.priceFrom) })} <span className="text-[12px] text-[#9E9A90]">{t('property.perNight')}</span>
                </p>
              )}
              <p className="text-[11px] text-[#9E9A90] flex items-center gap-1">
                <BadgeCheck size={12} className="text-[#8B7355]" /> {t('property.conciergeShort')}
              </p>
            </div>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0">
              {t('property.talkConciergeMobile')}
            </a>
          </div>
        </div>
        )}

        <Footer />
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[200] bg-black/95 overflow-y-auto">
          <button onClick={() => setLightboxOpen(false)} className="fixed top-3 right-3 z-[210] touch-target rounded-full bg-white/10 hover:bg-white/20 transition-colors" aria-label={t('propertyDetail.closeGallery')}>
            <X size={20} className="text-white" />
          </button>
          <div className="container py-16 lg:py-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {images.map((img: string, idx: number) => (
                <img key={idx} src={img} alt={`${property.name} - ${idx + 1}`} className="w-full aspect-[4/3] object-cover" loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      )}

      {modalProduct && (
        <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
      )}
    </>
  );
}
