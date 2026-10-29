/**
 * Keyboard focus never stops on a link that its sideways-scrolling row has
 * cut off.
 *
 * The destination chapter rows scroll sideways with the scrollbar hidden.
 * Chromium scrolls a focused element into view only when it is entirely
 * outside its scroller, so Tab could stop on a chapter the row showed only in
 * part ("Er" of "Erlebnisse" at 390 px) or not at all, with a 2 px sliver of
 * the focus ring as the only trace (revisão do PR #182, M1).
 *
 * Only the row moves, never the page, and only for keyboard focus: a click
 * or a tap focuses the link too, and moving the row under the pointer between
 * press and release would turn the click into a click on the row.
 */
import type { FocusEvent } from 'react';

/** Never closer to the row's edge than the focus ring (3 px outline + 2 px offset). */
const MIN_INSET = 8;

/**
 * The row's scrollLeft that shows the link whole, at least `insetLeft` /
 * `insetRight` px inside the row's edges; the current one when it already
 * does. A link wider than the room left shows its start.
 */
export function scrollLeftToReveal(
  row: { left: number; right: number; scrollLeft: number },
  link: { left: number; right: number },
  insetLeft: number,
  insetRight: number = insetLeft,
): number {
  const minLeft = row.left + insetLeft;
  const maxRight = row.right - insetRight;
  if (link.left < minLeft) return row.scrollLeft - (minLeft - link.left);
  if (link.right > maxRight) return row.scrollLeft + Math.min(link.right - maxRight, link.left - minLeft);
  return row.scrollLeft;
}

function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true; // A browser without :focus-visible: reveal anyway.
  }
}

/**
 * onFocus for the scrolling row (React's onFocus bubbles from the links):
 * the focused link ends up where the row's padding begins, the place of the
 * first link at rest.
 */
export function revealFocusedLink(e: FocusEvent<HTMLElement>) {
  const row = e.currentTarget;
  const link = e.target as HTMLElement;
  if (link === row || !keyboardFocus(link)) return;
  const style = getComputedStyle(row);
  const box = row.getBoundingClientRect();
  const next = scrollLeftToReveal(
    { left: box.left, right: box.right, scrollLeft: row.scrollLeft },
    link.getBoundingClientRect(),
    Math.max(MIN_INSET, parseFloat(style.paddingLeft) || 0),
    Math.max(MIN_INSET, parseFloat(style.paddingRight) || 0),
  );
  if (next !== row.scrollLeft) row.scrollLeft = next;
}
