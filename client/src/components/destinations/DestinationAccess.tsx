import {
  ArrowRight,
  ArrowUpRight,
  BusFront,
  CarTaxiFront,
  Plane,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { withEditorialTrip } from "@shared/editorialTripContext";

/* Editorial source note — checked 28 September 2026, not shown in the UI.
 * Airport access and the distinction between taxi ranks and app pickups:
 * https://www.aeroportoporto.pt/pt/opo/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos
 * https://www.aeroportolisboa.pt/pt/lis/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos
 * https://www.aeroportofaro.pt/pt/fao/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos
 * https://www.aena.es/en/vigo/getting-there/taxi.html
 * App pickup instructions, changing pickup points and car-seat limits:
 * https://www.uber.com/global/en/r/airports/opo/pickup/
 * Regional airport choices and arranging rural returns are planning advice,
 * not guaranteed routes, journey times or app coverage. PA shuttle service
 * information confirmed on 28 September 2026.
 * No fare, vehicle, included transfer or availability is promised here.
 */

type Language = "pt" | "en";
type AirportCode = "OPO" | "VGO" | "LIS" | "FAO";
type Localized = Record<Language, string>;

const airports: Record<AirportCode, { name: Localized; href: string }> = {
  OPO: {
    name: { pt: "Porto · Portugal", en: "Porto · Portugal" },
    href: "https://www.aeroportoporto.pt/pt/opo/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos",
  },
  VGO: {
    name: { pt: "Vigo · Espanha", en: "Vigo · Spain" },
    href: "https://www.aena.es/en/vigo/getting-there/taxi.html",
  },
  LIS: {
    name: { pt: "Lisboa · Portugal", en: "Lisbon · Portugal" },
    href: "https://www.aeroportolisboa.pt/pt/lis/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos",
  },
  FAO: {
    name: { pt: "Faro · Portugal", en: "Faro · Portugal" },
    href: "https://www.aeroportofaro.pt/pt/fao/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos",
  },
};

type AccessGuide = { airports: AirportCode[]; arrival: Localized };

const minhoAccess: AccessGuide = {
  airports: ["OPO", "VGO"],
  arrival: {
    pt: "Compare os voos para Porto e Vigo com o percurso até à casa. Se chegar por Vigo, combine a travessia de Espanha para Portugal com o operador.",
    en: "Compare flights to Porto and Vigo alongside the journey to your home. If you land in Vigo, arrange the crossing from Spain to Portugal with your transport provider.",
  },
};

const accessByDestination: Record<string, AccessGuide> = {
  minho: minhoAccess,
  "viana-do-castelo": minhoAccess,
  caminha: minhoAccess,
  esposende: {
    airports: ["OPO"],
    arrival: {
      pt: "O Porto é o aeroporto de referência para Esposende. Planeie a ligação final até à morada do alojamento.",
      en: "Porto is the main airport to consider for Esposende. Plan the onward journey to your accommodation address.",
    },
  },
  porto: {
    airports: ["OPO"],
    arrival: {
      pt: "O aeroporto do Porto tem ligações de metro e autocarro à cidade. Para uma casa fora do centro, confirme também a ligação final.",
      en: "Porto Airport has metro and bus connections to the city. For a home outside the centre, check the final part of the journey too.",
    },
  },
  douro: {
    airports: ["OPO"],
    arrival: {
      pt: "Considere chegar pelo Porto e combine o percurso até à quinta. As distâncias no vale variam: use a morada exata para planear a viagem.",
      en: "Consider flying into Porto and arrange the onward journey to your quinta. Distances across the valley vary, so plan around the exact address.",
    },
  },
  lisbon: {
    airports: ["LIS"],
    arrival: {
      pt: "O aeroporto de Lisboa tem metro, autocarros e táxis. Escolha a ligação conforme a morada da casa, na cidade ou nos arredores.",
      en: "Lisbon Airport has metro, bus and taxi connections. Choose your onward transport around the home’s address, in the city or beyond.",
    },
  },
  alentejo: {
    airports: ["LIS", "FAO"],
    arrival: {
      pt: "Compare Lisboa e Faro conforme a localização da casa. O Alentejo é extenso; confirme o percurso completo antes de escolher o voo.",
      en: "Compare Lisbon and Faro according to your home’s location. The Alentejo is a large region, so check the full journey before choosing a flight.",
    },
  },
  algarve: {
    airports: ["FAO"],
    arrival: {
      pt: "Faro é o aeroporto de referência para o Algarve. Planeie a ligação à casa, sobretudo se ficar fora dos principais centros urbanos.",
      en: "Faro is the main airport to consider for the Algarve. Plan the journey to your home, especially when staying outside the main towns.",
    },
  },
};

const copy = {
  pt: {
    airports: "Aeroportos",
    airportLink: "Acessos oficiais ao aeroporto",
    taxiTitle: "Táxi e Uber",
    taxi: "Nas praças do aeroporto ou por reserva com um operador local.",
    uber: "Peça pela app e siga o ponto de recolha indicado. A cobertura e a disponibilidade de motoristas variam.",
    rural:
      "Para casas rurais ou viagens à noite, combine o regresso com antecedência.",
    shuttle: "Shuttle Portugal Active",
    shuttleBody:
      "A Portugal Active organiza shuttles entre o aeroporto e o alojamento. Diga-nos o voo, o número de passageiros e a bagagem para prepararmos a proposta.",
    shuttleTerms:
      "Solicite com antecedência. Preço, disponibilidade, veículo e cadeiras de criança sujeitos a confirmação. Não incluído automaticamente na estadia.",
    shuttleCta: "Pedir proposta de shuttle",
  },
  en: {
    airports: "Airports",
    airportLink: "Official airport access information",
    taxiTitle: "Taxi and Uber",
    taxi: "Use the airport taxi rank or book with a local taxi operator.",
    uber: "Request through the app and follow its pickup instructions. Coverage and driver availability vary.",
    rural: "For rural homes or late journeys, arrange your return in advance.",
    shuttle: "Portugal Active shuttle",
    shuttleBody:
      "Portugal Active organises shuttles between the airport and your accommodation. Share your flight, passenger numbers and luggage needs so we can prepare a proposal.",
    shuttleTerms:
      "Request in advance. Price, availability, vehicle and child seats are subject to confirmation. Not automatically included in your stay.",
    shuttleCta: "Request a shuttle proposal",
  },
};

export interface DestinationAccessProps {
  slug: string;
  language: string;
  /** Less padding, with the same readable copy and booking conditions. */
  compact?: boolean;
}

/** Three cards to place below the destination's arrival section heading. */
export function DestinationAccess({
  slug,
  language,
  compact = false,
}: DestinationAccessProps) {
  const search = useSearch();
  const guide = accessByDestination[slug];
  if (!guide) return null;

  const lang: Language =
    language.toLowerCase().split("-")[0] === "pt" ? "pt" : "en";
  const labels = copy[lang];
  const cardSpacing = compact ? "p-5 md:p-6" : "p-6 md:p-8";
  const cardClass = `min-w-0 rounded-2xl border border-pa-sand ${cardSpacing}`;

  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-3 ${compact ? "gap-4" : "gap-6"}`}
    >
      <article className={`${cardClass} bg-pa-cream`}>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-white text-pa-gold-aa">
          <Plane aria-hidden="true" className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h3 className="mb-5 font-display text-3xl leading-tight text-pa-dark">
          {labels.airports}
        </h3>
        <ul className="mb-5 space-y-3">
          {guide.airports.map(code => (
            <li key={code}>
              <a
                href={airports[code].href}
                aria-label={`${airports[code].name[lang]} (${code}) — ${labels.airportLink}`}
                className="group flex min-h-11 items-center gap-3 rounded-lg text-base text-pa-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pa-gold-aa"
              >
                <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg border border-pa-sand bg-white font-medium tracking-wide text-pa-gold-aa">
                  {code}
                </span>
                <span className="underline decoration-pa-sand underline-offset-4 group-hover:decoration-pa-gold-aa">
                  {airports[code].name[lang]}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="ml-auto h-4 w-4 shrink-0 text-pa-gold-aa"
                />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-base leading-relaxed text-pa-earth">
          {guide.arrival[lang]}
        </p>
      </article>

      <article className={`${cardClass} bg-white`}>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-pa-cream text-pa-gold-aa">
          <CarTaxiFront
            aria-hidden="true"
            className="h-6 w-6"
            strokeWidth={1.5}
          />
        </div>
        <h3 className="mb-5 font-display text-3xl leading-tight text-pa-dark">
          {labels.taxiTitle}
        </h3>
        <dl className="space-y-4 text-base leading-relaxed">
          <div>
            <dt className="font-medium text-pa-dark">
              {lang === "pt" ? "Táxi" : "Taxi"}
            </dt>
            <dd className="text-pa-earth">{labels.taxi}</dd>
          </div>
          <div>
            <dt className="font-medium text-pa-dark">Uber</dt>
            <dd className="text-pa-earth">{labels.uber}</dd>
          </div>
        </dl>
        <p className="mt-5 border-t border-pa-sand pt-5 text-base leading-relaxed text-pa-earth">
          {labels.rural}
        </p>
      </article>

      <article
        className={`flex min-w-0 flex-col rounded-2xl bg-pa-dark text-white ${cardSpacing}`}
      >
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/25 text-white">
          <BusFront aria-hidden="true" className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h3 className="mb-5 font-display text-3xl leading-tight text-white">
          {labels.shuttle}
        </h3>
        <p className="text-base leading-relaxed text-white">
          {labels.shuttleBody}
        </p>
        <p className="mb-6 mt-5 border-t border-white/25 pt-5 text-base leading-relaxed text-white">
          {labels.shuttleTerms}
        </p>
        <Link
          href={withEditorialTrip(
            `/contact?subject=services-enquiry&service=airport-shuttle&destination=${encodeURIComponent(slug)}`,
            search
          )}
          className="mt-auto inline-flex min-h-12 items-center justify-between gap-3 rounded-lg border border-white/60 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          {labels.shuttleCta}
          <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
        </Link>
      </article>
    </div>
  );
}
