/** Public planning information checked on 2026-09-28, not a promise of live
 * transport, attraction opening or property availability. Internal links are
 * locale-neutral so the site's existing locale router can preserve language. */
export type PlanningGuide = {
  title: string;
  answer: string;
  areas: {
    name: string;
    bestFor: string;
    transport: string;
    limitation: string;
  }[];
  arrival: {
    title: string;
    text: string;
    sourceUrl: string;
    sourceLabel: string;
  }[];
  rain: {
    title: string;
    text: string;
    sourceUrl: string;
    sourceLabel: string;
  }[];
  season: string;
  nextLinks: { label: string; href: string }[];
  sources: { label: string; url: string }[];
  reviewedAt: "2026-09-28";
  itinerary?: { title: string; steps: { title: string; text: string }[] };
};

type Locale = "pt" | "en";
type Source = PlanningGuide["sources"][number];
const source = (label: string, url: string): Source => ({ label, url });
const S = {
  minho: source(
    "CP · Linha do Minho",
    "https://www.cp.pt/info/documents/d/cp/comboios-regionais-porto-valenca-minho"
  ),
  airportViana: source(
    "GET BUS · Viana / Porto Airport",
    "https://www.getbus.eu/pt/viana-do-castelo-aeroporto"
  ),
  airportLima: source(
    "GET BUS · Ponte de Lima / Porto Airport",
    "https://www.getbus.eu/pt/ponte-de-lima-aeroporto-porto"
  ),
  cabedelo: source(
    "Viana do Castelo · TUViana",
    "https://www.cm-viana-castelo.pt/areas-de-atividade/mobilidade/transportes/tuviana"
  ),
  viana: source(
    "Viana do Castelo · PT / EN",
    "https://www.cm-viana-castelo.pt/cmvianadocastelo/uploads/document/file/4355/viana_do_castelo___fica_no_coracao___pt_en.pdf"
  ),
  gil: source(
    "Fundação Gil Eannes",
    "https://www.fundacaogileannes.pt/engine.php?cat=32"
  ),
  ipma: source(
    "IPMA · 1991–2020",
    "https://www.ipma.pt/pt/oclima/normais.clima/1991-2020/"
  ),
  esposende: source(
    "Visite Esposende",
    "https://www.visitesposende.com/pt/comochegar"
  ),
  maritime: source(
    "Museu Marítimo de Esposende",
    "https://www.visitesposende.com/pt/fazer/monumentos/museu-maritimo-de-esposende"
  ),
  closedMuseum: source(
    "Museu Municipal de Esposende",
    "https://www.visitesposende.com/pt/fazer/monumentos/museu-municipal-de-esposende"
  ),
  portoAirport: source(
    "ANA · Porto Airport",
    "https://www.aeroportoporto.pt/pt/opo/acesso-e-estacionamento/chegar-e-sair-do-aeroporto/transportes-publicos"
  ),
  serralves: source(
    "Fundação de Serralves",
    "https://www.serralves.pt/visitar-serralves/"
  ),
  douro: source("CP · Linha do Douro", "https://www.cp.pt/info/w/douro-line"),
  douroMuseum: source(
    "Museu do Douro",
    "https://www.museudodouro.pt/o-museu-do-douro"
  ),
  lisbon: source("CP · Lisboa", "https://www.cp.pt/info/pt/lisboa"),
  sintra: source(
    "Parques de Sintra",
    "https://www.parquesdesintra.pt/pt/planear-a-visita/como-chegar/"
  ),
  ttsl: source(
    "Transtejo Soflusa",
    "https://ttsl.pt/wp-content/uploads/2026/06/Horarios-TTSL_Todas-as-ligacoes-fluviais-_-2026_8-junho-2026_VF.pdf"
  ),
  oceanario: source(
    "Oceanário de Lisboa",
    "https://oceanario.pt/planear-visita/"
  ),
  alentejo: source(
    "CP · Linha do Alentejo",
    "https://www.cp.pt/info/documents/d/cp/comboios-lisboa-evora-beja"
  ),
  ferreira: source(
    "Município de Ferreira do Alentejo",
    "https://ferreiradoalentejo.pt/visitar/mapa-interativo/"
  ),
  ferreiraMuseum: source(
    "Museu Municipal de Ferreira do Alentejo",
    "https://ferreiradoalentejo.pt/viver/cultura-e-lazer/museu-municipal/"
  ),
  rota: source("Rota Vicentina", "https://rotavicentina.com/guia-de-ajuda/"),
  algarve: source(
    "CP · Linha do Algarve",
    "https://cp.pt/info/documents/d/cp/comboios-regionais-vila-real-s-antonio-lagos"
  ),
  portimao: source(
    "Museu de Portimão",
    "https://www.museudeportimao.pt/visitar/museu"
  ),
};

const note = (title: string, text: string, ref: Source) => ({
  title,
  text,
  sourceUrl: ref.url,
  sourceLabel: ref.label,
});
const area = (
  name: string,
  bestFor: string,
  transport: string,
  limitation: string
) => ({
  name,
  bestFor,
  transport,
  limitation,
});
const link = (label: string, href: string) => ({ label, href });
function guide(
  data: Omit<PlanningGuide, "reviewedAt" | "sources">,
  extra: Source[] = []
): PlanningGuide {
  const sources = [...data.arrival, ...data.rain].map(n =>
    source(n.sourceLabel, n.sourceUrl)
  );
  sources.push(...extra, S.ipma);
  return {
    ...data,
    reviewedAt: "2026-09-28",
    sources: sources.filter(
      (item, index, all) => all.findIndex(s => s.url === item.url) === index
    ),
  };
}

const guides: Record<string, Partial<Record<Locale, PlanningGuide>>> = {
  "viana-do-castelo": {
    pt: guide(
      {
        title: "Viana sem pressa: escolha a base antes da casa",
        answer:
          "Para combinar cidade, museus e refeições a pé, comece pelo centro de Viana. O Cabedelo faz mais sentido quando a praia é o plano principal; Carreço e Afife pedem atenção ao trajeto entre estação, casa e areal. É possível chegar sem carro, mas a localização exata do alojamento muda o que consegue fazer depois. Reserve um dia para a cidade e outro para uma única zona costeira, mantendo uma alternativa cultural se a previsão não ajudar.",
        areas: [
          area(
            "Centro histórico",
            "Praças, museus e refeições na cidade.",
            "Chegada à estação ou interface; confirme o percurso a pé até à casa.",
            "O centro da cidade não é a praia do Cabedelo."
          ),
          area(
            "Cabedelo / Darque",
            "Uma estadia orientada para a praia.",
            "Consulte a linha 10 e o regresso. Confirme a operação antes de contar com barco.",
            "Fica na outra margem do Lima; atravessar faz parte do plano."
          ),
          area(
            "Carreço / Afife",
            "Costa e passeios a partir de uma base mais dispersa.",
            "Há paragens na Linha do Minho; verifique quais os comboios que param.",
            "A estação não garante acesso confortável a pé à casa ou à praia."
          ),
        ],
        arrival: [
          note(
            "Do aeroporto do Porto",
            "A GET BUS publica uma ligação direta ao Interface de Viana. Escolha a partida para a sua data e deixe margem entre o voo e o autocarro.",
            S.airportViana
          ),
          note(
            "Do Porto e ao longo da costa",
            "Consulte a Linha do Minho para Viana, Carreço, Afife, Moledo e Caminha. Confirme paragens, eventuais mudanças e último regresso.",
            S.minho
          ),
        ],
        rain: [
          note(
            "Museu do Traje",
            "Na Praça da República, permite incluir cultura no passeio pelo centro. Confirme a abertura do dia antes de organizar o percurso.",
            S.viana
          ),
          note(
            "Navio-museu Gil Eannes",
            "Uma visita à história marítima na frente ribeirinha. A Fundação identifica limitações para visitantes com dificuldades motoras; conte também com acessos expostos à chuva.",
            S.gil
          ),
        ],
        season:
          "Para praia e passeios, escolha a viagem pelo tipo de dia que quer ter, sem assumir sol ou mar calmo. Fora do verão, dê mais espaço à cidade e aos museus. A previsão para as datas e os avisos costeiros são mais úteis para decidir um passeio do que uma média mensal.",
        itinerary: {
          title: "Dois dias, com uma alternativa para a chuva",
          steps: [
            {
              title: "Dia 1 · Centro e Santa Luzia",
              text: "Comece pela Praça da República e pelas ruas do centro. Se houver visibilidade, reserve a outra parte do dia para Santa Luzia, confirmando a abertura do elevador e o regresso. Com chuva persistente, troque a subida pelo Museu do Traje ou pelo Gil Eannes.",
            },
            {
              title: "Dia 2 · Cabedelo ou Moledo",
              text: "Escolha uma praia: Cabedelo com a linha 10, ou Moledo pela Linha do Minho. Verifique ida e regresso antes de sair e deixe margem para caminhar até à paragem. Se o tempo não permitir praia, use a opção cultural que ficou por visitar.",
            },
          ],
        },
        nextLinks: [
          link("Aprofundar o guia de Viana", "/blog/viana-do-castelo-guide"),
          link("Comparar bases no Minho", "/destinations/minho"),
        ],
      },
      [S.cabedelo]
    ),
    en: guide(
      {
        title: "Viana at your pace: choose your base first",
        answer:
          "Start with central Viana if you want city sights, museums and meals on foot. Cabedelo suits a beach-led stay, while Carreço and Afife need a closer look at the route between station, home and sand. Arriving without a car is possible; your exact address determines what happens next. Set aside one day for the city and another for one coastal area, with a cultural alternative ready if the forecast changes your plans.",
        areas: [
          area(
            "Historic centre",
            "City squares, museums and meals.",
            "Arrive at the station or interchange and check the walk to your home.",
            "Central Viana and Cabedelo beach are different bases."
          ),
          area(
            "Cabedelo / Darque",
            "A stay centred on the beach.",
            "Check route 10 and your return journey. Confirm operation before relying on a boat.",
            "The beach is across the Lima; the crossing is part of the journey."
          ),
          area(
            "Carreço / Afife",
            "Coastal walks from a more dispersed base.",
            "The Minho Line has stops here; check which services call.",
            "A station does not guarantee an easy walk to the home or beach."
          ),
        ],
        arrival: [
          note(
            "From Porto Airport",
            "GET BUS publishes a direct service to Viana’s transport interchange. Check your travel date and allow time between landing and departure.",
            S.airportViana
          ),
          note(
            "From Porto and along the coast",
            "Check the Minho Line for Viana, Carreço, Afife, Moledo and Caminha. Confirm stops, changes and the last useful return.",
            S.minho
          ),
        ],
        rain: [
          note(
            "Costume Museum",
            "In Praça da República, this adds a cultural stop to a city-centre walk. Check opening arrangements before planning your day around it.",
            S.viana
          ),
          note(
            "Gil Eannes museum ship",
            "Explore maritime history on the waterfront. The Foundation identifies limitations for visitors with reduced mobility; access also includes areas exposed to the weather.",
            S.gil
          ),
        ],
        season:
          "Choose dates around the activities you want, allowing for changing coastal weather. Outside summer, give the city and museums more space in your plan. Check forecasts and coastal warnings for the actual day; a monthly average cannot promise sunshine or calm seas.",
        itinerary: {
          title: "Two days, with a wet-weather alternative",
          steps: [
            {
              title: "Day 1 · Centre and Santa Luzia",
              text: "Begin with Praça da República and the surrounding streets. If visibility is good, use the other part of the day for Santa Luzia, checking the funicular and return arrangements. In persistent rain, switch the hilltop for the Costume Museum or Gil Eannes.",
            },
            {
              title: "Day 2 · Cabedelo or Moledo",
              text: "Choose one beach: Cabedelo using route 10, or Moledo on the Minho Line. Check both journeys before leaving and allow time to reach the stop. If beach weather fails, visit the cultural stop you saved from day one.",
            },
          ],
        },
        nextLinks: [
          link("Read the Viana guide", "/blog/viana-do-castelo-guide"),
          link("Compare bases in Minho", "/destinations/minho"),
        ],
      },
      [S.cabedelo]
    ),
  },
  minho: {
    pt: guide({
      title: "Costa, vale ou serra: o Minho começa pela base",
      answer:
        "O Minho funciona melhor quando escolhe uma base e combina lugares próximos, em vez de tentar ver toda a região na mesma escapadinha. Viana permite juntar cidade e costa; Moledo e Caminha orientam a viagem para o mar e o estuário; Ponte de Lima oferece uma base no vale. Sem carro, alinhe o roteiro com as ligações disponíveis e resolva os trajetos finais antes de reservar. Uma casa no Minho não significa estar perto de todas estas zonas.",
      areas: [
        area(
          "Viana do Castelo",
          "Cidade e um primeiro contacto com a costa.",
          "Comboio e ligação rodoviária ao aeroporto.",
          "Cabedelo exige atravessar o Lima; as freguesias são mais dispersas."
        ),
        area(
          "Moledo / Caminha",
          "Praia, vila e estuário do Minho.",
          "Linha do Minho, com paragens e serviços a confirmar.",
          "Vilar de Mouros e a serra precisam de outro troço de transporte."
        ),
        area(
          "Ponte de Lima e vale do Lima",
          "Uma viagem centrada no vale e nas localidades rurais.",
          "Há ligação GET BUS ao aeroporto; confirme transporte para fora da vila.",
          "Quintas e aldeias dispersas não são uma continuação automática do passeio a pé."
        ),
      ],
      arrival: [
        note(
          "Um roteiro pela costa",
          "Use a Linha do Minho para escolher bases servidas por comboio. Confirme o serviço em cada estação e mantenha o regresso no plano.",
          S.minho
        ),
        note(
          "Uma base no vale",
          "A GET BUS publica uma ligação entre o aeroporto do Porto e Ponte de Lima. A viagem até uma casa rural ou quinta é uma etapa adicional.",
          S.airportLima
        ),
      ],
      rain: [
        note(
          "Cultura em Viana",
          "O Museu do Traje, no centro de Viana, permite manter um plano cultural. Se estiver noutra zona do Minho, conte a deslocação de ida e volta antes de o escolher.",
          S.viana
        ),
      ],
      season:
        "Prepare uma alternativa à praia e aos trilhos em qualquer estação. Para uma viagem fora do verão, concentre o percurso em menos bases e confirme abertura de equipamentos, visitas a produtores e transportes. A costa, os vales e a serra devem ser avaliados separadamente na previsão.",
      nextLinks: [
        link("Planear Viana do Castelo", "/destinations/viana-do-castelo"),
        link("Explorar Caminha e Moledo", "/destinations/caminha"),
        link("Quando visitar o Norte", "/blog/when-to-visit-north-portugal"),
      ],
    }),
    en: guide({
      title: "Coast, valley or hills: start with a Minho base",
      answer:
        "Minho is easier to enjoy when you choose one base and combine nearby places instead of covering the whole region in a short break. Viana brings city and coast together; Moledo and Caminha focus on the beach and estuary; Ponte de Lima offers a valley base. Without a car, build your route around available connections and arrange the final journeys before booking. A home described as being in Minho is not necessarily close to all three areas.",
      areas: [
        area(
          "Viana do Castelo",
          "City sights and an introduction to the coast.",
          "Rail services and a coach connection to the airport.",
          "Cabedelo is across the Lima; outlying villages are more dispersed."
        ),
        area(
          "Moledo / Caminha",
          "Beach, town and Minho estuary.",
          "Minho Line services; check the stops for your journey.",
          "Vilar de Mouros and the hills need an additional journey."
        ),
        area(
          "Ponte de Lima and the Lima valley",
          "A trip focused on the valley and rural places.",
          "GET BUS connects to the airport; arrange travel beyond the town.",
          "Scattered estates and villages are not automatically within walking distance."
        ),
      ],
      arrival: [
        note(
          "Following the coast",
          "Use the Minho Line to choose bases with rail access. Check which services call at each station and plan your return.",
          S.minho
        ),
        note(
          "Staying in the valley",
          "GET BUS publishes a connection between Porto Airport and Ponte de Lima. Getting from there to a rural home or estate is a separate journey.",
          S.airportLima
        ),
      ],
      rain: [
        note(
          "Culture in Viana",
          "The Costume Museum in central Viana offers a cultural alternative. From another Minho base, include the outward and return journey before choosing it.",
          S.viana
        ),
      ],
      season:
        "Keep an alternative to beaches and trails in every season. Outside summer, use fewer bases and check attraction openings, producer visits and transport. Look at forecasts separately for the coast, valleys and hills.",
      nextLinks: [
        link("Plan Viana do Castelo", "/destinations/viana-do-castelo"),
        link("Explore Caminha and Moledo", "/destinations/caminha"),
        link("When to visit the North", "/blog/when-to-visit-north-portugal"),
      ],
    }),
  },
  caminha: {
    pt: guide({
      title: "Escolha entre a vila, o mar e o vale do Coura",
      answer:
        "Caminha, Moledo e Vilar de Mouros dão origem a estadias diferentes. A vila concentra o passeio pelo centro e pelo estuário; Moledo coloca a praia no plano; Vilar de Mouros leva a viagem para o rio Coura. O comboio ajuda nas duas primeiras bases, mas não resolve todos os acessos ao vale. Ao escolher alojamento num conjunto de casas ou num moinho, confirme a unidade reservada, os espaços partilhados e se está a contratar o conjunto inteiro.",
      areas: [
        area(
          "Caminha",
          "Centro histórico e estuário.",
          "Estação na Linha do Minho; confirme o caminho até à casa.",
          "Uma travessia para Espanha precisa de confirmação própria."
        ),
        area(
          "Moledo",
          "Praia e passeios pela costa.",
          "Verifique serviços com paragem em Moledo do Minho.",
          "O estado do mar e o vento podem mudar o plano de praia."
        ),
        area(
          "Vilar de Mouros",
          "Rio Coura e uma base mais rural.",
          "Planeie o troço desde Caminha até à morada.",
          "Estar no concelho de Caminha não significa ficar junto à estação ou ao mar."
        ),
      ],
      arrival: [
        note(
          "Chegada de comboio",
          "Consulte a CP para Caminha ou Moledo e escolha a estação pela morada do alojamento. Não assuma que todos os serviços param em ambas.",
          S.minho
        ),
        note(
          "Do aeroporto, via Viana",
          "Pode comparar a ligação GET BUS a Viana com a continuação de comboio. São etapas distintas: confirme compatibilidade e deixe margem para a mudança.",
          S.airportViana
        ),
      ],
      rain: [
        note(
          "Uma alternativa cultural em Viana",
          "Se a previsão inviabilizar o plano de praia, considere o Museu do Traje em Viana. É uma deslocação a outra cidade: confirme abertura e ligações de ida e regresso antes de sair.",
          S.viana
        ),
      ],
      season:
        "Escolha datas pelo objetivo da viagem e confirme a agenda de cada edição se vier para um festival. Praia de mar, estuário e praia fluvial pedem avaliação das condições locais; a época do ano não garante banho, travessias ou atividades.",
      nextLinks: [
        link("Comparar com Viana", "/destinations/viana-do-castelo"),
        link("Escolher uma base no Minho", "/destinations/minho"),
      ],
    }),
    en: guide({
      title: "Choose the town, the beach or the Coura valley",
      answer:
        "Caminha, Moledo and Vilar de Mouros make different kinds of stay. Caminha puts the old town and estuary first; Moledo brings the beach into the daily plan; Vilar de Mouros takes you inland to the Coura river. Rail helps with the first two bases but does not solve every valley journey. When choosing accommodation in a group of homes or a watermill, confirm the exact unit, shared spaces and whether your booking covers the whole estate.",
      areas: [
        area(
          "Caminha",
          "Old town and estuary.",
          "A Minho Line station; check the route to your home.",
          "Any crossing to Spain needs separate confirmation."
        ),
        area(
          "Moledo",
          "Beach time and coastal walks.",
          "Check services calling at Moledo do Minho.",
          "Wind and sea conditions may change beach plans."
        ),
        area(
          "Vilar de Mouros",
          "The Coura river and a rural base.",
          "Arrange the final journey from Caminha to the address.",
          "Being in Caminha municipality does not mean being beside the station or sea."
        ),
      ],
      arrival: [
        note(
          "Arriving by train",
          "Check CP services to Caminha or Moledo and choose the station for your address. Do not assume every service calls at both.",
          S.minho
        ),
        note(
          "From the airport via Viana",
          "Compare the GET BUS connection to Viana with an onward train. These are separate journeys: check that they connect and leave time to change.",
          S.airportViana
        ),
      ],
      rain: [
        note(
          "A cultural alternative in Viana",
          "If beach plans are rained off, consider the Costume Museum in Viana. This is a trip to another city: check opening arrangements and both transport connections before leaving.",
          S.viana
        ),
      ],
      season:
        "Choose dates around your interests and check the specific edition if visiting for a festival. Ocean beaches, the estuary and river beaches each require a check of local conditions; the season does not guarantee swimming, crossings or activities.",
      nextLinks: [
        link("Compare with Viana", "/destinations/viana-do-castelo"),
        link("Choose a Minho base", "/destinations/minho"),
      ],
    }),
  },
  esposende: {
    pt: guide(
      {
        title: "Esposende: planeie a visita e escolha a base",
        answer:
          "Escolha a zona pelo que quer fazer: centro e estuário em Esposende, praia em Ofir ou costa e moinhos em Apúlia. Sem carro, confirme o acesso à praia concreta e o último regresso, além da chegada ao concelho. Este guia também serve uma visita a partir de outra base no Minho. As alternativas de alojamento apresentadas noutras localidades devem ser escolhidas pela sua localização real; não correspondem a casas disponíveis dentro de Esposende.",
        areas: [
          area(
            "Esposende e estuário do Cávado",
            "Centro, frente ribeirinha e visita cultural.",
            "Compare ligações rodoviárias e paragem final.",
            "Chegar ao centro não resolve o acesso a todas as praias."
          ),
          area(
            "Fão / Ofir",
            "Praia, pinhal e passeios na margem sul.",
            "Verifique o trajeto até Fão ou Ofir e o regresso.",
            "A localização está noutra margem do Cávado face ao centro de Esposende."
          ),
          area(
            "Apúlia",
            "Uma visita à costa e aos moinhos.",
            "Confirme a paragem mais útil para o areal escolhido.",
            "Não conte com um serviço sazonal sem verificar as datas."
          ),
        ],
        arrival: [
          note(
            "Por estrada ou autocarro",
            "Use a informação municipal para identificar acessos e operadores, confirmando depois os horários para a sua data e destino final.",
            S.esposende
          ),
          note(
            "Se vier de comboio",
            "A Linha do Minho passa por Barcelos e Viana. A continuação até Esposende precisa de outro transporte; Fão não é uma estação desta linha.",
            S.minho
          ),
        ],
        rain: [
          note(
            "Museu Marítimo",
            "Na antiga Casa do Salva Vidas, é uma opção cultural no centro de Esposende. Confirme o horário antes de sair. O Museu Municipal é outro equipamento e anuncia encerramento temporário por obras.",
            S.maritime
          ),
        ],
        season:
          "Para praia e percursos na costa, confirme vento, mar, acessos e vigilância nas datas escolhidas. Fora da época balnear, organize a visita em torno da vila e de equipamentos abertos; não presuma que serviços de verão funcionam durante todo o ano.",
        nextLinks: [
          link("Explorar outras bases no Minho", "/destinations/minho"),
          link(
            "Planear uma estadia em Viana",
            "/destinations/viana-do-castelo"
          ),
        ],
      },
      [S.closedMuseum]
    ),
    en: guide(
      {
        title: "Esposende: plan the visit and choose your base",
        answer:
          "Choose an area around your plans: central Esposende and the estuary, the beach at Ofir, or the coast and windmills at Apúlia. Without a car, check access to your chosen beach and the last return as well as the journey into the municipality. This guide also works for a visit from another Minho base. Accommodation alternatives in other towns should be chosen by their actual location; they are not homes available within Esposende.",
        areas: [
          area(
            "Esposende and the Cávado estuary",
            "Town, waterfront and a cultural visit.",
            "Compare coach connections and the final stop.",
            "Reaching the town does not solve access to every beach."
          ),
          area(
            "Fão / Ofir",
            "Beach, pine woods and the south bank.",
            "Check the journey to Fão or Ofir and your return.",
            "This is across the Cávado from central Esposende."
          ),
          area(
            "Apúlia",
            "Coastal scenery and windmills.",
            "Check the most useful stop for your chosen beach.",
            "Do not rely on a seasonal service without checking dates."
          ),
        ],
        arrival: [
          note(
            "By road or coach",
            "Use municipal information to identify routes and operators, then confirm services for your date and final destination.",
            S.esposende
          ),
          note(
            "If arriving by train",
            "The Minho Line serves Barcelos and Viana. Continuing to Esposende needs another form of transport; Fão is not a station on this line.",
            S.minho
          ),
        ],
        rain: [
          note(
            "Maritime Museum",
            "The former lifeboat station offers a cultural stop in Esposende. Check opening arrangements first. The Municipal Museum is a different venue and currently announces a temporary closure for works.",
            S.maritime
          ),
        ],
        season:
          "For beaches and coastal walks, check wind, sea conditions, access and lifeguard arrangements for your dates. Outside the bathing season, build your visit around the town and open venues; summer services should not be assumed to run all year.",
        nextLinks: [
          link("Explore other Minho bases", "/destinations/minho"),
          link("Plan a stay in Viana", "/destinations/viana-do-castelo"),
        ],
      },
      [S.closedMuseum]
    ),
  },
  porto: {
    pt: guide({
      title: "Uma base urbana ou uma estadia junto à costa?",
      answer:
        "Para uma primeira visita sem carro, compare a localização da casa com as deslocações que vai repetir: estação, centro, Gaia ou costa. Baixa e Ribeira privilegiam a cidade; Gaia acrescenta outra margem e acessos próprios; Foz e Matosinhos mudam o centro do dia para o mar. Uma casa maior fora destes núcleos pode servir o grupo, mas exige um plano de transporte diferente. Separe a visita urbana de uma viagem ao Douro para evitar dias ocupados sobretudo em deslocações.",
      areas: [
        area(
          "Baixa / Ribeira",
          "Património, refeições e passeios urbanos.",
          "Combine caminhada com metro ou autocarro conforme a morada.",
          "Subidas e calçada importam se viajar com malas ou mobilidade condicionada."
        ),
        area(
          "Vila Nova de Gaia",
          "A margem sul e visitas ligadas ao vinho do Porto.",
          "Compare a morada com as estações e travessias do rio.",
          "Gaia é extensa; nem toda a casa fica junto ao cais."
        ),
        area(
          "Foz / Matosinhos",
          "Costa e uma estadia com mais tempo junto ao mar.",
          "Confirme linha e última ligação para o percurso escolhido.",
          "Foz e Matosinhos têm acessos diferentes e não são o centro histórico."
        ),
      ],
      arrival: [
        note(
          "Do aeroporto para a cidade",
          "A ANA identifica a linha E do metro e ligações rodoviárias. Escolha o percurso pela estação ou paragem mais útil para a casa, incluindo a última caminhada.",
          S.portoAirport
        ),
        note(
          "Uma viagem ao Douro",
          "Planeie a Linha do Douro como uma viagem própria, com tempo no destino e regresso confirmado. Não confunda chegada à estação com acesso a uma quinta.",
          S.douro
        ),
      ],
      rain: [
        note(
          "Museu de Serralves",
          "Escolha as exposições interiores e consulte as ligações STCP indicadas pela Fundação. O parque é ao ar livre; confirme o bilhete e os espaços que pretende visitar.",
          S.serralves
        ),
      ],
      season:
        "Um programa urbano pode combinar interiores e passeios ao longo do ano. Deixe a frente marítima para um período favorável da previsão e adapte as caminhadas à chuva. Se incluir o Douro, consulte também as condições no vale, sem usar a previsão do Porto para todo o percurso.",
      nextLinks: [
        link("Combinar Porto e Douro", "/blog/porto-douro-valley-guide"),
        link("Escolher uma base no Douro", "/destinations/douro"),
      ],
    }),
    en: guide({
      title: "A city base or a stay by the coast?",
      answer:
        "For a first car-free visit, compare your home’s location with the journeys you will repeat: station, centre, Gaia or coast. Baixa and Ribeira put the city first; Gaia adds another riverbank and its own access routes; Foz and Matosinhos shift the day towards the sea. A larger home outside these centres may suit your group but needs a different transport plan. Treat a Douro visit as a separate trip so travel does not take over the day.",
      areas: [
        area(
          "Baixa / Ribeira",
          "Heritage, meals and city walks.",
          "Combine walking with metro or bus according to the address.",
          "Hills and paving matter with luggage or reduced mobility."
        ),
        area(
          "Vila Nova de Gaia",
          "The south bank and Port wine visits.",
          "Compare the address with stations and river crossings.",
          "Gaia is extensive; not every home is beside the waterfront."
        ),
        area(
          "Foz / Matosinhos",
          "A stay with more time beside the sea.",
          "Check routes and the last connection for your chosen journey.",
          "Foz and Matosinhos have different transport options and are outside the historic centre."
        ),
      ],
      arrival: [
        note(
          "From the airport to the city",
          "ANA lists metro line E and coach options. Choose the route for the station or stop closest to your home, including the final walk.",
          S.portoAirport
        ),
        note(
          "A trip to the Douro",
          "Plan the Douro Line as a separate outing with time at your destination and a confirmed return. Reaching a station does not mean reaching a wine estate.",
          S.douro
        ),
      ],
      rain: [
        note(
          "Serralves Museum",
          "Choose the indoor exhibitions and check the STCP connections listed by the Foundation. The park is outdoors; confirm which spaces your ticket covers.",
          S.serralves
        ),
      ],
      season:
        "A city break can combine indoor visits and walks throughout the year. Save the seafront for a suitable weather window and adapt walking plans to rain. If visiting the Douro, check conditions in the valley separately from Porto.",
      nextLinks: [
        link("Combine Porto and Douro", "/blog/porto-douro-valley-guide"),
        link("Choose a Douro base", "/destinations/douro"),
      ],
    }),
  },
  douro: {
    pt: guide({
      title: "Douro sem carro: primeiro a estação, depois a quinta",
      answer:
        "É possível construir uma visita ao Douro em torno do comboio, escolhendo uma base como a Régua ou o Pinhão. O passo decisivo vem depois: confirmar como chega da estação à casa, à quinta ou ao cais e como regressa. Para uma primeira estadia, concentre cada dia numa zona e reserve antecipadamente a visita ao produtor. Uma quinta num mapa perto do rio não é necessariamente acessível a pé, e o último comboio não deve ser uma descoberta no fim do dia.",
      areas: [
        area(
          "Peso da Régua",
          "Uma base com estação e Museu do Douro.",
          "Confirme comboio e percurso entre estação, museu e alojamento.",
          "As quintas nas encostas precisam de verificação de acesso."
        ),
        area(
          "Pinhão",
          "Passeio junto ao rio e uma visita previamente escolhida.",
          "Linha do Douro; combine a chegada com a hora da visita.",
          "Uma reserva na quinta não inclui automaticamente o transporte."
        ),
        area(
          "Tua / Douro Superior",
          "Prosseguir pelo vale para uma viagem mais concentrada na paisagem.",
          "Planeie as paragens e o regresso antes de embarcar.",
          "Menos flexibilidade para acrescentar visitas sem transporte organizado."
        ),
      ],
      arrival: [
        note(
          "Do Porto para o vale",
          "Consulte a página da CP para a Linha do Douro, o horário em vigor e avisos. Escolha primeiro a base e depois os comboios que deixam tempo útil no destino.",
          S.douro
        ),
        note(
          "O último troço",
          "Antes de marcar uma quinta ou casa afastada, obtenha um transporte de ida e volta confirmado. O horário ferroviário ajuda a organizar as margens, mas não garante táxi à chegada.",
          S.douro
        ),
      ],
      rain: [
        note(
          "Museu do Douro, na Régua",
          "Uma opção interior para conhecer a região. Consulte abertura, última entrada e acessibilidade na página do museu; inclua o percurso até à estação no plano.",
          S.douroMuseum
        ),
      ],
      season:
        "Na época de vindimas, confirme com cada produtor se a visita inclui alguma atividade de colheita e em que data. Nos dias de calor, reduza percursos expostos e reserve pausas. Com chuva, mantenha flexibilidade entre paisagem, museu e visita interior previamente confirmada.",
      itinerary: {
        title: "Dois dias entre Régua e Pinhão, sem carro",
        steps: [
          {
            title: "Antes da viagem · Fechar as ligações",
            text: "Escolha uma base junto de um acesso que consegue usar. Confirme comboios, transporte final e uma visita a uma quinta; deixe margem entre essa visita e o regresso, sem depender do último serviço possível.",
          },
          {
            title: "Dia 1 · Régua",
            text: "Chegue de comboio, deixe a bagagem no alojamento conforme combinado e visite o Museu do Douro. Se o tempo permitir, acrescente o passeio ribeirinho. Confirme a ligação do dia seguinte antes de terminar o dia.",
          },
          {
            title: "Dia 2 · Pinhão",
            text: "Viaje até Pinhão e faça a visita à quinta já reservada, com o transporte de ida e volta acordado. Regresse à estação com margem. Em caso de alteração do tempo ou da visita, reduza o programa antes de comprometer o comboio de regresso.",
          },
        ],
      },
      nextLinks: [
        link("Ler o guia de Porto e Douro", "/blog/porto-douro-valley-guide"),
        link("Explorar vinho no Norte", "/blog/wine-guide-douro-vinho-verde"),
      ],
    }),
    en: guide({
      title: "Douro without a car: station first, estate second",
      answer:
        "You can build a Douro visit around the railway, using a base such as Régua or Pinhão. The decisive step comes next: confirming how you reach your home, wine estate or boat departure from the station, and how you return. For a first stay, keep each day in one area and book your producer visit ahead. An estate that looks close to the river on a map is not necessarily walkable, and the last train should never be an end-of-day surprise.",
      areas: [
        area(
          "Peso da Régua",
          "A base with a railway station and the Douro Museum.",
          "Check the train and the route between station, museum and home.",
          "Hillside estates need a separate access check."
        ),
        area(
          "Pinhão",
          "Time by the river and a visit chosen in advance.",
          "Use the Douro Line and align arrival with your visit.",
          "An estate booking does not automatically include transport."
        ),
        area(
          "Tua / Douro Superior",
          "Continuing along the valley for a landscape-focused trip.",
          "Plan stops and the return before boarding.",
          "Less flexibility for extra visits without arranged transport."
        ),
      ],
      arrival: [
        note(
          "From Porto into the valley",
          "Check CP’s Douro Line page, current timetable and service notices. Choose your base first, then trains that leave useful time at the destination.",
          S.douro
        ),
        note(
          "The final journey",
          "Before booking a remote estate or home, confirm transport both ways. Railway times help set your margins but do not guarantee a taxi on arrival.",
          S.douro
        ),
      ],
      rain: [
        note(
          "Douro Museum in Régua",
          "An indoor way to explore the region. Check opening, last entry and accessibility with the museum, and include the journey back to the station in your plan.",
          S.douroMuseum
        ),
      ],
      season:
        "During harvest season, ask each producer whether your visit includes any harvest activity and on which date. On hot days, shorten exposed walks and plan breaks. In rain, keep flexibility between scenery, the museum and a previously confirmed indoor visit.",
      itinerary: {
        title: "Two days between Régua and Pinhão without a car",
        steps: [
          {
            title: "Before travelling · Connect the journeys",
            text: "Choose a base with access you can use. Confirm trains, final transport and one estate visit. Leave time between the visit and your return, without relying on the last possible service.",
          },
          {
            title: "Day 1 · Régua",
            text: "Arrive by train, leave luggage at your accommodation as agreed and visit the Douro Museum. Add a riverside walk if the weather allows. Confirm the next day’s connection before ending the day.",
          },
          {
            title: "Day 2 · Pinhão",
            text: "Travel to Pinhão for the estate visit you have already booked, with outward and return transport arranged. Reach the station with time to spare. If weather or the visit changes, shorten the programme before putting your return train at risk.",
          },
        ],
      },
      nextLinks: [
        link(
          "Read the Porto and Douro guide",
          "/blog/porto-douro-valley-guide"
        ),
        link("Explore wine in the North", "/blog/wine-guide-douro-vinho-verde"),
      ],
    }),
  },
  lisbon: {
    pt: guide(
      {
        title: "Lisboa, Sintra ou Cascais: três bases diferentes",
        answer:
          "Escolha Lisboa para um programa centrado na cidade, Sintra para dedicar tempo aos monumentos e à serra, ou Cascais para uma estadia mais orientada para a costa. É possível combinar zonas de transportes públicos, mas cada mudança ocupa parte do dia. Compare a morada da casa com a estação e o último troço do percurso antes de reservar. Outras localidades, como o Barreiro, exigem acessos próprios; não devem ser tratadas como alojamento no centro de Lisboa.",
        areas: [
          area(
            "Lisboa",
            "Bairros, museus e um programa urbano.",
            "Escolha a casa pela ligação à rede e pelos percursos a pé.",
            "Colinas e calçada podem alterar a facilidade de uma caminhada."
          ),
          area(
            "Sintra",
            "Dedicar um dia aos monumentos e à serra.",
            "Comboio até à vila; transporte adicional conforme o monumento.",
            "Chegar à estação não significa chegar à entrada do palácio."
          ),
          area(
            "Cascais",
            "Costa com ligação ferroviária a Lisboa.",
            "Consulte a Linha de Cascais e o percurso final.",
            "Nem todas as praias e casas da costa ficam junto de uma estação."
          ),
        ],
        arrival: [
          note(
            "Comboio entre bases",
            "A CP publica as linhas de Sintra e Cascais. Escolha a partida e o regresso para a sua base; confirme também os percursos entre estações.",
            S.lisbon
          ),
          note(
            "Da estação de Sintra ao monumento",
            "A Parques de Sintra apresenta os acessos por local. Planeie o transporte final antes de escolher a hora do bilhete, incluindo margem para entrar.",
            S.sintra
          ),
        ],
        rain: [
          note(
            "Oceanário, no Parque das Nações",
            "Uma visita interior em Lisboa, com acesso indicado pela estação Oriente. Confirme bilhete e abertura; a caminhada entre a estação e o edifício faz parte do percurso.",
            S.oceanario
          ),
        ],
        season:
          "Combine passeios ao ar livre com visitas interiores e confirme a previsão da zona que vai visitar. Sintra, Lisboa e a costa não devem partilhar automaticamente o mesmo plano meteorológico. Bilhetes com hora marcada e transportes devem orientar a ordem das visitas.",
        nextLinks: [
          link("Comparar destinos em Portugal", "/destinations"),
          link("Explorar o Alentejo", "/destinations/alentejo"),
        ],
      },
      [S.ttsl]
    ),
    en: guide(
      {
        title: "Lisbon, Sintra or Cascais: three different bases",
        answer:
          "Choose Lisbon for a city-focused programme, Sintra for time with monuments and the hills, or Cascais for a more coastal stay. Public transport can connect these areas, but each change takes part of your day. Compare your home’s address with the station and final journey before booking. Other places, such as Barreiro, have their own transport arrangements and should not be treated as accommodation in central Lisbon. Start with your daily route, then choose the home.",
        areas: [
          area(
            "Lisbon",
            "Neighbourhoods, museums and a city programme.",
            "Choose your home around transport connections and walking routes.",
            "Hills and paving can change how easy a walk feels."
          ),
          area(
            "Sintra",
            "A day devoted to monuments and the hills.",
            "Train to the town, then additional transport for your monument.",
            "Reaching the station is not the same as reaching a palace entrance."
          ),
          area(
            "Cascais",
            "A coastal base with rail links to Lisbon.",
            "Check the Cascais Line and the final route.",
            "Not every coastal beach or home is beside a station."
          ),
        ],
        arrival: [
          note(
            "Rail between bases",
            "CP publishes the Sintra and Cascais lines. Choose outward and return journeys for your base and check any travel between stations.",
            S.lisbon
          ),
          note(
            "From Sintra station to the monument",
            "Parques de Sintra explains access for each site. Plan the last journey before choosing your ticket time, allowing time to reach the entrance.",
            S.sintra
          ),
        ],
        rain: [
          note(
            "Oceanário in Parque das Nações",
            "An indoor visit in Lisbon, with access described via Oriente station. Check tickets and opening arrangements; the walk from the station remains part of the journey.",
            S.oceanario
          ),
        ],
        season:
          "Combine outdoor walks with indoor visits and check the forecast for the area you will actually visit. Sintra, Lisbon and the coast should not automatically share one weather plan. Timed tickets and transport connections should shape the order of your visits.",
        nextLinks: [
          link("Compare destinations in Portugal", "/destinations"),
          link("Explore Alentejo", "/destinations/alentejo"),
        ],
      },
      [S.ttsl]
    ),
  },
  alentejo: {
    pt: guide(
      {
        title: "Praia ou interior: escolha uma parte do Alentejo",
        answer:
          "Uma viagem à Comporta e uma estadia no interior do Alentejo pedem planos diferentes. Escolha a costa se o objetivo principal é praia; Ferreira do Alentejo se procura uma base rural nessa zona; Évora se quer centrar a visita na cidade. Sem carro, comece por confirmar o acesso à morada e às atividades, não apenas a chegada à região. Evite juntar estas bases num único dia e reserve tempo para refeições, pausas e deslocações.",
        areas: [
          area(
            "Comporta e costa do Sado",
            "Uma viagem orientada para a costa.",
            "Confirme transporte até à morada e à praia escolhida.",
            "Ficar na região não garante acesso a pé ao areal."
          ),
          area(
            "Ferreira do Alentejo",
            "Campo e visitas no interior.",
            "Planeie a chegada e as deslocações entre casa e vila.",
            "É uma base interior, não uma alternativa equivalente à Comporta."
          ),
          area(
            "Évora",
            "Património e um programa centrado na cidade.",
            "A CP publica ligações; confirme o percurso entre estação e alojamento.",
            "As propriedades rurais fora da cidade exigem outro troço de transporte."
          ),
        ],
        arrival: [
          note(
            "Comboio para o interior",
            "Consulte as ligações CP de Lisboa a Évora ou Beja. Escolha a estação pela viagem completa e confirme o transporte posterior até à casa.",
            S.alentejo
          ),
          note(
            "Localizar a base rural",
            "Use o mapa municipal para situar Ferreira do Alentejo e os lugares que pretende visitar. Para viajar sem carro, confirme cada ligação de ida e volta antes de reservar.",
            S.ferreira
          ),
        ],
        rain: [
          note(
            "Museu Municipal de Ferreira do Alentejo",
            "Uma opção de cultura local se a sua base fica nesta zona do interior. Confirme horário e condições de visita com o museu; não o trate como uma visita próxima de toda a costa alentejana.",
            S.ferreiraMuseum
          ),
        ],
        season:
          "Organize os dias de calor com pausas e menos caminhada exposta. Para percursos da Rota Vicentina, a associação recomenda setembro a junho; confirme sempre condições e alertas do percurso escolhido. Essa recomendação não equivale a uma previsão para todo o Alentejo.",
        nextLinks: [
          link("Comparar com Lisboa e costa", "/destinations/lisbon"),
          link("Explorar o Algarve", "/destinations/algarve"),
        ],
      },
      [S.rota]
    ),
    en: guide(
      {
        title: "Coast or countryside: choose one part of Alentejo",
        answer:
          "A Comporta trip and a stay in inland Alentejo need different plans. Choose the coast when beaches are the priority, Ferreira do Alentejo for a rural base in that area, or Évora for a city-focused visit. Without a car, start by confirming access to your actual address and activities, not simply transport into the region. Avoid combining these bases in one day and leave time for meals, breaks and the journeys between places.",
        areas: [
          area(
            "Comporta and the Sado coast",
            "A trip centred on the coast.",
            "Confirm transport to the address and your chosen beach.",
            "Staying in the area does not guarantee a walk to the sand."
          ),
          area(
            "Ferreira do Alentejo",
            "Countryside and visits inland.",
            "Plan arrival and journeys between your home and the town.",
            "This is an inland base, not an equivalent alternative to Comporta."
          ),
          area(
            "Évora",
            "Heritage and a city-focused programme.",
            "CP publishes connections; check the route from station to home.",
            "Rural properties outside the city require another journey."
          ),
        ],
        arrival: [
          note(
            "Rail into the interior",
            "Check CP connections from Lisbon to Évora or Beja. Choose the station for the complete journey and confirm onward transport to your home.",
            S.alentejo
          ),
          note(
            "Locating a rural base",
            "Use the municipal map to place Ferreira do Alentejo and your intended visits. For a car-free stay, confirm every outward and return journey before booking.",
            S.ferreira
          ),
        ],
        rain: [
          note(
            "Ferreira do Alentejo Municipal Museum",
            "A local cultural option if your base is in this inland area. Confirm opening and visiting arrangements with the museum; it is not a nearby outing from every part of the Alentejo coast.",
            S.ferreiraMuseum
          ),
        ],
        season:
          "On hot days, plan breaks and shorter exposed walks. For Rota Vicentina routes, the association recommends September to June; check conditions and notices for your chosen trail. This recommendation is not a forecast for the whole Alentejo.",
        nextLinks: [
          link("Compare Lisbon and its coast", "/destinations/lisbon"),
          link("Explore Algarve", "/destinations/algarve"),
        ],
      },
      [S.rota]
    ),
  },
  algarve: {
    pt: guide({
      title: "No Algarve, a praia e o acesso escolhem a base",
      answer:
        "Escolha primeiro a parte do Algarve e a praia que pretende usar mais vezes. Lagos é uma base no oeste; Faro permite organizar a chegada e explorar a zona da Ria Formosa; Tavira muda o foco para o sotavento. Sem carro, compare estação, centro, alojamento e acesso final à praia, incluindo eventuais barcos. Uma ligação ferroviária entre cidades não garante chegar à porta da casa. Para uma estadia curta, concentre os passeios numa zona e confirme transportes antes de reservar.",
      areas: [
        area(
          "Lagos e oeste",
          "Uma base no oeste para explorar a costa envolvente.",
          "Há estação em Lagos; verifique o trajeto até à casa e às praias.",
          "A continuação para Sagres ou praias afastadas exige outro transporte."
        ),
        area(
          "Faro / Ria Formosa",
          "Organizar chegadas e explorar a cidade e a Ria Formosa.",
          "Compare comboio, transporte do aeroporto e ligações finais.",
          "Uma estação na cidade não dá acesso direto às praias insulares."
        ),
        area(
          "Tavira e sotavento",
          "Uma viagem concentrada no leste da região.",
          "Há serviços ferroviários; confirme também acessos à praia.",
          "Barcos e outros serviços podem ter calendário sazonal."
        ),
      ],
      arrival: [
        note(
          "Viajar ao longo da região",
          "A CP publica o eixo Lagos–Faro–Vila Real de Santo António. Verifique paragens, mudanças e regresso para a sua data.",
          S.algarve
        ),
        note(
          "Da estação até à praia ou à casa",
          "Compare o endereço com a estação antes de escolher o comboio. Reserve ou confirme separadamente autocarro, barco ou transporte final; a linha ferroviária não cobre todos os acessos.",
          S.algarve
        ),
      ],
      rain: [
        note(
          "Museu de Portimão",
          "Uma alternativa interior para quem está nesta parte do Algarve. O museu publica horários sazonais e dias de fecho; confirme-os antes de fazer a deslocação a partir de outra base.",
          S.portimao
        ),
      ],
      season:
        "Fora do verão, confirme serviços de praia, barcos e atividades para as suas datas. Para dias quentes, planeie sombra e pausas. Passeios de barco e visitas a grutas dependem do estado do mar, do operador e das regras locais; não organize o único dia disponível como se a saída fosse garantida.",
      nextLinks: [
        link(
          "Conhecer o Algarve além dos resorts",
          "/blog/algarve-beyond-resorts"
        ),
        link("Comparar Minho e Algarve", "/blog/minho-vs-algarve"),
      ],
    }),
    en: guide({
      title: "In Algarve, let the beach and access choose the base",
      answer:
        "Choose your part of Algarve and the beach you will use most often first. Lagos offers a western base; Faro helps organise arrival and visits around Ria Formosa; Tavira shifts the focus east. Without a car, compare station, centre, home and the final beach journey, including any boat crossing. A railway link between towns does not guarantee transport to your door. For a short stay, focus outings in one area and confirm connections before booking.",
      areas: [
        area(
          "Lagos and the west",
          "A western base for exploring the surrounding coast.",
          "Lagos has a station; check onward travel to homes and beaches.",
          "Sagres and more remote beaches require additional transport."
        ),
        area(
          "Faro / Ria Formosa",
          "Organising arrival and exploring the city and Ria Formosa.",
          "Compare rail, airport transport and final connections.",
          "A city station does not provide direct access to island beaches."
        ),
        area(
          "Tavira and the east",
          "A trip focused on the eastern region.",
          "Rail services are available; check beach access too.",
          "Boats and other services may follow seasonal schedules."
        ),
      ],
      arrival: [
        note(
          "Travelling along the region",
          "CP publishes services on the Lagos–Faro–Vila Real de Santo António axis. Check stops, changes and the return for your date.",
          S.algarve
        ),
        note(
          "From station to beach or home",
          "Compare your address with the station before choosing a train. Separately confirm any bus, boat or final transport; the railway does not cover every access route.",
          S.algarve
        ),
      ],
      rain: [
        note(
          "Portimão Museum",
          "An indoor alternative for visitors staying in this part of Algarve. The museum publishes seasonal hours and closure days; check them before travelling from another base.",
          S.portimao
        ),
      ],
      season:
        "Outside summer, confirm beach services, boats and activities for your dates. On hot days, plan shade and breaks. Boat trips and cave visits depend on sea conditions, the operator and local rules; do not plan your only available day around a guaranteed departure.",
      nextLinks: [
        link(
          "Explore Algarve beyond the resorts",
          "/blog/algarve-beyond-resorts"
        ),
        link("Compare Minho and Algarve", "/blog/minho-vs-algarve"),
      ],
    }),
  },
};

/** Only languages with reviewed text are returned; no English fallback. */
export function getDestinationPlanning(
  slug: string,
  lang: string
): PlanningGuide | undefined {
  const locale = lang.toLowerCase().split("-")[0];
  if (locale !== "pt" && locale !== "en") return undefined;
  return guides[slug]?.[locale];
}
