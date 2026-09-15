import { hasSwimmingPool } from './homeSearch';
export interface CollectionFilter {
  slug: string;
  filter: { type: string; pattern?: string; min?: number };
  excludeApartments?: boolean;
}
export function matchesCollection(p: Record<string, any>, def: CollectionFilter): boolean {
  if (def.excludeApartments && p.propertyType === 'Apartment') return false;
  const amenities = Object.values(p.amenities ?? {}).flatMap(v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []) as string[];
  if (def.slug === 'pet-friendly-villas') return p.petsAllowed === true;
  if (def.slug === 'villas-with-private-pool') return hasSwimmingPool(amenities);
  if (def.filter.type === 'minGuests') return (p.maxGuests ?? 0) >= (def.filter.min ?? 0);
  if (def.filter.type === 'amenity' && def.filter.pattern) return amenities.some(a => new RegExp(def.filter.pattern!, 'i').test(a));
  return false;
}
