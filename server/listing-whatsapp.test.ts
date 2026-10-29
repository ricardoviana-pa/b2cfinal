import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createInstance, type TFunction } from 'i18next';
import { conciergeWhatsAppHref, listingWhatsAppMessage } from '@/lib/whatsappMessage';
import { trackContextFromDataset } from '@/lib/datalayer';
import { trackAttributes } from '@/components/homes/ListingWhatsApp';
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
    expect(shortcut).toMatch(/className="lg:hidden fixed/);
    expect(shortcut).not.toMatch(/onClick|pushDL|WhatsAppModal/);
    expect(read('client/src/pages/Homes.tsx')).toMatch(/<ListingWhatsApp href=\{listingWhatsAppHref\} context=\{trackContext\} \/>/);
    expect(read('client/src/pages/Collection.tsx')).toMatch(/<ListingWhatsApp\s+href=\{whatsappHref\}/);
    // The delegated listener carries the context into whatsapp_click.
    expect(read('client/src/lib/datalayer.ts')).toMatch(/pushDL\(\{ event: 'whatsapp_click', source, \.\.\.context \}\)/);
  });

  it('the listing no longer sends English-only WhatsApp texts', () => {
    const homes = read('client/src/pages/Homes.tsx');
    expect(homes).not.toMatch(/wa\.me\/351927161771\?text=/);
    expect(homes).not.toMatch(/Hi, I'm looking for a property/);
  });
});
