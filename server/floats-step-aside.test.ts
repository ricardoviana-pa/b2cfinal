import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import postcss, { type AtRule, type Rule } from 'postcss';
import {
  BACK_TO_TOP_RIGHT_LG,
  BACK_TO_TOP_SIZE_LG,
  BOOKING_CARD_FLOATS_GAP,
  BOOKING_CARD_UNDER_FLOATS_ATTR,
  COOKIE_BANNER_LIFT,
  COOKIE_BANNER_OPEN_ATTR,
  FLOATS_CLEARANCE_VAR,
  HOME_HERO_ATTR,
  LANGUAGE_CARD_ATTR,
  WHATSAPP_RISE_LG,
  bookingCardUnderFloats,
  watchBookingCardUnderFloats,
} from '@/lib/fixedBottom';
import { LG_MIN_WIDTH, SM_MIN_WIDTH, languageCardWaits } from '@/lib/languageSuggestion';
import { stripHreflang } from './_core/vite';

// Verificação final em produção, 29 out 2026 (depois dos PRs #166–#186): o
// que está fixo ao fundo do ecrã e não tem para onde subir afasta-se
// (lib/fixedBottom.ts):
// - P1: na página da experiência, a 1280×800 com o banner aberto, o botão do
//   WhatsApp (subido 57 px) tapava o «(42)» de «View all photos» e abria o
//   WhatsApp em vez das fotos.
// - P2 / PP-1: na página da casa, a 1024–1100 e 1280–1350 px de largura, o
//   «voltar ao topo» caía sobre o canto do CHECK AVAILABILITY do cartão fixo
//   e sobre o RESERVE enquanto o cartão saía no fim da coluna.
// - PP-2: no telemóvel, o «voltar ao topo» (z-89) era pintado por cima da
//   gaveta de reserva aberta (z-50) e não recebia toques.
// - P5: no telemóvel, com o browser em alemão, o cartão de língua e o banner
//   dos cookies tapavam o «Search homes» do hero; no contacto, o campo
//   «More details».
// - P6: a 640–1023 px, numa visita seguinte, o WhatsApp (56 px de altura)
//   tapava 8 px do «voltar ao topo».
// - P7: a página «experiência não encontrada» (404) oferecia «Auf Deutsch
//   ansehen» e gastava o cartão único da visita numa página morta.

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('client/src/index.css');
const app = read('client/src/App.tsx');
const backToTop = app.slice(app.indexOf('function BackToTop'), app.indexOf('function OfflineBanner'));
const card = read('client/src/components/layout/LanguageSuggestion.tsx');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Env = { bannerH?: number; safe?: number };
/** A CSS length from index.css / lib/fixedBottom.ts (var, env, max, calc, translateY; px and rem) in px. */
function cssPx(expr: string, { bannerH = 0, safe = 0 }: Env = {}): number {
  const js = expr
    .replace(/var\(--cookie-banner-h,\s*0px\)/g, `${bannerH}px`)
    .replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g, `${safe}px`)
    .replace(/(\d*\.?\d+)rem/g, (_, n) => `${Number(n) * 16}px`)
    .replace(/(\d*\.?\d+)px/g, '$1')
    .replace(/(translateY|calc)\(/g, '(')
    .replace(/\b(max|min)\(/g, 'Math.$1(');
  if (!/^[\d.\s+\-*/(),]*$/.test(js.replace(/Math\.(max|min)/g, ''))) throw new Error(`unexpected CSS: ${expr} → ${js}`);
  return Function(`"use strict"; return (${js});`)() as number;
}
/** Tailwind spacing class value in px (`md:right-7` → 28). */
const tw = (source: string, cls: string) => {
  const m = source.match(new RegExp(`(?:^|[\\s"'\`])${escapeRe(cls)}-(\\d+(?:\\.5)?)(?=[\\s"'\`])`));
  expect(m, cls).not.toBeNull();
  return Number(m![1]) * 4;
};

type Box = { top: number; bottom: number; left: number; right: number };
const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Every rule of index.css with its cascade layer, media and supports conditions. */
function rules() {
  const out: Array<{ selectors: string[]; layer: string | null; media: string[]; declarations: Record<string, string> }> = [];
  postcss.parse(css).walkRules((rule: Rule) => {
    let layer: string | null = null;
    const media: string[] = [];
    for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
      const at = p as AtRule;
      if (at.name === 'layer') layer = at.params;
      if (at.name === 'media') media.unshift(at.params);
    }
    const declarations: Record<string, string> = {};
    rule.walkDecls((d) => { declarations[d.prop] = d.value; });
    out.push({ selectors: rule.selectors, layer, media, declarations });
  });
  return out;
}
const allRules = rules();
const ruleOf = (selector: string, media: string[] = []) => {
  const found = allRules.filter((r) => r.selectors.includes(selector) && JSON.stringify(r.media) === JSON.stringify(media));
  expect(found, `${media.join(' ')} ${selector}`).toHaveLength(1);
  return found[0];
};

describe('P1: the experience page’s «View all photos» ends left of the WhatsApp button', () => {
  const gallery = read('client/src/components/experience/ExperienceGallery.tsx');
  const whatsapp = read('client/src/components/layout/WhatsAppFloat.tsx');

  it('the button keeps the footer’s clearance (lg:mr-16) inside the container, on top of the container’s own padding', () => {
    const row = gallery.slice(gallery.indexOf('View all photos button (desktop, below grid)'), gallery.indexOf('{/* Lightbox */}'));
    expect(row).toMatch(/<div className="hidden lg:flex container justify-end pt-3">/);
    expect(row).toMatch(/className="pa-action lg:mr-16 /);
    // The narrowest container gutter from lg is 2rem (index.css): gutter + margin ≥ 8 px left of the float.
    const gutter = cssPx(ruleOf('.container', ['(min-width: 768px)']).declarations['padding-right']);
    const margin = tw(row, 'lg:mr');
    const floatColumn = tw(whatsapp, 'md:right') + tw(whatsapp, 'sm:w'); // 28 + 56
    expect(gutter + margin).toBeGreaterThanOrEqual(floatColumn + 8);
    // Footer.tsx uses the same clearance for its last row.
    expect(tw(read('client/src/components/layout/Footer.tsx').slice(0, 20000), 'lg:pr')).toBe(margin);
  });

  it('1280×800, first visit: the lifted float (57 px up over the 77 px banner) no longer meets the button; nor at rest', () => {
    // Measured live: float [1196,659,1252,715] with the banner, [1196,716,1252,772] without; button [1065,686.5,1240,730.5].
    const lift = -cssPx(WHATSAPP_RISE_LG, { bannerH: 77 });
    expect(lift).toBeCloseTo(57, 6);
    const float = (bannerH: number): Box => {
      const bottom = cssPx('1.75rem') - cssPx(WHATSAPP_RISE_LG, { bannerH });
      return { top: 800 - bottom - 56, bottom: 800 - bottom, left: 1280 - 28 - 56, right: 1280 - 28 };
    };
    const before: Box = { top: 686.5, bottom: 730.5, left: 1065.1, right: 1240 };
    const after: Box = { ...before, left: before.left - 64, right: before.right - 64 };
    expect(overlap(float(77), before)).toBe(true);
    expect(overlap(float(0), before)).toBe(true);
    expect(overlap(float(77), after)).toBe(false);
    expect(overlap(float(0), after)).toBe(false);
    expect(after.right).toBeLessThanOrEqual(float(0).left - 8);
  });
});

describe('P2 / PP-1: on a computer «back to top» steps aside while a home’s booking card reaches under its column', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the column it reads is the button’s own: md:right-7 + sm:w-10, plus 8 px of air', () => {
    expect(BACK_TO_TOP_RIGHT_LG).toBe(tw(backToTop, 'md:right'));
    expect(BACK_TO_TOP_SIZE_LG).toBe(tw(backToTop, 'sm:w'));
    expect(BOOKING_CARD_FLOATS_GAP).toBe(8);
  });

  it('the widths measured live: under the column at 1024, 1100, 1280 and 1300 px; clear at 1366 and 1440', () => {
    // Card right edges measured on the Carcavelos page (the grid is 1024 px wide to 1279 px, 1280 px from there).
    for (const [vw, cardRight, under] of [[1024, 992, true], [1100, 1030, true], [1280, 1240, true], [1300, 1250, true], [1366, 1283, false], [1440, 1320, false]] as const) {
      expect(bookingCardUnderFloats(cardRight, vw), `${vw}`).toBe(under);
    }
    // The button's left edge at 1280 is 1212: a card ending at 1240 is 28 px under it.
    expect(1280 - BACK_TO_TOP_RIGHT_LG - BACK_TO_TOP_SIZE_LG).toBe(1212);
  });

  it('marks <html> while the card is on screen and under the column, follows the scroll and the window, and takes the mark back', () => {
    const attrs = new Map<string, string>();
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        removeAttribute: (k: string) => attrs.delete(k),
      },
    });
    const listeners = new Map<string, () => void>();
    const win = { innerWidth: 1280, addEventListener: (e: string, cb: () => void) => listeners.set(e, cb), removeEventListener: (e: string) => listeners.delete(e) };
    vi.stubGlobal('window', win);
    const intersections: Array<{ cb: (entries: Array<{ isIntersecting: boolean }>) => void; observed: unknown[]; disconnected: boolean }> = [];
    vi.stubGlobal('IntersectionObserver', class {
      state: { cb: (entries: Array<{ isIntersecting: boolean }>) => void; observed: unknown[]; disconnected: boolean };
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { this.state = { cb, observed: [], disconnected: false }; intersections.push(this.state); }
      observe(el: unknown) { this.state.observed.push(el); }
      disconnect() { this.state.disconnected = true; }
    });
    const resizes: Array<{ cb: () => void; observed: unknown[]; disconnected: boolean }> = [];
    vi.stubGlobal('ResizeObserver', class {
      state: { cb: () => void; observed: unknown[]; disconnected: boolean };
      constructor(cb: () => void) { this.state = { cb, observed: [], disconnected: false }; resizes.push(this.state); }
      observe(el: unknown) { this.state.observed.push(el); }
      disconnect() { this.state.disconnected = true; }
    });
    const rect = { right: 1240 };
    const card = { getBoundingClientRect: () => rect } as unknown as HTMLElement;

    const cleanup = watchBookingCardUnderFloats(card);
    expect(intersections[0].observed).toEqual([card]);
    expect(resizes[0].observed).toEqual([card]);
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(false); // not before the observer has reported
    intersections[0].cb([{ isIntersecting: true }]);
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(true); // 1280: card to 1240, button from 1212
    win.innerWidth = 1440; // the card now ends at 1320, the button starts at 1372
    rect.right = 1320;
    listeners.get('resize')!();
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(false);
    win.innerWidth = 1024;
    rect.right = 992;
    resizes[0].cb();
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(true);
    intersections[0].cb([{ isIntersecting: true }, { isIntersecting: false }]); // the card left at the end of its column
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(false);
    intersections[0].cb([{ isIntersecting: true }]); // scrolled back up
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(true);
    cleanup?.();
    expect(attrs.has(BOOKING_CARD_UNDER_FLOATS_ATTR)).toBe(false);
    expect(intersections[0].disconnected).toBe(true);
    expect(resizes[0].disconnected).toBe(true);
    expect(listeners.has('resize')).toBe(false);
    expect(watchBookingCardUnderFloats(null)).toBeUndefined();
  });

  it('nothing without IntersectionObserver (the server, an old browser)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    expect(watchBookingCardUnderFloats({} as HTMLElement)).toBeUndefined();
  });

  it('the home page watches its card, and from lg the button is gone while <html> is marked — a utilities-layer rule', () => {
    const page = read('client/src/pages/PropertyDetail.tsx');
    expect(page).toMatch(/useEffect\(\(\) => watchBookingCardUnderFloats\(bookingCardEl\), \[bookingCardEl\]\);/);
    expect(page).toMatch(/<div ref=\{setBookingCardEl\} className="property-sticky-card/);
    expect(BOOKING_CARD_UNDER_FLOATS_ATTR).toBe('data-booking-card-under-floats');
    const rule = ruleOf(`html[${BOOKING_CARD_UNDER_FLOATS_ATTR}] .back-to-top`, ['(min-width: 1024px)']);
    expect(rule.declarations).toEqual({ display: 'none' });
    // Tailwind v4: in @layer components `display: none` loses to the button's `flex` utility whatever its specificity.
    expect(rule.layer).toBe('utilities');
    expect(backToTop).toMatch(/className="back-to-top fixed z-\[89\] [^"]* flex /);
  });
});

describe('PP-2: «back to top» steps aside while a dialog, drawer or sheet holds the page', () => {
  it('body[data-scroll-locked] hides it, in the utilities layer, a rule of its own (no :has(), no selector list)', () => {
    const rule = ruleOf('body[data-scroll-locked] .back-to-top');
    expect(rule.declarations).toEqual({ display: 'none' });
    expect(rule.layer).toBe('utilities');
    expect(rule.selectors).toEqual(['body[data-scroll-locked] .back-to-top']);
    // Needed because the button (z-[89]) is painted over the drawer and its overlay (z-50).
    const drawer = read('client/src/components/ui/drawer.tsx');
    const overlayZ = Number(drawer.match(/fixed inset-0 z-(\d+) bg-black/)![1]);
    expect(Number(backToTop.match(/fixed z-\[(\d+)\]/)![1])).toBeGreaterThan(overlayZ);
    // Radix's scroll lock marks <body> with exactly this attribute.
    expect(read('node_modules/react-remove-scroll-bar/dist/es2015/component.js')).toMatch(/lockAttribute = 'data-scroll-locked'/);
    // The home's booking sheet is a Drawer that locks the page.
    expect(read('client/src/pages/PropertyDetail.tsx')).toMatch(/<Drawer open=\{bookingOpen\} onOpenChange=\{setBookingOpen\}>/);
  });
});

describe('P5: the language card waits for the hero and, on a phone, for the cookie choice', () => {
  const base = { viewportWidth: 390, homeHeroOnScreen: false, cookieChoice: 'essential' as string | null, cookieBannerOpen: false };

  it('below lg it waits while the homepage’s hero is on screen; from lg it does not', () => {
    for (const viewportWidth of [360, 390, 414, 768, 1023]) {
      expect(languageCardWaits({ ...base, viewportWidth, homeHeroOnScreen: true }), `${viewportWidth}`).toBe(true);
      expect(languageCardWaits({ ...base, viewportWidth, homeHeroOnScreen: false }), `${viewportWidth}`).toBe(false);
    }
    for (const viewportWidth of [1024, 1280, 1440]) {
      expect(languageCardWaits({ ...base, viewportWidth, homeHeroOnScreen: true }), `${viewportWidth}`).toBe(false);
    }
    expect(LG_MIN_WIDTH).toBe(1024);
  });

  it('on a phone it waits until the cookie choice is made (and while the banner is reopened); from 640 px it sits on the left, away from the banner’s buttons', () => {
    for (const viewportWidth of [360, 390, 414, 639]) {
      expect(languageCardWaits({ ...base, viewportWidth, cookieChoice: null }), `${viewportWidth} no choice`).toBe(true);
      expect(languageCardWaits({ ...base, viewportWidth, cookieChoice: 'all', cookieBannerOpen: true }), `${viewportWidth} reopened`).toBe(true);
      expect(languageCardWaits({ ...base, viewportWidth, cookieChoice: 'essential' }), `${viewportWidth} chosen`).toBe(false);
      expect(languageCardWaits({ ...base, viewportWidth, cookieChoice: 'all' }), `${viewportWidth} chosen`).toBe(false);
    }
    for (const viewportWidth of [640, 768, 1024, 1440]) {
      expect(languageCardWaits({ ...base, viewportWidth, cookieChoice: null, cookieBannerOpen: true }), `${viewportWidth}`).toBe(false);
    }
    expect(SM_MIN_WIDTH).toBe(640);
    expect(card).toMatch(/sm:left-6 sm:right-auto sm:max-w-sm/);
  });

  it('390×844, de-DE, first visit: the card (70 px, lifted 155 px over the 156 px banner) sat on the hero’s «Search homes»; now neither is there', () => {
    // Measured live: card [16,603,374,673] = bottom 1rem + 155 px of lift; the banner from 687.6; «Search homes» under both.
    const lift = cssPx(COOKIE_BANNER_LIFT, { bannerH: 156.4 });
    expect(lift).toBeCloseTo(155.4, 6);
    const cardTop = 844 - 16 - lift - 70;
    expect(cardTop).toBeCloseTo(602.6, 6);
    expect(languageCardWaits({ viewportWidth: 390, homeHeroOnScreen: true, cookieChoice: null, cookieBannerOpen: true })).toBe(true);
    // After the choice, still at the hero: waits; past the hero: shown.
    expect(languageCardWaits({ viewportWidth: 390, homeHeroOnScreen: true, cookieChoice: 'essential', cookieBannerOpen: false })).toBe(true);
    expect(languageCardWaits({ viewportWidth: 390, homeHeroOnScreen: false, cookieChoice: 'essential', cookieBannerOpen: false })).toBe(false);
  });

  it('the homepage marks <html> while the hero is on screen, with the state that already holds the WhatsApp button back', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(HOME_HERO_ATTR).toBe('data-home-hero');
    expect(home).toMatch(/useEffect\(\(\) => \{\s*if \(pastHero\) return;\s*const root = document\.documentElement;\s*root\.setAttribute\(HOME_HERO_ATTR, ''\);\s*return \(\) => root\.removeAttribute\(HOME_HERO_ATTR\);\s*\}, \[pastHero\]\);/);
    expect(home).toMatch(/<div className=\{pastHero \? undefined : 'hidden lg:block home-float-at-hero'\}>\s*<WhatsAppFloat \/>/);
  });

  it('the card reads the page (hero mark, banner mark, cookie choice, width), follows their changes, and only counts as shown once on the page', () => {
    expect(card).toMatch(/homeHeroOnScreen: root\.hasAttribute\(HOME_HERO_ATTR\)/);
    expect(card).toMatch(/cookieBannerOpen: root\.hasAttribute\(COOKIE_BANNER_OPEN_ATTR\)/);
    expect(card).toMatch(/cookieChoice: getCookieChoice\(\)/);
    expect(card).toMatch(/viewportWidth: window\.innerWidth/);
    expect(card).toMatch(/observer\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \[HOME_HERO_ATTR, COOKIE_BANNER_OPEN_ATTR\] \}\);/);
    expect(card).toMatch(/window\.addEventListener\(COOKIE_CHOICE_EVENT, update\);\s*window\.addEventListener\('resize', update\);/);
    // Decided and shown are two things: the visit's marker, the page it appeared on and the <html> mark come with visibility.
    expect(card).toMatch(/const visible = target !== null && !waits;/);
    expect(card).toMatch(/if \(!visible\) return;\s*if \(shownOn\.current === null\) \{\s*shownOn\.current = location;\s*keepVisit\(\);\s*\}\s*const root = document\.documentElement;\s*root\.setAttribute\(LANGUAGE_CARD_ATTR/);
    expect(card).toMatch(/if \(!visible\) return null;/);
    expect(LANGUAGE_CARD_ATTR).toBe('data-language-card');
    // A card that only waited on the previous page is decided again on the next one.
    const main = card.slice(card.indexOf('if (location !== landingPage.current)'), card.indexOf('const next = suggestedLanguage('));
    expect(main).toMatch(/setTarget\(null\);\s*$/);
    const decide = card.slice(card.indexOf('const decide = () => {'), card.indexOf('const first = window.setTimeout(decide, 0);'));
    expect(decide).not.toContain('keepVisit');
    expect(decide).not.toContain('shownOn');
  });
});

describe('P6: from 640 px «back to top» sits on top of the taller WhatsApp button, and the footer keeps room for both', () => {
  const whatsapp = read('client/src/components/layout/WhatsAppFloat.tsx');
  const whatsappBottom = cssPx(ruleOf('.whatsapp-float').declarations.bottom); // 88

  it('its bottom lives in index.css, per band: phone 5rem + 56px (= 5.5rem + the 48 px button), 640–1023 px 5.5rem + 56px', () => {
    expect(backToTop).not.toMatch(/bottom:/);
    const phone = cssPx(ruleOf('.back-to-top').declarations.bottom);
    const tablet = cssPx(ruleOf('.back-to-top', ['(min-width: 640px) and (max-width: 1023.98px)']).declarations.bottom);
    expect(phone).toBe(whatsappBottom + tw(whatsapp, 'h')); // 88 + 48
    expect(tablet).toBe(whatsappBottom + tw(whatsapp, 'sm:h')); // 88 + 56
    // Measured live at 768 (returning visit): "back to top" at 840–880, the WhatsApp button from 880 (viewport 1024 high).
    expect(1024 - tablet).toBe(880);
    expect(1024 - whatsappBottom - tw(whatsapp, 'sm:h')).toBe(880);
    // Before: 136 px put the 40 px circle 8 px into the 56 px button.
    expect(whatsappBottom + tw(whatsapp, 'sm:h') - phone).toBe(8);
  });

  it('the footer’s clearance grows with it on tablets: last row ≥ 4 px above the arrow, with and without a home indicator', () => {
    const clearance = (media: string[]) => {
      const found = allRules.filter((r) => r.selectors.includes(':root') && JSON.stringify(r.media) === JSON.stringify(media) && r.declarations[FLOATS_CLEARANCE_VAR]);
      expect(found, `${media.join(' ')} ${FLOATS_CLEARANCE_VAR}`).toHaveLength(1);
      return found[0].declarations[FLOATS_CLEARANCE_VAR];
    };
    const footerPadding = tw(read('client/src/components/layout/Footer.tsx').slice(read('client/src/components/layout/Footer.tsx').indexOf('{/* Bottom bar */}')), 'py'); // 28
    for (const safe of [0, 20, 34]) {
      const phoneTop = cssPx(ruleOf('.back-to-top').declarations.bottom, { safe }) + tw(backToTop, 'h');
      expect(cssPx(clearance([]), { safe }) + footerPadding).toBeGreaterThanOrEqual(phoneTop + 4);
      const tabletTop = cssPx(ruleOf('.back-to-top', ['(min-width: 640px) and (max-width: 1023.98px)']).declarations.bottom, { safe }) + tw(backToTop, 'sm:h');
      expect(cssPx(clearance(['(min-width: 640px) and (max-width: 1023.98px)']), { safe }) + footerPadding).toBeGreaterThanOrEqual(tabletTop + 4);
    }
    expect(cssPx(clearance(['(min-width: 1024px)']))).toBe(0);
  });
});

describe('P7: a 404 offers no language, on the server and in the page', () => {
  const alternates = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']
    .flatMap((l) => [l, `${l}-${l.toUpperCase()}`])
    .concat('x-default')
    .map((l) => `    <link rel="alternate" hreflang="${l}" href="https://www.portugalactive.com/${l.split('-')[0]}/experiences/zz" />`)
    .join('\n');
  const head = `<head>\n    <meta name="robots" content="index, follow" />\n${alternates}\n    <link rel="canonical" href="https://www.portugalactive.com/en/experiences/zz" />\n  </head>`;

  it('stripHreflang removes every alternate and nothing else', () => {
    const out = stripHreflang(head);
    expect(out).not.toContain('hreflang=');
    expect(out).toContain('<link rel="canonical" href="https://www.portugalactive.com/en/experiences/zz" />');
    expect(out).toContain('<meta name="robots" content="index, follow" />');
    expect(stripHreflang('<head></head>')).toBe('<head></head>');
    // and every 404 leaves through it (server/_core/vite.ts, sendHtml)
    const vite = read('server/_core/vite.ts');
    expect(vite).toMatch(/const sendHtml = \(body: string\) => \{\s*if \(status === 404\) body = stripHreflang\(forceNoindex\(body\)\);/);
  });

  it('the pages whose record can be missing say noindex then, which clears the alternates and writes none (usePageMeta)', () => {
    const meta = read('client/src/hooks/usePageMeta.ts');
    expect(meta).toMatch(/if \(opts\?\.noindex\) \{[\s\S]*?clearHreflang\(\);\s*return/);
    for (const [file, pattern] of [
      ['client/src/pages/ExperienceDetail.tsx', /noindex: !exp,\s*\}\);/],
      ['client/src/pages/ServiceDetail.tsx', /noindex: !item,\s*\}\);/],
      ['client/src/pages/BlogArticle.tsx', /noindex: !article,\s*\}\);/],
      ['client/src/pages/Collection.tsx', /noindex: !def \|\| !copy,\s*\}\);/],
      ['client/src/pages/PropertyDetail.tsx', /usePageMeta\(\{ \.\.\.pdpMeta, type: 'place', noindex: partnerNoindex \|\| !property \}\);/],
      ['client/src/pages/DestinationDetail.tsx', /noindex: !dest \|\| dest\.status !== 'active' \|\| !!dest\.comingSoon,/],
      ['client/src/pages/NotFound.tsx', /noindex: true \}\);/],
    ] as const) {
      expect(read(file), file).toMatch(pattern);
    }
    // /activities/:slug is the experience page too.
    expect(app).toMatch(/<Route path="\/activities\/:slug" component=\{ExperienceDetail\} \/>/);
  });
});
