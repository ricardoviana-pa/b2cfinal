/** Public card payload. Full descriptions, room photos and review bodies stay on the PDP. */
const CATALOG_FIELDS = [
  'id', 'guestyId', 'supplierUid', 'slug', 'name', 'title', 'tagline', 'tier', 'destination', 'locality',
  'bedrooms', 'bathrooms', 'maxGuests', 'priceFrom', 'pricePerNight', 'cleaningFee', 'currency', 'petsAllowed',
  'tags', 'occasions', 'isActive', 'isPortfolio', 'isFeatured', 'source', 'bookingMode',
  'sortOrder', 'averageRating', 'reviewCount', 'propertyType', 'minNights', 'groupId', 'unitOf', 'style',
] as const;

export function toCatalogCard(property: Record<string, any>) {
  const card: Record<string, any> = {};
  for (const field of CATALOG_FIELDS) if (property[field] !== undefined) card[field] = property[field];
  card.images = Array.isArray(property.images) ? property.images.slice(0, 4) : [];
  card.amenities = property.amenities ?? {};
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
