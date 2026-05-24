/* ==========================================================================
   DESTINATION PAGE — 11-section composer
   ========================================================================

   The parent template defined by the destinations strategy doc (May 2026).
   It is a pure composer — data resolution (properties for this destination,
   blog articles tagged, adventures, related destinations) is the page's
   responsibility. Each section renders nothing if its data slice is empty,
   so the same template works for the Viana pilot (everything filled) and
   for scaffolded spokes (only the basics rendered).
   ========================================================================== */

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
  return (
    <>
      {/* 1 */} <HeroEditorial destination={destination} />
      {/* 2 */} <WhyThisPlace destination={destination} />
      {/* 3 */} <WhereToStay destination={destination} properties={properties} />
      {/* 4 */} <TheJournal destination={destination} articles={articles} />
      {/* 5 */} <WhatToSeeAndDo destination={destination} />
      {/* 6 */} <WhenToVisit destination={destination} />
      {/* 7 */} <HowToGetHere destination={destination} />
      {/* 8 */}
      <EatDrinkExperience
        destination={destination}
        adventures={adventures}
        onAddToItinerary={onAddToItinerary}
      />
      {/* 9 */} <PressAccolades destination={destination} />
      {/* 10 */} <FAQSection destination={destination} />
      {/* 11 */} <RelatedDestinationsAndOwnersCTA destination={destination} related={related} />
    </>
  );
}

export default DestinationPage;
