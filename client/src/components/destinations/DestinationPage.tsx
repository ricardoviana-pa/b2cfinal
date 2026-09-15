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
      <WhereToStay destination={destination} properties={properties} />
      <WhyThisPlace destination={destination} />
      <div className="container py-6">
        <details className="site-faq border-t border-pa-sand">
          <summary>{t('siteUx.travelGuide')}</summary>
          <WhatToSeeAndDo destination={destination} />
          <WhenToVisit destination={destination} />
          <HowToGetHere destination={destination} />
        </details>
      </div>
      <EatDrinkExperience
        destination={destination}
        adventures={adventures}
        onAddToItinerary={onAddToItinerary}
      />
      <TheJournal destination={destination} articles={articles} />
      <FAQSection destination={destination} />
      <RelatedDestinationsAndOwnersCTA destination={destination} related={related} />
    </>
  );
}

export default DestinationPage;
