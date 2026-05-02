/* ==========================================================================
   DESTINATION DETAIL — V1.6 Mega-guide
   Hero, editorial "Why", info grid, properties, services, adventures
   ========================================================================== */

import { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useParams, Link } from 'wouter';
import { ArrowRight, MapPin, Sun, Plane, Plus } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import PropertyCard from '@/components/property/PropertyCard';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));
import destinationsData from '@/data/destinations.json';
import productsData from '@/data/products.json';
import { trpc } from '@/lib/trpc';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import AnswerCapsule from '@/components/seo/AnswerCapsule';
import type { Destination, Property, Product } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';

const destinations = destinationsData as unknown as Destination[];
const allProducts = productsData as unknown as Product[];

export default function DestinationDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const allProperties = ((propsData ?? []).filter((p: any) => p.isActive !== false)) as Property[];

  const dest = destinations.find(d => d.slug === slug);
  usePageMeta({
    title: dest ? `${dest.name} Portugal | Luxury Villas and Experiences` : undefined,
    description: dest ? `Discover ${dest.name}. Private villas with pool, concierge, and curated experiences. Book direct with Portugal Active.`.slice(0, 155) : undefined,
    image: dest?.coverImage,
    url: dest ? `/destinations/${dest.slug}` : undefined,
  });
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const destinationGraph = useMemo(() => {
    if (!dest) return null;
    const containsPlace = allProperties
      .filter((p) => p.destination === dest.slug)
      .map((p) => ({
        '@type': 'VacationRental',
        name: p.name,
        url: `https://www.portugalactive.com/homes/${p.slug}`,
      }));
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'TouristDestination',
        name: dest.name,
        description: dest.description || dest.tagline,
        url: `https://www.portugalactive.com/destinations/${dest.slug}`,
        image: dest.coverImage,
        ...(containsPlace.length > 0 && { containsPlace }),
      },
      buildBreadcrumbSchema([
        { name: t('destinationDetail.breadcrumbHome'), item: '/' },
        { name: t('destinationDetail.breadcrumbDestinations'), item: '/destinations' },
        { name: dest.name },
      ]),
    ];
  }, [dest, allProperties]);

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
          <h1 className="headline-lg text-[#1A1A18] mb-4">{t('destinationsPage.notFound')}</h1>
          <Link href="/destinations" className="text-[#8B7355] hover:underline">{t('destinationsPage.backToDestinations')}</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {destinationGraph && <StructuredData id={`destination-${dest.slug}`} data={destinationGraph} />}
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        {dest.coverImage ? (
          <img src={dest.coverImage} alt={`${dest.name}, Portugal – luxury villa destination`} className="absolute inset-0 w-full h-full object-cover" width={1600} height={900} fetchPriority="high" />
        ) : (
          <div className="absolute inset-0 placeholder-image" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <Link href="/destinations" className="text-[13px] text-white/60 hover:text-white/80 transition-colors mb-3 inline-block">
            ← {t('destinationsPage.backToDestinations')}
          </Link>
          <h1 className="headline-xl text-white mb-3">{dest.name}</h1>
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>{dest.tagline}</p>
        </div>
      </section>

      {/* Answer capsule — citable destination summary for AI engines */}
      <section className="pt-10 pb-4 bg-white">
        <div className="container max-w-3xl mx-auto">
          <AnswerCapsule
            question={`Why stay in ${dest.name} with Portugal Active?`}
            answer={`${dest.name} is one of Portugal Active's curated destinations, featuring ${destProperties.length} private hotel${destProperties.length !== 1 ? 's' : ''} managed to five-star standards. ${dest.tagline || dest.description || ''} Every property includes a dedicated concierge, daily housekeeping, and access to private chef and curated local experiences. Book direct for the best rate and a fully managed stay.`}
            lastUpdated="2026-04-17"
            author="Portugal Active concierge team"
            emitSchema
            schemaId={`qa-dest-${dest.slug}`}
            cite={[
              { label: `${dest.name} properties`, href: `/homes?destination=${dest.slug}` },
              { label: 'All destinations', href: '/destinations' },
              { label: 'Concierge services', href: '/concierge' },
            ]}
          />
        </div>
      </section>

      {/* Editorial: Why */}
      <section className="section-padding bg-white">
        <div className="container max-w-3xl mx-auto">
          {(dest as any).whyOverline && (
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{(dest as any).whyOverline}</p>
          )}
          <h2 className="headline-lg text-[#1A1A18] mb-8">{t('destinationDetail.whyTitle', { name: dest.name })}</h2>
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
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1">{t('destinationDetail.howToGetHere')}</p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {dest.howToGetHere || t('destinationDetail.howToGetHereDefault')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5 bg-white border border-[#E8E4DC]">
              <Sun className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1">{t('destinationsPage.bestTimeToVisit')}</p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {dest.bestTimeToVisit || t('destinationsPage.bestTimeDefault')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5 bg-white border border-[#E8E4DC]">
              <MapPin className="w-5 h-5 text-[#8B7355] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[14px] font-medium text-[#1A1A18] mb-1">{t('destinationDetail.whatToExpect')}</p>
                <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {dest.whatToExpect || t('destinationDetail.whatToExpectDefault')}
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
            <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationDetail.ourLocalPicks')}</h2>
            <p className="body-lg text-[#6B6860] mb-8">{t('destinationDetail.ourLocalPicksSubtitle', { name: dest.name })}</p>
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
            <h2 className="headline-lg text-[#1A1A18]">{t('destinationDetail.homesIn', { name: dest.name })}</h2>
            <a href="/homes" className="hidden md:flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors">
              {t('destinationDetail.viewAllHomes')} <ArrowRight className="w-4 h-4" />
            </a>
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {destProperties.map(property => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Info banner for destinations with no properties yet */}
      {destProperties.length === 0 && !dest.comingSoon && (
        <section className="section-padding bg-white">
          <div className="container max-w-xl text-center">
            <h2 className="headline-lg text-[#1A1A18] mb-4">{t('destinationDetail.newHomesComingSoon', { name: dest.name })}</h2>
            <p className="body-lg">{t('destinationDetail.newHomesComingSoonSubtitle', { name: dest.name })}</p>
          </div>
        </section>
      )}

      {/* Services */}
      <section className="section-padding bg-[#FAFAF7]">
        <div className="container">
          <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationsPage.servicesAvailable')}</h2>
          <p className="body-lg mb-8 max-w-xl">
            <Trans
              i18nKey="destinationsPage.servicesIntro"
              values={{ destination: dest.name }}
              components={{ 1: <Link href="/services" className="text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4 decoration-[#E8E4DC]" /> }}
            />
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {services.slice(0, 8).map(service => (
              <div key={service.id} className="bg-white border border-[#E8E4DC] p-5 flex flex-col">
                <h4 className="text-[15px] font-medium text-[#1A1A18] mb-2" style={{ fontFamily: 'var(--font-body)' }}>{service.name}</h4>
                <p className="text-[13px] text-[#6B6860] flex-1 mb-3 leading-relaxed line-clamp-2" style={{ fontWeight: 300 }}>{service.description}</p>
                {(service.priceFrom ?? 0) > 0 && <p className="text-[13px] text-[#8B7355] mb-3">{t('destinationDetail.fromPrice', { price: formatEurEditorial(service.priceFrom ?? 0) })}</p>}
                <button
                  onClick={() => setModalProduct(service)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                  style={{ minHeight: 'auto', minWidth: 'auto' }}
                >
                  <Plus className="w-3.5 h-3.5" /> {t('destinationsPage.addToItinerary')}
                </button>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link href="/services" className="inline-flex items-center gap-2 text-[13px] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors">
              {t('destinationsPage.seeAllServices')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Adventures */}
      {adventures.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container">
            <h2 className="headline-lg text-[#1A1A18] mb-3">{t('destinationsPage.adventuresIn', { destination: dest.name })}</h2>
            <p className="body-lg mb-8 max-w-xl">
              <Trans
                i18nKey="destinationsPage.adventuresIntro"
                components={{ 1: <Link href="/adventures" className="text-[#8B7355] hover:text-[#1A1A18] transition-colors underline underline-offset-4 decoration-[#E8E4DC]" /> }}
              />
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {adventures.map(adv => (
                <div key={adv.id} className="group">
                  <div className="relative overflow-hidden bg-[#E8E4DC] mb-3" style={{ aspectRatio: '3/2' }}>
                    {adv.image ? (
                      <img src={adv.image} alt={`${adv.name} – outdoor experience in ${dest.name}, Portugal`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" width={800} height={600} />
                    ) : (
                      <div className="w-full h-full placeholder-image" />
                    )}
                  </div>
                  <h4 className="text-[15px] font-medium text-[#1A1A18] mb-1" style={{ fontFamily: 'var(--font-body)' }}>{adv.name}</h4>
                  <p className="text-[13px] text-[#6B6860] mb-2 leading-relaxed line-clamp-2" style={{ fontWeight: 300 }}>{adv.description}</p>
                  <div className="flex items-center justify-between">
                    {(adv.priceFrom ?? 0) > 0 && <p className="text-[13px] text-[#8B7355]">{t('destinationDetail.fromPrice', { price: formatEurEditorial(adv.priceFrom ?? 0) })}</p>}
                    <button
                      onClick={() => setModalProduct(adv)}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('destinationsPage.addToItinerary')}
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
        <Suspense fallback={null}>
          <AddToItineraryModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} />
        </Suspense>
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
