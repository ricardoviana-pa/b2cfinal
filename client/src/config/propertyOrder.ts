/**
 * Curated property ordering for the PLP.
 *
 * The "Recommended" sort places these listings in the exact order below,
 * then falls back to the standard secondary rule (sortOrder asc) for
 * anything not on the list. This is also the default sort on the PLP
 * when the user hasn't picked dates AND is the tie-breaker that
 * overrides the random / live-price ranking that the date-driven
 * available bucket would otherwise produce.
 *
 * Source of truth: ranking-casas-portugalactive.json (commercial team).
 * Each entry maps the rank → Guesty listingId. For multi-unit groups
 * (Watermill, Lima River, Fountain, Quinta de Parada) we use the PARENT
 * id from PROPERTY_GROUPS — the group card represents the whole cluster
 * on the PLP, so ranking the parent ranks the whole cluster.
 *
 * To reorder: edit the array, commit, push. No deploy beyond Render's
 * usual auto-rebuild — the PLP picks up the new order on the next
 * page load.
 *
 * To remove a property from the curated tier: delete its line — it
 * falls to the secondary sort rule like everything else.
 */

export const CURATED_PROPERTY_ORDER: string[] = [
  '6a2ad70638d6620013badaef', // # 1 Carcavelos House by Portugal Active
  '696533466d209c001510ecfe', // # 2 Eben Lodge (show off)
  '69e7350685a8b000124854c5', // # 3 Alvarinho Villa 5 Suites & Heated Pool
  '696533722def930014e914e2', // # 4 Abreu Retreat Palace - Luxury, Elegance & Leisure
  '69c415ceab80a8001247452c', // # 5 Azenha do Tio Luis - Riverside Watermill (multi-unit)
  '6965335cbf04fe00137431cb', // # 6 Lima River Houses (multi-unit)
  '69c567ad7f6873000e9a3c37', // # 7 Alentejo Rural Farmhouse with Pool and Total Privacy
  '696533abf142270014026fa9', // # 8 Stars View by Portugal Active
  '69653354109993001383ef5f', // # 9 Beach Farm - Pool and Jacuzzi with Sea View
  '69653335bf04fe0013742743', // #10 Nature Hill Duo - 10 min Beach
  '6965330b6d209c001510dd49', // #11 Atlantic Lodge - SEA VIEW - Premium
  '696533284b583900135ceb91', // #12 Sunset Beach Lodge - Heated Pool
  '696533d64b583900135d00cc', // #13 The Luxury Manor by Portugal Active
  '6965330729bb8c00141e8cd6', // #14 Habito's Lodge - 5min Beach & Town
  '6965331fec80690013738c68', // #15 Villa Aura - Sauna, Gym, 5min Beach & City
  '69653365bf04fe0013743511', // #16 Sao Juliao Retreat - Pool, Jacuzzi & Garden
  '696533d34b583900135cfd96', // #17 Luxury and Nature Retreat w/pool, jacuzzi & BBQ (Quinta de Parada parent)
  '6965334abf04fe0013742da8', // #18 Montaria Lodge by Portugal Active
  '6965332327950e001416f0b2', // #19 Cabedelo Beach Lodge - Heated Pool
  '696533aaf142270014026d70', // #20 Skyline Retreat with pool
  '69653381bf04fe00137437cd', // #21 Stone by the Sea - Mountain & Beach Retreat w/Pool
  '696533494b9b64001401b62e', // #22 Portugal Active Oliveira's Farm
  '696533b2e44e1a0015bb2b42', // #23 Rose Dream Boat by Portugal Active
  '6970af61638a8a0015eaa850', // #24 Moledo Front Beach w/Sunset Views and Pool
  '6965339dbf04fe0013743e2d', // #25 Fountain Retreat - Quinta da Fonte (multi-unit)
  '69dfa9cead7c9c0014cb71c9', // #26 Dunes Beach House with Ocean Views
  '6a312c59a705e1001327708c', // #27 Sunset Cliffs with Ocean View
  '69653390ecf7490014ed2d6c', // #28 Lighthouse View by Portugal Active
  '69b3f4234aafb300134e52a9', // #29 Madorra House - Heated Pool
  '69e7552df2f71100122bbb35', // #30 Lumina Duplex by Portugal Active
  '696533266dec35001492fdbb', // #31 Portugal Active BlueGreen Beach Apartment
  '6965338ed1c09900156e8502', // #32 Calejo House Pool & Sports & Grill Retreat
  '696533814b9b64001401c7b8', // #33 Salty Escape by Portugal Active
  '696533d8753fb0001424b10d', // #34 The Nature Princess by Portugal Active
  '696533762def930014e917bf', // #35 Seabreeze Duplex Beach & Terrace
  '696533616cff760015e28965', // #36 Tide Terrace Duplex - Sea Escape
  '6965338a753fb0001424acf6', // #37 Blue Tile Hideaway by Portugal Active
  '696532fa6d209c001510d5ee', // #38 Ocean view Cabedelo Beach Duplex
  '6a341163c50f210012f12b80', // #39 Douro Garden by Portugal Active
  '696533b7bf04fe00137440f8', // #40 Heritage Loft in the Cradle of Portugal
  '6a0359b4e343150013abc14d', // #41 Atlas Hideway by Portugal Active
  '69653388753fb0001424abad', // #42 Invictus Escape Jacuzzi & Charm in the City
  '696533794b583900135cf0fc', // #43 Yellow Breeze Apartment
  '696532eee44e1a0015bb2460', // #44 Portugal Active Beach Flat
  '6965338cecf7490014ed2c2d', // #45 Framed Corner by Portugal Active
  '6965338554dbb5001568a505', // #46 Classic Meets Modern Downtown Balcony Retreat
  '696533752def930014e9167c', // #47 Seaside Urban Retreat 5min to Esposende Beach
  '696533d2ec19770014fd1b52', // #48 Coastal Horizon by Portugal Active
  '696532f3753fb0001424a570', // #49 Countryside House near the Beach and City
  '6965332c6d209c001510e1c1', // #50 Slow Living Countryside House
  '696533af4fe6a100145fecb6', // #51 White Charm by the Sea
  '69ca869e5b0a0500158b7d5a', // #52 River View by Portugal Active
  '6965333104b96f00147f5428', // #53 Portugal Active Bandeira Retreat
  '696533794fe6a100145fe4bf', // #54 Ocean Bliss - Beach & BBQ Apartment
  '6965335df1c3a8001597c8e4', // #55 Divine Waves Duplex by Portugal Active
  '6965337d2def930014e919c6', // #56 Urban Reflections by Portugal Active
  '696533cf4b583900135cfb02', // #57 Shoreline Escape by Portugal Active
  // #58 Portugal Active Encosta House — guestyId unknown (not in current Guesty
  //     catalogue). Add the id here when the listing is back active/listed.
];

const positionByGuestyId = new Map<string, number>(
  CURATED_PROPERTY_ORDER.map((id, i) => [id, i]),
);

/** Position in the curated list (lower = higher up), or +Infinity if not curated. */
export function curatedPosition(guestyId: string | undefined): number {
  if (!guestyId) return Number.POSITIVE_INFINITY;
  const p = positionByGuestyId.get(guestyId);
  return p === undefined ? Number.POSITIVE_INFINITY : p;
}

/** True when this Guesty id is in the curated top list. */
export function isCurated(guestyId: string | undefined): boolean {
  return !!guestyId && positionByGuestyId.has(guestyId);
}
