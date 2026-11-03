import { runInNewContext } from 'node:vm';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptLanguagePreferences, LANGUAGE_CHOICE_COOKIE, preferredSiteLanguage, SITE_LANGUAGES } from '../shared/siteLanguage';
import { LANGUAGE_ENTRY_SCRIPT, languageEntryHtml, shouldSelectLanguage } from './lib/languageEntry';
import { detectPreferredLanguage, rememberLanguage } from '../client/src/lib/languagePreference';

afterEach(() => vi.unstubAllGlobals());

function visit({ path = '/', search = '', hash = '', browser = ['pt-PT', 'en'], chosen = null, cookie = '', storageBlocked = false }: {
  path?: string; search?: string; hash?: string; browser?: string[]; chosen?: string | null; cookie?: string; storageBlocked?: boolean;
} = {}) {
  let destination: string | null = null;
  const writes: string[] = [];
  const document = { get cookie() { return cookie; }, set cookie(value: string) { writes.push(value); } };
  runInNewContext(LANGUAGE_ENTRY_SCRIPT, {
    location: { pathname: path, search, hash, protocol: 'https:', replace(value: string) { destination = value; } },
    navigator: { languages: browser, language: browser[0] }, document,
    localStorage: { getItem() { if (storageBlocked) throw new Error('blocked'); return chosen; } },
  });
  return { destination, writes };
}

describe('automatic language entry — executes the exact script sent to browsers', () => {
  it('selects the first supported browser language, including regional variants', () => {
    expect(visit().destination).toBe('/pt');
    expect(visit({ browser: ['ja-JP', 'de-CH', 'en'] }).destination).toBe('/de');
    expect(visit({ browser: ['ru', 'nl-BE', 'fr'] }).destination).toBe('/nl');
    for (const language of SITE_LANGUAGES) {
      expect(visit({ browser: [`${language.toUpperCase()}-XX`] }).destination).toBe(`/${language}`);
    }
  });
  it('keeps every part of a booking/search link including its fragment', () => {
    expect(visit({ path: '/homes/casa', search: '?checkin=2027-05-10&checkout=2027-05-17&guests=1&utm_source=email', hash: '#availability' }).destination)
      .toBe('/pt/homes/casa?checkin=2027-05-10&checkout=2027-05-17&guests=1&utm_source=email#availability');
    expect(visit({ path: '/checkout/resume', search: '?resume=1', hash: '#pay' }).destination).toBe('/pt/checkout/resume?resume=1#pay');
  });
  it('preserves a previous manual choice, including old localStorage-only choices', () => {
    const result = visit({ chosen: 'en-GB', cookie: `${LANGUAGE_CHOICE_COOKIE}=fr` });
    expect(result.destination).toBe('/en');
    expect(result.writes).toEqual([`${LANGUAGE_CHOICE_COOKIE}=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure`]);
    expect(visit({ storageBlocked: true, cookie: `${LANGUAGE_CHOICE_COOKIE}=fr` }).destination).toBe('/fr');
    expect(visit({ chosen: 'invalid', cookie: `${LANGUAGE_CHOICE_COOKIE}=de` }).destination).toBe('/de');
  });
  it('does not save an automatically detected language as a manual choice', () => {
    expect(visit().writes).toEqual([]);
    expect(visit({ browser: ['ja'] })).toEqual({ destination: '/en', writes: [] });
    expect(visit({ browser: [] })).toEqual({ destination: '/en', writes: [] });
    expect(visit({ storageBlocked: true }).destination).toBe('/pt');
  });
  it('never changes explicit localized links, even against browser and saved preferences', () => {
    for (const language of SITE_LANGUAGES) {
      expect(visit({ path: `/${language}/homes`, chosen: 'fr', browser: ['de'] })).toEqual({ destination: null, writes: [] });
      expect(shouldSelectLanguage(`/${language}/homes`)).toBe(false);
    }
  });
  it('cannot redirect away from the site through a path or query', () => {
    const target = visit({ path: '//evil.example/path', search: '?next=https://evil.example' }).destination!;
    expect(new URL(target, 'https://www.portugalactive.com').origin).toBe('https://www.portugalactive.com');
  });
});

describe('server fallback and independent services', () => {
  it('honours weighted Accept-Language and an explicit choice with JavaScript disabled', () => {
    expect(acceptLanguagePreferences('en;q=0.2, ja;q=1, fr-CA;q=0.9,pt;q=0')).toEqual(['ja', 'fr-CA', 'en']);
    expect(preferredSiteLanguage(acceptLanguagePreferences('en;q=0.2,fr-CA;q=0.9'))).toBe('fr');
    expect(languageEntryHtml('/homes', '?guests=2', 'fr-CA,pt;q=0.5')).toContain('<noscript><meta http-equiv="refresh" content="0;url=/fr/homes?guests=2"></noscript>');
    expect(languageEntryHtml('/', '', 'fr', `${LANGUAGE_CHOICE_COOKIE}=pt`)).toContain('content="0;url=/pt"');
    expect(languageEntryHtml('/', '', 'ja')).toContain('content="0;url=/en"');
  });
  it('escapes untrusted URLs in HTML and never inserts them into the script', () => {
    const html = languageEntryHtml('/homes', '?x="</script><script>alert(1)</script>&guests=2', 'pt');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&quot;&lt;/script&gt;');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain('rel="canonical" href="https://www.portugalactive.com/en/homes"');
  });
  it('does not intercept APIs, files, assets or independently routed business sites', () => {
    for (const path of ['/api', '/api/trpc/x', '/assets/a.js', '/files/download', '/robots.txt', '/.well-known/security.txt', '/management', '/management/pt/', '/realestate', '/real-estate/pt/']) {
      expect(shouldSelectLanguage(path), path).toBe(false);
    }
    expect(shouldSelectLanguage('/')).toBe(true);
    expect(shouldSelectLanguage('/homes/casa')).toBe(true);
  });
  it('the production entry is uncacheable at browser and CDN, preserving crawler x-default', () => {
    const source = fs.readFileSync(new URL('./_core/vite.ts', import.meta.url), 'utf8');
    const entry = source.slice(source.indexOf('// First visits use navigator.languages;'), source.indexOf('/** Extract the locale prefix', source.indexOf('// First visits use navigator.languages;')));
    expect(entry).toContain("'Cache-Control': 'private, no-store'");
    expect(entry).toContain("'CDN-Cache-Control': 'no-store'");
    expect(entry).toContain("'Cloudflare-CDN-Cache-Control': 'no-store'");
    expect(entry).toContain("if (BOT_UA_RE.test(req.headers['user-agent'] || ''))");
    expect(entry).toContain("return res.redirect(301, `/en${p === '/' ? '' : p}${query}`)");
  });
});

describe('a language picked by the visitor survives the next entry', () => {
  it('the language switcher preference is independently persisted to storage and the no-JS cookie', () => {
    const state = new Map<string, string>();
    const document = { cookie: '' };
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => state.set(key, value), getItem: (key: string) => state.get(key) });
    vi.stubGlobal('document', document);
    vi.stubGlobal('location', { protocol: 'https:' });
    vi.stubGlobal('navigator', { languages: ['pt-PT'], language: 'pt-PT' });
    rememberLanguage('fr');
    expect(state.get('i18nextLng')).toBe('fr');
    expect(document.cookie).toBe('pa-site-language=fr; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(detectPreferredLanguage()).toBe('fr');
  });
  it('blocked localStorage still retains the deliberate choice in the cookie', () => {
    const document = { cookie: '' };
    vi.stubGlobal('localStorage', { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); } });
    vi.stubGlobal('document', document);
    vi.stubGlobal('location', { protocol: 'https:' });
    vi.stubGlobal('navigator', { languages: ['pt-PT'], language: 'pt-PT' });
    expect(() => rememberLanguage('de')).not.toThrow();
    expect(detectPreferredLanguage()).toBe('de');
  });
  it('both stores blocked still allows automatic detection without an exception', () => {
    vi.stubGlobal('localStorage', { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); } });
    vi.stubGlobal('document', { get cookie() { throw new Error('blocked'); }, set cookie(_value: string) { throw new Error('blocked'); } });
    vi.stubGlobal('location', { protocol: 'https:' });
    vi.stubGlobal('navigator', { languages: ['ja', 'sv-SE'], language: 'ja' });
    expect(() => rememberLanguage('de')).not.toThrow();
    expect(detectPreferredLanguage()).toBe('sv');
  });
});
