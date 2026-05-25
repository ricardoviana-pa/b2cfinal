/* ==========================================================================
   DESTINATION PAGE — 12-section composer (Pass 3 editorial redesign)
   ========================================================================

   Composes the chapter components from sections.tsx + the editorial chrome
   (sticky TOC, sticky bottom CTA, full-bleed pull-quote interludes between
   chapter groups). Data resolution stays with the page that calls this
   composer — DestinationDetail.tsx — so this file is pure layout.
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
  EventsAndPlanning,
  PressAccolades,
  FAQSection,
  RelatedDestinationsAndOwnersCTA,
  CHAPTERS,
} from './sections';
import {
  EditorialInterlude,
  DestinationTOC,
  StickyBookingBar,
} from './EditorialChrome';

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
  articles: JournalArticle[];
  adventures: Product[];
  related: Destination[];
  onAddToItinerary?: (product: Product) => void;
  /** WhatsApp link for the sticky concierge button (optional). */
  whatsappUrl?: string;
}

/** Best available pull-quote source for an interlude — first a real press
 *  quote, else the destination's hero pull-quote, else null (which suppresses
 *  the interlude block entirely). */
function pickInterludeQuote(
  d: Destination,
  index: 0 | 1,
): { quote: string; attribution: string } | null {
  const press = d.pressQuotes ?? [];
  const candidates: Array<{ quote: string; attribution: string }> = [
    ...press.map(p => ({
      quote: p.quote,
      attribution: `${p.source}${p.year ? ` · ${p.year}` : ''}`,
    })),
  ];
  if (d.pullQuote && index === 0) {
    candidates.push({
      quote: d.pullQuote.text,
      attribution: `${d.pullQuote.source}${d.pullQuote.year ? ` · ${d.pullQuote.year}` : ''}`,
    });
  }
  return candidates[index] ?? null;
}

export function DestinationPage({
  destination,
  properties,
  articles,
  adventures,
  related,
  onAddToItinerary,
  whatsappUrl,
}: DestinationPageProps) {
  const interludeMidQuote = pickInterludeQuote(destination, 0);
  const interludeLateQuote = pickInterludeQuote(destination, 1);
  const interludeMidImage =
    destination.imagery?.interludeMid ?? destination.coverImage;
  const interludeLateImage =
    destination.imagery?.interludeLate ??
    destination.imagery?.interludeMid ??
    destination.coverImage;

  return (
    <>
      {/* Sticky chapter index, desktop ≥1024px */}
      <DestinationTOC chapters={CHAPTERS.map(c => ({ ...c }))} />

      {/* 1 */} <HeroEditorial destination={destination} />
      {/* 2 */} <WhyThisPlace destination={destination} />

      {/* Editorial interlude — after the why, before the property grid.
          Uses a real press quote when available; suppressed otherwise. */}
      {interludeMidQuote && interludeMidImage && (
        <EditorialInterlude
          image={interludeMidImage}
          quote={interludeMidQuote.quote}
          attribution={interludeMidQuote.attribution}
          height="tall"
        />
      )}

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

      {/* Second interlude before the events / press cluster. */}
      {interludeLateQuote && interludeLateImage && interludeLateQuote.quote !== interludeMidQuote?.quote && (
        <EditorialInterlude
          image={interludeLateImage}
          quote={interludeLateQuote.quote}
          attribution={interludeLateQuote.attribution}
          height="short"
        />
      )}

      {/* 9  */} <EventsAndPlanning destination={destination} />
      {/* 10 */} <PressAccolades destination={destination} />
      {/* 11 */} <FAQSection destination={destination} />
      {/* 12 */} <RelatedDestinationsAndOwnersCTA destination={destination} related={related} />

      {/* Sticky bottom CTA — appears after the hero is scrolled past. */}
      <StickyBookingBar
        destinationName={destination.name}
        destinationRegion={destination.region}
        whatsappUrl={whatsappUrl}
      />
    </>
  );
}

export default DestinationPage;
