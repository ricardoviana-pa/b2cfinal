import { Link, useSearch } from "wouter";
import { withEditorialTrip } from "@shared/editorialTripContext";
import { ArrowRight, ArrowUpRight, TrainFront, CloudRain } from "lucide-react";
import type { Destination } from "@/lib/types";
import type { PlanningGuide } from "@/data/destination-planning";
import { cdnResize, cdnSrcSet } from "@/lib/images";
import { pushDL } from "@/lib/datalayer";
import { DestinationAccess } from "./DestinationAccess";
import { destinationAccommodationCaption } from "@/lib/destinationPhotography";

export const planningLabels = (lang: string) =>
  lang.split("-")[0] === "pt"
    ? {
        back: "Todos os destinos",
        eyebrow: "Portugal, com tempo",
        plan: "Planear a viagem",
        areas: "Escolher a sua base",
        areasIntro:
          "O lugar onde fica muda a viagem. Compare o ambiente, os acessos e o que terá de planear.",
        suits: "Para quem",
        transport: "Deslocações",
        consider: "Tenha em conta",
        arrive: "Chegar e circular",
        rain: "Se chover, mude o plano",
        season: "Escolher a época",
        route: "Um percurso possível",
        sources: "Fontes e atualização",
        checked: "Informação prática verificada em",
        sourceNote:
          "Horários, acessos e condições podem mudar. Consulte o operador antes de viajar. Sugestões de visita não são serviços incluídos na estadia.",
        next: "Continue a planear",
        homes: "Escolher uma casa",
        guide: "Mais sobre o destino",
      }
    : {
        back: "All destinations",
        eyebrow: "Portugal, at your pace",
        plan: "Plan your trip",
        areas: "Choose your base",
        areasIntro:
          "Where you stay shapes your trip. Compare the setting, connections and what needs planning ahead.",
        suits: "Good for",
        transport: "Getting around",
        consider: "Keep in mind",
        arrive: "Getting here and around",
        rain: "A plan for rainy days",
        season: "Choose your season",
        route: "A possible itinerary",
        sources: "Sources and updates",
        checked: "Practical information checked on",
        sourceNote:
          "Timetables, access and conditions can change. Check with the operator before travelling. Visit suggestions are not services included in your stay.",
        next: "Keep planning",
        homes: "Find a place to stay",
        guide: "More about this destination",
      };

export function trackPlanning(
  slug: string,
  language: string,
  section: string,
  action: "chapter" | "source" | "guide" | "homes"
) {
  // Fixed editorial identifiers only: never dates, contact details or full URLs.
  pushDL({
    event: "destination_planning",
    destination: slug,
    language: language.split("-")[0],
    section,
    action,
  });
}

export function PlanningHero({
  destination: d,
  guide,
  language,
}: {
  destination: Destination;
  guide: PlanningGuide;
  language: string;
}) {
  const labels = planningLabels(language);
  const search = useSearch();
  const image = d.regionImage || d.coverImage;
  const imageCaption = destinationAccommodationCaption(d.slug, language);
  return (
    <section className="pt-28 pb-9 md:pt-32 md:pb-14 bg-pa-cream">
      <div className="container">
        <Link
          href={withEditorialTrip("/destinations", search)}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-pa-earth mb-6"
        >
          ← {labels.back}
        </Link>
        <div className="grid lg:grid-cols-[1.05fr_1fr] items-center gap-8 lg:gap-14">
          <div>
            <p className="text-xs uppercase tracking-[.14em] text-pa-gold-aa mb-5">
              {labels.eyebrow}
            </p>
            <h1 className="headline-xl !leading-[1.03] mb-5">{d.name}</h1>
            <p className="font-display text-2xl md:text-3xl leading-tight text-pa-dark mb-5">
              {guide.title}
            </p>
            <p className="text-base md:text-lg leading-relaxed text-pa-earth max-w-[58ch]">
              {guide.answer}
            </p>
            <a
              href="#destination-areas"
              onClick={() =>
                trackPlanning(d.slug, language, "areas", "chapter")
              }
              className="btn-primary mt-7"
            >
              {labels.plan}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
          <figure className="m-0 overflow-hidden rounded-t-[100px] lg:rounded-t-[180px] bg-pa-sand">
            <img
              src={cdnResize(image, 1080)}
              srcSet={cdnSrcSet(image, [480, 768, 1080])}
              sizes="(min-width:1024px) 45vw, 92vw"
              alt={imageCaption || `${d.name}, Portugal`}
              width={1080}
              height={1080}
              fetchPriority="high"
              className="w-full aspect-[4/3] lg:aspect-[1/1] object-cover"
            />
            {imageCaption && (
              <figcaption className="bg-pa-cream pt-3 text-sm text-pa-earth leading-relaxed">
                {imageCaption}
              </figcaption>
            )}
          </figure>
        </div>
      </div>
    </section>
  );
}

export function AreaComparison({
  guide,
  language,
}: {
  guide: PlanningGuide;
  language: string;
}) {
  const l = planningLabels(language);
  return (
    <section
      id="destination-areas"
      className="py-12 md:py-16 scroll-mt-24 bg-white"
    >
      <div className="container">
        <div className="max-w-2xl mb-8">
          <h2 className="headline-lg mb-4">{l.areas}</h2>
          <p className="body-lg">{l.areasIntro}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-7 md:gap-9">
          {guide.areas.map((area, i) => (
            <article
              key={area.name}
              className="border-t border-pa-dark/25 pt-5"
            >
              <span aria-hidden="true" className="text-xs text-pa-gold-aa">
                0{i + 1}
              </span>
              <h3 className="font-display text-3xl mt-3 mb-5">{area.name}</h3>
              <dl className="space-y-4 text-base leading-relaxed">
                {[
                  [l.suits, area.bestFor],
                  [l.transport, area.transport],
                  [l.consider, area.limitation],
                ].map(([term, value]) => (
                  <div key={term}>
                    <dt className="font-medium text-sm text-pa-dark mb-1">
                      {term}
                    </dt>
                    <dd className="text-pa-earth">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PracticalPlanning({
  guide,
  slug,
  language,
}: {
  guide: PlanningGuide;
  slug: string;
  language: string;
}) {
  const l = planningLabels(language);
  const search = useSearch();
  const source = (
    item: { sourceUrl: string; sourceLabel: string },
    section: string
  ) => (
    <a
      href={item.sourceUrl}
      onClick={() => trackPlanning(slug, language, section, "source")}
      className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4 text-pa-dark mt-2"
    >
      {item.sourceLabel}
      <ArrowUpRight aria-hidden="true" className="w-4 h-4 shrink-0" />
    </a>
  );
  return (
    <section className="bg-pa-cream py-12 md:py-16">
      <div className="container">
        <div id="destination-arrival" className="scroll-mt-24 mb-12">
          <h2 className="headline-lg mb-7">{l.arrive}</h2>
          <DestinationAccess slug={slug} language={language} compact />
        </div>
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-20">
          <div>
            <TrainFront
              aria-hidden="true"
              className="w-6 h-6 text-pa-gold-aa mb-4"
            />
            <h2 className="headline-lg mb-7">
              {language.startsWith("pt")
                ? "Transportes na região"
                : "Travel within the region"}
            </h2>
            <div className="space-y-7">
              {guide.arrival.map(item => (
                <article key={item.title}>
                  <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                  <p className="text-base leading-relaxed text-pa-earth">
                    {item.text}
                  </p>
                  {source(item, "arrival")}
                </article>
              ))}
            </div>
          </div>
          <div>
            <div id="destination-rain" className="scroll-mt-24">
              <CloudRain
                aria-hidden="true"
                className="w-6 h-6 text-pa-gold-aa mb-4"
              />
              <h2 className="headline-lg mb-7">{l.rain}</h2>
              <div className="space-y-6">
                {guide.rain.map(item => (
                  <article key={item.title}>
                    <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                    <p className="text-base leading-relaxed text-pa-earth">
                      {item.text}
                    </p>
                    {source(item, "rain")}
                  </article>
                ))}
              </div>
            </div>
            <div
              id="destination-seasons"
              className="scroll-mt-24 border-t border-pa-sand pt-7 mt-7"
            >
              <h2 className="font-display text-3xl mb-3">{l.season}</h2>
              <p className="text-base leading-relaxed text-pa-earth">
                {guide.season}
              </p>
            </div>
          </div>
        </div>
        {guide.itinerary && (
          <div className="mt-12 md:mt-16 border-t border-pa-sand pt-10">
            <p className="text-xs uppercase tracking-widest text-pa-gold-aa mb-3">
              {l.route}
            </p>
            <h2 className="headline-lg mb-7">{guide.itinerary.title}</h2>
            <ol className="grid md:grid-cols-2 gap-7">
              {guide.itinerary.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-pa-gold-aa text-sm"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-medium mb-2">{step.title}</h3>
                    <p className="text-base text-pa-earth leading-relaxed">
                      {step.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        <details className="site-faq border-y border-pa-sand mt-10">
          <summary>{l.sources}</summary>
          <div className="pb-5 max-w-3xl">
            <p className="text-sm leading-relaxed text-pa-earth">
              {l.checked}{" "}
              <time dateTime={guide.reviewedAt}>
                {new Date(guide.reviewedAt + "T12:00:00Z").toLocaleDateString(
                  language,
                  {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }
                )}
              </time>
              . {l.sourceNote}
            </p>
            <ul className="mt-4">
              {guide.sources.map(s => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    onClick={() =>
                      trackPlanning(slug, language, "sources", "source")
                    }
                    className="inline-flex items-center gap-2 min-h-11 text-sm underline underline-offset-4"
                  >
                    {s.label}
                    <ArrowUpRight aria-hidden="true" className="w-4 h-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </details>
        <div className="mt-8">
          <h2 className="text-sm font-medium mb-3">{l.next}</h2>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {guide.nextLinks.map(link => (
              <Link
                key={link.href}
                href={withEditorialTrip(link.href, search)}
                onClick={() => trackPlanning(slug, language, "next", "guide")}
                className="inline-flex min-h-11 items-center gap-3 text-base underline underline-offset-4"
              >
                {link.label}
                <ArrowRight aria-hidden="true" className="w-4 h-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
