/* ==========================================================================
   CONCIERGE — Services exclusive to guests staying at our properties
   Sections: Gastronomy, Wellness, Mobility, Additional Services
   ========================================================================== */

import { useMemo } from 'react';
import { Link } from 'wouter';
import { MessageCircle, ArrowRight, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import productsData from '@/data/products.json';
import type { Product } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import AnswerCapsule from '@/components/seo/AnswerCapsule';

const allProducts = productsData as unknown as Product[];
const services = allProducts.filter(p => p.type === 'service' && p.isActive);

const getService = (slug: string) => services.find(s => s.slug === slug);

const GASTRONOMY_SLUGS = ['private-chef'];
const WELLNESS_SLUGS = ['in-villa-spa', 'private-yoga', 'personal-training'];
const MOBILITY_SLUGS = ['airport-shuttle'];
const ADDITIONAL_SLUGS = ['grocery-delivery', 'babysitter', 'daily-housekeeping'];

const WHATSAPP_BASE = 'https://wa.me/351927161771?text=';

function ServiceCard({ product }: { product: Product | undefined }) {
  const { t } = useTranslation();
  if (!product) return null;
  return (
    <div className="group block">
      <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '4/5' }}>
        {product.image ? (
          <img src={product.image} alt={`${product.name} – concierge service at luxury villa in Portugal`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
        ) : (
          <div className="w-full h-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h4 className="font-display text-[1.25rem] text-white mb-1 leading-tight">{product.name}</h4>
          {product.tagline && (
            <p className="text-[12px] text-white/80 font-light line-clamp-2">{product.tagline}</p>
          )}
        </div>
      </div>
      {product.priceFrom && (
        <p className="mt-3 text-[12px] text-[#6B6860]">
          <span className="text-[#1A1A18] font-medium">{t('common.from')} {formatEurEditorial(product.priceFrom)}</span>
          <span className="text-[#9E9A90]"> {product.priceSuffix}</span>
        </p>
      )}
    </div>
  );
}

/** Single-product editorial layout: image left, copy right. Used when a section has exactly 1 product. */
function SingleServiceFeature({ product, overline, title, body }: { product: Product | undefined; overline: string; title: string; body: string }) {
  const { t } = useTranslation();
  if (!product) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '4/5' }}>
        {product.image && (
          <img src={product.image} alt={`${product.name} – concierge service at luxury villa in Portugal`} className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>
      <div>
        <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-4">{overline}</p>
        <h2 className="headline-lg text-[#1A1A18] mb-6">{title}</h2>
        <p className="body-lg mb-8">{body}</p>
        <div className="border-t border-[#E8E4DC] pt-6">
          <h3 className="font-display text-[1.5rem] text-[#1A1A18] mb-2">{product.name}</h3>
          {product.tagline && <p className="body-md mb-4">{product.tagline}</p>}
          {product.priceFrom && (
            <p className="text-[13px] text-[#1A1A18] mb-6">
              <span className="font-medium">{t('common.from')} {formatEurEditorial(product.priceFrom)}</span>
              <span className="text-[#9E9A90] ml-1">{product.priceSuffix}</span>
            </p>
          )}
          <Link href={`/services/${product.slug}`} className="inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] uppercase text-[#8B7355] hover:text-[#1A1A18] transition-colors">
            {t('services.learnMore')} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Concierge() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Concierge Services | Exclusive to Portugal Active Guests', description: 'Private chef, in-house spa, airport transfers and additional services available exclusively to guests staying at our properties.', url: '/concierge' });

  const gastronomyProducts = GASTRONOMY_SLUGS.map(getService).filter(Boolean) as Product[];
  const wellnessProducts = WELLNESS_SLUGS.map(getService).filter(Boolean) as Product[];
  const mobilityProducts = MOBILITY_SLUGS.map(getService).filter(Boolean) as Product[];
  const additionalProducts = ADDITIONAL_SLUGS.map(getService).filter(Boolean) as Product[];

  // Services are emitted as an ItemList of Service items. The brand entity
  // (Organization) already exists once globally in index.html — we reference
  // it via providedBy @id rather than re-declaring it here.
  const servicesGraph = useMemo(() => {
    const allServices = [
      ...gastronomyProducts,
      ...wellnessProducts,
      ...mobilityProducts,
      ...additionalProducts,
    ];
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Portugal Active Concierge Services',
        url: 'https://www.portugalactive.com/concierge',
        numberOfItems: allServices.length,
        itemListElement: allServices.map((service, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          item: {
            '@type': 'Service',
            name: service.name,
            description: service.tagline || service.name,
            url: `https://www.portugalactive.com/services/${service.slug}`,
            ...(service.image && { image: service.image }),
            areaServed: { '@type': 'Country', name: 'Portugal' },
            provider: { '@id': 'https://www.portugalactive.com/#organization' },
            ...(service.priceFrom && {
              offers: {
                '@type': 'Offer',
                priceCurrency: 'EUR',
                price: service.priceFrom,
                ...(service.priceSuffix && { description: service.priceSuffix }),
              },
            }),
          },
        })),
      },
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Concierge' },
      ]),
    ];
  }, [gastronomyProducts, wellnessProducts, mobilityProducts, additionalProducts]);

  const waConciergeMsgEncoded = encodeURIComponent("Hi, I'd like to talk to your concierge about planning my stay.");

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData id="services-graph" data={servicesGraph} />
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src="/experiences/pa-property-firepit.webp"
          alt="Portugal Active property terrace with fire pit at sunset"
          className="absolute inset-0 w-full h-full object-cover"
          width={1600}
          height={900}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/90 mb-3 tracking-[0.12em] uppercase">
            <Lock className="w-3 h-3" /> {t('services.exclusiveToGuests')}
          </p>
          <h1 className="headline-xl text-white mb-4">{t('services.heroTitle')}</h1>
          <p className="body-lg max-w-xl text-white/95">
            {t('services.heroBody')}
          </p>
        </div>
      </section>

      {/* Guests-only banner */}
      <div className="bg-[#F5F1EB] border-b border-[#E8E4DC]">
        <div className="container py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#6B6860]">
            <span className="font-medium text-[#1A1A18]">{t('services.guestsOnlyBanner')}</span> {t('services.guestsOnlyQuestion')}
          </p>
          <Link href="/experiences" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8B7355] hover:text-[#1A1A18] transition-colors inline-flex items-center gap-1">
            {t('services.browseExperiences')} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Answer capsule — citable concierge summary for AI engines */}
      <section className="pt-10 pb-4 bg-[#FAFAF7]">
        <div className="container max-w-3xl mx-auto">
          <AnswerCapsule
            question="What concierge services does Portugal Active offer?"
            answer="Portugal Active provides hotel-grade concierge services exclusively to guests staying at its private hotels. Services include private chef dining, in-villa spa and wellness treatments, airport transfers, car rental, and curated local experiences. Every service is delivered by the in-house team or vetted local partners. These services are not available on third-party booking platforms."
            lastUpdated="2026-04-17"
            author="Portugal Active concierge team"
            emitSchema
            schemaId="qa-services"
            cite={[
              { label: 'Browse properties', href: '/homes' },
              { label: 'Contact concierge', href: '/contact' },
            ]}
          />
        </div>
      </section>

      {/* Section Nav */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container">
          <div className="flex gap-6 overflow-x-auto scrollbar-hide py-3">
            {[
              { label: t('services.navGastronomy'), href: '#gastronomy' },
              { label: t('services.navWellness'), href: '#wellness' },
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
          {gastronomyProducts.length === 1 ? (
            <SingleServiceFeature
              product={gastronomyProducts[0]}
              overline={t('services.gastronomyOverline')}
              title={t('services.gastronomyTitle')}
              body={t('services.gastronomyBody')}
            />
          ) : (
            <>
              <div className="max-w-3xl mb-12">
                <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.12em] uppercase">{t('services.gastronomyOverline')}</p>
                <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.gastronomyTitle')}</h2>
                <p className="body-lg">{t('services.gastronomyBody')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {gastronomyProducts.map(p => (
                  <Link key={p.slug} href={`/services/${p.slug}`}><ServiceCard product={p} /></Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Wellness */}
      <section id="wellness" className="section-padding bg-[#F5F1EB]">
        <div className="container">
          <div className="max-w-3xl mb-12">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.12em] uppercase">{t('services.wellnessOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.wellnessTitle')}</h2>
            <p className="body-lg">{t('services.wellnessBody')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {wellnessProducts.map(p => (
              <Link key={p.slug} href={`/services/${p.slug}`}><ServiceCard product={p} /></Link>
            ))}
          </div>
        </div>
      </section>

      {/* Mobility */}
      <section id="mobility" className="section-padding bg-white">
        <div className="container">
          {mobilityProducts.length === 1 ? (
            <SingleServiceFeature
              product={mobilityProducts[0]}
              overline={t('services.mobilityOverline')}
              title={t('services.mobilityTitle')}
              body={t('services.mobilityBody')}
            />
          ) : (
            <>
              <div className="max-w-3xl mb-12">
                <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.12em] uppercase">{t('services.mobilityOverline')}</p>
                <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.mobilityTitle')}</h2>
                <p className="body-lg">{t('services.mobilityBody')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {mobilityProducts.map(p => (
                  <Link key={p.slug} href={`/services/${p.slug}`}><ServiceCard product={p} /></Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Additional Services */}
      <section id="additional" className="section-padding bg-[#F5F1EB]">
        <div className="container">
          <div className="max-w-3xl mb-12">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.12em] uppercase">{t('services.additionalOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-6">{t('services.additionalTitle')}</h2>
            <p className="body-lg">{t('services.additionalBody')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {additionalProducts.map(p => (
              <Link key={p.slug} href={`/services/${p.slug}`}><ServiceCard product={p} /></Link>
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

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
