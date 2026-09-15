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
import { localizeProduct } from '@/lib/localizeProduct';
import type { Product } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';

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
    <Link href={`/services/${product.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-xl bg-[#E8E4DC]" style={{ aspectRatio: '4/3' }}>
        {product.image ? (
          <img src={product.image} alt={`${product.name} – concierge service at luxury villa in Portugal`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
        ) : (
          <div className="w-full h-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h3 className="font-display text-[1.25rem] text-white mb-1 leading-tight">{product.name}</h3>
          {product.tagline && (
            <p className="text-[12px] text-white/80 font-light line-clamp-2">{product.tagline}</p>
          )}
        </div>
      </div>
      {product.priceFrom && (
        <p className="mt-3 text-[12px] text-[#6B6860]">
          <span className="text-[#1A1A18] font-medium">{t('common.from')} {formatEurEditorial(product.priceFrom)}</span>
          <span className="text-[#726D63]"> {product.priceSuffix}</span>
        </p>
      )}
    <span className="inline-flex items-center gap-2 mt-3 min-h-11 body-sm font-medium text-pa-dark">{t('siteUx.viewService')} <ArrowRight className="w-4 h-4" /></span>
    </Link>
  );
}

/** Single-product editorial layout: image left, copy right. Used when a section has exactly 1 product. */
function SingleServiceFeature({ product, overline, title, body }: { product: Product | undefined; overline: string; title: string; body: string }) {
  const { t } = useTranslation();
  if (!product) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <div className="relative overflow-hidden rounded-xl bg-[#E8E4DC]" style={{ aspectRatio: '4/3' }}>
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
          {product.priceFrom && (
            <p className="text-[13px] text-[#1A1A18] mb-6">
              <span className="font-medium">{t('common.from')} {formatEurEditorial(product.priceFrom)}</span>
              <span className="text-[#726D63] ml-1">{product.priceSuffix}</span>
            </p>
          )}
        </div>
      <Link href={`/services/${product.slug}`} className="btn-ghost">{t('siteUx.viewService')} <ArrowRight className="w-4 h-4" /></Link>
      </div>
    </div>
  );
}

export default function Concierge() {
  const { t, i18n } = useTranslation();
  usePageMeta({ title: 'Concierge Services | Exclusive to Portugal Active Guests', description: 'Private chef, in-house spa, airport transfers and additional services available exclusively to guests staying at our properties.', url: '/concierge' });

  const loc = (p: Product | undefined) => localizeProduct(p, i18n.language) as Product;
  const gastronomyProducts = GASTRONOMY_SLUGS.map(getService).filter(Boolean).map(loc) as Product[];
  const wellnessProducts = WELLNESS_SLUGS.map(getService).filter(Boolean).map(loc) as Product[];
  const mobilityProducts = MOBILITY_SLUGS.map(getService).filter(Boolean).map(loc) as Product[];
  const additionalProducts = ADDITIONAL_SLUGS.map(getService).filter(Boolean).map(loc) as Product[];

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
      <section className="page-hero">
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
            {t('conversion.extrasNote')}
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <a href="#gastronomy" className="btn-white">{t('siteUx.exploreServices')}</a>
            <Link href="/homes" className="btn-ghost-light">{t('siteUx.findStay')}</Link>
          </div>
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
              body={gastronomyProducts[0].description || gastronomyProducts[0].tagline || ''}
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
                  <ServiceCard key={p.slug} product={p} />
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {wellnessProducts.map(p => (
              <ServiceCard key={p.slug} product={p} />
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
              body={mobilityProducts[0].description || mobilityProducts[0].tagline || ''}
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
                  <ServiceCard key={p.slug} product={p} />
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
              <ServiceCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#1A1A18]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-lg text-white mb-4">{t('services.ctaTitle')}</h2>
          <p className="body-lg mb-8" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {t('conversion.extrasNote')}
          </p>
          <a
            href={`${WHATSAPP_BASE}${waConciergeMsgEncoded}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-white"
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
