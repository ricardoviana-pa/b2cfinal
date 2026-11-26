/**
 * Former slugs of the partner (Tripwix) homes → their current slug.
 *
 * On 26 Nov 2026 the partner homes stopped using the owners' real house
 * names: Tripwix asks every partner not to publish them (emails of 9 Sep,
 * 22 Oct and 12 Nov 2026). The old addresses carried those names, so they
 * live here, on the server only, for two jobs:
 *  - /homes/<old> answers 301 to /<lang>/homes/<new> (lib/redirects.ts);
 *  - /homes/photos/<old>/… keeps serving the same files, for emails already
 *    sent and pages held in caches (properties-store.ts, partnerPhotoFolder).
 * Nothing here may reach a browser.
 */
export const FORMER_PARTNER_SLUGS: Readonly<Record<string, string>> = {
  "casa-do-rolapipas": "douro-6-bedroom-riverfront-villa-vineyard",
  "quinta-do-merouco-casa-do-rio": "douro-8-bedroom-riverbank-villa-private-dock",
  "quinta-vale-das-papas": "pinhao-6-bedroom-vineyard-villa-spa",
  "encostas-da-baronesa": "douro-7-bedroom-villa-sleeps-18-spa",
  "quinta-da-tojeira": "douro-9-bedroom-farmhouse-indoor-pool",
  "quinta-do-pinho": "douro-6-bedroom-quinta-vineyard-heated-pool",
  "casa-de-caiz": "amarante-6-bedroom-heritage-villa-river-view",
  "mirante-1": "albufeira-6-bedroom-villa-tennis-court",
  "villa-mare": "albufeira-5-bedroom-villa-infinity-pool",
  "villa-belvedere": "salema-5-bedroom-clifftop-villa-sea-view",
  "diamante-azul-mansion": "porches-8-bedroom-oceanfront-villa",
  "casa-da-rocha": "porches-5-bedroom-contemporary-villa-sea-view",
  "villa-trevo": "armacao-de-pera-5-bedroom-clifftop-villa",
  "vilarabe": "carvoeiro-6-bedroom-estate-tennis-court",
  "villa-19-monte-golf-qdl": "quinta-do-lago-8-bedroom-golf-villa-indoor-pool",
  "granvila": "almancil-8-bedroom-garden-villa-quinta-do-lago",
  "encosta-do-lago-5": "almancil-6-bedroom-villa-indoor-pool",
  "perogil-58": "tavira-4-bedroom-villa-heated-pool-sea-view",
  "alma-da-comporta": "comporta-5-bedroom-villa-tennis-court",
  "4-serras": "comporta-5-bedroom-villa-ocean-view",
  "pt-a-sud": "comporta-5-bedroom-villa-heated-pool-pines",
  "vale-da-raposa": "comporta-5-bedroom-beach-house-brejos",
  "villa-arroz": "comporta-possanco-6-bedroom-villa",
  "casa-na-areia": "comporta-carvalhal-4-bedroom-villa-heated-pool",
  "casa-da-palicada-lote-5": "comporta-pego-4-bedroom-villa-heated-pool",
  "3br-cabana-villa": "comporta-3-bedroom-cabana-beach-club",
  "villa-laura": "estoril-8-bedroom-beachfront-villa",
  "fairview-villa": "cascais-quinta-da-marinha-6-bedroom-golf-villa",
  "villa-guincho": "cascais-guincho-6-bedroom-villa-ocean-view",
  "beachfront-sintra": "sintra-8-bedroom-villa-tennis-ocean-view",
  "casa-do-moinho": "sintra-colares-7-bedroom-villa-tennis-indoor-pool",
  "casa-de-cima": "sintra-5-bedroom-villa-heated-pool-sauna",
  "loft-58": "lisbon-marvila-5-bedroom-loft-private-pool",
  "casa-do-presidente": "lisbon-3-bedroom-villa-heated-pool-garden",
};
