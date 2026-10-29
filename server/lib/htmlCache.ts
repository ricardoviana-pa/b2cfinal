/**
 * Cache headers for the HTML document.
 *
 * The HTML is identical for every visitor of a URL (no Set-Cookie; per-user
 * state is fetched client-side), so public pages can be held by Cloudflare —
 * that turns a 0.3–0.9 s origin round trip into an edge hit.
 *
 * Browsers: `Cache-Control: public, max-age=0, …` keeps them revalidating, so
 * a visitor never runs stale HTML that points at /assets hashes a deploy has
 * replaced. (Unchanged.)
 *
 * Cloudflare reads `CDN-Cache-Control` first and then ignores Cache-Control
 * for its own caching (developers.cloudflare.com/cache/concepts/cdn-cache-control).
 * That matters because the `s-maxage` in Cache-Control implies
 * proxy-revalidate, and with it Cloudflare refuses BOTH stale-while-revalidate
 * and stale-if-error (cache/concepts/revalidation, "Directives that disable
 * stale-while-revalidate") — which is why `stale-while-revalidate=120` never
 * did anything and the edge answered every expired page with EXPIRED /
 * REVALIDATED (auditoria out/2026, performance-01-html-edge-cache).
 *
 * What the edge gets, deliberately:
 * - `max-age=60`: the same 60 s as before. Not longer: a deploy replaces
 *   /assets/*, the old build's files are gone from the origin (an old bundle
 *   answers 404 there), and the boot purge in services/cdn-purge.ts is not
 *   running in production (on 29 Oct 2026 an old bundle was still a HIT at the
 *   edge, age 11 011 s, four deploys later). Longer-lived HTML would point at
 *   files that no longer exist.
 * - no stale-while-revalidate, for the same reason: it would let the edge
 *   serve HTML up to 60 + N seconds old after a deploy.
 * - `stale-if-error=86400`: when the origin answers 5xx or cannot be reached
 *   (the 502 windows of 28 Oct, Render restarts), Cloudflare serves the last
 *   good copy instead of an error page (auditoria out/2026,
 *   performance-11-502-on-origin-restart). A 404 is not an error for this.
 *
 * If Cloudflare did not honour the CDN header it would fall back to
 * Cache-Control, which keeps today's s-maxage=60, so nothing gets worse.
 */

/** Routes whose HTML must never be shared between visitors or held at the
 *  edge — anything behind auth or tied to a single booking/payment. */
export const NEVER_CACHE_PREFIXES = ["/account", "/login", "/admin", "/owners-portal", "/checkout", "/booking"];

export const PUBLIC_HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=120";
export const PUBLIC_HTML_CDN_CACHE_CONTROL = "public, max-age=60, stale-if-error=86400";

export function isPrivateHtmlPath(strippedPath: string): boolean {
  return NEVER_CACHE_PREFIXES.some((pre) => strippedPath.startsWith(pre));
}

/** The headers for an HTML response at `strippedPath` (locale removed). */
export function htmlCacheHeaders(strippedPath: string, status: number): Record<string, string> {
  if (status !== 200 || isPrivateHtmlPath(strippedPath)) {
    return { "Cache-Control": "private, no-store" };
  }
  return {
    "Cache-Control": PUBLIC_HTML_CACHE_CONTROL,
    "CDN-Cache-Control": PUBLIC_HTML_CDN_CACHE_CONTROL,
  };
}
