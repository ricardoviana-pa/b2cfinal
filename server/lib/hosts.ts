/**
 * Which hosts are the real site.
 *
 * dev.portugalactive.com serves the same pages as www, so without this it is a
 * second crawlable copy of the whole catalogue competing with the site that
 * matters. Two places act on it — the X-Robots-Tag middleware and the HTML
 * meta-robots injection — and they must never disagree: a host that is noindex
 * by header and "index, follow" in the markup is a contradiction a reviewer
 * has to stop and puzzle over, even though Google resolves it by taking the
 * more restrictive of the two.
 *
 * One definition, imported by both.
 */

const PRODUCTION_HOSTS = new Set(["www.portugalactive.com", "portugalactive.com"]);

/** True for the live site, and for local development (which no crawler sees). */
export function isProductionHost(hostHeader: string | undefined): boolean {
  const host = String(hostHeader || "").toLowerCase().split(":")[0];
  if (PRODUCTION_HOSTS.has(host)) return true;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** True for hosts that must stay out of the index — dev, previews, anything
 *  that is not the live site. */
export function isNonIndexableHost(hostHeader: string | undefined): boolean {
  return !isProductionHost(hostHeader);
}
