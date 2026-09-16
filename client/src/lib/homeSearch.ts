import type { Property, SortOption } from './types';
import { sortProperties } from './utils';

/** Region choices are distinct from city names; clearing resets both. */
export function parseDestinationSelection(value: string): { destination: string; location: string } {
  if (value.startsWith('region:')) {
    const destination = value.slice(7);
    return { destination: ['minho', 'porto', 'lisbon', 'alentejo', 'algarve'].includes(destination) ? destination : '', location: '' };
  }
  return { destination: '', location: value };
}

export interface SearchQuote {
  total: number;
  nightlyRate: number;
  available?: boolean;
  source?: string;
  feesKnown?: boolean;
}

export function hasConfirmedQuote(quote?: SearchQuote | null): boolean {
  return !!quote && quote.available === true && quote.total > 0 &&
    (quote.source === 'live' || quote.source === 'cached');
}

export function hasSwimmingPool(amenities: string[]): boolean {
  return amenities.some(a => /\bpool\b/i.test(a) && !/\b(pool table|poolside|pool view)\b/i.test(a));
}

export function hasHeatedPool(text: string): boolean {
  return /\b(heated (?:swimming )?pool|pool (?:is )?heated)\b/i.test(text);
}

export function searchPrice(property: Property, quotes: Record<string, SearchQuote | null>, fromPrices: Record<string, number | null> | undefined, nights: number): number | null {
  if (nights > 0) {
    const quote = quotes[property.slug];
    // Compare the same whole-stay total displayed on the card, including fees.
    if (quote?.source === 'partner_calendar' && !quote.feesKnown) return null;
    return quote && quote.available !== false && quote.total > 0 ? quote.total : null;
  }
  const price = fromPrices?.[property.guestyId ?? property.supplierUid ?? ''];
  return typeof price === 'number' && price > 0 ? price : null;
}

export function sortSearchResults(properties: Property[], sort: SortOption, quotes: Record<string, SearchQuote | null>, fromPrices: Record<string, number | null> | undefined, nights: number): Property[] {
  if (sort !== 'price-asc' && sort !== 'price-desc') return sortProperties(properties, sort);
  return [...properties].sort((a, b) => {
    const pa = searchPrice(a, quotes, fromPrices, nights);
    const pb = searchPrice(b, quotes, fromPrices, nights);
    // Unknown prices belong after comparable prices in either direction.
    if (pa === null) return pb === null ? 0 : 1;
    if (pb === null) return -1;
    return sort === 'price-asc' ? pa - pb : pb - pa;
  });
}

export function parseHomeFilters(params: URLSearchParams) {
  const pick = (key: string, options: string[], fallback = 'all') => {
    const value = params.get(key) || '';
    return options.includes(value) ? value : fallback;
  };
  return {
    type: pick('type', ['House', 'Villa', 'Apartment']),
    budget: pick('budget', ['b1', 'b2', 'b3', 'b4']),
    bedrooms: pick('bedrooms', ['1-2', '3-4', '5-6', '7+']),
    pool: params.get('pool') === '1',
    heatedPool: params.get('heatedPool') === '1',
    pets: params.get('pets') === '1',
    sort: pick('sort', ['recommended', 'price-asc', 'price-desc', 'newest'], 'recommended') as SortOption,
  };
}

/** Calendar-day arithmetic in UTC avoids DST and month-boundary surprises. */
export function addSearchDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildHomeSearchPath({ destination, checkin, checkout, guests }: {
  destination: string; checkin: string; checkout: string; guests: number;
}): string {
  const params = new URLSearchParams();
  if (destination) params.set('location', destination);
  if (checkin) params.set('checkin', checkin);
  if (checkout) params.set('checkout', checkout);
  if (guests > 1) params.set('guests', String(guests));
  return `/homes${params.size ? `?${params}` : ''}`;
}
