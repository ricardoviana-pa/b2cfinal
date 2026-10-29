import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance, type TFunction } from 'i18next';
import { conciergeWhatsAppHref, listingWhatsAppMessage } from '@/lib/whatsappMessage';
import { CONTACT_CONTEXT_FIELDS, contactClickEvent, trackContextFromDataset } from '@/lib/datalayer';
import ListingWhatsApp, { listingFloatShown, LISTING_FIRST_RESULT, LISTING_PHOTO_ARROWS, trackAttributes } from '@/components/homes/ListingWhatsApp';
import en from '../client/src/i18n/locales/en.json';
import pt from '../client/src/i18n/locales/pt.json';
import de from '../client/src/i18n/locales/de.json';
import fr from '../client/src/i18n/locales/fr.json';

// Auditoria 29 out, ux-home-plp-06: on phones /homes and the collections get a
// WhatsApp shortcut straight to wa.me, with the message in the page language
// and the guest's region and dates, counted as whatsapp_click with context.

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

async function tFor(lng: string): Promise<TFunction> {
  const i18n = createInstance();
  await i18n.init({ lng, fallbackLng: 'en', resources: { en: { translation: en }, pt: { translation: pt }, de: { translation: de }, fr: { translation: fr } }, interpolation: { escapeValue: false } });
  return i18n.t;
}

describe('prefilled concierge message', () => {
  it('says where, when and how many, in the page language', async () => {
    const msg = listingWhatsAppMessage(await tFor('en'), 'en', { place: 'Algarve', checkin: '2027-07-10', checkout: '2027-07-17', guests: 6 });
    expect(msg.split('\n')).toEqual([
      "Hello! I'm looking at homes on the Portugal Active website and would like some help choosing.",
      'Destination: Algarve',
      'Dates: 10 Jul 2027 → 17 Jul 2027',
      'Guests: 6',
    ]);
    const ptMsg = listingWhatsAppMessage(await tFor('pt'), 'pt', { place: 'Porto e Douro', checkin: '2027-07-10', checkout: '2027-07-17' });
    expect(ptMsg).toMatch(/^Olá! Estou a ver casas no site da Portugal Active/);
    expect(ptMsg).toContain('Destino: Porto e Douro');
    expect(ptMsg).toContain('Datas: 10 jul 2027 → 17 jul 2027');
    const deMsg = listingWhatsAppMessage(await tFor('de'), 'de', { collection: 'Villen am Strand' });
    expect(deMsg).toContain('Kollektion: Villen am Strand');
  });

  it('leaves out what the guest has not set, and broken or reversed dates', async () => {
    const t = await tFor('en');
    expect(listingWhatsAppMessage(t, 'en', {}).split('\n')).toHaveLength(1);
    expect(listingWhatsAppMessage(t, 'en', { checkin: '2027-07-17', checkout: '2027-07-10' })).not.toContain('Dates');
    expect(listingWhatsAppMessage(t, 'en', { checkin: '2027-7-1', checkout: '2027-07-10' })).not.toContain('Dates');
    expect(listingWhatsAppMessage(t, 'en', { guests: 0 })).not.toContain('Guests');
  });

  it('has its own opening for a dead end (no match / no availability), still in the page language', async () => {
    expect(listingWhatsAppMessage(await tFor('fr'), 'fr', { reason: 'noAvailability' })).toMatch(/^Bonjour ! Je n’ai pas trouvé .* disponible à mes dates/);
    expect(listingWhatsAppMessage(await tFor('pt'), 'pt', { reason: 'noMatch' })).toMatch(/^Olá! Não encontrei .* que corresponda/);
  });

  it('builds a wa.me link with the text encoded', () => {
    expect(conciergeWhatsAppHref()).toBe('https://wa.me/351927161771');
    const href = conciergeWhatsAppHref('Olá!\nDestino: Porto & Douro');
    expect(href).toBe('https://wa.me/351927161771?text=Ol%C3%A1!%0ADestino%3A%20Porto%20%26%20Douro');
    expect(new URL(href).searchParams.get('text')).toBe('Olá!\nDestino: Porto & Douro');
  });
});

describe('whatsapp_click with the listing context', () => {
  it('turns data-track-* attributes into event fields', () => {
    expect(trackContextFromDataset({
      trackSource: 'listing_float', trackItemListId: 'search_results', trackSearchLocation: 'algarve',
      trackSearchCheckin: '2027-07-10', trackSearchCheckout: '', other: 'ignored',
    })).toEqual({ item_list_id: 'search_results', search_location: 'algarve', search_checkin: '2027-07-10' });
  });

  it('cannot rename the event or its source', () => {
    expect(trackContextFromDataset({ trackEvent: 'purchase', trackSource: 'x' })).toEqual({});
  });

  it('renders the attributes the listener reads, dropping empty ones', () => {
    expect(trackAttributes('listing_float', { 'item-list-id': 'collection_beach-villas', 'search-checkin': undefined, 'search-location': '' }))
      .toEqual({ 'data-track-source': 'listing_float', 'data-track-item-list-id': 'collection_beach-villas' });
  });

  it('the shortcut is a direct wa.me link on /homes and the collections, phones and tablets only, with no own click event (no double count)', () => {
    const shortcut = read('client/src/components/homes/ListingWhatsApp.tsx');
    expect(shortcut).toMatch(/trackAttributes\('listing_float', context\)/);
    expect(shortcut).toMatch(/className=\{`lg:hidden fixed/);
    expect(shortcut).not.toMatch(/onClick|pushDL|WhatsAppModal/);
    expect(read('client/src/pages/Homes.tsx')).toMatch(/<ListingWhatsApp href=\{listingWhatsAppHref\} context=\{trackContext\} \/>/);
    expect(read('client/src/pages/Collection.tsx')).toMatch(/<ListingWhatsApp\s+href=\{whatsappHref\}/);
    // The delegated listener carries the context into whatsapp_click.
    expect(read('client/src/lib/datalayer.ts')).toMatch(/pushDL\(contactClickEvent\('whatsapp_click', source, tracked\?\.dataset\)\)/);
  });

  it('the listing no longer sends English-only WhatsApp texts', () => {
    const homes = read('client/src/pages/Homes.tsx');
    expect(homes).not.toMatch(/wa\.me\/351927161771\?text=/);
    expect(homes).not.toMatch(/Hi, I'm looking for a property/);
  });
});

// Revisão 2 do PR #175: fixed bottom-right from the first paint, the float
// sat on the first card's «Next image» arrow on a phone (390×844: arrow at
// y 694–730 under the float at 708–756, 23 of 24 loads), so a tap meant for
// the next photo opened WhatsApp; on a 375×553 screen it sat on the rail's
// «All» tab. The homepage holds its own float until the hero is scrolled past.
describe('the listing float keeps off the first card', () => {
  (globalThis as any).React = React;

  it('stays hidden while the first result is on screen and shows once it has scrolled away', () => {
    // at load: the first card (bottom ≈ 1000 px) is under the float's place
    expect(listingFloatShown({ firstResultBottom: 1000, scrollY: 0, viewportHeight: 844 })).toBe(false);
    // a tablet's first row, half scrolled
    expect(listingFloatShown({ firstResultBottom: 380, scrollY: 600, viewportHeight: 1024, scrolling: true, wasShown: true })).toBe(false);
    expect(listingFloatShown({ firstResultBottom: 4, scrollY: 996, viewportHeight: 844 })).toBe(false);
    expect(listingFloatShown({ firstResultBottom: 0, scrollY: 1000, viewportHeight: 844 })).toBe(true);
    expect(listingFloatShown({ firstResultBottom: -1200, scrollY: 2200, viewportHeight: 664 })).toBe(true);
  });

  it('with no result on the page (an empty search) it waits for 60 % of a screen, as the homepage does', () => {
    expect(listingFloatShown({ firstResultBottom: null, scrollY: 0, viewportHeight: 553 })).toBe(false);
    expect(listingFloatShown({ firstResultBottom: null, scrollY: 300, viewportHeight: 553 })).toBe(false);
    expect(listingFloatShown({ firstResultBottom: null, scrollY: 340, viewportHeight: 553 })).toBe(true);
  });

  it('never appears on a photo arrow, and steps aside when the page rests with one under it', () => {
    const past = { firstResultBottom: -40, scrollY: 1040, viewportHeight: 664 };
    // 390×664: when the first card leaves, card 3's «Next image» is under the float's place
    expect(listingFloatShown({ ...past, arrowUnder: true, scrolling: true, wasShown: false })).toBe(false);
    expect(listingFloatShown({ ...past, arrowUnder: false, scrolling: true, wasShown: false })).toBe(true);
    // shown, cards sliding under it while the page scrolls: no blinking
    expect(listingFloatShown({ ...past, arrowUnder: true, scrolling: true, wasShown: true })).toBe(true);
    // the page comes to rest with an arrow under it: a tap there turns the photo, never opens WhatsApp
    expect(listingFloatShown({ ...past, arrowUnder: true, scrolling: false, wasShown: true })).toBe(false);
    expect(listingFloatShown({ ...past, arrowUnder: false, scrolling: false, wasShown: false })).toBe(true);
  });

  it('is laid out but invisible on the server and until then: no tap target, not in the tab order', () => {
    const html = renderToStaticMarkup(React.createElement(ListingWhatsApp, { href: 'https://wa.me/351927161771' }));
    expect(html).toMatch(/data-shown="false"/);
    expect(html).toMatch(/class="[^"]*\binvisible opacity-0 pointer-events-none\b/);
    const shortcut = read('client/src/components/homes/ListingWhatsApp.tsx');
    expect(shortcut).toMatch(/shown \? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'/);
    expect(shortcut).toMatch(/window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
    expect(LISTING_PHOTO_ARROWS).toBe('[data-listing-results] article button');
    // a card's only buttons are its photo arrows
    const card = read('client/src/components/property/PropertyCard.tsx');
    expect(card.match(/<button\b/g)).toHaveLength(2);
    expect(card).toMatch(/aria-label=\{t\('property\.prevImage', 'Previous image'\)\}/);
    expect(card).toMatch(/aria-label=\{t\('property\.nextImage', 'Next image'\)\}/);
  });

  it('/homes and the collections mark the block that holds their cards', () => {
    expect(LISTING_FIRST_RESULT).toBe('[data-listing-results] article');
    expect(read('client/src/components/property/PropertyCard.tsx')).toMatch(/<article className="group cursor-pointer block">/);
    expect(read('client/src/pages/Homes.tsx')).toMatch(/<div className="min-w-0" data-listing-results="">\s*<ListingReassurance/);
    expect(read('client/src/pages/Collection.tsx')).toMatch(/<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8" data-listing-results="">\s*\{homes\.map/);
  });
});

// Revisão 2 do PR #175: the click spread only the data-track-* keys the link
// had. GTM's data model keeps a key until a push overwrites it, so a Data
// Layer Variable mapped on whatsapp_click read, on a later click in the same
// visit, the listing, region and dates of an earlier one — or of the last
// `search` event, which writes the same search_* keys.
describe('every contact click sets every context field', () => {
  function storage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v), removeItem: (k: string) => void values.delete(k) };
  }

  /** A page with the delegated listener installed, and GTM's model of what it pushed. */
  async function page() {
    const listeners: Record<string, (e: unknown) => void> = {};
    const win = {
      localStorage: storage({ 'pa-dl-debug': '1' }), // local debug: consent not needed
      sessionStorage: storage(),
      location: { hostname: 'localhost', pathname: '/en/' },
      dataLayer: [] as Record<string, unknown>[],
      addEventListener: () => {}, dispatchEvent: () => true, setTimeout,
    };
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { addEventListener: (type: string, cb: (e: unknown) => void) => { listeners[type] = cb; }, cookie: '' });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.resetModules();
    const dl = await import('../client/src/lib/datalayer');
    dl.installContactClickTracking();
    const click = (href: string, dataset?: Record<string, string>) => {
      const anchor = { getAttribute: (n: string) => (n === 'href' ? href : null), closest: (s: string) => (s === '[data-track-source]' && dataset ? { dataset } : null) };
      listeners.click({ target: { closest: (s: string) => (s === 'a[href]' ? anchor : null) } });
    };
    // The consent module queues gtag() commands (Arguments) on load; GTM runs
    // those as commands. Data pushes are plain objects.
    const data = () => win.dataLayer.filter((push) => Object.prototype.toString.call(push) !== '[object Arguments]');
    // GTM: a push overwrites the keys it names (undefined too); every other key stays.
    const model = () => data().reduce<Record<string, unknown>>((m, push) => Object.assign(m, push), {});
    return { dl, click, model, pushes: data };
  }
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const listingFloat = {
    trackSource: 'listing_float', trackItemListId: 'search_results', trackSearchLocation: 'algarve',
    trackSearchCheckin: '2027-07-10', trackSearchCheckout: '2027-07-17',
  };

  it('a later click without context reads no listing, region or dates of an earlier one', async () => {
    const { click, model } = await page();
    click('https://wa.me/351927161771?text=x', listingFloat);
    expect(model()).toMatchObject({ event: 'whatsapp_click', source: 'listing_float', item_list_id: 'search_results', search_location: 'algarve', search_checkin: '2027-07-10', search_checkout: '2027-07-17' });
    click('https://wa.me/351927161771', { trackSource: 'floating_button' });
    const after = model();
    expect(after.source).toBe('floating_button');
    for (const key of CONTACT_CONTEXT_FIELDS) expect(after[key], key).toBeUndefined();
  });

  it('nor the place and dates of the last search event; phone clicks too', async () => {
    const { dl, click, model } = await page();
    dl.pushDL({ event: 'search', search_location: 'algarve', search_checkin: '2027-07-10', search_checkout: null });
    click('https://wa.me/351927161771', { trackSource: 'floating_button' });
    expect(model().search_location).toBeUndefined();
    click('https://wa.me/351927161771', { ...listingFloat, trackSearchLocation: '' });
    expect(model()).toMatchObject({ item_list_id: 'search_results', search_checkin: '2027-07-10' });
    expect(model().search_location).toBeUndefined();
    click('tel:+351927161771');
    expect(model()).toMatchObject({ event: 'phone_click', source: '/en/' });
    for (const key of CONTACT_CONTEXT_FIELDS) expect(model()[key], key).toBeUndefined();
  });

  it('each click is one push with the event, its source and the four fields, no other key', async () => {
    const { click, pushes } = await page();
    click('https://wa.me/351927161771', { ...listingFloat, trackEvent: 'purchase', trackCollection: 'x' });
    expect(pushes()).toHaveLength(1);
    expect(Object.keys(pushes()[0]).sort()).toEqual(['event', 'source', ...CONTACT_CONTEXT_FIELDS].sort());
    expect(pushes()[0].event).toBe('whatsapp_click');
    expect(contactClickEvent('phone_click', '/en/homes')).toEqual({ event: 'phone_click', source: '/en/homes', item_list_id: undefined, search_location: undefined, search_checkin: undefined, search_checkout: undefined });
    expect(Object.keys(contactClickEvent('phone_click', '/en/homes'))).toHaveLength(6);
  });
});
