/* ==========================================================================
   DESTINATION PAGE — sourced planning with a contextual route to homes
   ========================================================================

   The parent template defined by the destinations strategy doc (May 2026).
   It is a pure composer — data resolution (properties for this destination,
   blog articles tagged, adventures, related destinations) is the page's
   responsibility. Each section renders nothing if its data slice is empty,
   so the same template works for the Viana pilot (everything filled) and
   for scaffolded spokes (only the basics rendered).
   ========================================================================== */

import { useTranslation } from "react-i18next";
import { getDestinationPlanning } from "@/data/destination-planning";
import { MinhoVisualGuide } from "./MinhoVisualGuide";
import {
  AreaComparison,
  PlanningHero,
  PracticalPlanning,
  planningLabels,
  trackPlanning,
} from "./PlanningGuide";
import type { Destination, Property, Product } from "@/lib/types";
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
} from "./sections";

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
  const { t, i18n } = useTranslation();
  const planning = getDestinationPlanning(destination.slug, i18n.language);
  const labels = planningLabels(i18n.language);
  if (planning && destination.slug === "minho")
    return (
      <MinhoVisualGuide
        destination={destination}
        properties={properties}
        articles={articles}
        adventures={adventures}
        related={related}
        onAddToItinerary={onAddToItinerary}
        guide={planning}
        language={i18n.language}
      />
    );
  if (planning)
    return (
      <>
        <PlanningHero
          destination={destination}
          guide={planning}
          language={i18n.language}
        />
        <nav
          aria-label={t("destinationGrowth.chapters")}
          className="border-y border-pa-sand bg-white"
        >
          <div className="container flex flex-wrap gap-x-7 gap-y-1 py-3 text-sm">
            {[
              ["destination-areas", labels.areas],
              ["destination-arrival", labels.arrive],
              ["destination-rain", labels.rain],
              ["destination-seasons", labels.season],
              ["destination-homes", labels.homes],
            ].map(([id, label]) => (
              <a
                key={id}
                className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
                href={`#${id}`}
                onClick={() =>
                  trackPlanning(destination.slug, i18n.language, id, "chapter")
                }
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
        <AreaComparison guide={planning} language={i18n.language} />
        <PracticalPlanning
          guide={planning}
          slug={destination.slug}
          language={i18n.language}
        />
        <WhereToStay destination={destination} properties={properties} />
        <TheJournal destination={destination} articles={articles} />
        <div id="destination-guide" className="container py-10 scroll-mt-24">
          <h2 className="headline-lg mb-6">{labels.guide}</h2>
          <details className="site-faq border-y border-pa-sand">
            <summary>
              {t("destinationDetail.whyTitle", { name: destination.name })}
            </summary>
            <WhyThisPlace destination={destination} />
          </details>
          <details className="site-faq border-b border-pa-sand">
            <summary>{t("destinationDetail.guide.seeAndDoTitle")}</summary>
            <WhatToSeeAndDo destination={destination} />
          </details>
          {!!destination.events?.length && (
            <details className="site-faq border-b border-pa-sand">
              <summary>{t("destinationDetail.guide.eventsTitle")}</summary>
              <EventsAndPlanning destination={destination} compact />
            </details>
          )}
        </div>
        <div id="destination-experiences" className="scroll-mt-24">
          <EatDrinkExperience
            destination={destination}
            adventures={adventures}
            onAddToItinerary={onAddToItinerary}
          />
        </div>
        <FAQSection destination={destination} />
        <RelatedDestinationsAndOwnersCTA
          destination={destination}
          related={related}
        />
      </>
    );
  return (
    <>
      <HeroEditorial destination={destination} />
      <nav
        aria-label={t("destinationGrowth.chapters")}
        className="border-b border-pa-sand bg-white"
      >
        <div className="container flex gap-6 overflow-x-auto whitespace-nowrap py-2 text-sm">
          <a
            className="inline-flex min-h-11 items-center"
            href="#destination-homes"
          >
            {t("destinationGrowth.homes")}
          </a>
          <a
            className="inline-flex min-h-11 items-center"
            href="#destination-seasons"
          >
            {t("destinationGrowth.seasons")}
          </a>
          <a
            className="inline-flex min-h-11 items-center"
            href="#destination-guide"
          >
            {t("destinationGrowth.guide")}
          </a>
          {adventures.length > 0 && (
            <a
              className="inline-flex min-h-11 items-center"
              href="#destination-experiences"
            >
              {t("destinationGrowth.experiences")}
            </a>
          )}
        </div>
      </nav>
      <WhereToStay destination={destination} properties={properties} />
      <WhyThisPlace destination={destination} />
      <div id="destination-seasons" className="scroll-mt-24">
        <WhenToVisit destination={destination} />
      </div>
      <div id="destination-guide" className="container py-8 scroll-mt-24">
        <h2 className="headline-lg mb-6">{t("siteUx.travelGuide")}</h2>
        <details className="site-faq border-y border-pa-sand">
          <summary>{t("destinationDetail.guide.seeAndDoTitle")}</summary>
          <WhatToSeeAndDo destination={destination} />
        </details>
        <details className="site-faq border-b border-pa-sand">
          <summary>
            {t("destinationDetail.guide.getHereTitleNamed", {
              name: destination.name,
            })}
          </summary>
          <HowToGetHere destination={destination} />
        </details>
        {!!destination.events?.length && (
          <details className="site-faq border-b border-pa-sand">
            <summary>{t("destinationDetail.guide.eventsTitle")}</summary>
            <EventsAndPlanning destination={destination} compact />
          </details>
        )}
        {!!destination.pressQuotes?.length && (
          <details className="site-faq border-b border-pa-sand">
            <summary>{t("destinationDetail.guide.pressTitle")}</summary>
            <PressAccolades destination={destination} compact />
          </details>
        )}
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
      <RelatedDestinationsAndOwnersCTA
        destination={destination}
        related={related}
      />
    </>
  );
}

export default DestinationPage;
