/** Public card payload. Full descriptions, room photos and review bodies stay on the PDP. */
const CATALOG_FIELDS = [
  'id', 'guestyId', 'supplierUid', 'slug', 'name', 'title', 'tagline', 'tier', 'destination', 'locality',
  'bedrooms', 'bathrooms', 'maxGuests', 'priceFrom', 'pricePerNight', 'cleaningFee', 'currency', 'petsAllowed',
  'tags', 'occasions', 'isActive', 'isPortfolio', 'isFeatured', 'source', 'bookingMode',
  'sortOrder', 'averageRating', 'reviewCount', 'propertyType', 'minNights', 'groupId', 'unitOf', 'style',
] as const;

/** The catalogue ships amenities only so the listing can filter on them:
 *  pool / heated pool (homeSearch.ts) and the amenity collections in
 *  collections.json (pool, sea view, pets, jacuzzi, beach). The rest (~65
 *  strings per home) was 45% of the catalogue embedded in every listing
 *  page's HTML. A new amenity-based filter must add its words here; the
 *  test checks every collections.json pattern is covered. */
export const CATALOG_AMENITY_PATTERN = /pool|heated|sea view|ocean view|beach|pets? allowed|pet friendly|jacuzzi|hot tub/i;

function filterAmenities(amenities: unknown): Record<string, string[]> {
  if (!amenities || typeof amenities !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [group, list] of Object.entries(amenities as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((a): a is string => typeof a === 'string' && CATALOG_AMENITY_PATTERN.test(a));
    if (kept.length) out[group] = kept;
  }
  return out;
}

export function toCatalogCard(property: Record<string, any>) {
  const card: Record<string, any> = {};
  for (const field of CATALOG_FIELDS) if (property[field] !== undefined) card[field] = property[field];
  card.images = Array.isArray(property.images) ? property.images.slice(0, 4) : [];
  card.amenities = filterAmenities(property.amenities);
  // Match the approximate location used on the public PDP. Never ship a street address here.
  if (Number.isFinite(property.address?.lat) && Number.isFinite(property.address?.lng)) {
    card.address = { lat: Number(property.address.lat.toFixed(3)), lng: Number(property.address.lng.toFixed(3)) };
  }
  return card;
}

/** Recent substantive feedback from the published inventory; no invented testimonials. */
export function recentGuestFeedback(properties: Record<string, any>[]) {
  const feedback = properties.filter(p => p.isActive !== false).flatMap(p =>
    (Array.isArray(p.reviews) ? p.reviews : []).filter((r: any) =>
      Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5 &&
      typeof r.text === 'string' && r.text.replace(/[^\p{L}]/gu, '').length >= 12 &&
      !/\bairbnb\b|booking\.com|\bvrbo\b|\bexpedia\b|homeaway/i.test(r.text)
    ).map((r: any) => ({
      property: { id: p.id, slug: p.slug, name: p.name, title: p.title, guestyId: p.guestyId },
      text: r.text, rating: r.rating, date: r.date,
      guestName: String(r.guestDisplayName || r.guestName || '').trim().split(/\s+/)[0],
    }))
  ).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const seen = new Set<string>();
  return feedback.filter(r => {
    if (seen.has(r.property.slug)) return false;
    seen.add(r.property.slug);
    return true;
  }).slice(0, 4);
}
