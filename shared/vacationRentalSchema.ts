/** One factual rental schema for the server response and client navigation.
 * Rates require dates and a verified quote; imported base rates are not offers.
 * Missing source data stays missing rather than inventing rich-result fields.
 */
export interface VacationRentalInput {
  id?: string | number | null;
  guestyId?: string | null;
  supplierUid?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  images?: string[] | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  maxGuests?: number | null;
  rooms?: Array<{ beds?: Array<{ type?: string; quantity?: number }> }> | null;
  areaSquareFeet?: number | null;
  priceFrom?: number | null;
  locality?: string | null;
  region?: string | null;
  amenities?: string[];
  petsAllowed?: boolean | null;
  licenseNumber?: string | null;
  smokingAllowed?: boolean | null;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  aggregateRating?: { ratingValue: number; reviewCount: number } | null;
  reviews?: Array<{ rating: number; text: string; guestName: string; date: string }> | null;
}

const BASE = 'https://www.portugalactive.com';
const TYPES: Record<string, string> = {
  Villa: 'Villa', House: 'House', Townhouse: 'House', Apartment: 'Apartment',
  Bungalow: 'Bungalow', Cabin: 'Cabin', Chalet: 'Chalet', Cottage: 'Cottage',
};
const BEDS: Record<string, string> = {
  KING_BED: 'King', QUEEN_BED: 'Queen', DOUBLE_BED: 'Double',
  SINGLE_BED: 'Single', SOFA_BED: 'SofaBed', BUNK_BED: 'BunkBed',
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const count = (n: unknown): n is number => finite(n) && Number.isInteger(n) && n >= 0;

export function rentalAccommodation(i: VacationRentalInput): Record<string, unknown> {
  const beds = (i.rooms ?? []).flatMap(room => room.beds ?? [])
    .filter(b => BEDS[b.type ?? ''] && count(b.quantity) && b.quantity > 0)
    .map(b => ({ '@type': 'BedDetails', numberOfBeds: b.quantity, typeOfBed: BEDS[b.type!] }));
  return {
    '@type': 'Accommodation',
    // House/Villa describes the building, not whether guests share the space.
    ...(count(i.bedrooms) && { numberOfBedrooms: i.bedrooms }),
    ...(finite(i.bathrooms) && i.bathrooms >= 0 && { numberOfBathroomsTotal: i.bathrooms }),
    ...(count(i.maxGuests) && i.maxGuests > 0 && {
      occupancy: { '@type': 'QuantitativeValue', value: i.maxGuests },
    }),
    ...(beds.length > 0 && { bed: beds }),
    ...(finite(i.areaSquareFeet) && i.areaSquareFeet > 0 && {
      floorSize: { '@type': 'QuantitativeValue', value: i.areaSquareFeet, unitCode: 'FTK' },
    }),
    ...(i.amenities?.length && { amenityFeature: i.amenities.slice(0, 30).map(name => ({
      '@type': 'LocationFeatureSpecification', name, value: true,
    })) }),
  };
}

export function vacationRentalSchema(i: VacationRentalInput, lang = 'en'): Record<string, unknown> {
  const url = `${BASE}/${lang}/homes/${i.slug}`;
  const identifier = i.guestyId ? `guesty:${i.guestyId}`
    : i.supplierUid ? `tripwix:${i.supplierUid}` : i.id != null ? `pa:${i.id}` : undefined;
  const images = [...new Set((i.images ?? []).filter(Boolean))].slice(0, 12)
    .map(src => src.startsWith('/') ? `${BASE}${src}` : src);
  return {
    '@context': 'https://schema.org', '@type': 'VacationRental', '@id': url,
    name: i.name, url,
    ...(identifier && { identifier }),
    ...(TYPES[i.propertyType ?? ''] && { additionalType: TYPES[i.propertyType!] }),
    ...(i.description && { description: i.description.replace(/\s+/g, ' ').trim().slice(0, 500) }),
    ...(images.length > 0 && { image: images }),
    containsPlace: rentalAccommodation(i),
    address: {
      '@type': 'PostalAddress', addressCountry: 'PT',
      ...(i.locality && { addressLocality: i.locality }),
      ...(i.region && { addressRegion: i.region }),
    },
    ...(finite(i.latitude) && finite(i.longitude) && Math.abs(i.latitude) <= 90 && Math.abs(i.longitude) <= 180 && {
      geo: { '@type': 'GeoCoordinates', latitude: i.latitude, longitude: i.longitude },
    }),
    ...(typeof i.petsAllowed === 'boolean' && { petsAllowed: i.petsAllowed }),
    ...(typeof i.smokingAllowed === 'boolean' && { smokingAllowed: i.smokingAllowed }),
    ...(i.checkinTime && { checkinTime: i.checkinTime }),
    ...(i.checkoutTime && { checkoutTime: i.checkoutTime }),
    ...(i.licenseNumber && { additionalProperty: {
      '@type': 'PropertyValue', propertyID: 'AL', name: 'Registo de Alojamento Local', value: String(i.licenseNumber),
    } }),
    ...(i.aggregateRating && finite(i.aggregateRating.ratingValue) && i.aggregateRating.ratingValue >= 1 && i.aggregateRating.ratingValue <= 5 && count(i.aggregateRating.reviewCount) && i.aggregateRating.reviewCount > 0 && {
      aggregateRating: { '@type': 'AggregateRating', ...i.aggregateRating, bestRating: 5, worstRating: 1 },
    }),
    ...(i.reviews?.length && { review: i.reviews
      .filter(r => finite(r.rating) && r.rating >= 1 && r.rating <= 5 && r.guestName && r.text)
      .slice(0, 5).map(r => ({
        '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { '@type': 'Person', name: r.guestName }, reviewBody: r.text.slice(0, 500),
        ...(r.date && { datePublished: r.date.split('T')[0] }),
      })) }),
    brand: { '@type': 'Brand', name: 'Portugal Active', url: BASE },
  };
}
