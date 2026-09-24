/**
 * Field Core Web Vitals, first-party.
 *
 * Search Console reports mobile LCP > 2.5 s and INP > 200 ms for the whole
 * site, but not which element or which tap is slow. Lab runs (Lighthouse)
 * can't answer that either: INP only exists on real devices with real taps.
 * This sends each page view's LCP / INP / CLS / FCP / TTFB, with the
 * attribution web-vitals computes (the element, the slow phase, the longest
 * script), to /api/vitals. `npm run report:vitals` reads it back.
 *
 * Anonymous by construction: no cookies, no storage, no ids, no query string.
 * Only the route template, language, device class and connection type.
 */
import { isLiveSiteHostname } from '@shared/deployment';

type Row = Record<string, string | number | undefined>;

const LOCALES = new Set(['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']);

/** /pt/homes/villa-aura-738c68 → { lang: 'pt', page: '/homes/:slug' }. */
export function routeTemplate(pathname: string): { lang: string; page: string } {
  const parts = pathname.split('/').filter(Boolean);
  const lang = parts[0] && LOCALES.has(parts[0]) ? parts.shift()! : '';
  const [first, second] = parts;
  let page: string;
  if (!first) page = '/';
  else if (second && ['homes', 'blog', 'destinations', 'experiences', 'services', 'collections'].includes(first)) page = `/${first}/:slug`;
  else if (first === 'checkout' || first === 'booking' || first === 'account') page = `/${first}`;
  else page = `/${parts.slice(0, 2).join('/')}`;
  return { lang, page: page.slice(0, 80) };
}

const trim = (s: unknown, n = 160) => (typeof s === 'string' ? s.slice(0, n) : undefined);
const ms = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined);

function scriptSource(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url) return undefined;
  try {
    const u = new URL(url, location.href);
    // Our hashed chunks collapse to their name; third parties keep their host.
    return u.host === location.host ? u.pathname.replace(/-[A-Za-z0-9_]{8}\.js$/, '.js') : `${u.host}${u.pathname}`.slice(0, 120);
  } catch { return trim(url, 120); }
}

export function startVitals(): void {
  if (typeof window === 'undefined' || !isLiveSiteHostname(location.hostname)) return;
  if (!('sendBeacon' in navigator)) return;

  const queue: Row[] = [];
  const { lang, page } = routeTemplate(location.pathname);
  const device = window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
  const conn = trim((navigator as any).connection?.effectiveType, 8);

  const flush = () => {
    if (!queue.length) return;
    const body = JSON.stringify(queue.splice(0));
    navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' }));
  };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);

  const push = (metric: { name: string; value: number; rating: string }, extra: Row) => {
    queue.push({ m: metric.name, v: metric.name === 'CLS' ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value), r: metric.rating, p: page, l: lang, d: device, c: conn, ...extra });
  };

  import('web-vitals/attribution').then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
    onLCP(m => push(m, {
      t: trim(m.attribution.target),
      ttfb: ms(m.attribution.timeToFirstByte), rld: ms(m.attribution.resourceLoadDelay),
      rlt: ms(m.attribution.resourceLoadDuration), erd: ms(m.attribution.elementRenderDelay),
    }));
    onINP(m => {
      const a = m.attribution;
      const s = a.longestScript;
      push(m, {
        t: trim(a.interactionTarget), y: a.interactionType,
        id: ms(a.inputDelay), pd: ms(a.processingDuration), pr: ms(a.presentationDelay),
        ls: a.loadState,
        ss: scriptSource(s?.entry?.sourceURL), si: trim(s?.entry?.invoker, 80), sd: ms(s?.intersectingDuration),
      });
    });
    onCLS(m => push(m, { t: trim(m.attribution.largestShiftTarget) }));
    onFCP(m => push(m, {}));
    onTTFB(m => push(m, {}));
  }).catch(() => { /* measurement is best effort */ });
}
