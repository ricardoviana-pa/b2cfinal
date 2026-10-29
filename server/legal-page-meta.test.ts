import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { __testing } from './_core/vite';
import { resolvePageMeta } from '@/lib/pageMeta';
import { LEGAL_META_LANGS, LEGAL_META_PATHS, legalPageMeta, type LegalMetaPath } from '../shared/legalPageMeta';

/* Auditoria 29 out 2026, Regression:P6: the privacy, terms and cookie pages
   had an English <title>, og:title and description in every language (only
   'en' in PAGE_META), and the pages wrote a second, different English string
   after a footer click. The cancellation page was localized on the server but
   English after a client-side navigation. */

const locale = (lng: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lng}.json`, 'utf8'));
const H1_KEY: Record<LegalMetaPath, [string, string]> = {
  '/legal/privacy': ['privacy', 'title'],
  '/legal/terms': ['terms', 'title'],
  '/legal/cookies': ['cookiesPage', 'title'],
  '/legal/cancellation-policy': ['cancellationPolicy', 'pageTitle'],
};
const PAGE_FILE: Record<LegalMetaPath, string> = {
  '/legal/privacy': 'client/src/pages/Privacy.tsx',
  '/legal/terms': 'client/src/pages/Terms.tsx',
  '/legal/cookies': 'client/src/pages/Cookies.tsx',
  '/legal/cancellation-policy': 'client/src/pages/CancellationPolicy.tsx',
};

describe('legal pages: title and description in the page language (Regression:P6)', () => {
  it.each(LEGAL_META_PATHS)('%s: the server title is the page H1 in all 9 languages', (path) => {
    const [ns, key] = H1_KEY[path];
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

  it.each(LEGAL_META_PATHS)('%s: the page asks usePageMeta for exactly what the server injected', (path) => {
    for (const lng of LEGAL_META_LANGS) {
      const server = __testing.getPageMeta(path, lng)!;
      const client = resolvePageMeta({ ...legalPageMeta(path, lng), url: path }, lng);
      expect(client.title, `${lng} ${path}`).toBe(server.title);
      expect(client.description, `${lng} ${path}`).toBe(server.description);
    }
  });

  it.each(LEGAL_META_PATHS)('%s: the page component passes the shared meta, not a hard-coded English string', (path) => {
    const src = fs.readFileSync(PAGE_FILE[path], 'utf8');
    expect(src).toMatch(new RegExp(`usePageMeta\\(\\{ \\.\\.\\.legalPageMeta\\('${path.replace(/\//g, '\\/')}', (i18n\\.language|lang)\\), url: '${path.replace(/\//g, '\\/')}' \\}\\)`));
    expect(src).not.toMatch(/usePageMeta\(\{\s*title: '/);
  });

  it('a regional or unknown language tag falls back sensibly', () => {
    expect(legalPageMeta('/legal/privacy', 'pt-PT').title).toBe('Política de Privacidade');
    expect(legalPageMeta('/legal/privacy', 'xx').title).toBe('Privacy Policy');
  });
});
