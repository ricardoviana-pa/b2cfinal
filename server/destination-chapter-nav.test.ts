import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { revealFocusedLink, scrollLeftToReveal } from '@/lib/revealFocusedLink';

/* Auditoria 29 out 2026, Regression:P5: on the destination pages in fr, es,
   it, de, nl, sv and fi (the fallback template) the chapter row under the
   hero read "Ferienhäuser Reisezeit Reiseführer entdeckeErlebnisse" at 390px.
   The links are flex items and the global 44px touch target
   (a[href] { min-width: 44px }) replaces the flex default min-width:auto, so
   they shrank below their text instead of the row scrolling. Measured in
   Chromium before the fix: de -6.8px between the last two labels at 390,
   fi -24.3 at 360, sv -13.3, nl -6.2, fr -2.1, it -1.6. */

const src = fs.readFileSync('client/src/components/destinations/DestinationPage.tsx', 'utf8');
// The single-row nav of the fallback template (the planning template above it
// wraps its chapters with flex-wrap and is not affected).
const start = src.lastIndexOf('aria-label={t("destinationGrowth.chapters")}');
const nav = src.slice(start, src.indexOf('</nav>', start));

describe('destination chapter row scrolls instead of squeezing the labels', () => {
  it('has the row and its four chapter links', () => {
    expect(nav.length).toBeGreaterThan(100);
    expect(nav.match(/<a\b/g)).toHaveLength(4);
  });

  it('no chapter link may shrink below its text', () => {
    for (const cls of nav.match(/className="[^"]*"/g)!.filter((c) => c.includes('min-h-11'))) {
      expect(cls).toMatch(/\bshrink-0\b/);
    }
  });

  it('the row is the scroller, without a visible scrollbar', () => {
    const row = nav.match(/<div\s+className="([^"]*)"/)![1];
    expect(row).toMatch(/\boverflow-x-auto\b/);
    expect(row).toMatch(/\bwhitespace-nowrap\b/);
    expect(row).toMatch(/\bno-scrollbar\b/);
  });
});

/* Revisão do PR #182, M1: once the row scrolls, Tab can stop on a chapter it
   has cut off. Chromium scrolls a focused element into view only when it is
   entirely outside its scroller. Measured on the build before the fix:
   "Erlebnisse" focused at 378.3-444.6 px of a 0-390 row (de, Minho, 390 px),
   "Upplevelser" at 389.6-465.4 (sv), and in English the .minho-chapters row
   (en/pt) stopped on "Food & wine" at 330.8-404.3 and, going back, on
   "Your base" at -5.9-52.3. Every scrolling chapter row now reveals the
   focused link itself. */

const ROWS: [string, string][] = [
  ['client/src/components/destinations/DestinationPage.tsx', 'aria-label={t("destinationGrowth.chapters")}'],
  ['client/src/components/destinations/DestinationVisualGuide.tsx', 'className="minho-chapters"'],
  ['client/src/components/destinations/MinhoVisualGuide.tsx', 'className="minho-chapters"'],
];

describe('keyboard focus scrolls the chapter link fully into its row (M1)', () => {
  it.each(ROWS)('%s: the element that holds the chapter links reveals the focused one', (file, marker) => {
    const s = fs.readFileSync(file, 'utf8');
    const at = s.lastIndexOf(marker);
    expect(at, marker).toBeGreaterThan(0);
    const navSrc = s.slice(at, s.indexOf('</nav>', at));
    expect(navSrc).toMatch(/<div\s+className="container[^"]*"\s+onFocus=\{revealFocusedLink\}\s*>/);
    expect(s).toMatch(/import \{ revealFocusedLink \} from "@\/lib\/revealFocusedLink";/);
  });

  const row = { left: 0, right: 390, scrollLeft: 0 };

  it('a link cut off on the right comes in to the row padding (de, Minho, 390 px)', () => {
    expect(scrollLeftToReveal(row, { left: 378.3, right: 444.6 }, 20)).toBeCloseTo(74.6, 6);
  });

  it('a link cut off on the left, after scrolling right, comes back to the padding', () => {
    expect(scrollLeftToReveal({ ...row, scrollLeft: 120 }, { left: -5.9, right: 52.3 }, 20)).toBeCloseTo(94.1, 6);
  });

  it('a link already inside the padding does not move the row', () => {
    expect(scrollLeftToReveal({ ...row, scrollLeft: 40 }, { left: 20, right: 370 }, 20)).toBe(40);
    expect(scrollLeftToReveal({ ...row, scrollLeft: 40 }, { left: 150, right: 230 }, 20)).toBe(40);
  });

  it('a link wider than the room left shows its start', () => {
    expect(scrollLeftToReveal(row, { left: 30, right: 430 }, 20)).toBe(10);
  });

  describe('the handler', () => {
    const realGCS = (globalThis as any).getComputedStyle;
    afterEach(() => { (globalThis as any).getComputedStyle = realGCS; });

    function focusIn(opts: { focusVisible: boolean; sameAsRow?: boolean; padding?: string }) {
      (globalThis as any).getComputedStyle = () => ({ paddingLeft: opts.padding ?? '20px', paddingRight: opts.padding ?? '20px' });
      const rowEl = { scrollLeft: 0, getBoundingClientRect: () => ({ left: 0, right: 390 }) };
      const link = { matches: (q: string) => q === ':focus-visible' && opts.focusVisible, getBoundingClientRect: () => ({ left: 378.3, right: 444.6 }) };
      revealFocusedLink({ currentTarget: rowEl, target: opts.sameAsRow ? rowEl : link } as any);
      return rowEl.scrollLeft;
    }

    it('keyboard focus (:focus-visible) scrolls only the row', () => {
      expect(focusIn({ focusVisible: true })).toBeCloseTo(74.6, 6);
    });

    it('focus from a click or a tap leaves the row still, so the click is not lost', () => {
      expect(focusIn({ focusVisible: false })).toBe(0);
    });

    it('the row itself taking focus is not a chapter', () => {
      expect(focusIn({ focusVisible: true, sameAsRow: true })).toBe(0);
    });

    it('a row without padding still keeps the focus ring off the edge', () => {
      expect(focusIn({ focusVisible: true, padding: '0px' })).toBeCloseTo(444.6 - 382, 6);
    });
  });
});
