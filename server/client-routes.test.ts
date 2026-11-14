/* ==========================================================================
   Which URLs are pages (auditoria de 14 nov 2026, segunda ronda técnica).

   /en/404 answered 200, "index, follow", with the public cache headers,
   because "/404" was on the server's list of known pages; /en/checkout/a/b
   answered 200 through the "/checkout/" prefix. The list now lives in
   server/lib/clientRoutes.ts and this file keeps it in step with the router
   in client/src/App.tsx, so a page added on one side and forgotten on the
   other fails here instead of in production.

   The HTTP side (status, noindex, cache headers, redirects untouched) is in
   server/perf-ssr-html.test.ts, on a fixture build.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKING_ROUTE, CHECKOUT_ROUTE, KNOWN_PREFIXES, KNOWN_ROUTES, clientPageStatus, normalisePagePath } from './lib/clientRoutes';
import { redirectTarget } from './lib/redirects';
import { __testing as vite } from './_core/vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'client/src/App.tsx'), 'utf8');
/** Every <Route path="…"> of the public router, in order. */
const APP_ROUTES = [...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const sample = (route: string) => route.replace(/:[a-zA-Z]+/g, 'sample-slug');

/** Routes App.tsx has that the server answers 404 for, each for a reason. */
const NOT_A_PAGE: Record<string, string> = {
  // The "not found" screen itself: it must say 404, like any unknown URL.
  '/404': 'the not-found screen is not a page',
  // A stub that forwards to the owner site in JavaScript. The server has
  // never listed it (it answers 404 + noindex and the app then redirects).
  // Left exactly as it was: making it a 200 or a 301 is a separate decision.
  '/owners-portal': 'client-side forward to the owner site, unchanged',
};

describe('the server knows the pages App.tsx has', () => {
  it('reads the router', () => {
    expect(APP_ROUTES.length).toBeGreaterThanOrEqual(35);
    expect(APP_ROUTES).toContain('/homes/:slug');
    expect(APP_ROUTES).toContain('/checkout/:intentId');
  });

  it.each(APP_ROUTES.filter((r) => !(r in NOT_A_PAGE)))('%s may answer 200', (route) => {
    expect(clientPageStatus(sample(route))).toBe(200);
  });

  it.each(Object.keys(NOT_A_PAGE))('%s is in the router and answers 404', (route) => {
    expect(APP_ROUTES).toContain(route);
    expect(clientPageStatus(route)).toBe(404);
  });

  it('lists no page the router does not have', () => {
    for (const route of KNOWN_ROUTES) expect(APP_ROUTES, route).toContain(route);
    for (const prefix of KNOWN_PREFIXES) {
      const section = prefix.slice(0, -1);
      const hasChild = APP_ROUTES.some((r) => r.startsWith(prefix));
      const isNested = new RegExp(`<Route path="${section}" nest `).test(APP);
      expect(hasChild || isNested, prefix).toBe(true);
    }
  });

  it('the app still renders the not-found screen for /404 and for anything unmatched', () => {
    expect(APP).toContain('<Route path="/404" component={NotFound} />');
    expect(APP).toMatch(/<Route component=\{NotFound\} \/>\s*<\/Switch>/);
  });
});

describe('what is not a page answers 404', () => {
  it.each([
    '/404', '/404/extra', '/zz-audit-none-1114', '/about/extra', '/login/extra', '/account/extra', '/faq/x',
    '/legal', '/legal/zz', '/collections', '/activities', '/checkout', '/booking', '/homes-old',
    '/api/unknown', '/foo.php',
  ])('%s', (p) => {
    expect(clientPageStatus(p)).toBe(404);
  });

  it('checkout is /checkout/<intent> and nothing deeper', () => {
    for (const p of ['/checkout/abc123', '/checkout/demo', '/checkout/3f2a9c1e-77aa-4c1d-9d0e-2b1f5a6c7d8e']) {
      expect(clientPageStatus(p), p).toBe(200);
      expect(CHECKOUT_ROUTE.test(p), p).toBe(true);
    }
    for (const p of ['/checkout/a/b', '/checkout/a/b/c', '/checkout/']) {
      expect(clientPageStatus(p), p).toBe(404);
    }
  });

  it('booking keeps the pages it had (same pattern, moved to lib/clientRoutes.ts)', () => {
    expect(vite.BOOKING_ROUTE).toBe(BOOKING_ROUTE);
    for (const p of ['/booking/confirmation/abc', '/booking/thank-you/GY-1', '/booking/balance/x1', '/booking/paypal-return', '/booking/klarna-return']) {
      expect(clientPageStatus(p), p).toBe(200);
    }
    for (const p of ['/booking/zz-audit-none', '/booking/confirmation', '/booking/a/b/c']) {
      expect(clientPageStatus(p), p).toBe(404);
    }
  });

  it('content sections start as 200: the record lookup decides (DYNAMIC_CONTENT_PREFIXES)', () => {
    for (const prefix of vite.DYNAMIC_CONTENT_PREFIXES) {
      expect(KNOWN_PREFIXES, prefix).toContain(prefix);
      expect(clientPageStatus(`${prefix}zz-no-such-record`), prefix).toBe(200);
    }
  });
});

describe('redirects are untouched', () => {
  it('/404 and unknown paths are still not redirected anywhere', () => {
    for (const p of ['/404', '/en/404', '/pt/404', '/en/zz-audit-none-1114', '/en/checkout/a/b']) {
      expect(redirectTarget(p), p).toBeNull();
    }
  });

  it('the routes the server forwards keep their 301', () => {
    expect(redirectTarget('/en/services')).toBe('/en/concierge');
    expect(redirectTarget('/pt/owners')).toBe('/management/');
    expect(redirectTarget('/en/villas')).toBe('/en/homes');
  });
});

describe('normalisePagePath', () => {
  it('drops empty segments and trailing slashes', () => {
    expect(normalisePagePath('/')).toBe('/');
    expect(normalisePagePath('')).toBe('/');
    expect(normalisePagePath('/homes/')).toBe('/homes');
    expect(normalisePagePath('//homes//casa/')).toBe('/homes/casa');
    expect(normalisePagePath('/404')).toBe('/404');
  });
});
