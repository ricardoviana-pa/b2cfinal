/**
 * Fixed UI along the bottom of the screen, and the cookie banner (auditoria de
 * 29 out 2026: W2, P2 e P3). One rule for all of it:
 *
 * - CookieBanner publishes its real height (safe area included) as
 *   --cookie-banner-h on <html> while it is open, and 0px once the guest has
 *   chosen.
 * - Everything else fixed to the bottom — the booking bar of a home (partner
 *   homes too), of an experience or an activity, the language card, "back to
 *   top", and the WhatsApp button on a phone — rises by that height, minus
 *   the safe area it already clears on its own. A bar then sits on the banner
 *   instead of under it, and what sits above the bar keeps its usual order.
 *   After the choice the lift is 0px and everything is back where it was.
 * - From 640 px the WhatsApp button rises only as far as it must to stay
 *   0.5rem above the banner (riseClearOfCookieBanner): on a tablet it already
 *   clears a 77 px banner and stays put, and on a computer it no longer moves
 *   onto the page's own buttons (revisão do PR #178, R1). On a phone it rises
 *   with the rest: the language card, full width there, sits on the banner
 *   right under it.
 * - It rises with a transform. Moving a fixed element with `bottom` counts as
 *   a layout shift (CLS) on every first visit; a transform does not. (A
 *   transform makes the element the containing block of anything fixed inside
 *   it: keep overlays as siblings of a lifted bar, as the Bókun one is.)
 * - A page's fixed bar publishes its own height as --bottom-bar-h
 *   (publishBottomBarHeight), and the footer keeps that much free under its
 *   last row (or the floating buttons' room on a phone, if higher), plus the
 *   banner while it is open, so the legal links and the Livro de Reclamações
 *   always scroll clear of all of them.
 * - While a dialog, drawer or sheet, or the phone menu, is open it covers the
 *   banner instead of the banner covering its buttons (index.css,
 *   [data-cookie-banner]).
 * - What cannot rise out of the way steps aside instead, through an attribute
 *   on <html>: the homepage's WhatsApp button at the hero on a computer while
 *   the banner is open (COOKIE_BANNER_OPEN_ATTR), "back to top" on a phone
 *   while the language card sits above a booking bar (LANGUAGE_CARD_ATTR), on
 *   a computer while a home's booking card reaches under its column
 *   (BOOKING_CARD_UNDER_FLOATS_ATTR) and everywhere while a dialog, drawer or
 *   sheet holds the page (body[data-scroll-locked], index.css), and the
 *   language card below lg while the homepage's hero is on screen
 *   (HOME_HERO_ATTR) and on a phone until the cookie choice is made
 *   (lib/languageSuggestion.ts, languageCardWaits). Verificação final de
 *   29 out 2026: P1, P2, P5, P6, PP-1, PP-2.
 */

/** The banner's height while it is open, 0px otherwise (CookieBanner.tsx). */
export const COOKIE_BANNER_H = 'var(--cookie-banner-h, 0px)';
/**
 * Set on <html> while the banner is open (CookieBanner.tsx). On a computer the
 * homepage's WhatsApp button would land on the hero's "Search homes" even
 * 0.5rem above the banner, so it waits (index.css, .home-float-at-hero).
 */
export const COOKIE_BANNER_OPEN_ATTR = 'data-cookie-banner-open';
/** The bottom safe area (home indicator); 0px where there is none. */
export const SAFE_AREA_BOTTOM = 'env(safe-area-inset-bottom, 0px)';
/**
 * How far fixed bottom UI rises while the banner is open. 1px short of the
 * banner, so a bar's bottom edge tucks under the banner's top hairline
 * (mostly transparent): no sliver of the page shows between the two.
 */
export const COOKIE_BANNER_LIFT = `max(0px, ${COOKIE_BANNER_H} - ${SAFE_AREA_BOTTOM} - 1px)`;
/** The transform that lifts it. `.whatsapp-float` in index.css repeats it verbatim for phones. */
export const RISE_ABOVE_COOKIE_BANNER = `translateY(calc(-1 * ${COOKIE_BANNER_LIFT}))`;

/** Air a float keeps above the open banner when it rises only as far as it must. */
export const FLOAT_GAP = '0.5rem';
/**
 * The transform for a float that rises only as far as it must to stay
 * FLOAT_GAP above the open banner, given its own `bottom`: none at all where
 * that already clears the banner.
 */
export const riseClearOfCookieBanner = (ownBottom: string) =>
  `translateY(calc(-1 * max(0px, ${COOKIE_BANNER_H} + ${FLOAT_GAP} - (${ownBottom}))))`;
/** The WhatsApp button's `bottom` below lg, and from lg (index.css, .whatsapp-float). */
export const WHATSAPP_BOTTOM = `5.5rem + ${SAFE_AREA_BOTTOM}`;
export const WHATSAPP_BOTTOM_LG = '1.75rem';
/** Its transform from 640 px (sm) and from 1024 px (lg); index.css repeats them verbatim. */
export const WHATSAPP_RISE_SM = riseClearOfCookieBanner(WHATSAPP_BOTTOM);
export const WHATSAPP_RISE_LG = riseClearOfCookieBanner(WHATSAPP_BOTTOM_LG);

/**
 * Set on <html> while the language card is shown (LanguageSuggestion.tsx):
 * "above-bar" over a home's or an experience's booking bar, "bottom"
 * elsewhere. Over a bar, on a phone, the full-width card sits where "back to
 * top" does, on its ×, so "back to top" steps aside until the card goes
 * (index.css, .back-to-top).
 */
export const LANGUAGE_CARD_ATTR = 'data-language-card';

/**
 * Set on <html> while the homepage's hero is on screen (Home.tsx, with the
 * pastHero state that already holds the WhatsApp button back below lg). The
 * language card waits there too below lg: on a phone, with the banner under
 * it, it landed on the hero's "Search homes" (verificação final, P5).
 */
export const HOME_HERO_ATTR = 'data-home-hero';

/**
 * Set on <html> while a home's booking card, on a computer, is on screen and
 * reaches under the floats' column at the right edge (PropertyDetail.tsx,
 * watchBookingCardUnderFloats). The card is as tall as the screen, so "back
 * to top" cannot rise out of its way: at 1024–1100 px and 1280–1350 px wide
 * it sat on the corner of CHECK AVAILABILITY, and on RESERVE while the card
 * left at the end of its column (verificação final, P2 and PP-1). It steps
 * aside instead (index.css, .back-to-top) and is back once the card has
 * scrolled off: at the related homes and the footer.
 */
export const BOOKING_CARD_UNDER_FLOATS_ATTR = 'data-booking-card-under-floats';
/** "Back to top" from md (App.tsx): 1.75rem from the right edge (md:right-7), 2.5rem wide (sm:w-10). */
export const BACK_TO_TOP_RIGHT_LG = 28;
export const BACK_TO_TOP_SIZE_LG = 40;
/** Air the card keeps from the button's column before the button steps aside. */
export const BOOKING_CARD_FLOATS_GAP = 8;
/** Bottom of the button's band on a computer: `.back-to-top` bottom = 5rem + 56px (index.css). */
export const BACK_TO_TOP_BOTTOM_LG = 136;
/** Does a card whose right edge is at `cardRight` reach under the floats' column of a `viewportWidth` screen? */
export function bookingCardUnderFloats(cardRight: number, viewportWidth: number, cardBottom?: number, viewportHeight?: number): boolean {
  const horizontal = cardRight > viewportWidth - (BACK_TO_TOP_RIGHT_LG + BACK_TO_TOP_SIZE_LG + BOOKING_CARD_FLOATS_GAP);
  // Also the button's band (revisão do PR #191, R2): on a tall screen the card
  // can end far above it, and the button then overlaps nothing.
  const vertical = cardBottom === undefined || viewportHeight === undefined
    || cardBottom > viewportHeight - (BACK_TO_TOP_BOTTOM_LG + BACK_TO_TOP_SIZE_LG) - BOOKING_CARD_FLOATS_GAP;
  return horizontal && vertical;
}
/**
 * Marks <html> with BOOKING_CARD_UNDER_FLOATS_ATTR while `card` is on screen
 * and reaches under the floats' column; follows the page scrolling (the card
 * entering and leaving), the card resizing and the window resizing. Returns
 * the cleanup, which also takes the mark back. Nothing on the server, below lg
 * (the card is display:none there and never on screen) or without
 * IntersectionObserver.
 */
export function watchBookingCardUnderFloats(card: HTMLElement | null): (() => void) | undefined {
  if (!card || typeof IntersectionObserver === 'undefined') return undefined;
  const root = document.documentElement;
  let onScreen = false;
  const sync = () => {
    const rect = card.getBoundingClientRect();
    if (onScreen && bookingCardUnderFloats(rect.right, window.innerWidth, rect.bottom, window.innerHeight)) root.setAttribute(BOOKING_CARD_UNDER_FLOATS_ATTR, '');
    else root.removeAttribute(BOOKING_CARD_UNDER_FLOATS_ATTR);
  };
  const intersection = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  intersection.observe(card);
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
  resize?.observe(card);
  window.addEventListener('resize', sync);
  // The card's bottom moves with the page when the sticky card leaves its column: one check per frame.
  let frame = 0;
  const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; sync(); }); };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    intersection.disconnect();
    resize?.disconnect();
    window.removeEventListener('resize', sync);
    window.removeEventListener('scroll', onScroll);
    if (frame) window.cancelAnimationFrame(frame);
    root.removeAttribute(BOOKING_CARD_UNDER_FLOATS_ATTR);
  };
}

/** Height of the page's own fixed bottom bar (0px or unset when there is none). */
export const BOTTOM_BAR_H_VAR = '--bottom-bar-h';
/**
 * Room for the floating buttons at the right edge on phones and tablets
 * ("back to top" reaches 176 px from the bottom on a phone and 184 px from
 * 640 px, WhatsApp 136 and 144 px): set in index.css, 0px from lg, where the
 * last row keeps clear of them sideways.
 */
export const FLOATS_CLEARANCE_VAR = '--floats-clearance';
/**
 * Free space the footer keeps under its last row: the page's bar or the
 * floating buttons, whichever reaches higher, plus the banner while it is open.
 */
export const FOOTER_BOTTOM_INSET = `calc(max(var(${BOTTOM_BAR_H_VAR}, 0px), var(${FLOATS_CLEARANCE_VAR}, 0px)) + ${COOKIE_BANNER_H})`;

/**
 * Ref callback for a page's fixed bottom bar: publishes the bar's height
 * (its safe-area padding included) as --bottom-bar-h while it is on the page,
 * kept current as it resizes — a price on two lines, or 0px at the widths
 * where the bar is hidden. React 19 runs the returned cleanup when the bar
 * leaves the page. A module-level function, so the ref never changes between
 * renders and the observer is set up once per bar.
 */
export function publishBottomBarHeight(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  const root = document.documentElement;
  const update = () => root.style.setProperty(BOTTOM_BAR_H_VAR, `${el.offsetHeight}px`);
  update();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  observer?.observe(el);
  return () => {
    observer?.disconnect();
    root.style.removeProperty(BOTTOM_BAR_H_VAR);
  };
}
