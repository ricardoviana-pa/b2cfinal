import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  BOTTOM_BAR_H_VAR,
  COOKIE_BANNER_LIFT,
  FOOTER_BOTTOM_INSET,
  RISE_ABOVE_COOKIE_BANNER,
  publishBottomBarHeight,
} from '@/lib/fixedBottom';

// Auditoria de 29 out 2026, verificação em produção:
// - W2: no telemóvel, na primeira visita, o banner de cookies (z-60, 156 px)
//   tapava por inteiro a barra de reserva da casa (z-40, bottom 0).
// - P2: no computador, o botão do WhatsApp (z-90) tapava o «Aceitar tudo» do
//   banner e o «Gerir cookies» do rodapé.
// - P3: no telemóvel, a barra fixa da casa e a da experiência tapavam para
//   sempre a última linha do rodapé (Privacidade, Termos, Cookies, Gerir cookies).

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

type Env = { bannerH?: number; safe?: number; barH?: number; clearance?: number };

/**
 * The CSS lengths shipped in lib/fixedBottom.ts and index.css (var, env, max,
 * calc, translateY; px and rem), evaluated to px for a given banner height,
 * safe area, bar height and floats clearance, as the browser computes them.
 */
function cssPx(expr: string, { bannerH = 0, safe = 0, barH = 0, clearance = 0 }: Env = {}): number {
  const js = expr
    .replace(/var\(--cookie-banner-h,\s*0px\)/g, `${bannerH}px`)
    .replace(/var\(--bottom-bar-h,\s*0px\)/g, `${barH}px`)
    .replace(/var\(--floats-clearance,\s*0px\)/g, `${clearance}px`)
    .replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g, `${safe}px`)
    .replace(/(\d*\.?\d+)rem/g, (_, n) => `${Number(n) * 16}px`)
    .replace(/(\d*\.?\d+)px/g, '$1')
    .replace(/(translateY|calc)\(/g, '(')
    .replace(/\b(max|min)\(/g, 'Math.$1(');
  if (!/^[\d.\s+\-*/(),]*$/.test(js.replace(/Math\.(max|min)/g, ''))) throw new Error(`unexpected CSS: ${expr} → ${js}`);
  return Function(`"use strict"; return (${js});`)() as number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A rule's declarations from index.css: its first plain occurrence, or the one opening `media`. */
function cssRule(css: string, selector: string, media?: string): string {
  const re = media
    ? new RegExp(`${escapeRe(media)} \\{\\s*${escapeRe(selector)} \\{([^}]*)\\}`)
    : new RegExp(`(?:^|[;}/]\\s*)${escapeRe(selector)} \\{([^}]*)\\}`);
  const m = css.match(re);
  expect(m, `${media ?? ''} ${selector}`).not.toBeNull();
  return m![1];
}

const declaration = (rule: string, prop: string) => {
  const m = rule.match(new RegExp(`(?:^|;|\\s)${escapeRe(prop)}:\\s*([^;]+);`));
  expect(m, prop).not.toBeNull();
  return m![1].trim();
};

/** The multi-line JSX opening tag (`<div` … a line with only `>`) that contains `marker`. */
function openingTag(source: string, marker: string): string {
  const at = source.indexOf(marker);
  expect(at, marker).toBeGreaterThanOrEqual(0);
  const start = source.lastIndexOf('<div', at);
  const end = at + source.slice(at).search(/\n\s*>\s*\n/);
  expect(end - start, marker).toBeLessThan(1200);
  return source.slice(start, end);
}

/** Tailwind spacing class value in px (`md:right-7` → 28). */
const tw = (source: string, cls: string) => {
  const m = source.match(new RegExp(`(?:^|[\\s"'\`])${escapeRe(cls)}-(\\d+(?:\\.5)?)(?=[\\s"'\`])`));
  expect(m, cls).not.toBeNull();
  return Number(m![1]) * 4;
};

const css = read('client/src/index.css');
const app = read('client/src/App.tsx');
const backToTop = app.slice(app.indexOf('function BackToTop'), app.indexOf('function OfflineBanner'));
const footer = read('client/src/components/layout/Footer.tsx');
const whatsappFloat = read('client/src/components/layout/WhatsAppFloat.tsx');

// Banner heights seen on 29 Oct (77 px desktop, 156.4 px at 390 px) and taller
// ones (long languages, 360 px, the reload notice); with and without a home
// indicator. The banner's height includes its own safe-area padding.
const BANNERS = [77, 112, 156.4, 196, 240];
const SAFE_AREAS = [0, 20, 34];
/** Bars' content above their own safe-area padding: home 73/87 (price on 2 lines), experience 81. */
const BAR_CONTENT = [73, 81, 87, 120];

describe('W2: a booking bar sits on the open cookie banner, never under it', () => {
  it('rises by the banner minus the safe area it already clears; after the choice, not at all', () => {
    for (const content of BANNERS) {
      for (const safe of SAFE_AREAS) {
        const bannerH = content + safe;
        const lift = cssPx(COOKIE_BANNER_LIFT, { bannerH, safe });
        // The bar's own safe-area padding goes under the banner and its content ends where the
        // banner starts: its bottom 1px under the banner's top hairline (no sliver of page between).
        expect(lift + safe, `${bannerH}/${safe}`).toBeCloseTo(bannerH - 1, 6);
        expect(cssPx(RISE_ABOVE_COOKIE_BANNER, { bannerH, safe })).toBeCloseTo(-lift, 6);
      }
    }
    for (const safe of SAFE_AREAS) {
      expect(cssPx(COOKIE_BANNER_LIFT, { bannerH: 0, safe }), `closed/${safe}`).toBe(0);
      expect(cssPx(RISE_ABOVE_COOKIE_BANNER, { bannerH: 0, safe })).toBeCloseTo(0, 6);
    }
  });

  it('the home bar (partner homes too) and the experience/activity bar rise with it and publish their height', () => {
    const home = openingTag(read('client/src/pages/PropertyDetail.tsx'), 'lg:hidden fixed bottom-0 left-0 right-0 bg-white/95');
    expect(home).toContain('ref={publishBottomBarHeight}');
    expect(home).toMatch(/transform: RISE_ABOVE_COOKIE_BANNER \}\}/);
    const exp = openingTag(read('client/src/components/experience/ExperienceMobileBookingBar.tsx'), 'lg:hidden fixed bottom-0 left-0 right-0 z-40');
    expect(exp).toContain('ref={publishBottomBarHeight}');
    // Hidden (translate-y-full) it stays off the screen: no lift until it is shown.
    expect(exp).toMatch(/transform: visible \? RISE_ABOVE_COOKIE_BANNER : undefined/);
  });

  it('the sheet a bar opens, and the phone menu, are never under the banner while open', () => {
    const rule = css.match(/body\[data-scroll-locked\] \[data-cookie-banner\],\s*body:has\(#mobile-menu-panel:not\(\[inert\]\)\) \[data-cookie-banner\] \{\s*z-index:\s*(\d+);\s*\}/);
    expect(rule).not.toBeNull();
    const underModal = Number(rule![1]);
    const banner = read('client/src/components/layout/CookieBanner.tsx');
    expect(banner).toMatch(/data-cookie-banner=""\s+className="fixed bottom-0 left-0 right-0 z-\[\d+\]"/);
    const bannerZ = Number(banner.match(/className="fixed bottom-0 left-0 right-0 z-\[(\d+)\]"/)![1]);
    // Dialogs, drawers (the booking sheet), sheets: their overlay and content are z-50.
    for (const ui of ['drawer', 'dialog', 'sheet', 'alert-dialog']) {
      const overlayZ = Number(read(`client/src/components/ui/${ui}.tsx`).match(/fixed inset-0 z-(\d+) bg-black/)![1]);
      expect(underModal, ui).toBeLessThan(overlayZ);
      expect(bannerZ, ui).toBeGreaterThan(overlayZ);
    }
    // The phone menu: backdrop z-[54], panel z-[55], `inert` only while closed.
    const header = read('client/src/components/layout/Header.tsx');
    expect(header).toMatch(/id="mobile-menu-panel"[\s\S]{0,80}inert=\{!menuOpen\}/);
    for (const z of [54, 55]) {
      expect(header).toContain(`z-[${z}]`);
      expect(underModal).toBeLessThan(z);
      expect(bannerZ).toBeGreaterThan(z);
    }
    // Still above the page's own bars and floats (z-40, and z-45 for the language card of #175).
    expect(underModal).toBeGreaterThan(45);
    // The attribute is the one Radix's scroll lock (react-remove-scroll-bar) puts on <body>.
    expect(read('node_modules/react-remove-scroll-bar/dist/es2015/component.js')).toMatch(/lockAttribute = 'data-scroll-locked'/);
  });
});

describe('P2: the floats rise above the banner and keep out of the footer’s last links', () => {
  const mobile = cssRule(css, '.whatsapp-float');
  const desktop = cssRule(css, '.whatsapp-float', '@media (min-width: 1024px)');

  it('the WhatsApp button and “back to top” rise with the same transform as the bars', () => {
    expect(declaration(mobile, 'transform')).toBe(RISE_ABOVE_COOKIE_BANNER);
    expect(backToTop).toMatch(/transform: RISE_ABOVE_COOKIE_BANNER,/);
  });

  it('lifted, the WhatsApp button clears the open banner (and its “Accept all”) on a computer and on a phone', () => {
    for (const content of BANNERS) {
      for (const [rule, safes] of [[desktop, [0, 20]], [mobile, SAFE_AREAS]] as const) {
        for (const safe of safes) {
          const bannerH = content + safe;
          const floatBottom = cssPx(declaration(rule, 'bottom'), { safe }) + cssPx(COOKIE_BANNER_LIFT, { bannerH, safe });
          expect(floatBottom, `${declaration(rule, 'bottom')} over a ${bannerH}px banner`).toBeGreaterThanOrEqual(bannerH + 4);
        }
      }
    }
    // Without the lift the desktop button (28 px from the bottom) sat on a 77 px banner.
    expect(cssPx(declaration(desktop, 'bottom'))).toBeLessThan(77);
  });

  it('on a computer the last row’s links end to the left of the WhatsApp button and “back to top”', () => {
    const row = footer.slice(footer.indexOf('Row 2: copyright + legal'), footer.indexOf('{t(\'footer.copyrightLine\''));
    const clearance = tw(row, 'lg:pr');
    // Narrowest gutter from 1024 px: the container's 2rem side padding.
    const gutter = cssPx(declaration(cssRule(css, '.container', '@media (min-width: 768px)'), 'padding-right'));
    const whatsapp = tw(whatsappFloat, 'md:right') + tw(whatsappFloat, 'sm:w'); // 28 + 56
    const top = tw(backToTop, 'md:right') + tw(backToTop, 'sm:w'); // 28 + 40
    expect(gutter + clearance, 'links end ≥ 8 px left of the buttons').toBeGreaterThanOrEqual(Math.max(whatsapp, top) + 8);
  });
});

describe('P3: the footer keeps the fixed bar, the floats and the open banner clear of its last row', () => {
  afterEach(() => vi.unstubAllGlobals());

  const clearanceRule = css.match(/:root \{\s*--floats-clearance:\s*([^;]+);\s*\}\s*@media \(min-width: 1024px\) \{\s*:root \{\s*--floats-clearance:\s*([^;]+);/);
  const footerPadding = tw(footer.slice(footer.indexOf('{/* Bottom bar */}')), 'py'); // container py-7 → 28

  it('its bottom padding covers whatever is fixed at the bottom of the screen', () => {
    expect(clearanceRule).not.toBeNull();
    const [, phoneClearance, desktopClearance] = clearanceRule!;
    expect(cssPx(desktopClearance)).toBe(0);
    for (const content of BAR_CONTENT) {
      for (const safe of SAFE_AREAS) {
        const barH = content + safe; // what the bar publishes: its offsetHeight, safe-area padding included
        const clearance = cssPx(phoneClearance, { safe });
        expect(cssPx(FOOTER_BOTTOM_INSET, { barH, safe, clearance }), `bar ${barH}`).toBeGreaterThanOrEqual(barH);
        for (const banner of BANNERS) {
          const bannerH = banner + safe;
          // Open banner: the bar's content sits on it (W2).
          expect(cssPx(FOOTER_BOTTOM_INSET, { barH, bannerH, safe, clearance }), `bar ${barH} + banner ${bannerH}`).toBeGreaterThanOrEqual(bannerH + content);
        }
      }
    }
    // A computer, no bar: only the open banner.
    expect(cssPx(FOOTER_BOTTOM_INSET, { bannerH: 77 })).toBeCloseTo(77, 6);
    expect(cssPx(FOOTER_BOTTOM_INSET)).toBe(0);
    expect(footer).toMatch(/<footer className="bg-\[#1A1A18\] text-white" role="contentinfo" style=\{\{ paddingBottom: FOOTER_BOTTOM_INSET \}\}>/);
  });

  it('on a phone or a tablet, scrolled to the end, the last row sits above “back to top” and the WhatsApp button', () => {
    const [, phoneClearance] = clearanceRule!;
    const bottom = backToTop.match(/bottom: '([^']+)'/)![1];
    const size = Math.max(tw(backToTop, 'h'), tw(backToTop, 'sm:h'));
    const waTop = cssPx(declaration(cssRule(css, '.whatsapp-float'), 'bottom'), {}) + tw(whatsappFloat, 'sm:h');
    for (const safe of SAFE_AREAS) {
      for (const bannerH of [0, ...BANNERS.map((b) => b + safe)]) {
        const lift = cssPx(COOKIE_BANNER_LIFT, { bannerH, safe });
        const floatsTop = Math.max(cssPx(bottom, { safe }) + size, waTop + safe) + lift;
        for (const barH of [0, ...BAR_CONTENT.map((c) => c + safe)]) {
          const lastRowBottom = cssPx(FOOTER_BOTTOM_INSET, { barH, bannerH, safe, clearance: cssPx(phoneClearance, { safe }) }) + footerPadding;
          expect(lastRowBottom, `safe ${safe}, banner ${bannerH}, bar ${barH}`).toBeGreaterThanOrEqual(floatsTop + 4);
        }
      }
    }
  });

  it('a bar publishes its real height, follows it as it changes and takes it back when it leaves the page', () => {
    const style = new Map<string, string>();
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty: (k: string, v: string) => style.set(k, v), removeProperty: (k: string) => style.delete(k) } },
    });
    const observers: Array<{ cb: () => void; observed: unknown[]; disconnected: boolean }> = [];
    vi.stubGlobal('ResizeObserver', class {
      state: { cb: () => void; observed: unknown[]; disconnected: boolean };
      constructor(cb: () => void) { this.state = { cb, observed: [], disconnected: false }; observers.push(this.state); }
      observe(el: unknown) { this.state.observed.push(el); }
      disconnect() { this.state.disconnected = true; }
    });
    const bar = { offsetHeight: 73 } as unknown as HTMLElement;
    const cleanup = publishBottomBarHeight(bar);
    expect(style.get(BOTTOM_BAR_H_VAR)).toBe('73px');
    expect(observers[0].observed).toEqual([bar]);
    (bar as { offsetHeight: number }).offsetHeight = 87; // the price wraps to two lines
    observers[0].cb();
    expect(style.get(BOTTOM_BAR_H_VAR)).toBe('87px');
    (bar as { offsetHeight: number }).offsetHeight = 0; // lg: the bar is hidden on a computer
    observers[0].cb();
    expect(style.get(BOTTOM_BAR_H_VAR)).toBe('0px');
    cleanup?.();
    expect(style.has(BOTTOM_BAR_H_VAR)).toBe(false);
    expect(observers[0].disconnected).toBe(true);
    expect(publishBottomBarHeight(null)).toBeUndefined();
  });

  it('the home page has no spacer above the footer any more (it only left a white gap there)', () => {
    const page = read('client/src/pages/PropertyDetail.tsx');
    expect(page).not.toMatch(/lg:hidden h-\[100px\]/);
    expect(page).toMatch(/<Footer \/>/);
  });
});
