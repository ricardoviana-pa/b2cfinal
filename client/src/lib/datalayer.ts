/* ==========================================================================
   DATA LAYER UTILITY — GTM / GA4 helpers
   All dataLayer pushes should go through these helpers to ensure:
   - window.dataLayer is always initialized before pushing
   - ecommerce object is always cleared before each ecommerce event
   ========================================================================== */

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

/** Map service slug → GA4 item_category2 and ADDON ID prefix */
export const ADDON_PREFIX: Record<string, string> = {
  'private-chef':       'ADDON-CHF',
  'in-villa-spa':       'ADDON-SPA',
  'private-yoga':       'ADDON-YGA',
  'personal-training':  'ADDON-PTR',
  'grocery-delivery':   'ADDON-GRC',
  'babysitter':         'ADDON-BST',
  'airport-shuttle':    'ADDON-TRF',
  'daily-housekeeping': 'ADDON-HSK',
};

/** Push any event to the dataLayer */
export function pushDL(event: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
}

/** Push an ecommerce event — automatically clears the previous ecommerce object first */
export function pushEcommerce(event: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push(event);
}

/** Build a GA4 addon item object from a service/adventure product */
export function buildAddonItem(product: {
  id: string | number;
  slug: string;
  name: string;
  priceFrom?: number;
}, quantity = 1): Record<string, unknown> {
  const prefix = ADDON_PREFIX[product.slug] || 'ADDON';
  return {
    item_id: `${prefix}-${product.id}`,
    item_name: product.name,
    item_category: 'addon',
    item_category2: product.slug.replace(/-/g, '_'),
    price: product.priceFrom || 0,
    quantity,
  };
}

/** Build a GA4 property item object */
export function buildPropertyItem(property: {
  id: string | number;
  name: string;
  locality?: string;
  destination?: string;
  tier?: string;
  priceFrom?: number;
  maxGuests?: number;
  bedrooms?: number;
}, options: {
  nights?: number;
  checkinDate?: string;
  checkoutDate?: string;
  guests?: number;
  index?: number;
} = {}): Record<string, unknown> {
  return {
    item_id: `PROP-${property.id}`,
    item_name: property.name,
    item_category: 'villa',
    item_category2: property.locality || property.destination || '',
    item_category3: 'Portugal',
    item_variant: property.tier || '',
    price: property.priceFrom || 0,
    quantity: options.nights || 1,
    ...(options.checkinDate && { checkin_date: options.checkinDate }),
    ...(options.checkoutDate && { checkout_date: options.checkoutDate }),
    ...(options.guests && { guests_adults: options.guests }),
    ...(options.index !== undefined && { index: options.index }),
  };
}
