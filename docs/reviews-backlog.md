# Reviews — estado e backlog

## Política: todas as avaliações contam (desde 29/10/2026)

Decisão do Ricardo a 29/10/2026: a página de cada casa mostra **a média real de
todas as avaliações** e lista as de qualquer classificação, com a classificação
visível em cada cartão. Regras em `shared/reviewStats.ts`, partilhadas pela sync,
pelos scripts, pela página e pelo JSON-LD:

- a sync (`buildReviewsByListing`, guesty-sync.ts) guarda todas as avaliações de
  hóspede públicas com texto, normalizadas para 1–5 (canais de 10 pontos ÷ 2);
  `averageRating`/`reviewCount` são calculados sobre esse conjunto completo;
- a página mostra a média com uma casa decimal e **só a partir de 3 avaliações**;
  com 1 ou 2 mostra apenas a contagem. O `aggregateRating` do JSON-LD declara
  exactamente os mesmos números (e não existe abaixo de 3);
- ordem dos cartões: língua da página primeiro, depois inglês, depois as outras;
  mais recentes primeiro dentro de cada grupo (como na faixa da página inicial).

Entre 30/08 e 29/10/2026 o site publicou só 5★, pelo que todas as casas liam
"5,0". Os dados comprometidos (`properties.json`) continuam a ter só 5★ até à
próxima sync no Render reconstruir as avaliações com a nova regra; o back-catalogue
do Airbnb em `reviews.manual.json` também foi colhido só com 5★ — repetir a recolha
(secção seguinte) para trazer as 4★ e as restantes.

## Números

| | antes | depois |
|---|--:|--:|
| Reviews no site | 326 | **530** |
| Cartões visíveis | 262 | **524** |
| Casas sem cartões | 11 | **7** |

418 reviews de 5★ colhidas das páginas públicas dos 48 anúncios Airbnb, guardadas em
`client/src/data/reviews.manual.json` e fundidas em cada sync do Guesty.

### Repetir a recolha

1. Colher de `airbnb.pt/rooms/<id>/reviews` — o dashboard de desempenho trunca o
   texto e é limitado por rate-limit, não serve.
2. Converter para array de `{guest,listing,rating,text,date}`.
3. `npm run reviews:import -- <dump.json> --apply`
4. `npm run reviews:apply`

Anúncios Airbnb ainda sem qualquer review: 7 Suites & Pool Geres, Sky Pool Luxury,
Sunrise Escape, Casa do Moinho.

## Estado por casa

| Casa | cartões | total |
|---|--:|--:|
| 7 Suites & Pool, Geres Gateway - Portugal Active | 0 | 0 |
| Canopy House I Heated Pool by Portugal Active | 0 | 0 |
| Garden House at Fountain Retreat I Pool & Sports | 0 | 0 |
| Riverside Watermill House · Private Beach Access | 0 | 0 |
| Roses House at Fountain Retreat I Pool & Sports | 0 | 0 |
| Sky Pool Luxury by Portugal Active | 0 | 0 |
| Sunrise Escape with Pool by Portugal Active | 0 | 0 |
| Agra Country House with Pool by Portugal Active | 1 | 1 |
| Carcavelos Manor House by Portugal Active | 1 | 1 |
| Fountain Cottage at Fountain Retreat I Pool & Sports | 1 | 1 |
| Historic Riverfront Watermill · Private Beach Access | 1 | 1 |
| Luxury and Nature Retreat with Pool, Jacuzzi & BBQ | 1 | 1 |
| River Beach Loft · Bob Dylan at the Watermill | 1 | 1 |
| Sunset Cliffs with Ocean View by Portugal Active | 1 | 1 |
| The Luxury Manor by Portugal Active | 1 | 1 |
| U2 Loft at the Riverside Watermill | 1 | 1 |
| Douro Garden by Portugal Active | 2 | 2 |
| Filigree Plaza by Portugal Active | 2 | 2 |
| Fountain Retreat I Pool & Sports Escape | 2 | 2 |
| Lima River - S. Silvestre House | 2 | 2 |
| Moledo Front Beach with Sunset Views and Pool | 2 | 2 |
| Ocean view Cabedelo Beach Duplex | 2 | 3 |
| River Beach Suite · Joe Cocker at the Watermill | 2 | 2 |
| River View by Portugal Active | 2 | 2 |
| Saltwind Studio by Portugal Active | 2 | 2 |
| White Charm by the Sea | 2 | 2 |
| Alvarinho Villa — 5 Suites & Heated Pool | 3 | 3 |
| Atlas Hideway by Portugal Active | 3 | 3 |
| Buganvílias House at Fountain Retreat I Pool & Sports | 3 | 3 |
| Lumina Duplex by Portugal Active | 3 | 3 |
| Portugal Active BlueGreen Beach Apartment | 3 | 3 |
| Portugal Active Eben Lodge | Heated Pool | 3 | 4 |
| Shoreline Escape by Portugal Active | 3 | 3 |
| Dunes Beach House with Ocean Views | 4 | 4 |
| Seabreeze Duplex I Beach and Terrace | 4 | 4 |
| Countryside House near the Beach and City center | 5 | 5 |
| Rose Dream Boat by Portugal Active | 5 | 5 |
| Skyline Retreat with pool by Portugal Active | 5 | 5 |
| Stone by the Sea I Mountain and Beach Retreat with Pool | 5 | 5 |
| The Nature Princess by Portugal Active | 5 | 5 |
| Alentejo Rural Farmhouse with Heated Pool & Total Privacy | 6 | 6 |
| Coastal Horizon by Portugal Active | 6 | 6 |
| Senhorial House at Fountain Retreat-Pool & Sports | 6 | 6 |
| Portugal Active Oliveira's Farm | 7 | 7 |
| Classic Meets Modern I Downtown Balcony Retreat | 8 | 8 |
| Stars View by Portugal Active | 8 | 8 |
| Yellow Breeze Apartment | 8 | 8 |
| Abreu Retreat Palace I Luxury Elegance and Leisure Villa | 9 | 9 |
| Heritage Loft I in the Cradle of Portugal | 10 | 10 |
| Lima River - S. Salvador House | 10 | 10 |
| Tide Terrace Duplex - Sea Escape | 10 | 10 |
| Urban Reflections by Portugal Active | 10 | 10 |
| Lighthouse View by Portugal Active | 12 | 12 |
| Portugal Active Bandeira Retreat | 12 | 12 |
| Calejo House I Pool and Sports and Grill Retreat | 13 | 13 |
| Invictus Escape I Jacuzzi and Charm in the City | 13 | 13 |
| Lima River Houses by Portugal Active | 13 | 13 |
| Salty Escape by Portugal Active | 13 | 13 |
| Seaside Urban Retreat by Portugal Active | 13 | 13 |
| Slow Living Countryside House by Portugal Active | 13 | 13 |
| Montaria Lodge by Portugal Active | 16 | 16 |
| Portugal Active Sunset Beach Lodge I Heated Pool | 16 | 19 |
| Beach Farm - Pool and Jacuzzi with Sea View | 17 | 17 |
| Divine Waves Duplex by Portugal Active | 17 | 17 |
| Habitos Lodge by Portugal Active I Beach & Town Villa with Heated Pool | 17 | 18 |
| Villa Aura · Sauna, Gym, 5min Beach & City | 17 | 17 |
| Blue Tile Hideaway by Portugal Active | 18 | 18 |
| Portugal Active Nature Hill Duo Villa | 19 | 19 |
| Portugal Active Atlantic Lodge I Sea View Premium Villa | 20 | 20 |
| Portugal Active Beach Flat | 20 | 20 |
| 4 Sao Juliao Retreat I Pool, Jacuzzi and Garden Escape Villa | 21 | 21 |
| Portugal Active Cabedelo Beach Lodge I Heated Pool | 21 | 21 |
| Ocean Bliss - Beach & BBQ Apartment | 22 | 22 |
