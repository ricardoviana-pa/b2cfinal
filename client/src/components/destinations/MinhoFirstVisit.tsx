import { useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowRight,
  MapPin,
  CarFront,
  Plane,
  Heart,
  Compass,
} from "lucide-react";
import { withEditorialTrip } from "@shared/editorialTripContext";
import { PORTUGAL_MAINLAND_OUTLINE } from "./PortugalMap";
import { trackPlanning } from "./PlanningGuide";

export function MinhoOrientation({ language }: { language: string }) {
  const pt = language.split("-")[0] === "pt";
  return (
    <section
      id="destination-first-visit"
      className="minho-section minho-orientation"
    >
      <div className="container minho-orientation-grid">
        <figure className="minho-locator">
          <svg
            viewBox="45 15 225 385"
            role="img"
            aria-label={
              pt
                ? "Minho no noroeste de Portugal, a norte do Porto. Lisboa mais a sul."
                : "Minho in northwestern Portugal, north of Porto. Lisbon lies farther south."
            }
          >
            <path
              d={PORTUGAL_MAINLAND_OUTLINE}
              fill="#dce5db"
              stroke="#9baa99"
              strokeWidth="1"
            />
            <circle cx="105.2" cy="59.3" r="26" fill="#9cb797" opacity=".35" />
            <circle cx="105.2" cy="59.3" r="5" fill="#294c3a" />
            <text x="122" y="47" fontSize="17" fill="#294c3a" fontWeight="600">
              Minho
            </text>
            <circle cx="104.7" cy="100.9" r="3" fill="#677463" />
            <text x="116" y="107" fontSize="13" fill="#465442">
              Porto
            </text>
            <circle cx="78.1" cy="259.5" r="3" fill="#677463" />
            <text x="89" y="265" fontSize="13" fill="#465442">
              {pt ? "Lisboa" : "Lisbon"}
            </text>
            <text
              x="141"
              y="230"
              fontSize="10"
              fill="#677463"
              letterSpacing="2"
              transform="rotate(-90 141 230)"
            >
              PORTUGAL
            </text>
          </svg>
          <figcaption>
            {pt ? "Minho · Norte de Portugal" : "Minho · Northern Portugal"}
          </figcaption>
        </figure>
        <div>
          <p className="minho-kicker">
            {pt ? "É A SUA PRIMEIRA VEZ?" : "YOUR FIRST TIME HERE?"}
          </p>
          <h2>
            {pt
              ? "Um outro lado de Portugal, a norte do Porto."
              : "Another side of Portugal, north of Porto."}
          </h2>
          <p className="minho-orientation-intro">
            {pt
              ? "O Minho é uma região, com o Atlântico a oeste, a Galiza a norte e vales que sobem até à Peneda-Gerês. Aqui, uma viagem pode juntar praia em Moledo, um passeio em Ponte de Lima e uma mesa de Vinho Verde. Viana, Braga e Guimarães acrescentam cidade e história."
              : "Minho is a region: the Atlantic to the west, Galicia to the north and valleys leading towards Peneda-Gerês. One trip can bring together a beach in Moledo, a walk through Ponte de Lima and a table set with Vinho Verde. Viana, Braga and Guimarães add town life and history."}
          </p>
          <div className="minho-first-facts">
            <a href="#destination-stay-length">
              <Compass size={20} aria-hidden="true" />
              <span>
                <strong>{pt ? "3, 5 ou 7 noites" : "3, 5 or 7 nights"}</strong>
                {pt
                  ? "Uma escapadinha ou uma semana para explorar."
                  : "A short escape or a week to explore."}
              </span>
            </a>
            <a href="#destination-arrival">
              <Plane size={20} aria-hidden="true" />
              <span>
                <strong>{pt ? "Voar para o Porto" : "Fly into Porto"}</strong>
                {pt
                  ? "OPO como ponto de partida; Vigo para o norte da região."
                  : "Start with OPO; consider Vigo for the region’s north."}
              </span>
            </a>
            <a href="#destination-areas">
              <CarFront size={20} aria-hidden="true" />
              <span>
                <strong>
                  {pt ? "Explorar ao seu ritmo" : "Explore at your pace"}
                </strong>
                {pt
                  ? "Carro para combinar paisagens; uma base central para ir a pé e de comboio."
                  : "A car for different landscapes; a central base for walking and rail outings."}
              </span>
            </a>
          </div>
          <p className="minho-fit">
            <Heart size={16} aria-hidden="true" />
            {pt
              ? "Para quem gosta de alternar natureza, pequenas cidades e tempo em casa — a dois, em família ou com amigos."
              : "For those who enjoy nature, small towns and time at home — as a couple, with family or with friends."}
          </p>
        </div>
      </div>
    </section>
  );
}

const days = [
  {
    place: "Viana do Castelo",
    title: ["Chegar e entrar no ritmo", "Arrive and ease into the rhythm"],
    text: [
      "Instale-se na casa, passeie pela Praça da República e termine o dia à mesa. A primeira tarde fica perto da base.",
      "Settle into your home, stroll through Praça da República and ease into dinner. Keep the first afternoon close to your base.",
    ],
    href: "/destinations/viana-do-castelo",
  },
  {
    place: "Santa Luzia · Cabedelo",
    title: [
      "A cidade vista do alto. Depois, o mar.",
      "The city from above. Then the ocean.",
    ],
    text: [
      "Comece pela vista de Santa Luzia e pelo centro de Viana. À tarde, atravesse o Lima para um passeio ou uma aula de surf no Cabedelo.",
      "Start with the view from Santa Luzia and central Viana. In the afternoon, cross the Lima for a walk or a surf lesson at Cabedelo.",
    ],
    href: "/blog/viana-do-castelo-guide",
  },
  {
    place: "Ponte de Lima",
    title: ["Um dia junto ao rio", "A day beside the river"],
    text: [
      "Atravesse a ponte, descubra o centro e demore-se no almoço. Complete o dia com uma prova de Loureiro marcada num produtor do vale.",
      "Cross the bridge, explore the town and linger over lunch. Round off the day with a Loureiro tasting booked at a valley producer.",
    ],
    href: "/blog/wine-guide-douro-vinho-verde",
  },
  {
    place: "Caminha · Moledo",
    title: ["A vila e a praia, no mesmo dia", "Town and beach in one day"],
    text: [
      "Combine um passeio em Caminha com tempo no areal de Moledo, de frente para o monte de Santa Tecla, do outro lado do Minho.",
      "Pair a stroll in Caminha with time on Moledo beach, facing Mount Santa Tecla across the Minho estuary.",
    ],
    href: "/destinations/caminha",
  },
  {
    place: ["A sua casa", "Your home"],
    title: ["Um dia sem agenda", "A day with no agenda"],
    text: [
      "Pequeno-almoço demorado, produtos do mercado e tempo juntos. Se escolher uma casa com piscina ou jardim, reserve um dia para os aproveitar.",
      "A late breakfast, market produce and time together. If you choose a home with a pool or garden, leave a day to enjoy them.",
    ],
    href: "/homes?destination=minho",
  },
  {
    place: "Peneda-Gerês",
    title: ["Mudar de paisagem", "A change of scenery"],
    text: [
      "Dê à montanha um dia próprio: escolha Soajo e Lindoso, ou um trilho adequado ao grupo. Planeie a entrada do parque a partir da sua casa.",
      "Give the mountains a day of their own: choose Soajo and Lindoso, or a trail suited to your group. Plan your park entrance around your home’s location.",
    ],
    href: "/blog/peneda-geres-national-park-autumn-2026-guide",
  },
  {
    place: "Braga / Guimarães",
    title: ["Uma cidade para descobrir devagar", "A city to discover slowly"],
    text: [
      "Escolha Braga para o Bom Jesus e os Biscainhos, ou Guimarães para o centro histórico e o castelo. Guarde a outra para uma próxima visita.",
      "Choose Braga for Bom Jesus and Biscainhos, or Guimarães for its historic centre and castle. Save the other for your next visit.",
    ],
    href: "#destination-culture",
  },
];

export function MinhoStayLength({ language }: { language: string }) {
  const pt = language.split("-")[0] === "pt";
  const n = pt ? 0 : 1;
  const [nights, setNights] = useState<3 | 5 | 7>(5);
  const search = useSearch();
  const href = (path: string) => withEditorialTrip(path, search);
  const summary = pt
    ? {
        3: "Uma primeira escapadinha: cidade, costa e um dia no vale.",
        5: "A nossa sugestão para começar: explorar e ainda ter tempo para a casa.",
        7: "Uma semana para juntar montanha e cultura aos dias de costa.",
      }
    : {
        3: "A first escape: town, coast and a day in the valley.",
        5: "Our suggested starting point: time to explore and enjoy your home.",
        7: "A week to add mountains and culture to your coastal days.",
      };
  return (
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
          <p>
            {pt
              ? "Um ponto de partida para a primeira visita, com base na zona de Viana. Adapte a ordem à localização da casa e aos seus interesses."
              : "A starting point for a first visit, based around Viana. Adapt the order to your home’s location and your interests."}
          </p>
        </div>
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
              aria-controls="minho-suggested-days"
              onClick={() => {
                setNights(value);
                trackPlanning(
                  "minho",
                  language,
                  `stay_${value}_nights`,
                  "chapter"
                );
              }}
            >
              {value} {pt ? "noites" : "nights"}
            </button>
          ))}
        </div>
        <p className="minho-duration-summary" aria-live="polite">
          {summary[nights]}
        </p>
        <ol id="minho-suggested-days" className="minho-day-grid">
          {days.slice(0, nights).map((day, i) => (
            <li key={i}>
              <span className="minho-day-number">
                {i === 0
                  ? pt
                    ? "CHEGADA"
                    : "ARRIVAL"
                  : `${pt ? "DIA" : "DAY"} ${i + 1}`}
              </span>
              <span className="minho-place">
                <MapPin size={14} aria-hidden="true" />
                {Array.isArray(day.place) ? day.place[n] : day.place}
              </span>
              <h3>{day.title[n]}</h3>
              <p>{day.text[n]}</p>
              {day.href.startsWith("#") ? (
                <a
                  href={day.href}
                  className="minho-text-link"
                  onClick={() =>
                    trackPlanning(
                      "minho",
                      language,
                      "itinerary_culture",
                      "chapter"
                    )
                  }
                >
                  {pt ? "Explorar este momento" : "Explore this moment"}
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              ) : (
                <Link
                  href={href(day.href)}
                  className="minho-text-link"
                  onClick={() =>
                    trackPlanning(
                      "minho",
                      language,
                      `itinerary_day_${i + 1}`,
                      "guide"
                    )
                  }
                >
                  {pt ? "Explorar este momento" : "Explore this moment"}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </li>
          ))}
        </ol>
        <div className="minho-itinerary-footer">
          <p>
            {pt
              ? "No dia de partida, deixe tempo para o pequeno-almoço e a viagem. Esta é uma sugestão de roteiro; visitas, atividades e transportes são combinados à parte."
              : "On departure day, leave time for breakfast and the journey. This is a suggested itinerary; visits, activities and transport are arranged separately."}
          </p>
          <Link
            href={href("/homes?destination=minho")}
            onClick={() =>
              trackPlanning("minho", language, "itinerary", "homes")
            }
            className="btn-primary"
          >
            {pt
              ? "Escolher a casa para estes dias"
              : "Find a home for these days"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
