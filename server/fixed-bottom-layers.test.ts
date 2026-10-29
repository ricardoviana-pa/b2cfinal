import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type AtRule, type Rule } from 'postcss';
import ts from 'typescript';
import {
  BOTTOM_BAR_H_VAR,
  COOKIE_BANNER_LIFT,
  COOKIE_BANNER_OPEN_ATTR,
  FOOTER_BOTTOM_INSET,
  LANGUAGE_CARD_ATTR,
  RISE_ABOVE_COOKIE_BANNER,
  WHATSAPP_BOTTOM,
  WHATSAPP_BOTTOM_LG,
  WHATSAPP_RISE_LG,
  WHATSAPP_RISE_SM,
  publishBottomBarHeight,
} from '@/lib/fixedBottom';
import { hasBottomBookingBar } from '@/lib/languageSuggestion';

// Auditoria de 29 out 2026, verificação em produção:
// - W2: no telemóvel, na primeira visita, o banner de cookies (z-60, 156 px)
//   tapava por inteiro a barra de reserva da casa (z-40, bottom 0).
// - P2: no computador, o botão do WhatsApp (z-90) tapava o «Aceitar tudo» do
//   banner e o «Gerir cookies» do rodapé.
// - P3: no telemóvel, a barra fixa da casa e a da experiência tapavam para
//   sempre a última linha do rodapé (Privacidade, Termos, Cookies, Gerir cookies).
// Revisão do PR #178 (no fim do ficheiro): o WhatsApp subia mais do que
// precisava (R1), a regra dos modais caía inteira sem :has() (R2), o rodapé da
// página «experiência não encontrada» saltava ao abrir o banner, e, já com o
// #175, o cartão de língua mexia-se com `bottom` e o «voltar ao topo» tapava o
// seu ×.

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
/** The WhatsApp button's rule on a phone, from 640 px (SM) or from 1024 px (LG). */
const SM = '@media (min-width: 640px)';
const LG = '@media (min-width: 1024px)';
const whatsappRule = (media?: string) => cssRule(css, '.whatsapp-float', media);
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
    // Two rules (R2, below): the sheet's does not depend on :has().
    const rule = css.match(/\n\s*body\[data-scroll-locked\] \[data-cookie-banner\] \{\s*z-index:\s*(\d+);\s*\}/);
    expect(rule).not.toBeNull();
    const menuRule = css.match(/@supports selector\(:has\(\*\)\) \{\s*body:has\(#mobile-menu-panel:not\(\[inert\]\)\) \[data-cookie-banner\] \{\s*z-index:\s*(\d+);\s*\}/);
    expect(menuRule).not.toBeNull();
    expect(Number(menuRule![1])).toBe(Number(rule![1]));
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
  it('on a phone the WhatsApp button, and “back to top” everywhere, rise with the same transform as the bars', () => {
    expect(declaration(whatsappRule(), 'transform')).toBe(RISE_ABOVE_COOKIE_BANNER);
    expect(backToTop).toMatch(/transform: RISE_ABOVE_COOKIE_BANNER,/);
  });

  it('lifted, the WhatsApp button clears the open banner (and its “Accept all”) on a computer, a tablet and a phone', () => {
    const [mobile, tablet, desktop] = [whatsappRule(), whatsappRule(SM), whatsappRule(LG)];
    expect(declaration(tablet, 'transform')).toBe(WHATSAPP_RISE_SM);
    expect(declaration(desktop, 'transform')).toBe(WHATSAPP_RISE_LG);
    expect(declaration(mobile, 'bottom')).toBe(`calc(${WHATSAPP_BOTTOM})`);
    expect(declaration(desktop, 'bottom')).toBe(WHATSAPP_BOTTOM_LG);
    for (const content of BANNERS) {
      for (const [bottomRule, transformRule, safes] of [[desktop, desktop, [0, 20]], [mobile, tablet, SAFE_AREAS], [mobile, mobile, SAFE_AREAS]] as const) {
        for (const safe of safes) {
          const bannerH = content + safe;
          const floatBottom = cssPx(declaration(bottomRule, 'bottom'), { safe }) - cssPx(declaration(transformRule, 'transform'), { bannerH, safe });
          expect(floatBottom, `${declaration(bottomRule, 'bottom')} over a ${bannerH}px banner`).toBeGreaterThanOrEqual(bannerH + 4);
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

  // Phone, 640–1023 px (verificação final de 29 out, P6: "back to top" sits 8 px higher there) and from lg.
  const TABLET = '@media (min-width: 640px) and (max-width: 1023.98px)';
  const clearanceRule = css.match(new RegExp(`:root \\{\\s*--floats-clearance:\\s*([^;]+);\\s*\\}\\s*${escapeRe(TABLET)} \\{\\s*:root \\{\\s*--floats-clearance:\\s*([^;]+);\\s*\\}\\s*\\}\\s*@media \\(min-width: 1024px\\) \\{\\s*:root \\{\\s*--floats-clearance:\\s*([^;]+);`));
  const footerPadding = tw(footer.slice(footer.indexOf('{/* Bottom bar */}')), 'py'); // container py-7 → 28

  it('its bottom padding covers whatever is fixed at the bottom of the screen', () => {
    expect(clearanceRule).not.toBeNull();
    const [, phoneClearance, tabletClearance, desktopClearance] = clearanceRule!;
    expect(cssPx(desktopClearance)).toBe(0);
    for (const content of BAR_CONTENT) {
      for (const safe of SAFE_AREAS) {
        const barH = content + safe; // what the bar publishes: its offsetHeight, safe-area padding included
        for (const clearance of [cssPx(phoneClearance, { safe }), cssPx(tabletClearance, { safe })]) {
          expect(cssPx(FOOTER_BOTTOM_INSET, { barH, safe, clearance }), `bar ${barH}`).toBeGreaterThanOrEqual(barH);
          for (const banner of BANNERS) {
            const bannerH = banner + safe;
            // Open banner: the bar's content sits on it (W2).
            expect(cssPx(FOOTER_BOTTOM_INSET, { barH, bannerH, safe, clearance }), `bar ${barH} + banner ${bannerH}`).toBeGreaterThanOrEqual(bannerH + content);
          }
        }
      }
    }
    // A computer, no bar: only the open banner.
    expect(cssPx(FOOTER_BOTTOM_INSET, { bannerH: 77 })).toBeCloseTo(77, 6);
    expect(cssPx(FOOTER_BOTTOM_INSET)).toBe(0);
    expect(footer).toMatch(/<footer className="bg-\[#1A1A18\] text-white" role="contentinfo" style=\{\{ paddingBottom: FOOTER_BOTTOM_INSET \}\}>/);
  });

  it('on a phone or a tablet, scrolled to the end, the last row sits above “back to top” and the WhatsApp button', () => {
    const [, phoneClearance, tabletClearance] = clearanceRule!;
    // "Back to top"'s bottom is in index.css (.back-to-top), per band (P6).
    expect(backToTop).not.toMatch(/bottom:/);
    const bands = [
      { clearance: phoneClearance, bottom: declaration(cssRule(css, '.back-to-top'), 'bottom'), waHeight: tw(whatsappFloat, 'h') },
      { clearance: tabletClearance, bottom: declaration(cssRule(css, '.back-to-top', TABLET), 'bottom'), waHeight: tw(whatsappFloat, 'sm:h') },
    ];
    const size = Math.max(tw(backToTop, 'h'), tw(backToTop, 'sm:h'));
    for (const { clearance, bottom, waHeight } of bands) {
      const waTop = cssPx(declaration(cssRule(css, '.whatsapp-float'), 'bottom'), {}) + waHeight;
      // The arrow sits right on top of the WhatsApp button, never into it.
      expect(cssPx(bottom), bottom).toBe(waTop);
      for (const safe of SAFE_AREAS) {
        for (const bannerH of [0, ...BANNERS.map((b) => b + safe)]) {
          const lift = cssPx(COOKIE_BANNER_LIFT, { bannerH, safe });
          const floatsTop = Math.max(cssPx(bottom, { safe }) + size, waTop + safe) + lift;
          for (const barH of [0, ...BAR_CONTENT.map((c) => c + safe)]) {
            const lastRowBottom = cssPx(FOOTER_BOTTOM_INSET, { barH, bannerH, safe, clearance: cssPx(clearance, { safe }) }) + footerPadding;
            expect(lastRowBottom, `${bottom}: safe ${safe}, banner ${bannerH}, bar ${barH}`).toBeGreaterThanOrEqual(floatsTop + 4);
          }
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

// ─── Revisão do PR #178 ──────────────────────────────────────────────────────

type Box = { top: number; bottom: number; left: number; right: number };
const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('R1: from 640 px the WhatsApp button rises only as far as it must', () => {
  const bottomOf = (rule: string, safe = 0) => cssPx(declaration(rule, 'bottom'), { safe });
  const liftOf = (rule: string, bannerH: number, safe = 0) => -cssPx(declaration(rule, 'transform'), { bannerH, safe });
  /** The 56 px button 28 px from the right, as WhatsAppFloat.tsx places it from md. */
  const floatBox = (vw: number, vh: number, bottom: number): Box => {
    const size = tw(whatsappFloat, 'sm:w');
    const right = tw(whatsappFloat, 'md:right');
    return { top: vh - bottom - size, bottom: vh - bottom, left: vw - right - size, right: vw - right };
  };

  it('it ends 0.5rem above the open banner, or stays where it is if that already clears it', () => {
    const [mobile, tablet, desktop] = [whatsappRule(), whatsappRule(SM), whatsappRule(LG)];
    for (const content of BANNERS) {
      for (const safe of [0, 20]) {
        const bannerH = content + safe;
        for (const [bottomRule, rule] of [[mobile, tablet], [desktop, desktop]] as const) {
          const own = bottomOf(bottomRule, safe);
          expect(own + liftOf(rule, bannerH, safe), `${declaration(bottomRule, 'bottom')} over ${bannerH}px`).toBeCloseTo(Math.max(own, bannerH + 8), 6);
        }
      }
    }
    expect(liftOf(tablet, 0)).toBeCloseTo(0, 6);
    expect(liftOf(desktop, 0)).toBeCloseTo(0, 6);
  });

  it('iPad portrait, contact page: over the 77 px banner it stays off «SEND MESSAGE», where the full lift put it', () => {
    // Measured on the local build, 768×1024 en, first visit: banner 947–1024; the form's submit at y 804–848, x 544–736.
    const send: Box = { top: 804.2, bottom: 848.2, left: 544.4, right: 736 };
    const [mobile, tablet] = [whatsappRule(), whatsappRule(SM)];
    expect(liftOf(tablet, 77)).toBeCloseTo(0, 6);
    expect(overlap(floatBox(768, 1024, bottomOf(mobile) + liftOf(tablet, 77)), send)).toBe(false);
    expect(overlap(floatBox(768, 1024, bottomOf(mobile) + cssPx(COOKIE_BANNER_LIFT, { bannerH: 77 })), send)).toBe(true);
  });

  it('the homepage waits with its button at the hero while the banner is open: at 1024 px even 0.5rem above it, it lands on «Search homes»', () => {
    // 1024×768 en, first visit: banner 691–768; the hero's «Search homes» at y 593–657, x 811–982.
    const search: Box = { top: 592.7, bottom: 656.7, left: 811.1, right: 982 };
    const desktop = whatsappRule(LG);
    expect(overlap(floatBox(1024, 768, bottomOf(desktop) + liftOf(desktop, 77)), search)).toBe(true);
    expect(overlap(floatBox(1024, 768, bottomOf(desktop)), search)).toBe(false); // banner closed: no lift, no collision
    const home = read('client/src/pages/Home.tsx');
    expect(home).toMatch(/<div className=\{pastHero \? undefined : 'hidden lg:block home-float-at-hero'\}>\s*<WhatsAppFloat \/>/);
    expect(css).toMatch(new RegExp(`html\\[${COOKIE_BANNER_OPEN_ATTR}\\] \\.home-float-at-hero \\{\\s*display: none;\\s*\\}`));
    // The banner marks <html> while it is open, and takes the mark back when it closes or leaves the page.
    const banner = read('client/src/components/layout/CookieBanner.tsx');
    const effect = banner.slice(banner.indexOf("root.style.setProperty('--cookie-banner-h', '0px');"), banner.indexOf('}, [visible]);'));
    expect(effect).toMatch(/update\(\);\s*root\.setAttribute\(COOKIE_BANNER_OPEN_ATTR, ''\);/);
    expect(effect.match(/root\.removeAttribute\(COOKIE_BANNER_OPEN_ATTR\);/g)).toHaveLength(2);
  });
});

describe('R2: without :has() the banner still goes under an open sheet', () => {
  it('no rule lists a :has() selector with others, and the sheet’s rule needs none', () => {
    const rules: Array<{ selectors: string[]; supports: string | null }> = [];
    postcss.parse(css).walkRules((rule: Rule) => {
      const parent = rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : null;
      rules.push({ selectors: rule.selectors, supports: parent?.name === 'supports' ? parent.params : null });
    });
    const withHas = rules.filter(({ selectors }) => selectors.some((s) => s.includes(':has(')));
    expect(withHas.length).toBeGreaterThan(0);
    for (const { selectors, supports } of withHas) {
      // A browser drops a whole rule over one selector it cannot read.
      expect(selectors, selectors.join(', ')).toHaveLength(1);
      expect(supports, selectors[0]).toBe('selector(:has(*))');
    }
    const sheet = rules.filter(({ selectors }) => selectors.includes('body[data-scroll-locked] [data-cookie-banner]'));
    expect(sheet).toEqual([{ selectors: ['body[data-scroll-locked] [data-cookie-banner]'], supports: null }]);
  });
});

describe('the experience «not found» page: the footer comes after the full-height column', () => {
  /** Lines of <Footer> inside an element whose className has both min-h-screen and flex-col. */
  function footersInFullHeightColumns(file: string): number[] {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: number[] = [];
    const className = (el: ts.JsxOpeningLikeElement) => {
      for (const p of el.attributes.properties) {
        if (!ts.isJsxAttribute(p) || p.name.getText(source) !== 'className' || !p.initializer) continue;
        return ts.isStringLiteral(p.initializer) ? p.initializer.text : p.initializer.getText(source);
      }
      return '';
    };
    const visit = (node: ts.Node, inColumn: boolean) => {
      let column = inColumn;
      if (ts.isJsxElement(node)) {
        const cls = className(node.openingElement);
        if (/\bmin-h-screen\b/.test(cls) && /\bflex-col\b/.test(cls)) column = true;
      }
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'Footer' && inColumn) {
        found.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
      ts.forEachChild(node, (child) => visit(child, column));
    };
    visit(source, false);
    return found;
  }

  it('its bottom padding grows with the open banner: inside a min-h-screen column that pulled the footer up (layout shift) instead of lengthening the page', () => {
    expect(FOOTER_BOTTOM_INSET).toContain('var(--cookie-banner-h, 0px)');
    const pages = fileURLToPath(new URL('../client/src/pages/', import.meta.url));
    const files = (fs.readdirSync(pages, { recursive: true }) as string[]).filter((f) => f.endsWith('.tsx'));
    expect(files).toContain('ExperienceDetail.tsx');
    const offenders = files.flatMap((f) => footersInFullHeightColumns(path.join(pages, f)).map((line) => `${f}:${line}`));
    expect(offenders).toEqual([]);
    // The page still has its footer, right after the column.
    const page = read('client/src/pages/ExperienceDetail.tsx');
    const notFound = page.slice(page.indexOf('if (!exp) {'), page.indexOf('/* ── Derived values ── */'));
    expect(notFound).toMatch(/<div className="min-h-screen flex flex-col">[\s\S]*<\/div>\s*<\/div>\s*<Footer \/>\s*<\/div>\s*\);/);
  });
});

describe('#175’s language card against the banner and the floats', () => {
  const card = read('client/src/components/layout/LanguageSuggestion.tsx');
  const tag = card.slice(card.indexOf('data-testid="language-suggestion"'), card.indexOf('<p className'));
  const offset = (variant: 'aboveBookingBar' | 'elsewhere') => {
    const m = tag.match(/aboveBookingBar\s*\?\s*'bottom-\[calc\((\d+)rem\+env\(safe-area-inset-bottom,0px\)\)\][^']*'\s*:\s*'bottom-\[calc\((\d+)rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
    expect(m).not.toBeNull();
    return Number(m![variant === 'aboveBookingBar' ? 1 : 2]) * 16;
  };

  it('rises above the open banner with a transform, on the banner’s curve: no layout shift when the banner opens', () => {
    // With `bottom: calc(var(--cookie-banner-h) + …)` the card jumped 156 px when the banner opened: CLS 0.05–0.08 on a phone.
    expect(tag).not.toMatch(/--cookie-banner-h/);
    expect(tag).toMatch(/style=\{\{ transform: RISE_ABOVE_COOKIE_BANNER \}\}/);
    expect(tag).toMatch(/transition-transform duration-500 ease-\[cubic-bezier\(0\.16,1,0\.3,1\)\]/);
    expect(read('client/src/components/layout/CookieBanner.tsx')).toContain("animation: 'cookieSlideUp 0.5s cubic-bezier(0.16,1,0.3,1)'");
    for (const content of BANNERS) {
      for (const safe of SAFE_AREAS) {
        const bannerH = content + safe;
        const lift = cssPx(COOKIE_BANNER_LIFT, { bannerH, safe });
        // Above the banner…
        expect(offset('elsewhere') + safe + lift, `${bannerH}`).toBeGreaterThanOrEqual(bannerH + 8);
        // …and, over an English page's booking bar (73–87 px), above the bar sitting on the banner.
        for (const bar of [73, 81, 87]) expect(offset('aboveBookingBar') + safe + lift).toBeGreaterThanOrEqual(lift + bar + safe + 8);
      }
    }
  });

  it('on a phone, over a booking bar, it covers the place of “back to top”, which steps aside until the card goes', () => {
    const bttBottom = cssPx(declaration(cssRule(css, '.back-to-top'), 'bottom')); // phone band (index.css, P6)
    const bttSize = tw(backToTop, 'h');
    for (const cardH of [60, 68, 70, 78, 90]) {
      // Both at the right edge on a phone (the card is full width there): they would overlap.
      expect(offset('aboveBookingBar') < bttBottom + bttSize && bttBottom < offset('aboveBookingBar') + cardH, `${cardH}`).toBe(true);
    }
    expect(card).toMatch(/root\.setAttribute\(LANGUAGE_CARD_ATTR, aboveBookingBar \? 'above-bar' : 'bottom'\);\s*return \(\) => root\.removeAttribute\(LANGUAGE_CARD_ATTR\);/);
    expect(LANGUAGE_CARD_ATTR).toBe('data-language-card');
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*html\[data-language-card="above-bar"\] \.back-to-top \{\s*display: none;\s*\}\s*\}/);
    expect(backToTop).toMatch(/className="back-to-top fixed /);
    for (const p of ['/homes/villa-x', '/experiences/horseback-riding', '/activities/canyoning']) expect(hasBottomBookingBar(p), p).toBe(true);
    // Elsewhere the card (two lines, ≤ 72 px) ends under the WhatsApp button's place: nothing steps aside.
    expect(offset('elsewhere') + 72).toBeLessThanOrEqual(cssPx(declaration(cssRule(css, '.whatsapp-float'), 'bottom')));
    // From 640 px the card is on the left (max 24rem) and the floats on the right.
    expect(tag).toMatch(/sm:left-6 sm:right-auto sm:max-w-sm/);
  });
});
