import { Link, useSearch } from 'wouter';
import { destinationAccommodationCaption } from '@/lib/destinationPhotography';
import { destinationHomesHref } from '@shared/destinationNavigation';
import { withEditorialTrip } from '@shared/editorialTripContext';
import { getDestinationPlanning } from '@/data/destination-planning';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import destinationsData from '@/data/destinations.json';
import { localizeDestination, useDestinationOverrides } from '@/lib/localizeContent';
import PortugalMap from '@/components/destinations/PortugalMap';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import { cdnResize, cdnSrcSet } from '@/lib/images';
import type { Destination } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];

export default function Destinations() {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  usePageMeta({
    title: t('destinationGrowth.metaTitle'), description: t('destinationGrowth.metaDescription'), url: '/destinations',
  });
  const overrides = useDestinationOverrides(i18n.language);
  const active = destinations.filter(d => d.status === 'active' && !d.comingSoon)
    .map(d => localizeDestination(d, overrides)!)
    .map(d => d.slug === 'minho' ? { ...d, name: t('destinations.minho') } : d);
  const regions = active.filter(d => ['minho','porto','douro','lisbon','alentejo','algarve'].includes(d.slug));
  const towns = active.filter(d => !regions.includes(d));
  const base = `https://www.portugalactive.com/${i18n.language.split('-')[0]}`;

  return (
    <div className="min-h-screen bg-pa-cream">
      <StructuredData id="destinations-breadcrumb" data={[
        buildBreadcrumbSchema([{ name: t('nav.home'), item: '/' }, { name: t('nav.destinations') }]),
        { '@type': 'CollectionPage', '@id': `${base}/destinations`, url: `${base}/destinations`,
          name: t('destinationGrowth.metaTitle'), description: t('destinationGrowth.metaDescription'),
          mainEntity: { '@type': 'ItemList', itemListElement: active.map((d, index) => ({
            '@type': 'ListItem', position: index + 1, name: d.name, url: `${base}/destinations/${d.slug}`,
          })) },
        },
      ]} />
      <Header variant="solid" />
      <div>
        <section className="page-intro !pb-10">
          <div className="container grid lg:grid-cols-[1fr_1fr] gap-6 lg:gap-16 items-center">
            <div>
              <p className="text-xs text-pa-gold-aa tracking-widest uppercase mb-4">{t('destinationGrowth.eyebrow')}</p>
              <h1 className="headline-xl">{t('destinationsPage.titleFull')}</h1>
              <p className="body-lg max-w-xl mt-6">{t('destinationGrowth.intro')}</p>
            </div>
            <PortugalMap destinations={regions} />
          </div>
        </section>
        <section className="container pb-16" aria-label={t('destinationsPage.title')}>
          <div className="grid md:grid-cols-6 gap-x-6 gap-y-10">
            {regions.map((d, index) => (
              <article key={d.slug} className="group block md:col-span-3 lg:col-span-2">
                <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} aria-label={t('destinationGrowth.explore',{name:d.name})}>
                <div className="aspect-[3/2] md:aspect-[16/10] overflow-hidden rounded-xl bg-pa-sand mb-5">
                  <img src={cdnResize(d.regionImage || d.coverImage, 1080)} srcSet={cdnSrcSet(d.regionImage || d.coverImage, [400, 640, 1080])}
                    sizes={index < 2 ? '(min-width: 768px) 45vw, 90vw' : '(min-width: 768px) 30vw, 90vw'}
                    alt={destinationAccommodationCaption(d.slug,i18n.language) || d.name} width={1080} height={720} loading={index < 2 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                </div>
                {destinationAccommodationCaption(d.slug,i18n.language) && <p className="text-xs text-pa-earth mb-3">{destinationAccommodationCaption(d.slug,i18n.language)}</p>}
                <div className="flex justify-between items-center gap-3">
                  <h2 className="headline-md">
                    {d.slug === 'minho' ? d.name.split(' · ').map((part, partIndex) => (
                      <span key={part} className={partIndex === 0 ? 'block' : 'block mt-1 text-[0.78em] text-pa-stone-aa'}>{part}</span>
                    )) : d.name}
                  </h2>
                  <ArrowRight className="w-5 h-5 shrink-0 text-pa-gold-aa" aria-hidden="true" />
                </div>
                </Link>
                <p className="body-md mt-3 max-w-lg">{getDestinationPlanning(d.slug,i18n.language)?.title || d.tagline}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
                  <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4">{t('destinationGrowth.guide')}<ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>
                  <Link href={withEditorialTrip(destinationHomesHref(d),search)} className="inline-flex min-h-11 items-center underline underline-offset-4">{t('destinationGrowth.homes')}</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="bg-white border-y border-pa-sand py-12 lg:py-16">
          <div className="container"><h2 className="headline-lg mb-8">{t('planning.towns')}</h2>
            <div className="grid md:grid-cols-3 gap-8">{towns.map(d=><article key={d.slug}>
              <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)}><img src={cdnResize(d.regionImage || d.coverImage,768)} srcSet={cdnSrcSet(d.regionImage || d.coverImage,[400,640,768])} sizes="(min-width:768px) 30vw, 92vw" alt={destinationAccommodationCaption(d.slug,i18n.language) || d.name} width={768} height={576} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl mb-5" /><h3 className="headline-md">{d.name}</h3></Link>
              {destinationAccommodationCaption(d.slug,i18n.language) && <p className="text-xs text-pa-earth mt-2">{destinationAccommodationCaption(d.slug,i18n.language)}</p>}
              <p className="body-md mt-3">{getDestinationPlanning(d.slug,i18n.language)?.title || d.tagline}</p>
              <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4 mt-3 text-sm">{t('destinationGrowth.explore',{name:d.name})}<ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>
            </article>)}</div>
          </div>
        </section>
        <section className="container py-14 lg:py-20">
          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="headline-lg mb-4">{t('destinationGrowth.corporateTitle')}</h2>
              <p className="body-md max-w-2xl">{t('destinationGrowth.corporateIntro')}</p>
            </div>
            <Link href="/corporate-retreats" className="btn-primary self-start lg:self-center">{t('destinationGrowth.corporateCta')}<ArrowRight className="w-4 h-4" /></Link>
          </div>
        </section>
      </div>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
