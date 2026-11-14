/**
 * The pages the browser app has (<Router> in client/src/App.tsx), as far as
 * the server can tell from the path alone: what may answer 200 and what is a
 * 404 before any content is looked up. server/client-routes.test.ts reads
 * App.tsx and fails when the two tables stop agreeing.
 *
 * Paths here have no locale ("/homes", never "/en/homes").
 *
 * "/404" is deliberately NOT a page. It used to be listed, so /en/404 (and
 * the other eight languages) answered 200, "index, follow", with the public
 * cache headers and 19 hreflang alternates, while showing "page not found"
 * (auditoria de 14 nov 2026). It now falls where every unknown URL falls:
 * status 404, noindex, no hreflang, no-store. The screen is the same one: the
 * app's catch-all route renders it.
 */
export const KNOWN_ROUTES: ReadonlySet<string> = new Set([
  "/", "/homes", "/about", "/contact", "/services", "/adventures",
  "/events", "/corporate-retreats", "/blog", "/faq", "/careers", "/owners", "/login", "/account",
  "/legal/privacy", "/legal/terms", "/legal/cookies", "/legal/cancellation-policy", "/admin",
  "/destinations", "/experiences", "/concierge", "/best-rate-guarantee",
]);

/** Sections whose pages are decided further on: content pages by a lookup
 *  (a slug that matches no record ends as a 404, see DYNAMIC_CONTENT_PREFIXES
 *  in _core/vite.ts), booking and checkout by their shape below, and /admin/…
 *  by the admin area's own router, which the server does not mirror. */
export const KNOWN_PREFIXES: readonly string[] = [
  "/homes/", "/collections/", "/destinations/", "/blog/", "/services/", "/admin/",
  "/booking/", "/experiences/", "/activities/", "/checkout/",
];

/** The booking pages the client actually has; any other /booking/… is a 404
 *  (it answered 200, "index, follow"). All of them are noindex. */
export const BOOKING_ROUTE = /^\/booking\/(?:(?:confirmation|thank-you|balance)\/[^/]+|paypal-return|klarna-return)\/?$/;

/** /checkout/<intent id> and nothing deeper: /checkout/a/b matched the
 *  "/checkout/" prefix and answered 200 for a URL the app has no page for. */
export const CHECKOUT_ROUTE = /^\/checkout\/[^/]+\/?$/;

/**
 * 200 when the app has (or may have) a page at this path, 404 when it
 * certainly has not. A 200 here is only the starting point for content
 * sections: the HTML handler still turns an unknown home, article, service,
 * experience, collection or destination into a 404.
 */
export function clientPageStatus(strippedPath: string): 200 | 404 {
  const known = KNOWN_ROUTES.has(strippedPath) || KNOWN_PREFIXES.some((pre) => strippedPath.startsWith(pre));
  if (!known) return 404;
  if (strippedPath.startsWith("/booking/") && !BOOKING_ROUTE.test(strippedPath)) return 404;
  if (strippedPath.startsWith("/checkout/") && !CHECKOUT_ROUTE.test(strippedPath)) return 404;
  return 200;
}

/** "/homes/" → "/homes", "//homes" → "/homes", "" → "/": the same clean-up
 *  the HTML handler applies to a path once its locale is removed. */
export function normalisePagePath(pathname: string): string {
  return "/" + pathname.split("/").filter(Boolean).join("/");
}
