import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { pathInLanguage, SITE_LANGUAGES, siteLanguage, suggestedLanguage, SUGGESTION_COPY } from '@/lib/languageSuggestion';

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

describe('no redirect, nothing for crawlers', () => {
  it('the root still 301s to /en for everyone (x-default); the suggestion only runs in the browser after mount', () => {
    const vite = fs.readFileSync(new URL('./_core/vite.ts', import.meta.url), 'utf8');
    expect(vite).toMatch(/return res\.redirect\(301, `\/en\$\{p === '\/' \? '' : p\}\$\{query\}`\);/);
    expect(vite).not.toMatch(/accept-language/i);
    const card = fs.readFileSync(new URL('../client/src/components/layout/LanguageSuggestion.tsx', import.meta.url), 'utf8');
    expect(card).toMatch(/useState<SuggestedLanguage \| null>\(null\)/);
    expect(card).toMatch(/useEffect\(/);
    expect(card).toMatch(/navigator\.languages/);
    // Fixed, so appearing shifts no content; above the cookie banner.
    expect(card).toMatch(/className=\{`fixed /);
    expect(card).toMatch(/var\(--cookie-banner-h,0px\)/);
    expect(fs.readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8')).toMatch(/<LanguageSuggestion \/>/);
  });
});
