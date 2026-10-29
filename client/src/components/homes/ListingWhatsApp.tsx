/**
 * WhatsApp shortcut on the listing pages (/homes and the collections), phone
 * and tablet only — the desktop header already has WhatsApp in its contact
 * menu (auditoria 29 out, ux-home-plp-06).
 *
 * A plain link straight to wa.me with the message prefilled in the page
 * language and the search the guest is on: no "Connect on WhatsApp"
 * interstitial. Same look and position as the site's floating button
 * (.whatsapp-float clears the safe area and sits under "back to top"), but
 * z-40: under the filter sheet and the cookie banner, above the sticky rail.
 * It shows once the first result has scrolled out of view, and never rests
 * on a card's photo arrow (listingFloatShown).
 *
 * whatsapp_click is fired by the site-wide delegated listener
 * (installContactClickTracking) with source "listing_float" plus the
 * data-track-* context below — so nothing fires twice.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContactContextField } from '@/lib/datalayer';

type Kebab<S extends string> = S extends `${infer Head}_${infer Tail}` ? `${Head}-${Kebab<Tail>}` : S;
/** data-track-* context for a contact link: only the fields every contact
 *  click sends — and resets when a link has none (CONTACT_CONTEXT_FIELDS). */
export type TrackContext = Partial<Record<Kebab<ContactContextField>, string | undefined>>;

/** { "item-list-id": "x" } → { "data-track-item-list-id": "x" }, empty values dropped. */
export function trackAttributes(source: string, context: TrackContext = {}): Record<string, string> {
  const attrs: Record<string, string> = { 'data-track-source': source };
  for (const [key, value] of Object.entries(context)) {
    if (value) attrs[`data-track-${key}`] = value;
  }
  return attrs;
}

export function WhatsAppMark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** The listing's results: the pages put `data-listing-results` on the block that holds the cards. */
export const LISTING_FIRST_RESULT = '[data-listing-results] article';
/** A card's only buttons: the photo arrows, at its right and left edges — where the float sits. */
export const LISTING_PHOTO_ARROWS = '[data-listing-results] article button';
/** How long the page must be still to count as at rest. */
const REST_MS = 200;

/**
 * When the float may show (revisão 2 do PR #175). Fixed bottom-right from
 * the first paint, it sat on the first card's «Next image» arrow (390×844:
 * arrow at y 694–730 under the float at 708–756, in 23 of 24 loads), so a tap
 * meant for the next photo opened WhatsApp; on a 375×553 screen it sat on the
 * rail's «All» tab. Now:
 * - like the homepage's float, held until the hero is scrolled past, it
 *   waits until the first result has scrolled out of view (a tablet's first
 *   row goes with it); a page with no result waits for 60 % of a screen;
 * - after that, a photo arrow is never left under it: it does not appear on
 *   top of one (on a 390×664 iPhone screen it appeared on card 3's), and it
 *   steps aside when the page comes to rest with one under it. While the page
 *   scrolls it keeps its state, so it does not blink as the cards go by.
 */
export function listingFloatShown({ firstResultBottom, scrollY, viewportHeight, arrowUnder = false, scrolling = false, wasShown = false }: {
  /** Bottom edge of the first result card, from the top of the viewport; null when the page has none. */
  firstResultBottom: number | null;
  scrollY: number;
  viewportHeight: number;
  /** A card's photo arrow overlaps the float's place. */
  arrowUnder?: boolean;
  /** The page is scrolling (not yet still for REST_MS). */
  scrolling?: boolean;
  wasShown?: boolean;
}): boolean {
  const pastFirstResult = firstResultBottom === null ? scrollY > viewportHeight * 0.6 : firstResultBottom <= 0;
  if (!pastFirstResult) return false;
  if (!arrowUnder) return true;
  return scrolling && wasShown;
}

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function useListingFloatShown(float: RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let frame = 0;
    let rest = 0;
    let scrolling = false;
    const update = () => {
      frame = 0;
      const place = float.current?.getBoundingClientRect();
      if (!place) return;
      const first = document.querySelector(LISTING_FIRST_RESULT);
      const arrowUnder = Array.from(document.querySelectorAll(LISTING_PHOTO_ARROWS)).some((b) => overlaps(b.getBoundingClientRect(), place));
      setShown((wasShown) => listingFloatShown({
        firstResultBottom: first ? first.getBoundingClientRect().bottom : null,
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        arrowUnder,
        scrolling,
        wasShown,
      }));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const onScroll = () => {
      scrolling = true;
      window.clearTimeout(rest);
      rest = window.setTimeout(() => { scrolling = false; schedule(); }, REST_MS);
      schedule();
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(rest);
    };
  }, [float]);
  return shown;
}

export default function ListingWhatsApp({ href, context }: { href: string; context?: TrackContext }) {
  const { t } = useTranslation();
  const float = useRef<HTMLAnchorElement>(null);
  // Laid out but invisible (no tap target, not in the tab order) until it may
  // show — on the server too —, so its place can be measured.
  const shown = useListingFloatShown(float);
  return (
    <a
      ref={float}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...trackAttributes('listing_float', context)}
      aria-label={t('listingWhatsApp.aria')}
      data-testid="listing-whatsapp"
      data-shown={shown ? 'true' : 'false'}
      className={`lg:hidden fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#1A1A18] text-white shadow-lg border border-white/10 transition-[opacity,visibility,transform] duration-200 hover:scale-105 hover:bg-[#2a2a27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pa-gold sm:right-6 sm:h-14 sm:w-14 md:right-7 whatsapp-float ${
        shown ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
      }`}
    >
      <WhatsAppMark className="h-6 w-6 sm:h-7 sm:w-7" />
    </a>
  );
}
