/* Barrel for the destinations template — keeps page imports clean:
 *
 *   import { DestinationPage, buildDestinationGraph } from '@/components/destinations';
 *
 * Per the destinations strategy doc (May 2026, hub-and-spoke editorial)
 * plus the Pass 3 redesign (Aman Journal / Mr & Mrs Smith register). */

export {
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
  buildDestinationGraph,
} from './sections';

export { SectionChapter } from './SectionChapter';
export type { ChapterBackground } from './SectionChapter';

export { EditorialInterlude, DestinationTOC, StickyBookingBar } from './EditorialChrome';

export { DestinationPage } from './DestinationPage';
export type { JournalArticle, DestinationPageProps } from './DestinationPage';
