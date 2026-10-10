/* ==========================================================================
   DATA LAYER UTILITY — GTM / GA4 helpers
   All dataLayer pushes should go through these helpers to ensure:
   - window.dataLayer is always initialized before pushing
   - ecommerce object is always cleared before each ecommerce event
   ========================================================================== */

import { dataLayerDebugEnabled, hasMeasurementConsent } from './measurementConsent';
import { isLiveSiteHostname } from '@shared/deployment';

/** Purchases already reported in this document without consent (memory only). */
const cookielessPurchases = new Set<string>();

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

/**
 * Id da casa no catálogo da Meta (scripts/meta-catalog.mjs: `id` = guestyId).
 * O `id` interno das propriedades vem como "guesty-<id>"; o item GA4 usa
 * PROP-<guestyId> em todo o funil e as tags Meta do GTM tiram o prefixo PROP-
 * para os content_ids. Assim ViewContent, InitiateCheckout e Purchase batem
 * com o catálogo.
 */
export function propertyCatalogId(property: { id?: string | number | null; guestyId?: string | null }): string {
  return String(property.guestyId || property.id || '').replace(/^guesty-/, '');
}

function debugLog(event: Record<string, unknown>): void {
  if (dataLayerDebugEnabled()) console.info('[dataLayer]', event.event, event);
}

/** Push any event to the dataLayer */
export function pushDL(event: Record<string, unknown>): void {
  if (!hasMeasurementConsent()) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
  debugLog(event);
}

/** Push an ecommerce event — automatically clears the previous ecommerce object first */
export function pushEcommerce(event: Record<string, unknown>): void {
  if (!hasMeasurementConsent()) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push(event);
  debugLog(event);
}

/** Item comprado no checkout além da estadia (extra, receção, Flex). */
export type PurchaseExtraItem = { price?: number | null; quantity?: number | null } & Record<string, unknown>;

/** Soma price × quantity dos itens, arredondada ao cêntimo. */
export function sumItems(items: PurchaseExtraItem[] | null | undefined): number {
  const total = (items ?? []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Valor da reserva para o `purchase`: só a estadia (alojamento, limpeza,
 * taxas, já com o desconto do código), sem extras, receção nem Flex. É o
 * valor que vai para GA4, Google Ads e Meta (decisão de 10/10/2026). Os
 * serviços seguem no evento `purchase_extras` (pushPurchaseOnce).
 * Quando a página só conhece o total pago, a estadia é total − serviços.
 */
export function stayValue(stayTotalCents: number | null | undefined, totalPaidCents: number | null | undefined, extras?: PurchaseExtraItem[] | null): number | undefined {
  if (stayTotalCents != null && Number.isFinite(stayTotalCents) && stayTotalCents > 0) return Math.round(stayTotalCents) / 100;
  if (totalPaidCents == null || !Number.isFinite(totalPaidCents)) return undefined;
  const stay = Math.round(totalPaidCents) / 100 - sumItems(extras);
  return stay > 0 ? Math.round(stay * 100) / 100 : undefined;
}

/**
 * Push a GA4 `purchase` exactly once per transaction, across page refreshes,
 * redirects and the multiple funnel surfaces that can report the same booking
 * (return pages → thank-you page → confirmation page). Guarded by a
 * localStorage key per transaction_id; if storage is unavailable we still
 * push (a duplicate beats a lost purchase).
 */
/** Guest contact for Google Ads enhanced conversions (only sent with consent). */
export type PurchaseUserData = { email?: string | null; phone?: string | null };

/** GA4/Google Ads `user_data` shape: email trimmed + lowercased, phone in E.164
 *  when it already carries a country code (otherwise digits only, so Google
 *  can still try). Empty → undefined, so nothing is pushed. */
export function buildUserData(u?: PurchaseUserData | null): Record<string, string> | undefined {
  if (!u) return undefined;
  const out: Record<string, string> = {};
  const email = (u.email || '').trim().toLowerCase();
  if (email.includes('@')) out.email = email;
  const raw = (u.phone || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length >= 7) {
    if (raw.startsWith('+')) out.phone_number = `+${digits}`;
    else if (raw.startsWith('00')) out.phone_number = `+${digits.slice(2)}`;
    else out.phone_number = digits;
  }
  return Object.keys(out).length ? out : undefined;
}

export function pushPurchaseOnce(
  transactionId: string | null | undefined,
  event: Record<string, unknown>,
  userData?: PurchaseUserData | null,
  /** Serviços pagos com a reserva: saem num `purchase_extras` à parte, para o
   *  `purchase` levar só a estadia. Só com consentimento (GA4). */
  extras?: PurchaseExtraItem[] | null,
): void {
  // Advanced consent mode: without a grant the purchase still reaches GTM so
  // Google tags send a cookieless conversion ping (Meta/Clarity are gated in
  // GTM). Nothing is written to the browser: dedupe is in memory only, and
  // Google Ads / GA4 also dedupe on transaction_id. Never replayed on accept.
  if (!hasMeasurementConsent()) {
    if (typeof window === 'undefined' || !isLiveSiteHostname(window.location.hostname)) return;
    if (transactionId) {
      if (cookielessPurchases.has(transactionId)) return;
      cookielessPurchases.add(transactionId);
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push(event);
    return;
  }
  if (transactionId) {
    if (cookielessPurchases.has(transactionId)) return;
    const key = `dl_purchase_${transactionId}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, String(Date.now()));
    } catch {
      /* storage unavailable — push anyway */
    }
  }
  // Enhanced conversions: the guest's contact rides only on a consented
  // purchase (Google hashes it in the tag; ad_user_data must be granted).
  const user_data = buildUserData(userData);
  pushEcommerce(user_data ? { ...event, user_data } : event);
  if (extras && extras.length) {
    const ecommerce = (event.ecommerce ?? {}) as Record<string, unknown>;
    pushEcommerce({
      event: 'purchase_extras',
      ecommerce: {
        transaction_id: transactionId ?? ecommerce.transaction_id,
        currency: ecommerce.currency || 'EUR',
        value: sumItems(extras),
        items: extras,
      },
    });
  }
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

export function detectAiReferrer(landingLocation = { pathname: window.location.pathname, search: window.location.search }): void {
  if (!hasMeasurementConsent()) return;
  const ref = document.referrer || '';
  const params = new URLSearchParams(landingLocation.search);
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
      ai_landing_page: landingLocation.pathname,
    });
  }
}

/** Build a GA4 property item object */
export function buildPropertyItem(property: {
  id: string | number;
  guestyId?: string | null;
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
    item_id: `PROP-${propertyCatalogId(property)}`,
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

/**
 * Site-wide WhatsApp / phone click tracking via event delegation.
 *
 * WhatsApp is this business's main conversion channel, yet only 3 of 19
 * wa.me anchors pushed an event — Google/Meta optimized on a starved signal
 * (a big part of why paid ads "didn't work"). One capture-phase listener
 * covers every current AND future link, so nobody has to remember to
 * instrument the next one. Granular labels come from an optional
 * data-track-source attribute on the anchor (or an ancestor); pages without
 * one report their pathname, which is plenty for conversion counting.
 */
export function installContactClickTracking(): void {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('a[href]');
      if (!el) return;
      const href = el.getAttribute('href') || '';
      const source =
        (el.closest('[data-track-source]') as HTMLElement | null)?.dataset.trackSource ||
        window.location.pathname;
      if (href.includes('wa.me/')) {
        pushDL({ event: 'whatsapp_click', source });
      } else if (href.startsWith('tel:')) {
        pushDL({ event: 'phone_click', source });
      }
    },
    true,
  );
}
