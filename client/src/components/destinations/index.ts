/* Barrel for the destinations template — keeps page imports clean:
 *
 *   import { DestinationPage, buildDestinationGraph } from '@/components/destinations';
 *
 * Per the destinations strategy doc (May 2026, hub-and-spoke editorial). */

export {
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
  buildDestinationGraph,
} from './sections';

export { DestinationPage } from './DestinationPage';
export type { JournalArticle, DestinationPageProps } from './DestinationPage';
