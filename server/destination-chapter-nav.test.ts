import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

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
    const row = nav.match(/<div className="([^"]*)"/)![1];
    expect(row).toMatch(/\boverflow-x-auto\b/);
    expect(row).toMatch(/\bwhitespace-nowrap\b/);
    expect(row).toMatch(/\bno-scrollbar\b/);
  });
});
