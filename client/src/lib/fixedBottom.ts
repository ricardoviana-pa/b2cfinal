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
 *   the banner is open (COOKIE_BANNER_OPEN_ATTR), and "back to top" on a phone
 *   while the language card sits above a booking bar (LANGUAGE_CARD_ATTR).
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

/** Height of the page's own fixed bottom bar (0px or unset when there is none). */
export const BOTTOM_BAR_H_VAR = '--bottom-bar-h';
/**
 * Room for the floating buttons at the right edge on phones and tablets
 * ("back to top" reaches 176 px from the bottom, WhatsApp 144 px): set in
 * index.css, 0px from lg, where the last row keeps clear of them sideways.
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
