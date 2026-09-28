import { useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  CarFront,
  Compass,
  Heart,
  Leaf,
  MapPin,
  Plane,
  Plus,
  Sun,
  Wine,
  Coffee,
  TrainFront,
} from "lucide-react";
import { withEditorialTrip } from "@shared/editorialTripContext";
import { cdnResize, cdnSrcSet } from "@/lib/images";
import {
  editorialSources,
  editorialText,
  type DestinationEditorial,
} from "@/data/destination-editorial";
import type { PlanningGuide } from "@/data/destination-planning";
import type { DestinationPageProps } from "./DestinationPage";
import { PORTUGAL_MAINLAND_OUTLINE } from "./PortugalMap";
import { trackPlanning } from "./PlanningGuide";
import { DestinationAccess } from "./DestinationAccess";
import {
  WhereToStay,
  TheJournal,
  RelatedDestinationsAndOwnersCTA,
} from "./sections";
import "./MinhoVisualGuide.css";
import "./DestinationVisualGuide.css";

function Photo({
  src,
  alt,
  hero = false,
}: {
  src: string;
  alt: string;
  hero?: boolean;
}) {
  return (
    <img
      src={cdnResize(src, hero ? 1600 : 1000)}
      srcSet={cdnSrcSet(src, [480, 800, 1200, 1600])}
      sizes={hero ? "100vw" : "(min-width: 1024px) 55vw, 100vw"}
      alt={alt}
      width={1600}
      height={1067}
      loading={hero ? "eager" : "lazy"}
      fetchPriority={hero ? "high" : undefined}
      decoding="async"
    />
  );
}

/** The approved Minho visual language, with destination-specific content and routes. */
export function DestinationVisualGuide({
  destination: d,
  properties,
  articles,
  related,
  editorial: e,
  guide,
  language,
}: DestinationPageProps & {
  editorial: DestinationEditorial;
  guide: PlanningGuide;
  language: string;
}) {
  const pt = language.split("-")[0] === "pt";
  const tx = (value: [string, string]) => editorialText(value, language);
  const search = useSearch();
  const href = (path: string) => withEditorialTrip(path, search);
  const [nights, setNights] = useState<3 | 5 | 7>(5);
  const [routeId, setRouteId] = useState(e.routes[0].id);
  const route = e.routes.find(r => r.id === routeId) || e.routes[0];
  const track = (
    section: string,
    action: "chapter" | "source" | "homes" | "guide" = "chapter"
  ) => trackPlanning(d.slug, language, section, action);
  const sourceLink = (id: string, section: string) => {
    const source = editorialSources[id];
    if (!source) return null;
    return (
      <a
        className="minho-text-link"
        href={source.url}
        onClick={() => track(section, "source")}
      >
        {pt ? "Planear a visita" : "Plan your visit"}
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    );
  };
  const cityHomes =
    d.slug === "porto"
      ? properties.filter(p => p.locality?.toLowerCase() === "porto")
      : properties;
  const outsidePorto =
    d.slug === "porto"
      ? properties.filter(p =>
          ["trofa", "amarante"].includes(p.locality?.toLowerCase() || "")
        )
      : [];
  const localEsposende =
    d.slug === "esposende" &&
    properties.some(p => p.locality?.toLowerCase() === "esposende");
  const alternatives = d.slug === "esposende" && !localEsposende;
  const chapters = [
    ["first-visit", pt ? "Primeira visita" : "First visit"],
    ["nature", pt ? "Paisagens" : "Landscapes"],
    ["areas", pt ? "Escolher a zona" : "Choose your area"],
    ["stay-length", pt ? "Os seus dias" : "Your days"],
    ["taste", pt ? "À mesa" : "At the table"],
    ["culture", pt ? "Descobrir" : "Discover"],
    ["arrival", pt ? "Chegar e circular" : "Getting around"],
    ["homes", pt ? "Casas" : "Homes"],
  ];
  const refs = Array.from(
    new Set(
      [...e.moments, ...e.tables, ...e.culture]
        .map(x => x.source)
        .concat(
          d.slug === "algarve"
            ? ["G06", "G10"]
            : d.slug === "alentejo"
              ? ["T04", "T05", "T14", "T15"]
              : []
        )
    )
  )
    .map(id => editorialSources[id])
    .filter(Boolean);
  const homeLabel = alternatives
    ? pt
      ? "Explorar estadias no Minho"
      : "Explore stays in the Minho"
    : pt
      ? "Encontrar a sua casa"
      : "Find your home";

  return (
    <div
      className="minho-editorial destination-editorial"
      data-destination-guide={d.slug}
    >
      <section className="minho-hero">
        <Photo
          src={d.regionImage || d.coverImage}
          alt={`${tx(e.name)} · Portugal`}
          hero
        />
        <div className="minho-hero-shade" />
        <div className="container minho-hero-content">
          <Link className="minho-back" href={href("/destinations")}>
            ← {pt ? "Todos os destinos" : "All destinations"}
          </Link>
          <div className="minho-hero-copy">
            <p className="minho-kicker">
              PORTUGAL ACTIVE ·{" "}
              {pt ? "LUGARES PARA VIVER" : "PLACES TO EXPERIENCE"}
            </p>
            <h1>{tx(e.name)}</h1>
            <p className="minho-hero-line">{tx(e.line)}</p>
            <p className="minho-hero-intro">{tx(e.intro)}</p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2 mt-7">
              <a
                className="minho-hero-link"
                href="#destination-first-visit"
                onClick={() => track("hero")}
              >
                {pt ? "Imagine a sua viagem" : "Picture your trip"}
                <ArrowRight size={17} />
              </a>
              <a
                className="minho-hero-link"
                href="#destination-homes"
                onClick={() => track("hero", "homes")}
              >
                {homeLabel}
                <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </div>
      </section>
      <nav
        className="minho-chapters"
        aria-label={pt ? "Capítulos do destino" : "Destination chapters"}
      >
        <div className="container flex gap-7">
          {chapters.map(([id, label]) => (
            <a key={id} href={`#destination-${id}`} onClick={() => track(id)}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      <section
        id="destination-first-visit"
        className="minho-section minho-orientation"
      >
        <div className="container minho-orientation-grid">
          <figure className="minho-locator">
            <svg
              viewBox="45 15 225 385"
              role="img"
              aria-label={`${tx(e.name)} · Portugal`}
            >
              <path
                d={PORTUGAL_MAINLAND_OUTLINE}
                fill="#dce5db"
                stroke="#9baa99"
                strokeWidth="1"
              />
              <circle
                cx={e.point[0]}
                cy={e.point[1]}
                r="22"
                fill="#9cb797"
                opacity=".35"
              />
              <circle cx={e.point[0]} cy={e.point[1]} r="5" fill="#294c3a" />
              <text
                x="150"
                y="230"
                fontSize="10"
                fill="#677463"
                letterSpacing="2"
                transform="rotate(-90 150 230)"
              >
                PORTUGAL
              </text>
            </svg>
            <figcaption>{tx(e.name)} · Portugal</figcaption>
          </figure>
          <div>
            <p className="minho-kicker">
              {pt ? "É A SUA PRIMEIRA VEZ?" : "YOUR FIRST TIME HERE?"}
            </p>
            <h2>{pt ? "Comece por se situar." : "Find your bearings."}</h2>
            <p className="minho-orientation-intro">{tx(e.orientation)}</p>
            <div className="minho-first-facts">
              <a href="#destination-stay-length">
                <Compass size={20} />
                <span>
                  <strong>
                    {pt ? "3, 5 ou 7 noites" : "3, 5 or 7 nights"}
                  </strong>
                  {pt
                    ? "Escolha o tempo e imagine os seus dias."
                    : "Choose your length of stay and picture your days."}
                </span>
              </a>
              <a href="#destination-arrival">
                <Plane size={20} />
                <span>
                  <strong>{pt ? "A sua chegada" : "Your arrival"}</strong>
                  {tx(e.airport)}
                </span>
              </a>
              <a href="#destination-areas">
                <CarFront size={20} />
                <span>
                  <strong>
                    {pt ? "A base faz a diferença" : "Your base matters"}
                  </strong>
                  {tx(e.mobility)}
                </span>
              </a>
            </div>
            <p className="minho-fit">
              <Heart size={16} />
              {tx(e.fit)}
            </p>
          </div>
        </div>
      </section>

      <section id="destination-nature" className="minho-section bg-pa-cream">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt
                  ? "A PAISAGEM FAZ PARTE DA VIAGEM"
                  : "THE LANDSCAPE IS PART OF THE JOURNEY"}
              </p>
              <h2>
                {pt
                  ? "Três razões para sair e descobrir."
                  : "Three reasons to get out and explore."}
              </h2>
            </div>
            <p>
              {pt
                ? "Escolha o momento que mais lhe apetece. Há tempo para descobrir e tempo para simplesmente estar."
                : "Choose the moment that appeals to you. There is time to explore and time to simply be."}
            </p>
          </div>
          <figure className="destination-landscape-feature">
            <Photo src={e.photo.src} alt={tx(e.photo.caption)} />
            <figcaption>
              <MapPin size={15} />
              {tx(e.photo.caption)}
            </figcaption>
          </figure>
          <div className="minho-landscapes destination-moments">
            {e.moments.map((m, i) => (
              <article key={m.place[0]} className="minho-landscape-copy">
                <span className="minho-number">
                  0{i + 1} · {tx(m.place)}
                </span>
                <h3>{tx(m.title)}</h3>
                <p>{tx(m.text)}</p>
                <p className="minho-practical-note">{tx(m.plan)}</p>
                {sourceLink(m.source, "nature")}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="destination-areas" className="minho-section bg-white">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt
                  ? "ESCOLHER BEM MUDA OS DIAS"
                  : "THE RIGHT BASE SHAPES YOUR DAYS"}
              </p>
              <h2>
                {alternatives
                  ? pt
                    ? "Que parte da costa quer conhecer?"
                    : "Which part of the coast will you explore?"
                  : pt
                    ? "Encontre a sua zona."
                    : "Find your area."}
              </h2>
            </div>
            <p>
              {pt
                ? "Use estas zonas para orientar o programa. A localização concreta de cada casa vem a seguir."
                : "Use these areas to shape your plans. Then check the exact location of each home."}
            </p>
          </div>
          <div className="minho-bases destination-bases">
            {e.bases.map(b => (
              <article key={b.name}>
                <span className="minho-base-tag">{tx(b.tag)}</span>
                <h3>{b.name}</h3>
                <p>{tx(b.text)}</p>
                <div className="minho-base-transport">
                  <CarFront size={19} />
                  <p>{tx(b.transport)}</p>
                </div>
              </article>
            ))}
          </div>
          <a
            href="#destination-homes"
            className="minho-text-link mt-5"
            onClick={() => track("areas", "homes")}
          >
            {homeLabel}
            <ArrowRight size={17} />
          </a>
        </div>
      </section>

      <section
        id="destination-stay-length"
        className="minho-section minho-itinerary"
      >
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt ? "IMAGINE OS SEUS DIAS AQUI" : "PICTURE YOUR DAYS HERE"}
              </p>
              <h2>
                {pt ? "Quanto tempo tem para ficar?" : "How long can you stay?"}
              </h2>
            </div>
            <p>{tx(route.intro)}</p>
          </div>
          {e.routes.length > 1 && (
            <div
              className="destination-route-controls"
              role="group"
              aria-label={pt ? "Zona do roteiro" : "Itinerary area"}
            >
              {e.routes.map(r => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={r.id === route.id}
                  aria-controls="destination-suggested-days"
                  onClick={() => {
                    setRouteId(r.id);
                    track(`route_${r.id}`);
                  }}
                >
                  {tx(r.label)}
                </button>
              ))}
            </div>
          )}
          <div
            className="minho-duration-controls"
            role="group"
            aria-label={
              pt ? "Duração sugerida da estadia" : "Suggested length of stay"
            }
          >
            {([3, 5, 7] as const).map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={nights === value}
                aria-controls="destination-suggested-days"
                onClick={() => {
                  setNights(value);
                  track(`stay_${value}_nights`);
                }}
              >
                {value} {pt ? "noites" : "nights"}
              </button>
            ))}
          </div>
          <p className="minho-duration-summary" aria-live="polite">
            {pt
              ? `${nights - 1} dias completos, mais chegada e partida. `
              : `${nights - 1} full days, plus arrival and departure. `}
            {tx(route.label)}
          </p>
          <p className="destination-arrival-note">
            {pt
              ? "À chegada, instale-se e escolha uma refeição perto da casa. No dia de partida, deixe tempo para o pequeno-almoço e a viagem."
              : "On arrival, settle in and choose a meal near your home. On departure day, leave time for breakfast and the journey."}
          </p>
          <ol id="destination-suggested-days" className="minho-day-grid">
            {route.days.slice(0, nights - 1).map((day, i) => (
              <li key={`${route.id}-${i}`}>
                <span className="minho-day-number">
                  {pt ? "DIA COMPLETO" : "FULL DAY"} {i + 1}
                </span>
                <span className="minho-place">
                  <MapPin size={14} />
                  {tx(day.place)}
                </span>
                <h3>{tx(day.title)}</h3>
                <p>{tx(day.text)}</p>
              </li>
            ))}
          </ol>
          <div className="minho-itinerary-footer">
            <p>
              {pt
                ? "Uma sugestão de ritmo, adaptável à casa e ao grupo. Visitas, atividades, refeições e transportes são reservados separadamente."
                : "A suggested pace, adaptable to your home and group. Visits, activities, meals and transport are booked separately."}
            </p>
            <a
              className="btn-primary"
              href="#destination-homes"
              onClick={() => track("itinerary", "homes")}
            >
              {homeLabel}
              <ArrowRight size={17} />
            </a>
          </div>
        </div>
      </section>

      <section id="destination-taste" className="minho-section minho-taste">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt
                  ? "O LUGAR TAMBÉM SE DESCOBRE À MESA"
                  : "DISCOVER THE PLACE AT THE TABLE"}
              </p>
              <h2>
                {pt
                  ? "Sabores para guardar na memória."
                  : "Flavours to remember."}
              </h2>
            </div>
            <p>{tx(e.taste)}</p>
          </div>
          <div className="minho-restaurants destination-tables">
            {e.tables.map((t, i) => (
              <article key={t.name}>
                <span className="minho-number">0{i + 1}</span>
                <p className="minho-kicker">{tx(t.place)}</p>
                <h3>{t.name}</h3>
                <p className="mt-4">{tx(t.text)}</p>
                {sourceLink(t.source, "taste")}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="destination-culture" className="minho-section minho-culture">
        <span
          id="destination-experiences"
          className="minho-legacy-anchor"
          aria-hidden="true"
        />
        <span
          id="destination-rain"
          className="minho-legacy-anchor"
          aria-hidden="true"
        />
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt
                  ? "EXPERIÊNCIAS QUE DÃO SENTIDO AOS DIAS"
                  : "EXPERIENCES THAT GIVE DAYS MEANING"}
              </p>
              <h2>
                {pt
                  ? "Entre histórias e novas descobertas."
                  : "Stories and new discoveries."}
              </h2>
            </div>
            <p>
              {pt
                ? "Lugares e operadores para planear a visita. Escolha pelo seu interesse e consulte as condições para a data."
                : "Places and operators to help plan your visit. Choose by interest and check conditions for your date."}
            </p>
          </div>
          <div className="minho-culture-options destination-culture-grid">
            {e.culture.map((c, i) => (
              <article key={c.place[0] + c.source}>
                <span className="minho-number">
                  0{i + 1} · {tx(c.place)}
                </span>
                <div>
                  <h3>{tx(c.title)}</h3>
                  <p>{tx(c.text)}</p>
                  {sourceLink(c.source, "culture")}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="destination-seasons" className="minho-section bg-white">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt ? "QUAL É A SUA ÉPOCA?" : "FIND YOUR SEASON"}
              </p>
              <h2>
                {pt
                  ? "Quatro maneiras de viver o lugar."
                  : "Four ways to experience the place."}
              </h2>
            </div>
          </div>
          <div className="minho-seasons">
            {e.seasons.map((s, i) => {
              const Icon = [Leaf, Sun, Wine, Coffee][i];
              return (
                <article key={i}>
                  <Icon size={24} />
                  <span>
                    {
                      (pt
                        ? ["Primavera", "Verão", "Outono", "Inverno"]
                        : ["Spring", "Summer", "Autumn", "Winter"])[i]
                    }
                  </span>
                  <p className="mt-4">{tx(s)}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="destination-arrival" className="minho-section bg-pa-cream">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt ? "DO VOO À SUA CASA" : "FROM YOUR FLIGHT TO YOUR HOME"}
              </p>
              <h2>
                {pt
                  ? "Chegar pode ser a parte simples."
                  : "Getting here can be the easy part."}
              </h2>
            </div>
            <p>{tx(e.mobility)}</p>
          </div>
          <DestinationAccess slug={d.slug} language={language} />
          <div className="minho-local-travel">
            {guide.arrival.map(a => (
              <article key={a.title}>
                <TrainFront size={22} />
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                  <a
                    className="minho-text-link"
                    href={a.sourceUrl}
                    onClick={() => track("arrival", "source")}
                  >
                    {a.sourceLabel}
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <WhereToStay
        destination={d}
        properties={cityHomes}
        heading={
          alternatives
            ? pt
              ? "Alternativas para ficar no Minho"
              : "Alternative stays in the Minho"
            : d.slug === "porto"
              ? pt
                ? "Casas na cidade do Porto"
                : "Homes in Porto city"
              : undefined
        }
        intro={tx(e.homes)}
        viewAllHref={d.slug === "porto" ? "/homes?location=porto" : undefined}
      />
      {outsidePorto.length > 0 && (
        <WhereToStay
          destination={d}
          properties={outsidePorto}
          sectionId="destination-regional-homes"
          heading={
            pt
              ? "Outras bases: Trofa e Amarante"
              : "Other bases: Trofa and Amarante"
          }
          intro={
            pt
              ? "Alternativas fora da cidade, para uma viagem com transporte e mais espaço na agenda."
              : "Alternatives outside the city, for a trip with transport and more room in the schedule."
          }
          viewAllHref="/homes?destination=porto"
        />
      )}
      {d.slug === "porto" && (
        <div className="container pb-12">
          <Link className="minho-text-link" href={href("/destinations/douro")}>
            {pt
              ? "Prolongar a viagem no Douro"
              : "Extend your trip into the Douro"}
            <ArrowRight size={17} />
          </Link>
        </div>
      )}
      <TheJournal destination={d} articles={articles} />
      <section className="minho-section bg-pa-cream" id="destination-guide">
        <div className="container max-w-4xl">
          <p className="minho-kicker">
            {pt ? "OS ÚLTIMOS DETALHES" : "THE FINER DETAILS"}
          </p>
          <h2 className="mb-8">
            {pt ? "Antes de fazer as malas" : "Before you pack"}
          </h2>
          {d.faqs?.map(f => (
            <details
              key={f.question}
              className="minho-details"
              data-destination-faq
            >
              <summary>
                {f.question}
                <Plus size={18} />
              </summary>
              <p className="pb-6 text-pa-earth leading-relaxed">{f.answer}</p>
            </details>
          ))}
          <details className="minho-details">
            <summary>
              {pt ? "Fontes e fotografia" : "Sources and photography"}
              <Plus size={18} />
            </summary>
            <div className="pb-6">
              <p className="text-sm mb-4">
                {pt
                  ? "Informação prática revista em 28 de setembro de 2026. Consulte horários, bilhetes e condições atuais nos locais e operadores."
                  : "Practical information reviewed on 28 September 2026. Check current opening, tickets and conditions with the places and operators."}
              </p>
              <ul className="grid sm:grid-cols-2 gap-x-6">
                {refs.map(s => (
                  <li key={s.url}>
                    <a className="minho-text-link" href={s.url}>
                      {s.label}
                      <ArrowUpRight size={14} />
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href="/destinations/photography.html"
                className="minho-text-link"
              >
                {pt
                  ? "Fotografias, autores e licenças"
                  : "Photography, authors and licences"}
                <ArrowUpRight size={14} />
              </a>
            </div>
          </details>
        </div>
      </section>
      <RelatedDestinationsAndOwnersCTA destination={d} related={related} />
    </div>
  );
}
