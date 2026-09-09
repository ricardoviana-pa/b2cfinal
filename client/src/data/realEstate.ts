/** Confirmed public collection, 9 Sep 2026. Remove an entry when its sale listing closes.
 * Source: ricardoviana-pa/real-estate-website, src/data/houses.ts and villa-aura.json.
 * This allowlist prevents the stays catalogue from implying every home is for sale.
 */
const saleListings: Record<string,string> = {
  'skyline-retreat-with-pool-by-portugal-active-026d70': 'skyline',
  'portugal-active-beach-flat-bb2460': 'beach-flat',
  'portugal-active-oliveira-s-farm-01b62e': 'oliveiras-farm',
  'villa-aura-sauna-gym-5min-beach-city-738c68': 'villa-aura',
};
export function realEstateListing(staysSlug: string, language: string): string | undefined {
  const slug = saleListings[staysSlug];
  if (!slug) return undefined;
  const locale = language.split('-')[0];
  const prefix = ['pt','fr','es'].includes(locale) ? locale+'/' : '';
  return 'https://www.portugalactive.com/realestate/'+prefix+'houses/'+slug+'/';
}
