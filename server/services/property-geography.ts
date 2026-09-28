/** Pataias belongs to Alcobaça on the Silver Coast, not to Lisbon.
 * Keep this correction at the public boundary as older sync files still carry
 * the former Lisbon marketing bucket. No new destination page is implied.
 */
export function isPataias(value: unknown): boolean {
  return typeof value === 'string' && /^pataias(?:\s|,|$)/i.test(value.trim());
}

export function normalizePublicPropertyGeography<T extends Record<string, any>>(property: T): T {
  if (!isPataias(property.locality) && !isPataias(property.address?.city)) return property;
  return { ...property, destination: 'silver-coast', region: 'Silver Coast' };
}
