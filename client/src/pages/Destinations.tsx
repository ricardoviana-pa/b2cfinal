import { Link } from 'wouter';
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
  usePageMeta({
    title: t('destinationGrowth.metaTitle'), description: t('destinationGrowth.metaDescription'), url: '/destinations',
  });
  const overrides = useDestinationOverrides(i18n.language);
  const active = destinations.filter(d => d.status === 'active' && !d.comingSoon)
    .map(d => localizeDestination(d, overrides)!);
  const regions = active.filter(d => d.slug === d.region);
  const viana = active.find(d => d.slug === 'viana-do-castelo');
  const base = `https://www.portugalactive.com/${i18n.language.split('-')[0]}`;

  return (
    <div className="min-h-screen bg-pa-paper">
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
              <p className="text-xs text-pa-brown tracking-widest uppercase mb-4">{t('destinationGrowth.eyebrow')}</p>
              <h1 className="headline-xl">{t('destinationsPage.titleFull')}</h1>
              <p className="body-lg max-w-xl mt-6">{t('destinationGrowth.intro')}</p>
            </div>
            <PortugalMap destinations={regions} />
          </div>
        </section>
        <section className="container pb-16" aria-label={t('destinationsPage.title')}>
          <div className="grid md:grid-cols-6 gap-x-6 gap-y-10">
            {regions.map((d, index) => (
              <Link key={d.slug} href={`/destinations/${d.slug}`}
                className={`group block ${index < 2 ? 'md:col-span-3' : 'md:col-span-2'}`}>
                <div className="aspect-[3/2] md:aspect-[16/10] overflow-hidden rounded-xl bg-pa-sand mb-5">
                  <img src={cdnResize(d.regionImage || d.coverImage, 1080)} srcSet={cdnSrcSet(d.regionImage || d.coverImage, [400, 640, 1080])}
                    sizes={index < 2 ? '(min-width: 768px) 45vw, 90vw' : '(min-width: 768px) 30vw, 90vw'}
                    alt={d.name} width={1080} height={720} loading={index < 2 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                </div>
                <div className="flex justify-between items-center gap-3">
                  <h2 className="headline-md">{d.name}</h2>
                  <ArrowRight className="w-5 h-5 shrink-0 text-pa-brown" aria-hidden="true" />
                </div>
                <p className="body-md mt-2 max-w-lg">{d.tagline}</p>
              </Link>
            ))}
          </div>
        </section>
        {viana && <section className="bg-white border-y border-pa-sand">
          <div className="container grid md:grid-cols-2 gap-8 lg:gap-16 py-12 lg:py-16 items-center">
            <div className="aspect-[4/3] overflow-hidden rounded-xl">
              <img src={cdnResize(viana.regionImage || viana.coverImage, 1080)} srcSet={cdnSrcSet(viana.regionImage || viana.coverImage, [400, 640, 1080])}
                sizes="(min-width: 768px) 45vw, 90vw" alt={viana.name} width={1080} height={810}
                loading="lazy" className="w-full h-full object-cover" />
            </div>
            <div className="max-w-lg">
              <p className="text-xs text-pa-brown uppercase tracking-widest mb-4">{t('destinationGrowth.guide')}</p>
              <h2 className="headline-lg mb-5">{t('destinationGrowth.cityTitle')}</h2>
              <p className="body-lg mb-7">{t('destinationGrowth.cityIntro')}</p>
              <Link href="/destinations/viana-do-castelo" className="btn-primary">{t('destinationGrowth.explore', {name: viana.name})}<ArrowRight className="w-4 h-4" /></Link>
            </div>
          </div>
        </section>}
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
