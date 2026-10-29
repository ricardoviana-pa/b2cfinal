/**
 * Query parameters that only carry attribution — ad click ids, campaign tags,
 * analytics linkers. They never change what a page renders: the browser reads
 * them from its own URL for measurement (shared/visit-origin.ts,
 * client/src/lib/datalayer.ts), and the server ignores them.
 *
 * Used to key the SSR render cache (every Google Ads click carries a unique
 * gclid, so each paid visit used to render the page from scratch and push a
 * real page out of the cache — auditoria out/2026,
 * performance-01-html-edge-cache / seo-health-tracking-params-bypass-cache),
 * and to keep redirects that echo such a query out of shared caches.
 *
 * The same list goes into the Cloudflare cache-key rule (PR "Fora do código").
 */
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Ads / Marketing Platform
  "gclid", "gclsrc", "gbraid", "wbraid", "dclid", "gad_source", "gad_campaignid",
  // Google Merchant / organic listing tags, Google Analytics cross-domain linker
  "srsltid", "_gl", "_ga",
  // Meta, Microsoft, TikTok, X, LinkedIn, Instagram, Yandex
  "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "igshid", "yclid",
  // Mailchimp
  "mc_cid", "mc_eid",
]);

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** utm_* plus the click ids and linkers above (case-insensitive). */
export function isTrackingParam(name: string): boolean {
  const n = decodeName(name);
  return n.startsWith("utm_") || TRACKING_PARAMS.has(n);
}

function splitUrl(url: string): { path: string; query: string; hash: string } {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const noHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const q = noHash.indexOf("?");
  return q === -1
    ? { path: noHash, query: "", hash }
    : { path: noHash.slice(0, q), query: noHash.slice(q + 1), hash };
}

/**
 * The URL without its tracking parameters. Every other parameter is kept
 * byte for byte and in order (no re-encoding), so the page renders exactly as
 * it would for the clean URL. Accepts a path ("/en/homes?x=1") or a bare query
 * ("?x=1").
 */
export function stripTrackingParams(url: string): string {
  const { path, query, hash } = splitUrl(url);
  if (!query) return `${path}${hash}`;
  const kept = query.split("&").filter((pair) => pair !== "" && !isTrackingParam(pair.split("=", 1)[0]));
  return `${path}${kept.length ? `?${kept.join("&")}` : ""}${hash}`;
}

/** True when the URL (or bare query) carries at least one tracking parameter. */
export function hasTrackingParams(url: string): boolean {
  const { query } = splitUrl(url);
  return !!query && query.split("&").some((pair) => pair !== "" && isTrackingParam(pair.split("=", 1)[0]));
}

/**
 * A redirect that copies the visitor's query into its Location must not be
 * stored by a shared cache once that cache ignores tracking parameters in its
 * key: the next visitor would be sent on with someone else's gclid. Harmless
 * today (Cloudflare keys on the full URL); required before the cache-key rule
 * in the PR is switched on.
 */
export function noStoreIfTracked(res: { setHeader?: (name: string, value: string) => unknown }, url: string): void {
  if (hasTrackingParams(url)) res.setHeader?.("Cache-Control", "private, no-store");
}

/**
 * The URL a page is rendered from, and the key of the SSR render cache: the
 * request URL without its tracking parameters (server/_core/vite.ts).
 */
export function ssrRenderUrl(originalUrl: string): string {
  return stripTrackingParams(originalUrl);
}
