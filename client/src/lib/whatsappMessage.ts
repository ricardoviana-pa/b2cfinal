/**
 * Concierge WhatsApp links from the listing pages, with a message prefilled in
 * the page language and the search the guest is looking at (region, dates,
 * party). The concierge sees the context straight away and the guest skips
 * typing it (auditoria 29 out, ux-home-plp-06).
 *
 * Labels, not sentences, for the context lines ("Destination: Algarve"): a
 * place name dropped into a fixed preposition is what made "Casas em Algarve"
 * (i18n-copy-08), and a label reads right in every language.
 */
import type { TFunction } from 'i18next';
import { formatBookingDate } from './format';

export const CONCIERGE_WHATSAPP_NUMBER = '351927161771';

export function conciergeWhatsAppHref(message?: string): string {
  return `https://wa.me/${CONCIERGE_WHATSAPP_NUMBER}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export interface ListingMessageContext {
  /** Region or municipality, already in the page language. */
  place?: string;
  /** Collection title, in the page language. */
  collection?: string;
  checkin?: string;
  checkout?: string;
  /** Only a party size the guest chose. */
  guests?: number;
  /** Why the guest is writing: browsing (default), nothing matched, or no dates free. */
  reason?: 'browsing' | 'noMatch' | 'noAvailability';
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2027-07-10" → "10 Jul 2027" / "10 jul 2027": the site's booking date format. */
export function formatMessageDate(iso: string, lang: string): string {
  return formatBookingDate(iso, lang, true);
}

export function listingWhatsAppMessage(t: TFunction, lang: string, ctx: ListingMessageContext = {}): string {
  const intro = ctx.reason === 'noAvailability' ? 'listingWhatsApp.introNoAvailability'
    : ctx.reason === 'noMatch' ? 'listingWhatsApp.introNoMatch'
    : 'listingWhatsApp.intro';
  const lines = [t(intro)];
  if (ctx.place) lines.push(t('listingWhatsApp.destination', { place: ctx.place }));
  if (ctx.collection) lines.push(t('listingWhatsApp.collection', { name: ctx.collection }));
  if (ctx.checkin && ctx.checkout && ISO_DAY.test(ctx.checkin) && ISO_DAY.test(ctx.checkout) && ctx.checkout > ctx.checkin) {
    lines.push(t('listingWhatsApp.dates', { from: formatMessageDate(ctx.checkin, lang), to: formatMessageDate(ctx.checkout, lang) }));
  }
  if (ctx.guests && ctx.guests > 0) lines.push(t('listingWhatsApp.guests', { count: ctx.guests }));
  return lines.join('\n');
}
