// Editorial suggestions, not availability filters. Geography and access follow
// the reviewed destination guides; nights are suggestions, not minimum stays.
export type TripInterest = 'all' | 'beach' | 'nature' | 'wine' | 'family';
type Copy = [string, string]; // PT, EN
export const discoveryText = (copy: Copy, language: string) => copy[language.split('-')[0] === 'pt' ? 0 : 1];
export const discoveryLanguages = (language: string) => ['pt', 'en'].includes(language.split('-')[0]);

export const tripInterests: Array<{ id: TripInterest; label: Copy }> = [
  { id: 'all', label: ['Todos os ritmos', 'Every kind of escape'] },
  { id: 'beach', label: ['Praia', 'Beach days'] },
  { id: 'nature', label: ['Natureza', 'Into nature'] },
  { id: 'wine', label: ['Vinho e mesa', 'Wine & food'] },
  { id: 'family', label: ['Em família', 'Family time'] },
];

export const destinationDiscovery: Record<string, {
  interests: TripInterest[]; line: Copy; airport: Copy; stay: Copy; access: Copy;
}> = {
  minho: {
    interests: ['beach', 'nature', 'wine', 'family'],
    line: ['Praias atlânticas, rios e aldeias de montanha. Dias ao ar livre, com Viana do Castelo como ponto de partida.', 'Atlantic beaches, rivers and mountain villages. Days outdoors, with Viana do Castelo as a starting point.'],
    airport: ['Porto (OPO) · alternativa: Vigo (VGO)', 'Porto (OPO) · alternative: Vigo (VGO)'],
    stay: ['5–7 noites para combinar costa e vales', '5–7 nights to pair the coast with the valleys'],
    access: ['Carro para explorar; shuttle por marcação', 'A car for exploring; pre-booked airport shuttle'],
  },
  porto: {
    interests: ['wine'],
    line: ['Ruas para descobrir a pé, mesas cheias de sabor e as caves de Gaia do outro lado do rio.', 'Walkable streets, memorable meals and the wine cellars of Gaia across the river.'],
    airport: ['Porto (OPO)', 'Porto (OPO)'],
    stay: ['3 noites de cidade; prolongue no Douro', '3 nights in the city; add time in the Douro'],
    access: ['Metro e táxi na cidade; escolha a zona da casa', 'Metro and taxis in the city; check your home’s location'],
  },
  douro: {
    interests: ['nature', 'wine'],
    line: ['Vinhas em socalcos, manhãs sobre o rio e almoços que se prolongam. Uma casa com tempo para a paisagem.', 'Terraced vineyards, mornings above the river and long lunches. A home with time to take in the view.'],
    airport: ['Porto (OPO)', 'Porto (OPO)'],
    stay: ['3–5 noites para abrandar entre quintas', '3–5 nights to slow down between wine estates'],
    access: ['Combine carro ou motorista para as quintas', 'Arrange a car or driver for visits to the estates'],
  },
  lisbon: {
    interests: ['beach', 'family'],
    line: ['Dias de cidade em Lisboa, jardins em Sintra ou mar em Cascais. Escolha a base que combina consigo.', 'City days in Lisbon, gardens in Sintra or the sea in Cascais. Choose the base that feels right for you.'],
    airport: ['Lisboa (LIS)', 'Lisbon (LIS)'],
    stay: ['3–5 noites; mais tempo para juntar cidade e costa', '3–5 nights; longer to combine city and coast'],
    access: ['Transportes na cidade; planeie os passeios pela costa', 'Public transport in the city; plan your coastal outings'],
  },
  alentejo: {
    interests: ['beach', 'nature', 'wine'],
    line: ['Areais na Comporta ou horizontes de campo no interior. Escolha entre o ritmo da costa e o silêncio rural.', 'Sandy shores in Comporta or open countryside inland. Choose between the coastal rhythm and a rural retreat.'],
    airport: ['Lisboa (LIS) ou Faro (FAO), conforme a casa', 'Lisbon (LIS) or Faro (FAO), depending on your home'],
    stay: ['5–7 noites numa base bem escolhida', '5–7 nights in a thoughtfully chosen base'],
    access: ['Carro recomendado para explorar a região', 'A car is recommended for exploring the region'],
  },
  algarve: {
    interests: ['beach', 'nature', 'family'],
    line: ['Enseadas, falésias e tardes junto à piscina. Da costa oeste à Ria Formosa, cada zona tem o seu ritmo.', 'Coves, cliffs and afternoons by the pool. From the west coast to Ria Formosa, each area has its own pace.'],
    airport: ['Faro (FAO)', 'Faro (FAO)'],
    stay: ['5–7 noites para desfrutar da sua costa', '5–7 nights to enjoy your stretch of coast'],
    access: ['Escolha a zona antes de decidir os transportes', 'Choose your area before deciding on transport'],
  },
};

// Stable catalogue IDs survive changes to a property's marketing name or slug.
// Only homes returned for the current destination are eligible for selection.
export const featuredDestinationHomes: Record<string, Array<{ id: string; reason: Copy }>> = {
  minho: [
    { id: '69653354109993001383ef5f', reason: ['Para viver o Atlântico: vista mar, piscina privada e jacuzzi em Carreço.', 'For Atlantic days: sea views, a private pool and a jacuzzi in Carreço.'] },
    { id: '6965331fec80690013738c68', reason: ['Para combinar casa e cidade: piscina, sauna e ginásio em Viana.', 'For home comforts and city outings: a pool, sauna and gym in Viana.'] },
    { id: '6a7079007df813008d013634', reason: ['Para dias de montanha em grupo: sete suites e piscina em Vieira do Minho.', 'For mountain days together: seven suites and a pool in Vieira do Minho.'] },
  ],
  'viana-do-castelo': [
    { id: '69653354109993001383ef5f', reason: ['Para acordar de frente para o mar: piscina privada e jacuzzi em Carreço.', 'For waking up to the sea: a private pool and jacuzzi in Carreço.'] },
    { id: '6965331fec80690013738c68', reason: ['Para alternar passeios e tempo em casa: piscina, sauna e ginásio.', 'For days out and time at home: a pool, sauna and gym.'] },
    { id: '69653335bf04fe0013742743', reason: ['Para juntar várias famílias: casas independentes, jardim e piscina partilhados pelo grupo.', 'For several families together: separate houses with a garden and pool shared within your group.'] },
  ],
};

export function selectDestinationHomes<T extends { guestyId?: string | null; isActive?: boolean }>(homes: T[], slug: string): T[] {
  const eligible = homes.filter(home => home.isActive !== false);
  const selected = (featuredDestinationHomes[slug] || []).flatMap(pick => {
    const home = eligible.find(home => home.guestyId === pick.id);
    return home ? [home] : [];
  });
  return [...selected, ...eligible.filter(home => !selected.includes(home))].slice(0, 3);
}
