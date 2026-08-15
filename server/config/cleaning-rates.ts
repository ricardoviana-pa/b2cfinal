/**
 * Preços de limpeza POR CASA — gerado de "P.A Ops Revamp (1).xlsx", folha
 * Cleaning Rates (valores RoundUp, 12 jul 2026). 55 casas com preço direto;
 * fallback pela tabela de tipologia (nº de quartos). Regenerar quando a ops
 * atualizar o Excel.
 */
export interface CleaningRates { daily: number; deep: number }

export const CLEANING_BY_LISTING: Record<string, CleaningRates> = {
  "696532eee44e1a0015bb2460": { daily: 25, deep: 85 },
  "696532f3753fb0001424a570": { daily: 65, deep: 155 },
  "696532fa6d209c001510d5ee": { daily: 45, deep: 125 },
  "6965330729bb8c00141e8cd6": { daily: 85, deep: 235 },
  "6965330b6d209c001510dd49": { daily: 125, deep: 305 },
  "6965331fec80690013738c68": { daily: 105, deep: 295 },
  "6965332327950e001416f0b2": { daily: 150, deep: 325 },
  "696533266dec35001492fdbb": { daily: 25, deep: 75 },
  "6965332c6d209c001510e1c1": { daily: 85, deep: 235 },
  "6965333104b96f00147f5428": { daily: 65, deep: 150 },
  "69653335bf04fe0013742743": { daily: 170, deep: 355 },
  "696533494b9b64001401b62e": { daily: 105, deep: 295 },
  "6965334abf04fe0013742da8": { daily: 125, deep: 305 },
  "69653354109993001383ef5f": { daily: 150, deep: 325 },
  "696533616cff760015e28802": { daily: 45, deep: 140 },
  "696533616cff760015e28965": { daily: 65, deep: 150 },
  "696533714b583900135cef22": { daily: 125, deep: 305 },
  "696533762def930014e917bf": { daily: 65, deep: 160 },
  "696533794b583900135cf0fc": { daily: 25, deep: 80 },
  "696533794fe6a100145fe4bf": { daily: 25, deep: 80 },
  "6965337d2def930014e919c6": { daily: 65, deep: 155 },
  "696533814b9b64001401c7b8": { daily: 65, deep: 150 },
  "69653381bf04fe00137437cd": { daily: 85, deep: 235 },
  "6965338554dbb5001568a505": { daily: 25, deep: 80 },
  "69653388753fb0001424abad": { daily: 45, deep: 125 },
  "6965338a753fb0001424acf6": { daily: 45, deep: 110 },
  "6965338ed1c09900156e8502": { daily: 105, deep: 295 },
  "6965339404b96f00147f571a": { daily: 25, deep: 80 },
  "6965339bbf04fe0013743cd8": { daily: 150, deep: 315 },
  "6965339dbf04fe0013743e2d": { daily: 250, deep: 485 },
  "696533aaf142270014026d70": { daily: 105, deep: 295 },
  "696533abf142270014026fa9": { daily: 85, deep: 240 },
  "696533af4fe6a100145fecb6": { daily: 25, deep: 85 },
  "696533b2e44e1a0015bb2b42": { daily: 45, deep: 105 },
  "696533b7bf04fe00137440f8": { daily: 45, deep: 105 },
  "696533cf4b583900135cfb02": { daily: 65, deep: 160 },
  "696533d2ec19770014fd1b52": { daily: 85, deep: 235 },
  "696533d34b583900135cfd96": { daily: 190, deep: 410 },
  "696533d64b583900135d00cc": { daily: 150, deep: 315 },
  "696533d8753fb0001424b10d": { daily: 45, deep: 145 },
  "6970af61638a8a0015eaa850": { daily: 65, deep: 180 },
  "69c415701b964f00157188b5": { daily: 45, deep: 105 },
  "69c415701b964f00157188bd": { daily: 45, deep: 100 },
  "69ca869e5b0a0500158b7d5a": { daily: 45, deep: 125 },
  "69e7350685a8b000124854c5": { daily: 105, deep: 295 },
  "69e7552df2f71100122bbb35": { daily: 45, deep: 125 },
  "6a0359b4e343150013abc14d": { daily: 45, deep: 125 },
  "6a2ad70638d6620013badaef": { daily: 150, deep: 315 },
  "6a312c59a705e1001327708c": { daily: 105, deep: 295 },
  "6a341163c50f210012f12b80": { daily: 85, deep: 240 },
  "6a3549e5edd13800142415e0": { daily: 125, deep: 305 },
  "6a3a63f9e19cb0001db6a05e": { daily: 25, deep: 85 },
  "6a3ba1fce19cb0001dc57ea6": { daily: 25, deep: 85 },
  "6a4297f706510a0014f79dd1": { daily: 85, deep: 295 },
  "6a50d66857c8010015595ad0": { daily: 65, deep: 235 },
};

export const CLEANING_BY_BEDROOMS: Record<number, CleaningRates> = {
  1: { daily: 25, deep: 80 },
  12: { daily: 250, deep: 485 },
  2: { daily: 45, deep: 120 },
  3: { daily: 65, deep: 165 },
  4: { daily: 85, deep: 240 },
  5: { daily: 105, deep: 295 },
  6: { daily: 125, deep: 300 },
  7: { daily: 145, deep: 325 },
  8: { daily: 165, deep: 360 },
  9: { daily: 185, deep: 410 },
};

export function resolveCleaningRates(listingId?: string | null, bedrooms?: number | null): CleaningRates {
  if (listingId && CLEANING_BY_LISTING[listingId]) return CLEANING_BY_LISTING[listingId];
  const b = Math.max(1, Math.min(12, Math.round(bedrooms ?? 3)));
  return CLEANING_BY_BEDROOMS[b] ?? CLEANING_BY_BEDROOMS[3];
}
