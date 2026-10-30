import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { hasBottomBookingBar, pageOffersLanguage, pathInLanguage, shownThisVisit, SITE_LANGUAGES, siteLanguage, suggestedLanguage, SUGGESTION_COPY, SUGGESTION_SHOWN_KEY, SUGGESTION_VISIT_MS, type SuggestedLanguage } from '@/lib/languageSuggestion';
import { blogLanguageRedirect, blogLanguages } from '@shared/blogPublication';
import blogData from '../client/src/data/blog.json';

// Auditoria 29 out, i18n-copy-07: "/" and unprefixed links always open the
// English site. No Accept-Language redirect (crawlers keep /en); instead a
// small, dismissible suggestion, remembered on the device.

const base = { pageLang: 'en', path: '/', stored: null, declined: null };

describe('who gets a language suggestion', () => {
  it('a Portuguese or German browser on an English page', () => {
    expect(suggestedLanguage({ ...base, browser: ['pt-PT', 'pt', 'en-US'] })).toBe('pt');
    expect(suggestedLanguage({ ...base, path: '/homes', browser: ['de-CH', 'en'] })).toBe('de');
    expect(suggestedLanguage({ ...base, browser: ['zh-CN', 'nl-BE'] })).toBe('nl');
  });

  it('nobody whose first site language is English, or who reads another language page', () => {
    expect(suggestedLanguage({ ...base, browser: ['en-GB', 'pt-PT'] })).toBeNull();
    expect(suggestedLanguage({ ...base, browser: ['zh-CN', 'en-US', 'pt'] })).toBeNull();
    expect(suggestedLanguage({ ...base, browser: ['ja'] })).toBeNull();
    expect(suggestedLanguage({ ...base, pageLang: 'pt', browser: ['de-DE'] })).toBeNull();
  });

  it('the visitor’s own choice wins over the browser, and a "no" is remembered', () => {
    expect(suggestedLanguage({ ...base, stored: 'en', browser: ['pt-PT'] })).toBeNull();
    expect(suggestedLanguage({ ...base, stored: 'fr', browser: ['en-GB'] })).toBe('fr');
    expect(suggestedLanguage({ ...base, declined: 'pt', browser: ['pt-PT'] })).toBeNull();
    expect(suggestedLanguage({ ...base, declined: 'pt', browser: ['de-DE'] })).toBe('de');
  });

  it('never on booking, payment or account pages (a reload could lose the form)', () => {
    for (const path of ['/checkout/abc', '/checkout', '/booking/confirmation', '/account', '/login', '/admin/x']) {
      expect(suggestedLanguage({ ...base, path, browser: ['pt-PT'] }), path).toBeNull();
    }
    expect(suggestedLanguage({ ...base, path: '/homes/villa-x', browser: ['pt-PT'] })).toBe('pt');
  });
});

describe('the suggested page', () => {
  it('is the same page, query and anchor in the other language', () => {
    expect(pathInLanguage('/en/homes', '?destination=algarve', '#map', 'pt')).toBe('/pt/homes?destination=algarve#map');
    expect(pathInLanguage('/en', '', '', 'de')).toBe('/de');
    expect(pathInLanguage('/homes/villa', '', '', 'fr')).toBe('/fr/homes/villa');
  });

  it('speaks the language it offers, for every site language but English', () => {
    expect(Object.keys(SUGGESTION_COPY).sort()).toEqual(SITE_LANGUAGES.filter((l) => l !== 'en').sort());
    for (const copy of Object.values(SUGGESTION_COPY)) {
      expect(copy.prompt.length).toBeGreaterThan(10);
      expect(copy.action.length).toBeGreaterThan(3);
      expect(copy.dismiss.length).toBeGreaterThan(3);
    }
    expect(SUGGESTION_COPY.pt.action).toBe('Ver em português');
    expect(siteLanguage('PT_br')).toBe('pt');
    expect(siteLanguage('xx')).toBeNull();
  });
});

// Revisão 2 do PR #175: «once per visit» was once per tab. The marker lived in
// sessionStorage, which every new tab starts empty: a de-DE visitor who
// opened three homes from /en/homes in new tabs got the card in all three.
describe('once per visit, across tabs', () => {
  const now = Date.UTC(2026, 9, 29, 12, 0, 0);
  const card = fs.readFileSync(new URL('../client/src/components/layout/LanguageSuggestion.tsx', import.meta.url), 'utf8');

  it('a page in the same visit — any tab — finds the card already shown', () => {
    expect(SUGGESTION_SHOWN_KEY).toBe('pa-lang-suggestion-shown');
    expect(shownThisVisit(String(now - 1000), now)).toBe(true);
    expect(shownThisVisit(String(now - 29 * 60_000), now)).toBe(true);
    // a clock set back a little is still this visit
    expect(shownThisVisit(String(now + 60_000), now)).toBe(true);
  });

  it('a visit ends after 30 minutes without a page; nothing stored (or garbage) is no visit', () => {
    expect(SUGGESTION_VISIT_MS).toBe(30 * 60_000);
    expect(shownThisVisit(String(now - SUGGESTION_VISIT_MS), now)).toBe(false);
    expect(shownThisVisit(String(now - 3 * 3600_000), now)).toBe(false);
    for (const stored of [null, undefined, '', '1', 'yes', '-5', String(now + 2 * SUGGESTION_VISIT_MS)]) {
      expect(shownThisVisit(stored, now), String(stored)).toBe(false);
    }
  });

  it('the marker lives in localStorage (shared by the tabs), never in sessionStorage', () => {
    expect(card).not.toMatch(/sessionStorage/);
    expect(card).toMatch(/const keepVisit = \(\) => write\(\(\) => localStorage, SUGGESTION_SHOWN_KEY, String\(Date\.now\(\)\)\);/);
    expect(card).toMatch(/if \(shownThisVisit\(read\(\(\) => localStorage, SUGGESTION_SHOWN_KEY\), Date\.now\(\)\)\) \{\s*keepVisit\(\);\s*return;\s*\}/);
    // written when the card appears, and refreshed by every later page of the visit (its own tab too)
    expect(card).toMatch(/shownOn\.current = location;\s*keepVisit\(\);/);
    expect(card).toMatch(/if \(shownOn\.current !== location\) setTarget\(null\);\s*keepVisit\(\);\s*return;/);
  });
});

describe('no redirect, nothing for crawlers', () => {
  it('the root still 301s to /en for everyone (x-default); the suggestion only runs in the browser after mount', () => {
    const vite = fs.readFileSync(new URL('./_core/vite.ts', import.meta.url), 'utf8');
    expect(vite).toMatch(/return res\.redirect\(301, `\/en\$\{p === '\/' \? '' : p\}\$\{query\}`\);/);
    expect(vite).not.toMatch(/accept-language/i);
    const card = fs.readFileSync(new URL('../client/src/components/layout/LanguageSuggestion.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/useState<SuggestedLanguage \| null>\(null\)/);
    expect(card).toMatch(/useEffect\(/);
    expect(card).toMatch(/navigator\.languages/);
    // Fixed, so appearing shifts no content; above the cookie banner, rising
    // with it by a transform, so the banner opening shifts none either
    // (revisão do PR #178; server/fixed-bottom-layers.test.ts).
    expect(card).toMatch(/className=\{`fixed /);
    expect(card).toMatch(/style=\{\{ transform: RISE_ABOVE_COOKIE_BANNER \}\}/);
    expect(fs.readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8')).toMatch(/<LanguageSuggestion \/>/);
  });
});

// Revisão do PR #175, R4: the card was offered on English articles that have
// no edition in the visitor's language. /de/blog/<slug> 302s back to /en, so
// "Auf Deutsch ansehen" reloaded the English article and stored "de".
describe('only a language the page exists in', () => {
  /** The alternates the server writes for a page in these languages (generic + regional + x-default). */
  const alternates = (langs: readonly string[]) => [...langs.flatMap((l) => [l, `${l}-${l.toUpperCase()}`]), 'x-default'];

  it('an article in English and Portuguese offers Portuguese, not German or French', () => {
    const hreflangs = alternates(['en', 'pt']);
    expect(pageOffersLanguage(hreflangs, 'pt')).toBe(true);
    expect(pageOffersLanguage(hreflangs, 'de')).toBe(false);
    expect(pageOffersLanguage(hreflangs, 'fr')).toBe(false);
  });

  it('a page in every language offers any of them; with no alternates written yet, nothing is decided', () => {
    for (const l of SITE_LANGUAGES.filter((x): x is SuggestedLanguage => x !== 'en')) {
      expect(pageOffersLanguage(alternates(SITE_LANGUAGES), l), l).toBe(true);
      expect(pageOffersLanguage([], l), l).toBeNull();
      expect(pageOffersLanguage(['x-default'], l), l).toBeNull();
      expect(pageOffersLanguage([null, ''], l), l).toBeNull();
    }
  });

  it('agrees with the server for every published article: offered ⇔ no redirect back to English', () => {
    const articles = (blogData as { articles: Array<{ slug: string; status: string; publishedLocales?: string[] }> }).articles
      .filter((a) => a.status === 'published');
    const partial = articles.filter((a) => a.publishedLocales);
    expect(partial.map((a) => a.slug)).toEqual(expect.arrayContaining(['cycling-minho-portugal-guide', 'team-building-with-accommodation-portugal']));
    for (const article of articles) {
      const hreflangs = alternates(blogLanguages(article));
      for (const l of SITE_LANGUAGES.filter((x): x is SuggestedLanguage => x !== 'en')) {
        expect(pageOffersLanguage(hreflangs, l), `${article.slug} ${l}`).toBe(blogLanguageRedirect(article, l) === null);
      }
    }
  });

  it('the card decides from the page’s own alternates — after a client-side navigation, only once the new page has written them', () => {
    const card = fs.readFileSync(new URL('../client/src/components/layout/LanguageSuggestion.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/document\.querySelectorAll\('link\[rel="alternate"\]\[hreflang\]'\)/);
    // the landing page's alternates came with the HTML; after a navigation the previous page's are ignored
    expect(card).toMatch(/if \(location !== landingPage\.current\) leftLandingPage\.current = true;/);
    expect(card).toMatch(/let ownAlternates = !leftLandingPage\.current;/);
    expect(card).toMatch(/if \(records\.some\(\(record\) => Array\.from\(record\.addedNodes\)\.some\(isAlternateLink\)\)\) ownAlternates = true;/);
    const decide = card.slice(card.indexOf('const decide = () => {'), card.indexOf('const first = window.setTimeout(decide, 0);'));
    expect(decide).toMatch(/if \(!ownAlternates \|\| answered\.current\) return;/);
    expect(decide).toMatch(/const offered = pageOffersLanguage\(pageAlternates\(\), next\);\s*if \(offered === null\) return;/);
    expect(decide).toMatch(/setTarget\(offered \? next : null\);/);
    // Decided is not shown: the card may wait (the hero, the banner on a phone;
    // verificação final de 29 out, P5). The visit's marker and the page it
    // appeared on are written once it is on the page, never from decide().
    expect(decide).not.toContain('keepVisit');
    expect(card).toMatch(/if \(!visible\) return;\s*if \(shownOn\.current === null\) \{\s*shownOn\.current = location;\s*keepVisit\(\);\s*\}/);
    // decided after this render and again whenever the head changes, for a few seconds
    expect(card).toMatch(/const first = window\.setTimeout\(decide, 0\);/);
    expect(card).toMatch(/observer\.observe\(document\.head, \{ childList: true \}\);/);
    expect(card).toMatch(/window\.setTimeout\(\(\) => observer\.disconnect\(\), ALTERNATES_SETTLE_MS\)/);
    // once the visitor answers, a later change in the head never brings it back
    expect(card.match(/answered\.current = true;/g)?.length).toBe(2);
  });
});

// Revisão do PR #175, R2: at z-[91] the card covered the experience booking
// bar (BOOK NOW), the open Filters sheet ("Show N homes") and the open menu,
// and its × could not be clicked while a modal held the page.
describe('the card never covers a booking bar, a sheet or the menu', () => {
  const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const zOf = (source: string, pattern: RegExp) => {
    const m = source.match(pattern);
    expect(m, String(pattern)).not.toBeNull();
    return Number(m![1]);
  };
  const card = read('../client/src/components/layout/LanguageSuggestion.tsx');
  const cardZ = zOf(card, /className=\{`fixed z-\[(\d+)\]/);

  it('sits under every modal layer: dialogs, drawers, sheets, the menu, the cookie banner', () => {
    expect(card).not.toMatch(/z-\[91\]/);
    for (const [file, pattern] of [
      ['../client/src/components/ui/drawer.tsx', /fixed inset-0 z-(\d+) bg-black/],
      ['../client/src/components/ui/dialog.tsx', /fixed inset-0 z-(\d+) bg-black/],
      ['../client/src/components/ui/sheet.tsx', /fixed inset-0 z-(\d+) bg-black/],
      ['../client/src/components/layout/Header.tsx', /fixed inset-0 z-\[(\d+)\]/],
      ['../client/src/components/layout/CookieBanner.tsx', /fixed bottom-0 left-0 right-0 z-\[(\d+)\]/],
    ] as const) {
      expect(cardZ, file).toBeLessThan(zOf(read(file), pattern));
    }
  });

  it('sits over the page’s own bars and floats, and above the bar of a home or an experience on a phone', () => {
    expect(cardZ).toBeGreaterThan(zOf(read('../client/src/components/experience/ExperienceMobileBookingBar.tsx'), /lg:hidden fixed bottom-0 left-0 right-0 z-(\d+)/));
    expect(cardZ).toBeGreaterThan(zOf(read('../client/src/components/homes/ListingWhatsApp.tsx'), /fixed right-4 z-(\d+)/));
    for (const path of ['/homes/villa-x', '/experiences/horseback-riding', '/activities/canyoning']) {
      expect(hasBottomBookingBar(path), path).toBe(true);
    }
    for (const path of ['/', '/homes', '/experiences', '/blog/cycling-minho-portugal-guide', '/destinations/algarve']) {
      expect(hasBottomBookingBar(path), path).toBe(false);
    }
    // 6rem over the bar; the bar and the card both rise with the open banner.
    expect(card).toMatch(/aboveBookingBar\s*\?\s*'bottom-\[calc\(6rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
  });
});
