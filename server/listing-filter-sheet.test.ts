import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { returnFocusTo } from '@/components/homes/HomesFilterRail';

// Revisão 2 do PR #175. Below 1280 px the rail opens its filters in the vaul
// bottom sheet (phones already did; the PR extended it to 768–1279 px).
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rail = read('client/src/components/homes/HomesFilterRail.tsx');

describe('the Filters sheet takes keyboard focus', () => {
  // vaul 1.1.2: Root({ autoFocus = false }) and, in Content, onOpenAutoFocus
  // calls preventDefault() unless autoFocus — so Radix's focus scope never got
  // a focused element to trap. Enter on «Filters» left focus on the button,
  // aria-hidden behind the modal sheet; Tab walked the hidden page and took
  // 150+ presses to reach «Recommended» (1024–1279 px, also 390).
  it('vaul still moves no focus into a drawer by itself: the rail has to ask', () => {
    const vaul = fs.readFileSync(new URL('../node_modules/vaul/dist/index.mjs', import.meta.url), 'utf8');
    expect(vaul).toMatch(/autoFocus = false \}\) \{/);
    expect(vaul).toMatch(/if \(!autoFocus\) \{\s*e\.preventDefault\(\);/);
  });

  it('opens with autoFocus, so focus lands on the first option and stays in the sheet', () => {
    expect(rail).toMatch(/<Drawer open=\{sheetOpen\} onOpenChange=\{setSheetOpen\} autoFocus>/);
  });

  it('on close (Esc, the overlay, «Show N homes») focus goes back to «Filters»', () => {
    // The button is not a DrawerTrigger, so Radix had no trigger to return to:
    // with autoFocus alone, focus fell to <body> after Esc.
    expect(rail).toMatch(/<DrawerContent className="[^"]*" onCloseAutoFocus=\{returnFocusTo\(filtersButton\)\}>/);
    expect(rail).toMatch(/<button\s+ref=\{filtersButton\}\s+type="button"\s+onClick=\{\(\) => setSheetOpen\(true\)\}\s+aria-haspopup="dialog"\s+aria-expanded=\{sheetOpen\}/);
  });

  it('inside it, the focused Bedrooms/Sleeps cell shows its ring (inset: the row clips overflow)', () => {
    const css = read('client/src/index.css');
    const strip = rail.slice(rail.indexOf('function Strip<'), rail.indexOf('function ViewSwitch('));
    // the site's ring is 3 px, 2 px outside the element; the row hides overflow for its rounded corners
    expect(css).toMatch(/:focus-visible \{\s*outline: 3px solid #C4A87C;\s*outline-offset: 2px;/);
    expect(strip).toMatch(/className="grid rounded-lg border border-pa-sand overflow-hidden/);
    expect(strip).toMatch(/className=\{`flex flex-col items-center justify-center h-12 font-body transition-colors focus-visible:outline-offset-\[-3px\] /);
  });

  it('returnFocusTo cancels Radix’s own return (no trigger) and focuses the button without scrolling', () => {
    const calls: unknown[] = [];
    const button = { focus: (options?: FocusOptions) => calls.push(options) } as unknown as HTMLElement;
    let prevented = false;
    returnFocusTo({ current: button })({ preventDefault: () => { prevented = true; } } as Event);
    expect(prevented).toBe(true);
    expect(calls).toEqual([{ preventScroll: true }]);
    // Unmounted button: nothing to focus, no throw.
    expect(() => returnFocusTo({ current: null })({ preventDefault() {} } as Event)).not.toThrow();
  });
});

describe('the dated-search detail line clears the List/Map pill', () => {
  // The pill is two 44 px buttons (the global touch-target min-height), its
  // p-0.5 and its 1 px border: 50 px, in an h-12 (48 px) row, with the detail
  // line pulled up 6 px under it. The pill's edge ran through «· 9
  // unavailable» and the line took the taps on the bottom of Map and Filters.
  const css = read('client/src/index.css');
  const viewSwitch = rail.slice(rail.indexOf('function ViewSwitch('), rail.indexOf('/* ───────────── panels'));
  const phoneRail = rail.slice(rail.indexOf('<div className="xl:hidden">'), rail.indexOf('<Drawer '));

  it('the phone/tablet row is at least as tall as the pill', () => {
    // buttons: global min-height 44px (a button that sets none of its own)
    expect(css).toMatch(/\n\s*button:not\(:disabled\),[\s\S]{0,300}?\{\s*@apply cursor-pointer;\s*min-height: 44px;/);
    expect(viewSwitch).not.toMatch(/min-h-|minHeight/);
    expect(viewSwitch).toMatch(/className="inline-flex shrink-0 items-center rounded-full border border-pa-sand bg-white p-0\.5"/);
    const pill = 44 + 2 * 2 + 2 * 1; // buttons + p-0.5 + border
    const row = phoneRail.match(/<div className=\{`flex items-center gap-3 h-\[(\d+)px\]/);
    expect(row, 'row height in px').not.toBeNull();
    expect(Number(row![1])).toBeGreaterThanOrEqual(pill);
  });

  it('the detail line starts under the row, never pulled up into it', () => {
    const call = phoneRail.match(/detail\('plp-status-detail', '([^']*)'\)/);
    expect(call).not.toBeNull();
    expect(call![1]).not.toMatch(/(^|\s)-m[ty]?-/);
    expect(call![1]).toMatch(/border-b border-pa-sand/);
  });

  it('the sticky map below 1280 px follows the rail’s new height (type switch 44 + row 52)', () => {
    const homes = read('client/src/pages/Homes.tsx');
    expect(homes).toMatch(/lg:top-\[calc\(5rem\+96px\+1\.25rem\)\] lg:h-\[calc\(100dvh-5rem-96px-2\.5rem\)\]/);
  });
});
