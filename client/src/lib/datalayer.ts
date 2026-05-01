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

/* ── AI referrer detection ──────────────────────────────────────────────
   Fires a custom GA4 event when the visitor arrived from an AI source
   (ChatGPT link, Perplexity citation, Claude, Google AI Overview, etc.).
   Call once on app mount. Uses both document.referrer and UTM params.  */

const AI_REFERRER_PATTERNS: [RegExp, string][] = [
  [/chat\.openai\.com|chatgpt\.com/i, 'chatgpt'],
  [/perplexity\.ai/i, 'perplexity'],
  [/claude\.ai/i, 'claude'],
  [/gemini\.google\.com|bard\.google\.com/i, 'gemini'],
  [/copilot\.microsoft\.com/i, 'copilot'],
  [/you\.com/i, 'you.com'],
  [/phind\.com/i, 'phind'],
  [/google\.\w+\/search.*?ai_overview/i, 'google_ai_overview'],
];

export function detectAiReferrer(): void {
  const ref = document.referrer || '';
  const params = new URLSearchParams(window.location.search);
  const utmSource = (params.get('utm_source') || '').toLowerCase();
  const utmMedium = (params.get('utm_medium') || '').toLowerCase();

  let source = '';

  // Check referrer URL
  for (const [pattern, name] of AI_REFERRER_PATTERNS) {
    if (pattern.test(ref)) { source = name; break; }
  }

  // Check UTM fallback (links from AI tools often carry utm_source)
  if (!source && (utmMedium === 'ai' || utmMedium === 'llm')) {
    source = utmSource || 'ai_unknown';
  }
  if (!source && AI_REFERRER_PATTERNS.some(([p]) => p.test(utmSource))) {
    source = utmSource;
  }

  if (source) {
    pushDL({
      event: 'ai_referral',
      ai_source: source,
      ai_referrer: ref,
      ai_landing_page: window.location.pathname,
    });
  }
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
