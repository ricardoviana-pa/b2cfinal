/**
 * Central image registry — Replace these URLs with real Portugal Active photography.
 * Property images use high-quality Unsplash photos matched to each property's style.
 */

export const IMAGES = {
  // Hero images
  heroMain: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-main-96HXfBCK752avi2daWhgmd.webp',
  heroHomes: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-homes-NBdFZGmwXL2AoxvceMgjMy.webp',

  // Destination images
  destinationMinho: '/destinations/minho-coast.webp',
  destinationPorto: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/destination-porto-cjrXcH98hgUxZe4zNQBukn.webp',
  destinationAlgarve: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/destination-algarve-3kQynd6tpdsGxReK7b8dAs.webp',

  // Experience images — real Portugal Active photography
  expGastronomy: '/experiences/pa-chef-cooking.webp',
  expWellness: '/experiences/exp-wellness.webp',
  expAdventure: '/experiences/sup-river.webp',
  expMobility: 'https://images.unsplash.com/photo-1679007076103-9ffa7afa1bfb?w=800&q=80&auto=format&fit=crop',

  // About page
  aboutStory: '/hero/about-team-suite.webp',

  // Contact page
  contactHero: '/destinations/contact-hero.webp',

  // Logo
  logoWhite: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/portugal-active-logo-white_cbdf5c3f.webp',
  logoColor: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/portugal-active-logo_0b76cb12.webp',

  // Press logos
  pressForbes: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/press-forbes_1246ca14.png',
  pressTheTimes: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/press-the-times_f05a8eca.png',
  pressTheGuardian: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/press-the-guardian_90792c94.png',
  pressTimeOut: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/press-time-out-v2_5105e066.png',
  pressMensHealth: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/press-mens-health_0d8488bb.png',
  pressArquitectura: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/press-arquitectura-diseno_8d8e8eb4.png',
} as const;

/**
 * Property images — curated Unsplash photos matched to each property's style and location.
 * Each property gets 3-4 images for the carousel.
 * Replace with real property photos when available.
 */
export const PROPERTY_IMAGES: Record<string, string[]> = {
  // Casa do Mar — Oceanfront contemporary, Minho Coast
  'casa-do-mar': [
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80&auto=format&fit=crop',
  ],
  // Quinta da Eira — Restored farmhouse, vineyards, Ponte de Lima
  'quinta-da-eira': [
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop',
  ],
  // Villa Serena — Hilltop, Douro Valley, contemporary
  'villa-serena': [
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa da Praia — Beachfront modern, Caminha
  'casa-da-praia': [
    'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80&auto=format&fit=crop',
  ],
  // Solar de Além — Grand manor, heritage, gardens
  'solar-de-alem': [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa Rio — Riverside, Douro, modern
  'casa-rio': [
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800&q=80&auto=format&fit=crop',
  ],
  // Villa Atlântica — Clifftop, Lagos, Algarve
  'villa-atlantica': [
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa do Campo — Rural, Gerês, rustic
  'casa-do-campo': [
    'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1542718610-a1d656d1884c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?w=800&q=80&auto=format&fit=crop',
  ],
  // Palacete Porto — Historic townhouse, Porto
  'palacete-porto': [
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa Algarvia — Traditional, Tavira, Algarve
  'casa-algarvia': [
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80&auto=format&fit=crop',
  ],
  // Monte Velho — Countryside estate, Algarve
  'monte-velho': [
    'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1542718610-a1d656d1884c?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa da Torre — Medieval tower, Minho
  'casa-da-torre': [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80&auto=format&fit=crop',
  ],
  // Villa Luz — Modern, Albufeira, Algarve
  'villa-luz': [
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800&q=80&auto=format&fit=crop',
  ],
  // Quinta do Vale — Wine estate, Douro
  'quinta-do-vale': [
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa Branca — Whitewashed, Algarve
  'casa-branca': [
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80&auto=format&fit=crop',
  ],
  // Villa Garden — Contemporary, Vilamoura
  'villa-garden': [
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80&auto=format&fit=crop',
  ],
  // Casa do Artista — Bohemian, Porto
  'casa-do-artista': [
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop',
  ],
  // Villa Oceano — Oceanfront, Sagres
  'villa-oceano': [
    'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80&auto=format&fit=crop',
  ],
} as const;

/**
 * Get images for a property by slug. Falls back to a default set if no match.
 */
export function getPropertyImages(slug: string): string[] {
  return PROPERTY_IMAGES[slug] || [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop',
  ];
}
