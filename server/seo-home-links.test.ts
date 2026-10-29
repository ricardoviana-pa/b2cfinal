/* ==========================================================================
   The home page links the concierge hub and the experiences page directly.

   Since PR #177 /{lang}/services 301s to /{lang}/concierge (one concierge
   hub), and /{lang}/adventures already 301'd to /{lang}/experiences. The home
   page's experience cards still linked /services#gastronomy, #wellness,
   #mobility and /adventures: 36 links to a redirect, 4 on each of the 9
   home pages, the site's most-linked pages (review of PR #177, after
   seo-health-internal-links-to-redirects). Rendered with the real SSR entry,
   as the server sends it.
   ========================================================================== */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { redirectTarget } from './lib/redirects';
import { render } from '../client/src/entry-server';

(globalThis as any).React = React;

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'];

describe('home page internal links', () => {
  it.each(LANGS)('/%s: no link to a URL the server redirects', async (lang) => {
    const { appHtml } = await render(`/${lang}`);
    const hrefs = [...appHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(hrefs.length).toBeGreaterThan(30);
    const internal = hrefs.filter((h) => h.startsWith(`/${lang}/`));
    const redirected = internal.filter((h) => redirectTarget(h.split(/[?#]/)[0]) !== null);
    expect(redirected).toEqual([]);
    expect(internal.filter((h) => /^\/[a-z]{2}\/(services|adventures)(?:[?#]|$)/.test(h))).toEqual([]);
  });

  it.each(LANGS)('/%s: the experience cards open the concierge sections and the experiences page', async (lang) => {
    const { appHtml } = await render(`/${lang}`);
    for (const section of ['gastronomy', 'wellness', 'mobility']) {
      expect(appHtml).toContain(`href="/${lang}/concierge#${section}"`);
    }
    expect(appHtml).toContain(`href="/${lang}/experiences"`);
  });

  it('the old hub still redirects, so old links and bookmarks keep working', () => {
    expect(redirectTarget('/pt/services')).toBe('/pt/concierge');
    expect(redirectTarget('/en/adventures')).toBe('/en/experiences');
  });
});
