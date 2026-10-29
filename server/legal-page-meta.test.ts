import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { __testing } from './_core/vite';
import { resolvePageMeta } from '@/lib/pageMeta';
import { LEGAL_META_LANGS, legalPageMeta, type PageMetaEntry } from '../shared/legalPageMeta';
import { cancellationPolicyPageMeta } from '../shared/cancellationPolicy';

/* Auditoria 29 out 2026, Regression:P6: the privacy, terms and cookie pages
   had an English <title>, og:title and description in every language (only
   'en' in PAGE_META), and the pages wrote a second, different English string
   after a footer click. The cancellation page was localized on the server but
   English after a client-side navigation.
   Revisão do PR #182 (F2): the cancellation page's meta lives with the policy
   (cancellationPolicyPageMeta), the other three in shared/legalPageMeta.ts. */

type LegalPath = '/legal/privacy' | '/legal/terms' | '/legal/cookies' | '/legal/cancellation-policy';
const PAGES: Record<LegalPath, {
  h1: [string, string];
  file: string;
  /** The page's own source of meta, as the component calls it. */
  meta: (lang: string) => PageMetaEntry;
  call: RegExp;
}> = {
  '/legal/privacy': {
    h1: ['privacy', 'title'], file: 'client/src/pages/Privacy.tsx',
    meta: (l) => legalPageMeta('/legal/privacy', l),
    call: /usePageMeta\(\{ \.\.\.legalPageMeta\('\/legal\/privacy', i18n\.language\), url: '\/legal\/privacy' \}\)/,
  },
  '/legal/terms': {
    h1: ['terms', 'title'], file: 'client/src/pages/Terms.tsx',
    meta: (l) => legalPageMeta('/legal/terms', l),
    call: /usePageMeta\(\{ \.\.\.legalPageMeta\('\/legal\/terms', i18n\.language\), url: '\/legal\/terms' \}\)/,
  },
  '/legal/cookies': {
    h1: ['cookiesPage', 'title'], file: 'client/src/pages/Cookies.tsx',
    meta: (l) => legalPageMeta('/legal/cookies', l),
    call: /usePageMeta\(\{ \.\.\.legalPageMeta\('\/legal\/cookies', i18n\.language\), url: '\/legal\/cookies' \}\)/,
  },
  '/legal/cancellation-policy': {
    h1: ['cancellationPolicy', 'pageTitle'], file: 'client/src/pages/CancellationPolicy.tsx',
    meta: (l) => cancellationPolicyPageMeta(l),
    call: /usePageMeta\(\{ \.\.\.cancellationPolicyPageMeta\(lang\), url: '\/legal\/cancellation-policy' \}\)/,
  },
};
const PATHS = Object.keys(PAGES) as LegalPath[];

const locale = (lng: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lng}.json`, 'utf8'));

describe('legal pages: title and description in the page language (Regression:P6)', () => {
  it.each(PATHS)('%s: the server title is the page H1 in all 9 languages', (path) => {
    const [ns, key] = PAGES[path].h1;
    const en = __testing.getPageMeta(path, 'en')!;
    for (const lng of LEGAL_META_LANGS) {
      const meta = __testing.getPageMeta(path, lng)!;
      expect(meta.title, `${lng} ${path}`).toBe(`${locale(lng)[ns][key]} | Portugal Active`);
      expect(meta.description.length, `${lng} ${path}`).toBeGreaterThan(60);
      expect(meta.description.length, `${lng} ${path}`).toBeLessThanOrEqual(155);
      if (lng !== 'en') {
        expect(meta.title, `${lng} ${path}`).not.toBe(en.title);
        expect(meta.description, `${lng} ${path}`).not.toBe(en.description);
      }
    }
  });

  it.each(PATHS)('%s: the page asks usePageMeta for exactly what the server injected', (path) => {
    for (const lng of LEGAL_META_LANGS) {
      const server = __testing.getPageMeta(path, lng)!;
      const client = resolvePageMeta({ ...PAGES[path].meta(lng), url: path }, lng);
      expect(client.title, `${lng} ${path}`).toBe(server.title);
      expect(client.description, `${lng} ${path}`).toBe(server.description);
    }
  });

  it.each(PATHS)('%s: the page component passes the shared meta, not a hard-coded English string', (path) => {
    const src = fs.readFileSync(PAGES[path].file, 'utf8');
    expect(src).toMatch(PAGES[path].call);
    expect(src).not.toMatch(/usePageMeta\(\{\s*title: '/);
  });

  it('a regional or unknown language tag falls back sensibly', () => {
    expect(legalPageMeta('/legal/privacy', 'pt-PT').title).toBe('Política de Privacidade');
    expect(legalPageMeta('/legal/privacy', 'xx').title).toBe('Privacy Policy');
    expect(cancellationPolicyPageMeta('de-AT').title).toBe('Stornierungsbedingungen');
    expect(cancellationPolicyPageMeta('xx').title).toBe('Cancellation Policies');
  });
});
