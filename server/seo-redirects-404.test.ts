/* ==========================================================================
   Soft 404s, aliases, one concierge hub and the owners redirect
   (auditoria out/2026: seo-health-soft-404-catchall,
   seo-health-concierge-services-duplicate, seo-health-owners-js-redirect /
   i18n-copy-11).
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { __testing as redirects, legacyRedirects, ownersRedirectTarget, redirectTarget } from './lib/redirects';
import { STATIC_SITEMAP_PAGES } from './lib/sitemap-static';
import { __testing as vite } from './_core/vite';
import { managementUrl } from '../client/src/lib/siteLinks';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];
const BLOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/src/data/blog.json'), 'utf8'));
const PUBLISHED = new Set<string>(BLOG.articles.filter((a: any) => a.status === 'published').map((a: any) => a.slug));

function middleware301(route: string, query = '') {
  const redirect = vi.fn();
  const next = vi.fn();
  legacyRedirects({ method: 'GET', path: route, url: `${route}${query}` } as any, { redirect } as any, next);
  return { redirect, next };
}

describe('the single-segment catch-all is an explicit list', () => {
  it.each([
    '/zz-audit-garbage-9431', '/en/zz-audit-garbage-9431', '/pt/qualquer-coisa', '/de/xyz',
    '/en/villas-portugal', '/totally-unknown-page/',
  ])('%s is not redirected (the page answers 404)', (p) => {
    expect(redirectTarget(p)).toBeNull();
  });

  it('every WordPress-era slug points at a published article or a live page', () => {
    const live = new Set(['/en', '/en/blog', '/en/homes', '/en/experiences', '/en/concierge', '/en/contact']);
    for (const [slug, target] of Object.entries(redirects.LEGACY_SLUG_REDIRECTS)) {
      const article = target.match(/^\/en\/blog\/([^/]+)$/)?.[1];
      if (article) expect(PUBLISHED.has(article), `${slug} → ${target}`).toBe(true);
      else expect(live.has(target), `${slug} → ${target}`).toBe(true);
      expect(redirectTarget(`/${slug}`)).toBe(target);
      expect(redirectTarget(`/${slug}/`)).toBe(target);
    }
  });

  it('keeps the legacy WordPress pages recorded with a trailing slash, without it too', () => {
    expect(redirectTarget('/complaint-book')).toBe('/en/contact');
    expect(redirectTarget('/dispute-resolution')).toBe('/en/contact');
    expect(redirectTarget('/home-2')).toBe('/en');
    expect(redirectTarget('/thisisrealportugal')).toBe('/en');
  });
});

describe('aliases', () => {
  it.each(LANGS)('/%s/villas → /%s/homes, privacy and terms → legal pages', (lang) => {
    expect(redirectTarget(`/${lang}/villas`)).toBe(`/${lang}/homes`);
    expect(redirectTarget(`/${lang}/privacy`)).toBe(`/${lang}/legal/privacy`);
    expect(redirectTarget(`/${lang}/privacy-policy`)).toBe(`/${lang}/legal/privacy`);
    expect(redirectTarget(`/${lang}/terms`)).toBe(`/${lang}/legal/terms`);
    expect(redirectTarget(`/${lang}/terms-and-conditions`)).toBe(`/${lang}/legal/terms`);
  });

  it('bare legacy legal URLs land on the English legal pages', () => {
    expect(redirectTarget('/privacy-policy')).toBe('/en/legal/privacy');
    expect(redirectTarget('/terms-and-conditions')).toBe('/en/legal/terms');
    expect(redirectTarget('/politica-de-privacidade')).toBe('/en/legal/privacy');
    expect(redirectTarget('/pt/privacidade')).toBe('/pt/legal/privacy');
    expect(redirectTarget('/villas')).toBe('/en/homes');
    expect(redirectTarget('/pt/casas')).toBe('/pt/homes');
    expect(redirectTarget('/fr/maisons')).toBe('/fr/homes');
  });

  it('matches lower-case: capitals go to the lower-case URL', () => {
    expect(redirectTarget('/en/Homes')).toBe('/en/homes');
    expect(redirectTarget('/en/Destinations')).toBe('/en/destinations');
    expect(redirectTarget('/pt/VILLAS')).toBe('/pt/homes');
    expect(redirectTarget('/en/Privacy')).toBe('/en/legal/privacy');
    expect(redirectTarget('/EN/homes')).toBe('/en/homes');
    expect(redirectTarget('/PT')).toBe('/pt');
    expect(redirectTarget('/Homes')).toBe('/en/homes');
  });

  it('leaves real routes alone', () => {
    for (const p of ['/en', '/en/homes', '/pt/blog', '/en/legal/privacy', '/en/concierge', '/en/corporate-retreats', '/en/homes/villa-aura-sauna-gym-5min-beach-city-738c68']) {
      expect(redirectTarget(p), p).toBeNull();
    }
  });

  it('the middleware answers 301 and keeps the query string', () => {
    const { redirect, next } = middleware301('/en/villas', '?utm_source=x');
    expect(redirect).toHaveBeenCalledWith(301, '/en/homes?utm_source=x');
    expect(next).not.toHaveBeenCalled();
    const pass = middleware301('/en/zz-audit-garbage-9431');
    expect(pass.redirect).not.toHaveBeenCalled();
    expect(pass.next).toHaveBeenCalledOnce();
  });
});

describe('unknown destination and booking URLs are real 404s', () => {
  it('destinations are a dynamic-content prefix (unknown slug → 404, noindex)', () => {
    expect(vite.DYNAMIC_CONTENT_PREFIXES).toContain('/destinations/');
  });

  it('only the booking pages the client has are served', () => {
    for (const p of ['/booking/confirmation/abc', '/booking/thank-you/GY-1', '/booking/balance/x1', '/booking/paypal-return', '/booking/klarna-return']) {
      expect(vite.BOOKING_ROUTE.test(p), p).toBe(true);
    }
    for (const p of ['/booking/zz-audit-none', '/booking/', '/booking/confirmation', '/booking/a/b/c']) {
      expect(vite.BOOKING_ROUTE.test(p), p).toBe(false);
    }
  });
});

describe('one concierge hub: /services → /concierge', () => {
  it.each(LANGS)('/%s/services 301s to /%s/concierge', (lang) => {
    expect(redirectTarget(`/${lang}/services`)).toBe(`/${lang}/concierge`);
    expect(redirectTarget(`/${lang}/services/`)).toBe(`/${lang}/concierge`);
    expect(redirectTarget(`/${lang}/concierge`)).toBeNull();
  });

  it('bare and legacy hub URLs go straight to /concierge (no chain)', () => {
    expect(redirectTarget('/services')).toBe('/en/concierge');
    expect(redirectTarget('/Services')).toBe('/en/concierge');
    expect(redirectTarget('/offer/some-old-offer')).toBe('/en/concierge');
  });

  it('service detail pages keep their URLs', () => {
    expect(redirectTarget('/en/services/private-chef')).toBeNull();
    expect(redirectTarget('/pt/services/airport-shuttle')).toBeNull();
  });

  it('the sitemap lists /concierge, not /services', () => {
    const locs = STATIC_SITEMAP_PAGES.map((p) => p.loc);
    expect(locs).toContain('/concierge');
    expect(locs).not.toContain('/services');
  });
});

describe('/owners → the owner site in the visitor\'s language (server-side 301)', () => {
  it.each([
    ['en', '/management/en/'], ['pt', '/management/'], ['fr', '/management/fr/'], ['es', '/management/es/'],
    ['it', '/management/it/'], ['de', '/management/de/'], ['nl', '/management/nl/'],
    // The owner site has no Swedish or Finnish edition (404 on 29 Oct 2026).
    ['sv', '/management/en/'], ['fi', '/management/en/'],
  ])('/%s/owners → %s', (lang, target) => {
    expect(redirectTarget(`/${lang}/owners`)).toBe(target);
    expect(redirectTarget(`/${lang}/owners/`)).toBe(target);
    expect(new URL(managementUrl(lang)).pathname).toBe(target);
  });

  it('bare and capitalised forms too, with the query kept', () => {
    expect(ownersRedirectTarget('/owners')).toBe('/management/en/');
    expect(ownersRedirectTarget('/PT/Owners')).toBe('/management/');
    const { redirect } = middleware301('/pt/owners', '?utm_campaign=owners');
    expect(redirect).toHaveBeenCalledWith(301, '/management/?utm_campaign=owners');
  });

  it('is out of the sitemap', () => {
    expect(STATIC_SITEMAP_PAGES.map((p) => p.loc)).not.toContain('/owners');
  });
});
