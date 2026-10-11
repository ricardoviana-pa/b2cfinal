import { useState } from 'react';
import { Link, useSearch } from 'wouter';
import { destinationAccommodationCaption } from '@/lib/destinationPhotography';
import { destinationHomesHref } from '@shared/destinationNavigation';
import { withEditorialTrip } from '@shared/editorialTripContext';
import { ArrowRight, Plane, CalendarDays, CarFront } from 'lucide-react';
import { destinationDiscovery, discoveryLanguages, discoveryText, tripInterests, type TripInterest } from '@/data/destination-discovery';
import LocalStaySupport from '@/components/destinations/LocalStaySupport';
import { pushDL } from '@/lib/datalayer';
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
  const [interest, setInterest] = useState<TripInterest>('all');
  const language = i18n.language.split('-')[0];
  const pt = language === 'pt';
  const discovery = discoveryLanguages(language);
  const tx = (copy: [string, string]) => discoveryText(copy, language);
  const track = (destination: string, section: string, action: string) => pushDL({ event: 'destination_planning', destination, language, section, action });
  usePageMeta({
    title: t('destinationGrowth.metaTitle'), description: t('destinationGrowth.metaDescription'), url: '/destinations',
  });
  const overrides = useDestinationOverrides(i18n.language);
  const active = destinations.filter(d => d.status === 'active' && !d.comingSoon)
    .map(d => localizeDestination(d, overrides)!)
    .map(d => d.slug === 'minho' ? { ...d, name: t('destinations.minho') } : d);
  const regions = active.filter(d => ['minho','porto','douro','lisbon','alentejo','algarve'].includes(d.slug));
  const towns = active.filter(d => !regions.includes(d));
  const suggested = regions.filter(d => !discovery || interest === 'all' || destinationDiscovery[d.slug]?.interests.includes(interest));
  const base = `https://www.portugalactive.com/${i18n.language.split('-')[0]}`;

  return (
    <div className="min-h-screen bg-pa-cream">
      <StructuredData id="destinations-breadcrumb" data={[
        buildBreadcrumbSchema([{ name: 'Portugal Active', item: '/' }, { name: t('nav.destinations') }]),
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
              {discovery && <div className="flex flex-wrap gap-x-6 gap-y-2 mt-7">
                <a href="#choose-destination" className="btn-primary">{pt ? 'Encontrar o meu destino' : 'Find my kind of Portugal'}<ArrowRight size={17} /></a>
                <Link href={withEditorialTrip('/contact?subject=plan-my-stay', search)} onClick={() => track('index', 'hero', 'contact')} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{pt ? 'Pedir uma recomendação' : 'Ask for a recommendation'}</Link>
              </div>}
            </div>
            <PortugalMap destinations={regions} />
          </div>
        </section>
        <section id="choose-destination" className="container pb-16 scroll-mt-28" aria-label={t('destinationsPage.title')}>
          {discovery && <div className="pt-8 pb-9 border-t border-pa-sand">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-6">
              <h2 className="headline-lg">{pt ? 'Como imagina os seus dias?' : 'What would your perfect days look like?'}</h2>
              <p className="body-md max-w-md">{pt ? 'Comece pelo que lhe apetece. Estas são as nossas sugestões para escolher uma região.' : 'Start with what you love. These are our suggestions for finding your region.'}</p>
            </div>
            <div className="flex flex-wrap gap-3" role="group" aria-label={pt ? 'Tipo de viagem' : 'Type of trip'}>
              {tripInterests.map(item => <button key={item.id} type="button" aria-pressed={interest === item.id} onClick={() => { setInterest(item.id); track('index', item.id, 'filter'); }} className={`min-h-12 px-5 py-3 rounded-full text-sm border transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 ${interest === item.id ? 'bg-pa-dark text-white border-pa-dark' : 'bg-white border-pa-sand hover:border-pa-dark'}`}>{tx(item.label)}</button>)}
            </div>
            <p className="text-xs text-pa-stone-aa mt-4" role="status">{pt ? `${suggested.length} regiões para explorar · Durações sugeridas, à sua medida` : `${suggested.length} regions to explore · Suggested lengths, yours to adapt`}</p>
          </div>}
          <div className="grid md:grid-cols-6 gap-x-6 gap-y-10">
            {suggested.map((d, index) => (
              <article key={d.slug} className="group block md:col-span-3 lg:col-span-2">
                <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} onClick={() => track(d.slug, 'region-card', 'guide')} aria-label={t('destinationGrowth.explore',{name:d.name})}>
                <div className="aspect-[3/2] md:aspect-[16/10] overflow-hidden rounded-xl bg-pa-sand mb-5">
                  <img src={cdnResize(d.regionImage || d.coverImage, 1080)} srcSet={cdnSrcSet(d.regionImage || d.coverImage, [400, 640, 1080])}
                    sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 90vw"
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
                <p className="body-md mt-3 max-w-lg">{discovery && destinationDiscovery[d.slug] ? tx(destinationDiscovery[d.slug].line) : d.tagline}</p>
                {discovery && destinationDiscovery[d.slug] && <ul className="space-y-3 text-sm leading-relaxed mt-5 pt-5 border-t border-pa-sand text-pa-stone-aa">
                  <li className="flex gap-3"><Plane className="w-4 h-4 mt-1 shrink-0" aria-hidden="true" /><span>{tx(destinationDiscovery[d.slug].airport)}</span></li>
                  <li className="flex gap-3"><CalendarDays className="w-4 h-4 mt-1 shrink-0" aria-hidden="true" /><span>{tx(destinationDiscovery[d.slug].stay)}</span></li>
                  <li className="flex gap-3"><CarFront className="w-4 h-4 mt-1 shrink-0" aria-hidden="true" /><span>{tx(destinationDiscovery[d.slug].access)}</span></li>
                </ul>}
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
                  <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} onClick={() => track(d.slug, 'region-card', 'guide')} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4">{t('destinationGrowth.guide')}<ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>
                  <Link href={withEditorialTrip(destinationHomesHref(d),search)} onClick={() => track(d.slug, 'region-card', 'homes')} className="inline-flex min-h-11 items-center underline underline-offset-4" aria-label={`${t('destinationGrowth.homes')} · ${d.name}`}>{t('destinationGrowth.homes')}</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="bg-white border-y border-pa-sand py-12 lg:py-16">
          <div className="container"><h2 className="headline-lg mb-8">{t('planning.towns')}</h2>
            <div className="grid md:grid-cols-3 gap-8">{towns.map(d=><article key={d.slug}>
              <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} onClick={() => track(d.slug, 'town-card', 'guide')}><img src={cdnResize(d.regionImage || d.coverImage,768)} srcSet={cdnSrcSet(d.regionImage || d.coverImage,[400,640,768])} sizes="(min-width:768px) 30vw, 92vw" alt={destinationAccommodationCaption(d.slug,i18n.language) || d.name} width={768} height={576} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl mb-5" /><h3 className="headline-md">{d.name}</h3></Link>
              {destinationAccommodationCaption(d.slug,i18n.language) && <p className="text-xs text-pa-earth mt-2">{destinationAccommodationCaption(d.slug,i18n.language)}</p>}
              <p className="body-md mt-3">{d.tagline}</p>
              <Link href={withEditorialTrip(`/destinations/${d.slug}`,search)} onClick={() => track(d.slug, 'town-card', 'guide')} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4 mt-3 text-sm">{t('destinationGrowth.explore',{name:d.name})}<ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>
            </article>)}</div>
          </div>
        </section>
        {discovery && <section className="container py-12 lg:py-16">
          <h2 className="headline-lg mb-3">{pt ? 'Já sabe o que a casa precisa de ter?' : 'Already know what your home needs?'}</h2>
          <p className="body-md mb-6">{pt ? 'Explore as coleções e confirme na ficha de cada casa as comodidades e a localização.' : 'Explore the collections and check each home for its amenities and location.'}</p>
          <div className="flex flex-wrap gap-3">{[
            ['villas-with-private-pool', pt ? 'Casas com piscina' : 'Homes with a pool'],
            ['beach-villas', pt ? 'Perto da praia no Norte' : 'Beach stays in the North'],
            ['large-group-villas', pt ? 'Casas para 12 ou mais' : 'Homes for 12 or more'],
          ].map(([slug, label]) => <Link key={slug} href={withEditorialTrip(`/collections/${slug}`, search)} onClick={() => track('index', slug, 'homes')} className="inline-flex min-h-12 items-center gap-3 rounded-full border border-pa-sand px-5 py-3 text-sm hover:bg-white">{label}<ArrowRight size={16} /></Link>)}</div>
        </section>}
        <LocalStaySupport />
        <section className="container py-10 border-t border-pa-sand">
          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-lg font-medium mb-2">{t('destinationGrowth.corporateTitle')}</h2>
              <p className="text-sm leading-relaxed text-pa-stone-aa max-w-2xl">{t('destinationGrowth.corporateIntro')}</p>
            </div>
            <Link href="/corporate-retreats" className="inline-flex min-h-11 gap-2 items-center underline underline-offset-4 text-sm self-start lg:self-center">{t('destinationGrowth.corporateCta')}<ArrowRight className="w-4 h-4" /></Link>
          </div>
        </section>
      </div>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
