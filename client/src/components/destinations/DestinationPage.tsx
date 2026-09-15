/* ==========================================================================
   DESTINATION PAGE — inventory first, optional travel guide
   ========================================================================

   The parent template defined by the destinations strategy doc (May 2026).
   It is a pure composer — data resolution (properties for this destination,
   blog articles tagged, adventures, related destinations) is the page's
   responsibility. Each section renders nothing if its data slice is empty,
   so the same template works for the Viana pilot (everything filled) and
   for scaffolded spokes (only the basics rendered).
   ========================================================================== */

import { useTranslation } from 'react-i18next';
import type { Destination, Property, Product } from '@/lib/types';
import {
  HeroEditorial,
  WhyThisPlace,
  WhereToStay,
  TheJournal,
  WhatToSeeAndDo,
  WhenToVisit,
  HowToGetHere,
  EatDrinkExperience,
  EventsAndPlanning,
  PressAccolades,
  FAQSection,
  RelatedDestinationsAndOwnersCTA,
} from './sections';

export interface JournalArticle {
  slug: string;
  title: string;
  excerpt?: string;
  coverImage?: string;
  publishedAt?: string;
}

export interface DestinationPageProps {
  destination: Destination;
  properties: Property[];
  /** Blog articles tagged with this destination. Empty array if none. */
  articles: JournalArticle[];
  /** Bookable adventures available in this destination. */
  adventures: Product[];
  /** Sibling destinations to surface in section 11. */
  related: Destination[];
  onAddToItinerary?: (product: Product) => void;
}

export function DestinationPage({
  destination,
  properties,
  articles,
  adventures,
  related,
  onAddToItinerary,
}: DestinationPageProps) {
  const { t } = useTranslation();
  return (
    <>
      <HeroEditorial destination={destination} />
      <nav aria-label={t('destinationGrowth.chapters')} className="border-b border-pa-sand bg-white">
        <div className="container flex gap-6 overflow-x-auto whitespace-nowrap py-2 text-sm">
          <a className="inline-flex min-h-11 items-center" href="#destination-homes">{t('destinationGrowth.homes')}</a>
          <a className="inline-flex min-h-11 items-center" href="#destination-seasons">{t('destinationGrowth.seasons')}</a>
          <a className="inline-flex min-h-11 items-center" href="#destination-guide">{t('destinationGrowth.guide')}</a>
          {adventures.length > 0 && <a className="inline-flex min-h-11 items-center" href="#destination-experiences">{t('destinationGrowth.experiences')}</a>}
        </div>
      </nav>
      <WhereToStay destination={destination} properties={properties} />
      <WhyThisPlace destination={destination} />
      <div id="destination-seasons" className="scroll-mt-24">
        <WhenToVisit destination={destination} />
      </div>
      <div id="destination-guide" className="container py-8 scroll-mt-24">
        <h2 className="headline-lg mb-6">{t('siteUx.travelGuide')}</h2>
        <details className="site-faq border-y border-pa-sand">
          <summary>{t('destinationDetail.guide.seeAndDoTitle')}</summary>
          <WhatToSeeAndDo destination={destination} />
        </details>
        <details className="site-faq border-b border-pa-sand">
          <summary>{t('destinationDetail.guide.getHereTitleNamed', { name: destination.name })}</summary>
          <HowToGetHere destination={destination} />
        </details>
        {!!destination.events?.length && <details className="site-faq border-b border-pa-sand">
          <summary>{t('destinationDetail.guide.eventsTitle')}</summary>
          <EventsAndPlanning destination={destination} compact />
        </details>}
        {!!destination.pressQuotes?.length && <details className="site-faq border-b border-pa-sand">
          <summary>{t('destinationDetail.guide.pressTitle')}</summary>
          <PressAccolades destination={destination} compact />
        </details>}
      </div>
      <div id="destination-experiences" className="scroll-mt-24">
      <EatDrinkExperience
        destination={destination}
        adventures={adventures}
        onAddToItinerary={onAddToItinerary}
      />
      </div>
      <TheJournal destination={destination} articles={articles} />
      <FAQSection destination={destination} />
      <RelatedDestinationsAndOwnersCTA destination={destination} related={related} />
    </>
  );
}

export default DestinationPage;
