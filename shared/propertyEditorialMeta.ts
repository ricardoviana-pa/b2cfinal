/** EN/PT search-snippet pilot, reviewed 4 November 2026.
 * These choices live outside the synced property JSON. IDs select the pilot;
 * current catalogue facts supply the copy, so a sync cannot freeze an old
 * capacity or keep advertising a removed amenity. No supplier labels are
 * included in the result. Villa Aura joined after Ricardo confirmed its
 * 13-guest capacity on 5 November 2026. Alentejo Farmhouse joined after
 * he also confirmed its five bedrooms and ten-guest capacity that day.
 */
type Locale = 'en' | 'pt';
type Feature = 'privatePool' | 'outdoorPool' | 'garden' | 'seaView' | 'gym';

export const PROPERTY_EDITORIAL_META: Record<string, readonly Feature[]> = {
  '696533494b9b64001401b62e': ['privatePool', 'garden'], // Oliveira's Farm
  '6a2ad70638d6620013badaef': ['outdoorPool', 'garden'], // Carcavelos Manor House
  '6965330729bb8c00141e8cd6': ['privatePool', 'garden'], // Hábitos Lodge
  '6965330b6d209c001510dd49': ['outdoorPool', 'seaView'], // Atlantic Lodge
  '6965334abf04fe0013742da8': ['outdoorPool', 'garden'], // Montaria Lodge
  '6965335cbf04fe00137431cb': ['outdoorPool', 'garden'], // Lima River Houses
  '696533722def930014e914e2': ['outdoorPool', 'gym'], // Abreu Retreat Palace
  '6965339dbf04fe0013743e2d': ['outdoorPool', 'garden'], // Fountain Retreat
  '6965331fec80690013738c68': ['outdoorPool', 'gym'], // Villa Aura
  '69c567ad7f6873000e9a3c37': ['outdoorPool', 'garden'], // Alentejo Farmhouse / Monte do Sossego
};

const FEATURES: Record<Feature, { amenity: string; en: string; pt: string }> = {
  privatePool: { amenity: 'Private pool', en: 'a private pool', pt: 'piscina privada' },
  outdoorPool: { amenity: 'Outdoor pool', en: 'an outdoor pool', pt: 'piscina exterior' },
  garden: { amenity: 'Garden or backyard', en: 'a garden', pt: 'jardim' },
  seaView: { amenity: 'Sea view', en: 'sea views', pt: 'vista mar' },
  gym: { amenity: 'Gym', en: 'a gym', pt: 'ginásio' },
};

interface EditorialInput {
  guestyId?: string | null;
  source?: string | null;
  supplierUid?: string | null;
  isActive?: boolean;
  locality?: string | null;
  bedrooms?: number | null;
  maxGuests?: number | null;
  amenities?: { property?: string[] } | null;
}

/** Null leaves the established metadata builder unchanged outside the pilot. */
export function propertyEditorialMeta(prop: EditorialInput, name: string, language: string | undefined) {
  const locale = (language || 'en').toLowerCase().split('-')[0];
  const selected = prop.guestyId && PROPERTY_EDITORIAL_META[prop.guestyId];
  if (!selected || !['en', 'pt'].includes(locale) || prop.isActive === false ||
      prop.source === 'tripwix' || prop.supplierUid) return null;
  const lang = locale as Locale;
  const locality = prop.locality?.trim();
  const beds = prop.bedrooms;
  const guests = prop.maxGuests;
  if (!locality || !name.trim() || !Number.isInteger(beds) || !beds || beds < 1 ||
      !Number.isInteger(guests) || !guests || guests < 1) return null;

  const amenities = new Set(prop.amenities?.property || []);
  const features = selected.filter(key => amenities.has(FEATURES[key].amenity)).map(key => FEATURES[key][lang]);
  const featureText = features.join(lang === 'pt' ? ' e ' : ' and ');
  const titleWithBedrooms = lang === 'pt'
    ? `${name} | T${beds} em ${locality} | Portugal Active`
    : `${name} | ${beds}-Bed, ${locality} | Portugal Active`;
  // Keep the precise locality when a longer name cannot fit the title budget.
  // The description retains both the bedroom count and guest capacity.
  const title = titleWithBedrooms.length <= 65
    ? titleWithBedrooms : `${name} | ${locality} | Portugal Active`;
  const facts = lang === 'pt'
    ? `${name} em ${locality}: ${beds} ${beds === 1 ? 'quarto' : 'quartos'} para até ${guests} ${guests === 1 ? 'hóspede' : 'hóspedes'}`
    : `${name} in ${locality}: ${beds} ${beds === 1 ? 'bedroom' : 'bedrooms'} for up to ${guests} ${guests === 1 ? 'guest' : 'guests'}`;
  const description = `${facts}${featureText ? `, ${lang === 'pt' ? 'com' : 'with'} ${featureText}` : ''}.`;
  // The caller applies its existing length budgets, image and canonical path.
  return { title, description };
}
