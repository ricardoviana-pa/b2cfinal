/* ==========================================================================
   NEWSLETTER, BROWSER SIDE: the small helpers the pop-up gate (always
   loaded), the pop-up chunk and a few pages share. No React, no pop-up code:
   importing this never pulls the pop-up chunk.

   Marks. "Known" means we already have this person's email: a visit from
   one of our emails, a booking thank-you page, the newsletter box of the
   checkout. The pop-up then stays away for NL_KNOWN_DAYS. Nothing is written
   in the browser before the cookie banner has an answer (regra: nada antes
   do banner): until then the mark lives in memory, which survives the
   navigation inside the app, and it is written when the person answers.
   Fixed keys and a timestamp, never personal data.

   DOM. The fixed bar at the bottom of a house page, and whether another
   overlay is open (rules in shared/newsletter.ts, tested on the server).
   ========================================================================== */

import { COOKIE_CHOICE_EVENT, getCookieChoice } from '@/lib/measurementConsent';
import { NL_KNOWN_AT_KEY, NL_OVERLAY_SELECTOR, hasEmailOrRecoveryUtm, otherOverlayOpen } from '@shared/newsletter';

let knownAt: number | null = null;
let fromEmailThisVisit = false;
let waitingForChoice = false;

function persist(): void {
  if (knownAt === null || !getCookieChoice()) return;
  try { window.localStorage.setItem(NL_KNOWN_AT_KEY, String(knownAt)); } catch { /* storage unavailable */ }
}

/** We already have this person's email: no pop-up for NL_KNOWN_DAYS (written after the cookie choice). */
export function markNewsletterKnown(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  knownAt = now;
  if (getCookieChoice()) { persist(); return; }
  if (waitingForChoice) return;
  waitingForChoice = true;
  window.addEventListener(COOKIE_CHOICE_EVENT, persist);
}

/**
 * First load only: a visit that landed from one of our emails (or the
 * checkout recovery) never gets the pop-up, and the person is known.
 * The landing URL decides: SPA navigation loses the query.
 */
export function noteLandingFromEmail(search: string): void {
  if (!hasEmailOrRecoveryUtm(search)) return;
  fromEmailThisVisit = true;
  markNewsletterKnown();
}

/** "1" when this visit came from one of our emails (memory only). */
export function landedFromEmail(): string | null {
  return fromEmailThisVisit ? '1' : null;
}

/** The known mark: the one in memory (this visit) or the stored one. */
export function readKnownAt(): string | null {
  if (knownAt !== null) return String(knownAt);
  try { return window.localStorage.getItem(NL_KNOWN_AT_KEY); } catch { return null; }
}

/** Height of a fixed bar at the bottom (the house page booking bar) the phone sheet sits above. */
export function bottomBarHeight(): number {
  const bar = document.querySelector('[data-nl-bottom-bar]') as HTMLElement | null;
  if (!bar || window.getComputedStyle(bar).display === 'none') return 0;
  return Math.round(bar.getBoundingClientRect().height);
}

/** Another dialog, drawer, menu, the cookie banner or a lead form is open (shared/newsletter.ts). */
export function overlayOpen(): boolean {
  return otherOverlayOpen(document, (el) => window.getComputedStyle(el as unknown as Element));
}

/** A mutation that may have opened or closed an overlay (the sheet's own changes never count). */
export function overlayMutation(record: MutationRecord): boolean {
  if (record.type === 'childList') {
    return Array.from(record.addedNodes).some((node) =>
      node instanceof Element && !node.closest('[data-nl-popup]') && (node.matches(NL_OVERLAY_SELECTOR) || !!node.querySelector(NL_OVERLAY_SELECTOR)));
  }
  const target = record.target;
  if (target === document.body) return record.attributeName === 'style';
  return target instanceof Element && !target.closest('[data-nl-popup]') && target.matches(NL_OVERLAY_SELECTOR);
}
