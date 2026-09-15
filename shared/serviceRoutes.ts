/** Keep established canonical URLs while resolving the published catalogue. */
const ROUTES: Record<string, string> = {
  'in-villa-spa': 'massage-therapist',
  'grocery-delivery': 'grocery-setup',
  'personal-training': 'personal-trainer',
};

export const serviceRouteSlug = (productSlug: string): string => ROUTES[productSlug] || productSlug;
export const serviceProductSlug = (routeSlug: string): string =>
  Object.entries(ROUTES).find(([, route]) => route === routeSlug)?.[0] || routeSlug;
