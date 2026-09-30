import { Link, useSearch } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  Waves,
  Mountain,
  Wine,
  Utensils,
  Landmark,
  Coffee,
  Sun,
  Leaf,
  TrainFront,
  MapPin,
  Plus,
} from "lucide-react";
import { withEditorialTrip } from "@shared/editorialTripContext";
import { cdnResize, cdnSrcSet, IMAGES } from "@/lib/images";
import type { PlanningGuide } from "@/data/destination-planning";
import type { DestinationPageProps } from "./DestinationPage";
import {
  WhereToStay,
  TheJournal,
  EventsAndPlanning,
  RelatedDestinationsAndOwnersCTA,
  WhatToSeeAndDo,
} from "./sections";
import { trackPlanning } from "./PlanningGuide";
import { DestinationAccess } from "./DestinationAccess";
import { MinhoOrientation, MinhoStayLength } from "./MinhoFirstVisit";
import "./MinhoVisualGuide.css";

const landscapes = [
  {
    image: "/destinations/esposende-litoral-norte.jpg",
    name: ["O Atlântico à sua porta", "The Atlantic on your doorstep"],
    place: "Viana · Moledo · Esposende",
    text: [
      "Areais, dunas e dias que se deixam levar pelo mar. Um passeio pela costa, uma aula de surf ou tempo para ficar na praia.",
      "Sandy shores, dunes and days shaped by the sea. Follow the coast, take a surf lesson or simply make time for the beach.",
    ],
    plan: [
      "Cabedelo para uma aula de surf; Moledo para um passeio de frente para Santa Tecla.",
      "Cabedelo for a surf lesson; Moledo for a walk facing Mount Santa Tecla.",
    ],
    Icon: Waves,
  },
  {
    image:
      "https://images.unsplash.com/photo-1575460384680-d3040b05870f?auto=format&fit=crop&w=1200&q=85",
    name: ["O ritmo dos rios", "Life at the river’s pace"],
    place: "Lima · Minho · Coura",
    text: [
      "Água, vinhas e caminhos à sombra. Troque o relógio por um passeio junto ao rio e uma paragem demorada numa vila.",
      "Water, vineyards and shaded paths. Slow down with a riverside walk and an unhurried stop in a historic town.",
    ],
    plan: [
      "Ponte de Lima é uma base para descobrir o vale; quintas visitam-se por marcação.",
      "Ponte de Lima is a valley base; arrange vineyard visits ahead.",
    ],
    Icon: Leaf,
  },
  {
    image:
      "https://images.unsplash.com/photo-1663608025293-890bc47a1e53?auto=format&w=1200&q=85",
    name: ["A montanha muda a escala", "Mountains change your perspective"],
    place: "Peneda-Gerês · Serra d’Arga",
    text: [
      "Granito, floresta e aldeias onde apetece parar. Um dia de montanha merece espaço no roteiro, com tempo para o caminho.",
      "Granite, woodland and villages worth slowing down for. Give the mountains a day of their own, with time to enjoy the journey.",
    ],
    plan: [
      "Soajo e Lindoso para aldeias de montanha; um trilho para quem quer ir mais longe.",
      "Soajo and Lindoso for mountain villages; a trail for those keen to go farther.",
    ],
    Icon: Mountain,
  },
];

function EditorialPhoto({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={cdnResize(src, priority ? 1600 : 800)}
      srcSet={cdnSrcSet(src, priority ? [640, 1080, 1600] : [400, 640, 900])}
      sizes={
        priority
          ? "100vw"
          : "(min-width:1024px) 33vw, (min-width:768px) 50vw, 100vw"
      }
      alt={alt}
      width={priority ? 1600 : 900}
      height={priority ? 1000 : 675}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}

/** The Minho is the reviewed reference composition; other destinations keep their own template. */
export function MinhoVisualGuide({
  destination: d,
  properties,
  articles,
  adventures,
  related,
  onAddToItinerary,
  guide,
  language,
}: DestinationPageProps & { guide: PlanningGuide; language: string }) {
  const pt = language.split("-")[0] === "pt";
  const n = pt ? 0 : 1;
  const search = useSearch();
  const href = (path: string) => withEditorialTrip(path, search);
  const track = (
    section: string,
    action: "chapter" | "source" | "guide" | "homes" = "chapter"
  ) => trackPlanning(d.slug, language, section, action);
  const chapters = [
    ["destination-first-visit", pt ? "Visão geral" : "Overview"],
    ["destination-nature", pt ? "Natureza" : "Nature"],
    ["destination-areas", pt ? "Onde ficar" : "Your base"],
    ["destination-stay-length", pt ? "Os seus dias" : "Your days"],
    ["destination-taste", pt ? "À mesa" : "Food & wine"],
    ["destination-experiences", pt ? "Experiências" : "Experiences"],
    ["destination-culture", pt ? "Cultura e sabores" : "Culture & flavours"],
    ["destination-arrival", pt ? "Como chegar" : "Getting here"],
    ["destination-homes", pt ? "Casas" : "Homes"],
  ];
  const featured = adventures.filter(a => ["a2", "a3", "a8"].includes(a.id));
  const restaurants = d.restaurants || [];
  const referenceSources = [
    ...guide.sources,
    {
      label: "VisitPortugal · Peneda-Gerês",
      url: "https://www.visitportugal.com/pt-pt/destinos/porto-e-norte/73747",
    },
    {
      label: "UNESCO · Guimarães & Couros",
      url: "https://whc.unesco.org/en/list/1031/",
    },
    {
      label: "Alto Minho · Moledo",
      url: "https://www.altominho.pt/pt/visitar/o-que-ver/praia-de-moledo/",
    },
  ];
  const restaurantPlaces = [
    "Viana do Castelo",
    "Santa Marta de Portuzelo",
    "Vila Praia de Âncora",
    "Viana do Castelo",
  ];
  const restaurantNotes = pt
    ? [
        "Peixe e marisco para prolongar um dia junto à costa.",
        "Cozinha regional para descobrir a mesa minhota.",
        "Uma paragem à mesa num passeio por Âncora.",
        "Produtos locais para levar um pouco do Minho para casa.",
      ]
    : [
        "Fish and seafood to round off a day by the coast.",
        "Regional cooking and the flavours of the Minho.",
        "A place to pause for a meal on an Âncora outing.",
        "Local produce to bring a little of the Minho home.",
      ];
  const seasons = pt
    ? [
        [
          "Primavera",
          "Verde por todo o lado",
          "Jardins, caminhos junto ao rio e aldeias. Combine os passeios com uma visita ao centro de uma vila.",
        ],
        [
          "Verão",
          "Dias virados ao mar",
          "Dias de praia, surf e refeições ao ar livre. Época para dar mais tempo à costa.",
        ],
        [
          "Outono",
          "A mesa e os vales",
          "Passeios entre vinhas e refeições demoradas. As visitas de vindima exigem marcação.",
        ],
        [
          "Inverno",
          "Tempo para abrandar",
          "Cidades históricas, provas de vinho e conforto em casa. Uma estadia para abrandar e saborear.",
        ],
      ]
    : [
        [
          "Spring",
          "Green in every direction",
          "Gardens, riverside paths and villages. Pair your walks with time in a historic town.",
        ],
        [
          "Summer",
          "Days by the ocean",
          "Beach days, surfing and outdoor meals. A season to give the coast more time.",
        ],
        [
          "Autumn",
          "Valleys and long lunches",
          "Vineyard walks and unhurried meals. Harvest visits need an advance booking.",
        ],
        [
          "Winter",
          "A slower kind of stay",
          "Historic towns, wine tastings and comfort at home. A stay for slowing down and savouring.",
        ],
      ];
  return (
    <div className="minho-editorial">
      <section className="minho-hero">
        <EditorialPhoto
          src={d.regionImage || d.coverImage}
          alt={
            pt
              ? "Paisagem verde e rio no Minho ao fim do dia"
              : "River and green landscape in the Minho at the end of the day"
          }
          priority
        />
        <div className="minho-hero-shade" />
        <div className="container minho-hero-content">
          <Link href={href("/destinations")} className="minho-back">
            ← {pt ? "Todos os destinos" : "All destinations"}
          </Link>
          <div className="minho-hero-copy">
            <p className="minho-kicker">
              {pt
                ? "COSTA, RIOS E SERRA"
                : "COAST, RIVERS & MOUNTAINS"}
            </p>
            <h1>
              <span className="minho-hero-region">
                {pt ? "Norte de Portugal" : "Northern Portugal"}
              </span>
              <span className="minho-hero-place">Minho</span>
            </h1>
            <p className="minho-hero-line">
              {pt
                ? "O verde encontra o Atlântico."
                : "Where green meets the Atlantic."}
            </p>
            <p className="minho-hero-intro">
              {pt
                ? "Manhãs de mar. Caminhos junto ao rio. Uma mesa onde apetece ficar."
                : "Mornings by the sea. Paths beside the river. A table worth lingering at."}
            </p>
            <div className="flex flex-wrap items-center gap-5 mt-6">
              <a
                href="#destination-first-visit"
                onClick={() => track("overview")}
                className="btn-white"
              >
                {pt ? "Descobrir o Minho" : "Discover the Minho"}
                <ArrowRight size={17} />
              </a>
              <a
                href="#destination-homes"
                onClick={() => track("homes", "homes")}
                className="minho-hero-link"
              >
                {pt ? "Encontrar a minha casa" : "Find my place to stay"}
                <ArrowUpRight size={17} />
              </a>
            </div>
          </div>
        </div>
      </section>
      <nav
        aria-label={pt ? "Explorar o Minho" : "Explore the Minho"}
        className="minho-chapters"
      >
        <div className="container flex flex-wrap gap-x-6 gap-y-0 no-scrollbar">
          {chapters.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={() => track(id)}>
              {label}
            </a>
          ))}
        </div>
      </nav>
      <MinhoOrientation language={language} />
      <section id="destination-nature" className="minho-section bg-pa-cream">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt ? "ESCOLHA O SEU RITMO" : "FIND YOUR OWN PACE"}
              </p>
              <h2>
                {pt ? (
                  <>
                    Três paisagens.
                    <br />
                    Mil razões para ficar.
                  </>
                ) : (
                  <>
                    Three landscapes.
                    <br />
                    So many reasons to stay.
                  </>
                )}
              </h2>
            </div>
            <p>
              {pt
                ? "Da costa aos vales, o Minho convida a estar lá fora. Escolha uma base, combine lugares próximos e deixe espaço para os dias sem pressa."
                : "From the coast to the valleys, the Minho draws you outdoors. Choose a base, explore nearby places and leave room for unhurried days."}
            </p>
          </div>
          <div className="minho-landscapes">
            {landscapes.map(({ image, name, place, text, plan, Icon }, i) => (
              <article key={place}>
                <div className="minho-landscape-photo">
                  <EditorialPhoto
                    src={image}
                    alt={
                      (pt
                        ? [
                            "Dunas, Atlântico e estuário do Cávado em Esposende",
                            "Ponte e rio Lima em Ponte de Lima",
                            "Montanhas da Peneda-Gerês",
                          ]
                        : [
                            "Dunes, Atlantic and Cávado estuary in Esposende",
                            "Bridge and Lima river in Ponte de Lima",
                            "Mountains of Peneda-Gerês",
                          ])[i]
                    }
                  />
                  <span>
                    <Icon size={16} aria-hidden="true" />
                    {place}
                  </span>
                </div>
                <div className="minho-landscape-copy">
                  <span className="minho-number">0{i + 1}</span>
                  <h3>{name[n]}</h3>
                  <p>{text[n]}</p>
                  <div className="minho-practical-note">{plan[n]}</div>
                </div>
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
                {pt ? "UM LUGAR PARA CHAMAR SEU" : "SOMEWHERE TO CALL YOUR OWN"}
              </p>
              <h2>{pt ? "Escolher a sua base" : "Choose your base"}</h2>
            </div>
            <p>
              {pt
                ? "Mais cidade, mais praia ou mais campo? A localização da casa dá o tom à viagem."
                : "More city, more beach or more countryside? Where you stay sets the tone for your trip."}
            </p>
          </div>
          <div className="minho-bases">
            {guide.areas.map((area, i) => (
              <article key={area.name}>
                <span className="minho-base-tag">
                  {
                    (pt
                      ? ["CIDADE + COSTA", "PRAIA + VILA", "VALE + CAMPO"]
                      : [
                          "CITY + COAST",
                          "BEACH + TOWN",
                          "VALLEY + COUNTRYSIDE",
                        ])[i]
                  }
                </span>
                <h3>{area.name}</h3>
                <p>{area.bestFor}</p>
                <div className="minho-base-transport">
                  <TrainFront size={18} aria-hidden="true" />
                  <p>{area.transport}</p>
                </div>
                <details>
                  <summary>
                    {pt ? "Antes de escolher" : "Before you choose"}
                    <Plus size={16} />
                  </summary>
                  <p>{area.limitation}</p>
                </details>
                <Link
                  href={href(
                    i === 0
                      ? "/destinations/viana-do-castelo"
                      : i === 1
                        ? "/destinations/caminha"
                        : "/homes?location=ponte-de-lima"
                  )}
                  onClick={() => track("base", i === 2 ? "homes" : "guide")}
                  className="minho-text-link"
                >
                  {pt
                    ? i === 2
                      ? "Ver casas no vale"
                      : "Explorar esta base"
                    : i === 2
                      ? "Find valley homes"
                      : "Explore this base"}
                  <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <MinhoStayLength language={language} />
      <section id="destination-taste" className="minho-section minho-taste">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt ? "SABOREAR O LUGAR" : "A TASTE OF THE PLACE"}
              </p>
              <h2>
                {pt
                  ? "O Minho também se vive à mesa."
                  : "The Minho is a place to savour."}
              </h2>
            </div>
            <p>
              {pt
                ? "Do peixe da costa aos sabores do vale e ao Vinho Verde. Há dias que se planeiam a partir do almoço."
                : "From coastal fish to valley cooking and Vinho Verde. Some days are best planned around lunch."}
            </p>
          </div>
          <div className="minho-taste-feature">
            <figure>
              <EditorialPhoto
                src={IMAGES.expGastronomy}
                alt={
                  pt
                    ? "Chef Portugal Active a preparar uma refeição"
                    : "Portugal Active chef preparing a meal"
                }
              />
              <figcaption>
                {pt
                  ? "Chef Portugal Active · serviço por marcação"
                  : "Portugal Active chef · arranged on request"}
              </figcaption>
            </figure>
            <div className="minho-taste-stories">
              {[
                {
                  Icon: Utensils,
                  title: pt
                    ? "Da costa para a mesa"
                    : "From the coast to the table",
                  text: pt
                    ? "Peixe, marisco e bacalhau à moda de Viana. Na costa, guarde tempo para uma refeição depois da praia."
                    : "Fish, seafood and Viana-style cod. Along the coast, leave time for a proper meal after the beach.",
                },
                {
                  Icon: Wine,
                  title: pt
                    ? "Um copo, um vale, uma quinta"
                    : "A glass, a valley, a vineyard",
                  text: pt
                    ? "Loureiro no vale do Lima; Alvarinho em Monção e Melgaço. Uma visita a um produtor dá outro sentido à paisagem — e pede transporte de regresso combinado."
                    : "Loureiro in the Lima valley; Alvarinho in Monção and Melgaço. A producer visit brings the landscape to life — with the return journey arranged ahead.",
                },
                {
                  Icon: Leaf,
                  title: pt
                    ? "Ficar em casa também é um plano"
                    : "Staying in is a plan, too",
                  text: pt
                    ? "Traga produtos do mercado ou peça-nos uma experiência de chef. Menu, disponibilidade e preço são combinados antes da reserva do serviço."
                    : "Bring back market produce or ask us about a chef experience. Menu, availability and price are agreed before the service is booked.",
                },
              ].map(({ Icon, title, text }) => (
                <article key={title}>
                  <Icon size={22} aria-hidden="true" />
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
              <Link
                className="minho-text-link"
                href={href("/concierge")}
                onClick={() => track("chef", "guide")}
              >
                {pt ? "Planear um momento à mesa" : "Plan a food experience"}
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-between items-end mt-12 mb-6">
            <h3 className="minho-subtitle">
              {pt ? "Paragens para guardar" : "Places to keep in mind"}
            </h3>
            <p className="text-sm text-pa-earth">
              {pt
                ? "Consulte a ementa e abertura atuais; reserve quando necessário."
                : "Check current menus and opening; reserve where needed."}
            </p>
          </div>
          <div className="minho-restaurants">
            {restaurants.map((r, i) => (
              <article key={r.name}>
                <span className="minho-kicker">{r.category}</span>
                <h4>{r.name}</h4>
                <p className="minho-place">
                  <MapPin size={14} />
                  {restaurantPlaces[i]}
                </p>
                <p>{restaurantNotes[i]}</p>
                <details>
                  <summary>
                    {pt ? "Informação para a visita" : "Plan your visit"}
                    <Plus size={15} />
                  </summary>
                  <p>{r.description}</p>
                </details>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + " " + restaurantPlaces[i])}`}
                  className="minho-text-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {pt ? "Ver localização" : "View location"}
                  <ArrowUpRight size={15} />
                </a>
              </article>
            ))}
          </div>
          <details className="minho-details mt-8">
            <summary>
              {pt ? "Mais sabores da região" : "More local flavours"}
              <Plus size={18} />
            </summary>
            <div className="grid md:grid-cols-2 gap-6 py-6">
              {d.specialties?.map(s => (
                <article key={s.name}>
                  <h4 className="font-display text-2xl mb-2">{s.name}</h4>
                  <p className="text-pa-earth leading-relaxed">
                    {s.description}
                  </p>
                </article>
              ))}
            </div>
          </details>
        </div>
      </section>
      <section id="destination-experiences" className="minho-section bg-white">
        <div className="container">
          <div className="minho-section-heading">
            <div>
              <p className="minho-kicker">
                {pt ? "FAZER PARTE DA PAISAGEM" : "BE PART OF THE LANDSCAPE"}
              </p>
              <h2>
                {pt
                  ? "Dias para sentir, não só para ver."
                  : "Days to feel, not just to see."}
              </h2>
            </div>
            <p>
              {pt
                ? "Na água, a cavalo ou à procura da primeira onda. Escolha a experiência pelo seu ritmo; nós ajudamos a preparar os detalhes."
                : "On the water, on horseback or catching your first wave. Find an experience at your pace; we can help with the details."}
            </p>
          </div>
          <div className="minho-experiences">
            {featured.map(adv => (
              <article key={adv.id}>
                <EditorialPhoto src={adv.image} alt={adv.name} />
                <div>
                  <h3>{adv.name}</h3>
                  <p>
                    {pt
                      ? adv.id === "a2"
                        ? "Ver as margens do Lima a partir da água, num percurso adaptado às condições do dia."
                        : adv.id === "a3"
                          ? "Conhecer a paisagem de outra forma, com percurso e nível combinados com o centro hípico."
                          : "Dar os primeiros passos ou voltar ao mar com uma aula ajustada ao seu nível."
                      : adv.id === "a2"
                        ? "See the Lima riverbanks from the water, on a route suited to the day’s conditions."
                        : adv.id === "a3"
                          ? "Discover the landscape differently, with a route and level agreed with the riding centre."
                          : "Find your first wave or return to the sea with a lesson suited to your level."}
                  </p>
                  {onAddToItinerary && (
                    <button
                      type="button"
                      onClick={() => onAddToItinerary(adv)}
                      className="minho-text-link"
                    >
                      {pt ? "Adicionar ao itinerário" : "Add to itinerary"}
                      <Plus size={17} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="text-sm text-pa-earth mt-6">
            {pt
              ? "Atividades por reserva, com preço e disponibilidade próprios. Percurso, equipamento e requisitos são confirmados antes da atividade."
              : "Activities are booked separately, with their own price and availability. Route, equipment and requirements are confirmed before the activity."}
          </p>
          <details className="minho-details mt-8">
            <summary>
              {pt
                ? "Mais ideias para sair e explorar"
                : "More ways to get out and explore"}
              <Plus size={18} />
            </summary>
            <div className="grid md:grid-cols-2 gap-6 py-6">
              {d.experiences?.map(e => (
                <article key={e.name}>
                  <h4 className="font-display text-2xl mb-2">{e.name}</h4>
                  <p className="text-pa-earth leading-relaxed">
                    {e.description}
                  </p>
                </article>
              ))}
            </div>
          </details>
        </div>
      </section>
      <section id="destination-culture" className="minho-section minho-culture">
        <span
          id="destination-rain"
          className="minho-legacy-anchor"
          aria-hidden="true"
        />
        <div className="container grid lg:grid-cols-[.8fr_1.3fr] gap-10 lg:gap-16">
          <div>
            <span className="minho-culture-icon">
              <Landmark size={28} aria-hidden="true" />
            </span>
            <p className="minho-kicker">
              {pt
                ? "HISTÓRIAS QUE FAZEM PARTE DA VIAGEM"
                : "STORIES TO TAKE HOME"}
            </p>
            <h2>
              {pt
                ? "Entre palácios, tradições e um copo de vinho."
                : "Palaces, local traditions and a glass of wine."}
            </h2>
            <p className="mt-5">
              {pt
                ? "A filigrana de Viana, os vinhos do Lima e o património de Braga dão outra profundidade à viagem. Guimarães acrescenta um centro histórico classificado pela UNESCO: escolha uma cidade e dê-lhe tempo."
                : "Viana’s goldwork, Lima valley wines and Braga’s heritage bring another dimension to your stay. Guimarães adds a UNESCO-listed historic centre: choose a city and give it time."}
            </p>
            <div className="minho-culture-tip">
              {pt
                ? "Com crianças, o Aquamuseu de Cerveira dá vida à história do rio. Para uma tarde a dois, combine uma prova de vinho com um passeio em Ponte de Lima."
                : "With children, Cerveira’s Aquamuseum brings the river’s story to life. For an afternoon together, pair a wine tasting with a walk in Ponte de Lima."}
            </div>
          </div>
          <div className="minho-culture-options">
            {guide.rain.map((item, i) => (
              <article key={item.title}>
                <span className="minho-number">0{i + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <a
                    href={item.sourceUrl}
                    onClick={() => track("culture", "source")}
                    className="minho-text-link"
                  >
                    {pt ? "Planear a visita" : "Plan your visit"}
                    <ArrowUpRight size={15} />
                  </a>
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
                  ? "O Minho muda. A vontade de voltar fica."
                  : "A changing landscape. A reason to return."}
              </h2>
            </div>
            <Link
              className="minho-text-link"
              href={href("/blog/when-to-visit-north-portugal")}
              onClick={() => track("seasons", "guide")}
            >
              {pt ? "Ver o guia mês a mês" : "Read the month-by-month guide"}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="minho-seasons">
            {seasons.map(([season, title, text], i) => {
              const Icon = [Leaf, Sun, Wine, Coffee][i];
              return (
                <article key={season}>
                  <Icon size={24} aria-hidden="true" />
                  <span>{season}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
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
            <p>
              {pt
                ? "Aeroporto, shuttle, comboio ou carro: prepare a chegada e depois escolha como quer explorar."
                : "Airport, shuttle, train or car: plan the arrival, then decide how you want to explore."}
            </p>
          </div>
          <DestinationAccess slug={d.slug} language={language} />
          <div className="minho-local-travel">
            {guide.arrival.map(item => (
              <article key={item.title}>
                <TrainFront size={22} aria-hidden="true" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <a
                    href={item.sourceUrl}
                    onClick={() => track("arrival", "source")}
                    className="minho-text-link"
                  >
                    {item.sourceLabel}
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
        properties={properties}
        heading={
          pt ? "Casas para viver o Minho" : "Find your home in the Minho"
        }
        intro={
          pt
            ? "Um jardim para almoços demorados, uma piscina para tardes em família ou uma localização para sair a pé. Escolha o que faz diferença nos seus dias e consulte o total para as suas datas. A Portugal Active ajuda a preparar a chegada e os extras que quiser reservar."
            : "A garden for long lunches, a pool for family afternoons or a location for exploring on foot. Choose what matters to your days and check the total for your dates. Portugal Active can help arrange your arrival and any extras you would like to book."
        }
      />
      <TheJournal destination={d} articles={articles} />
      <section className="minho-section bg-pa-cream">
        <div className="container max-w-4xl">
          <p className="minho-kicker">
            {pt ? "OS ÚLTIMOS DETALHES" : "THE FINER DETAILS"}
          </p>
          <h2 className="mb-8">
            {pt ? "Antes de fazer as malas" : "Before you pack"}
          </h2>
          {d.faqs?.map(item => (
            <details key={item.question} className="minho-details">
              <summary>
                {item.question}
                <Plus size={18} />
              </summary>
              <p className="pb-6 text-pa-earth leading-relaxed max-w-3xl">
                {item.answer}
              </p>
            </details>
          ))}
          <details className="minho-details">
            <summary>
              {pt ? "Mais lugares para conhecer" : "More places to discover"}
              <Plus size={18} />
            </summary>
            <WhatToSeeAndDo destination={d} />
          </details>
          <details className="minho-details">
            <summary>
              {pt ? "Festas e eventos" : "Festivals and events"}
              <Plus size={18} />
            </summary>
            <EventsAndPlanning destination={d} compact />
          </details>
          <details className="minho-details">
            <summary>
              {pt ? "Fontes e atualização" : "Sources and updates"}
              <Plus size={18} />
            </summary>
            <div className="pb-6">
              <p className="text-sm text-pa-earth mb-4">
                {pt
                  ? "Informação prática revista em 28 de setembro de 2026. Consulte horários e condições atuais nas fontes. Fotografias: Portugal Active; Joseolgon / Wikimedia Commons (CC BY 4.0); Jesus David Gomez e Pedro Cunha / Unsplash."
                  : "Practical information reviewed on 28 September 2026. Check current opening and conditions at the sources. Photography: Portugal Active; Joseolgon / Wikimedia Commons (CC BY 4.0); Jesus David Gomez and Pedro Cunha / Unsplash."}
              </p>
              <ul className="grid sm:grid-cols-2 gap-x-7">
                {referenceSources.map(s => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      onClick={() => track("sources", "source")}
                      className="minho-text-link text-sm"
                    >
                      {s.label}
                      <ArrowUpRight size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </section>
      <RelatedDestinationsAndOwnersCTA destination={d} related={related} />
    </div>
  );
}
