/** Product region tags are broad marketing coverage, not proof of a local
 * meeting point. Keep known Lima products in their region and do not inherit
 * Porto's coastal activities on the inland Douro guide.
 */
export function adventureMatchesDestination(
  product: { slug: string; type: string; isActive: boolean; destinations: readonly string[] },
  destination: { slug: string; region: string },
): boolean {
  if (product.type !== 'adventure' || !product.isActive) return false;
  if (destination.slug === 'douro') return product.destinations.includes('douro');
  if (product.slug === 'stand-up-paddle' && destination.region !== 'minho') return false;
  return product.destinations.includes(destination.region);
}
