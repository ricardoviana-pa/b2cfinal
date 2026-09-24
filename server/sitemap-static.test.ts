import { describe, expect, it } from 'vitest';
import { redirectTarget } from './lib/redirects';
import { STATIC_SITEMAP_PAGES } from './lib/sitemap-static';

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

describe('sitemap lists only URLs that are served as is', () => {
  it.each(LANGS)('no fixed %s route is a legacy redirect', (lang) => {
    const redirecting = STATIC_SITEMAP_PAGES
      .map((p) => `/${lang}${p.loc === '/' ? '' : p.loc}`)
      .filter((loc) => redirectTarget(loc));
    expect(redirecting).toEqual([]);
  });

  it('lists /experiences, the page /adventures redirects to', () => {
    expect(redirectTarget('/pt/adventures')).toBe('/pt/experiences');
    expect(STATIC_SITEMAP_PAGES.map((p) => p.loc)).toContain('/experiences');
    expect(STATIC_SITEMAP_PAGES.map((p) => p.loc)).not.toContain('/adventures');
  });

  it('redirectTarget answers null for a page served as is', () => {
    expect(redirectTarget('/es/homes')).toBeNull();
    expect(redirectTarget('/en/corporate-retreats')).toBeNull();
  });
});
