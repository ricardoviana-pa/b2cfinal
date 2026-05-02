import { Request, Response, NextFunction } from "express";

/**
 * SEO 301 redirects for the 2026 Webflow → React migration.
 *
 * Source: Wayback Machine inventory of portugalactive.com URLs indexed by Google,
 * cross-referenced with the new properties.json / experiences / services slug lists.
 *
 * Strategy:
 * 1. Exact map (PROPERTY_REDIRECTS, STATIC_REDIRECTS) — fastest, takes priority.
 * 2. Pattern rules (PATTERN_REDIRECTS) — for parametric paths (/rooms/X, /event/X, ...).
 * 3. Fallback rules (CATCH_ALL) — for legacy noise (.html, /index.php, /category/*, ...).
 * 4. If nothing matches: pass through to the SPA, which renders 404 if route not found.
 *
 * All redirects are 301 (permanent) so Google transfers ranking signal to the new URL.
 */

// === PROPERTIES ===========================================================
// Old Webflow /properties/<slug> AND old WP /rooms/<slug> → new /homes/<slug>
// Slugs that don't map to a current home redirect to /homes index (preserves session, avoids 404).
const PROPERTY_REDIRECTS: Record<string, string> = {
  "abreu-retreat-palace": "abreu-retreat-palace-luxury-elegance-leisure-e914e2",
  "atlantic-lodge": "portugal-active-atlantic-lodge-sea-view-premium-10dd49",
  "bandeira-retreat": "portugal-active-bandeira-retreat-7f5428",
  "beach-flat": "portugal-active-beach-flat-bb2460",
  "blue-tile-hideaway": "blue-tile-hideaway-by-portugal-active-24acf6",
  "bluegreen-beach-apartment": "portugal-active-bluegreen-beach-apartment-92fdbb",
  "blue-green": "portugal-active-bluegreen-beach-apartment-92fdbb",
  "cabedelo-beach-duplex": "ocean-view-cabedelo-beach-duplex-10d5ee",
  "cabedelo-beachfront": "ocean-view-cabedelo-beach-duplex-10d5ee",
  "cabedelo-beach-lodge": "portugal-active-cabedelo-beach-lodge-heated-pool-16f0b2",
  "calejo-house": "calejo-house-pool-sports-grill-retreat-6e8502",
  "carrecos-beach-farm": "beach-farm-pool-and-jacuzzi-with-sea-view-83ef5f",
  "classic-meets-modern": "classic-meets-modern-downtown-balcony-retreat-68a505",
  "coastal-horizon": "coastal-horizon-by-portugal-active-fd1b52",
  "countryside-house": "countryside-house-near-the-beach-and-city-center-24a570",
  "divine-waves-duplex": "divine-waves-duplex-by-portugal-active-97c8e4",
  "eben-lodge": "portugal-active-eben-lodge-heated-pool-10ecfe",
  "fountain-retreat": "fountain-retreat-i-pool-sports-escape-743e2d",
  "framed-corner": "framed-corner-by-portugal-active-ed2c2d",
  "habitos-lodge": "habito-s-lodge-by-portugalactive-5min-beach-town-1e8cd6",
  "heritage-loft": "heritage-loft-in-the-cradle-of-portugal-7440f8",
  "invictus-escape": "invictus-escape-jacuzzi-charm-in-the-city-24abad",
  "lighthouse": "lighthouse-view-by-portugal-active-ed2d6c",
  "lima-river---s-salvador-house": "lima-river-s-salvador-house-5cef22",
  "lima-river-s-salvador-house": "lima-river-s-salvador-house-5cef22",
  "lima-river---s-silvestre-house": "lima-river-s-silvestre-house-e28802",
  "lima-river-s-silvestre-house": "lima-river-s-silvestre-house-e28802",
  "lima-river-houses": "lima-river-houses-by-portugal-active-7431cb",
  "luxury-and-nature-retreat": "luxury-and-nature-retreat-w-pool-jacuzzi-bbq-5cfd96",
  "moledo-front-beach": "moledo-front-beach-w-sunset-views-and-pool-eaa850",
  "moledo-beach-house": "moledo-front-beach-w-sunset-views-and-pool-eaa850",
  "montaria-lodge": "montaria-lodge-by-portugal-active-742da8",
  "nature-hill-duo": "portugal-active-nature-hill-duo-10-min-beach-742743",
  "ocean-bliss": "ocean-bliss-beach-bbq-apartment-5fe4bf",
  "oliveiras-farm": "portugal-active-oliveira-s-farm-01b62e",
  "rose-dream-boat": "ros-dream-boat-up-to-4-guests-bb2b42",
  "salty-escape": "salty-escape-by-portugal-active-01c7b8",
  "sao-juliao-retreat": "s-o-juli-o-retreat-pool-jacuzzi-garden-escape-743511",
  "seabreeze-duplex": "seabreeze-duplex-beach-terrace-e917bf",
  "seaside-urban-retreat": "seaside-urban-retreat-5min-to-esposende-beach-e9167c",
  "shoreline-escape": "shoreline-escape-by-portugal-active-5cfb02",
  "skyline-retreat": "skyline-retreat-with-pool-by-portugal-active-026d70",
  "slow-living-countryside-house": "slow-living-countryside-house-by-portugal-active-10e1c1",
  "stars-view": "stars-view-by-portugal-active-026fa9",
  "stone-by-the-sea": "stone-by-the-sea-mountain-beach-retreat-w-pool-7437cd",
  "sunset-beach-lodge": "portugal-active-sunset-beach-lodge-heated-pool-5ceb91",
  "the-mill-retreat": "century-old-watermill-on-the-river-beach-by-portugal-active-47452c",
  "tide-terrace-duplex": "tide-terrace-duplex-sea-escape-e28965",
  "urban-reflections": "urban-reflections-by-portugal-active-e919c6",
  "venade-mountain-house": "stone-by-the-sea-mountain-beach-retreat-w-pool-7437cd",
  "villa-luzia": "villa-luzia-by-portugal-active-5fee01",
  "white-charm-by-the-sea": "white-charm-by-the-sea-5fecb6",
  "yellow-breeze-apartament": "yellow-breeze-apartament-5cf0fc",
  "yellow-breeze-apartment": "yellow-breeze-apartament-5cf0fc",
};

// === ADVENTURES / EXPERIENCES =============================================
const EXPERIENCE_REDIRECTS: Record<string, string> = {
  "canyoning": "canyoning",
  "can-am-experience": "can-am-buggy",
  "fat-bike-wild-tour": "ebike-tours",
  "city-mountain-bike-tour": "ebike-tours",
  "e-bike-wild-tour": "ebike-tours",
  "e-bike-tour": "ebike-tours",
  "hike-dive-dine": "hike-dive-dine",
  "trek-dive-dine": "hike-dive-dine",
  "horseback-riding": "horseback-riding",
  "horse": "horseback-riding",
  "sailing-experience": "sailing",
  "stand-up-paddle-experience": "stand-up-paddle",
  "sun-sup-experience": "stand-up-paddle",
  "sailing-": "sailing",
};

// === SERVICES / OFFERS ====================================================
const SERVICE_REDIRECTS: Record<string, string> = {
  "airport-shuttle": "airport-shuttle",
  "babysitter": "babysitter",
  "grocery-setup": "grocery-delivery",
  "grocery-setup-and-delivery": "grocery-delivery",
  "massage-therapist": "in-villa-spa",
  "personal-trainer": "personal-training",
  "private-chauffeur": "airport-shuttle",
  "private-chef": "private-chef",
  "private-yoga": "private-yoga",
  "private-yoga-session": "private-yoga",
};

// === LOCATIONS → DESTINATIONS =============================================
const LOCATION_REDIRECTS: Record<string, string> = {
  "algarve-portugal": "algarve",
  "arcos-de-valdevez-portugal": "minho",
  "barcelos-potugal": "minho",
  "caminha-portugal": "minho",
  "esposende-portugal": "minho",
  "fafe-portugal": "minho",
  "guimaraes-portugal": "minho",
  "moimenta-da-beira-portugal": "porto",
  "ponte-de-lima-portugal": "minho",
  "porto-portugal": "porto",
  "viana-do-castelo-portugal": "minho",
  "vila-nova-de-famalicao-portugal": "minho",
};

// === STATIC PAGE REDIRECTS ================================================
const STATIC_REDIRECTS: Record<string, string> = {
  // Old static pages → new equivalents
  "/about-us": "/about",
  "/about-us.html": "/about",
  "/about/": "/about",
  "/contact-us": "/contact",
  "/contact-us.html": "/contact",
  "/contact.html": "/contact",
  "/connect-with-us/": "/contact",
  "/connect-with-us": "/contact",
  "/why-portugal-active/": "/about",
  "/why-portugal-active": "/about",
  "/founder-ricardo-viana/": "/about",
  "/founder-ricardo-viana": "/about",
  "/how-it-works/": "/about",
  "/how-it-works": "/about",
  "/lodges/": "/homes",
  "/lodges": "/homes",
  "/rooms/": "/homes",
  "/rooms": "/homes",
  "/our-rooms/": "/homes",
  "/our-rooms": "/homes",
  "/properties": "/homes",
  "/properties/": "/homes",
  "/adventures": "/experiences",
  "/adventure/": "/experiences",
  "/adventure": "/experiences",
  "/destination/": "/destinations",
  "/destination": "/destinations",
  "/locations": "/destinations",
  "/locations/": "/destinations",
  "/locations/portugal": "/destinations",
  "/services/": "/services",
  "/news/": "/blog",
  "/news": "/blog",
  "/legal-terms": "/legal/terms",
  "/terms-conditions/": "/legal/terms",
  "/terms-conditions": "/legal/terms",
  "/cookies-policy/": "/legal/cookies",
  "/cookies-policy": "/legal/cookies",
  "/complaint-book/": "/contact",
  "/dispute-resolution/": "/contact",
  "/lp-b2b": "/owners",
  "/reviews": "/about",
  "/index.html": "/",
  "/home-2/": "/",
  "/new-homepage/": "/",
  "/thisisrealportugal/": "/",
  "/journal": "/blog",
  "/journal/": "/blog",
  "/account/login": "/login",
  "/index": "/",
  "/new": "/",
  "/new/": "/",
  "/new/comments/feed/": "/",
  "/new/comments/feed": "/",
  "/new/author/ricardo/": "/about",
  "/new/author/portugalactive/": "/about",
  "/new/author/luis/": "/about",
  "/event/sailing-": "/experiences/sailing",
  "/event/sailing-/": "/experiences/sailing",
};

interface PatternRule {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, originalPath: string) => string;
}

// === PATTERN RULES ========================================================
const PATTERN_REDIRECTS: PatternRule[] = [
  // /properties/<slug> and /rooms/<slug> → /homes/<new-slug>
  {
    pattern: /^\/(properties|rooms)\/([^/?#]+)\/?$/i,
    resolve: (m) => {
      const slug = m[2];
      const mapped = PROPERTY_REDIRECTS[slug];
      return mapped ? `/homes/${mapped}` : "/homes";
    },
  },

  // /adventure/<slug> and /event/<slug> → /experiences/<slug>
  {
    pattern: /^\/(adventure|event)\/([^/?#]+)\/?$/i,
    resolve: (m) => {
      const slug = m[2];
      const mapped = EXPERIENCE_REDIRECTS[slug];
      return mapped ? `/experiences/${mapped}` : "/experiences";
    },
  },

  // /offer/<slug> → /services/<slug>
  {
    pattern: /^\/offer\/([^/?#]+)\/?$/i,
    resolve: (m) => {
      const slug = m[1];
      const mapped = SERVICE_REDIRECTS[slug];
      return mapped ? `/services/${mapped}` : "/services";
    },
  },

  // /services/<slug> (Webflow) → /services/<slug> (still valid in new site for these)
  {
    pattern: /^\/services\/([^/?#]+)\/?$/i,
    resolve: (m) => {
      const slug = m[1];
      const mapped = SERVICE_REDIRECTS[slug];
      return mapped ? `/services/${mapped}` : "/services";
    },
  },

  // /locations/<city> → /destinations/<region>
  {
    pattern: /^\/locations\/([^/?#]+)\/?$/i,
    resolve: (m) => {
      const slug = m[1];
      const mapped = LOCATION_REDIRECTS[slug];
      return mapped ? `/destinations/${mapped}` : "/destinations";
    },
  },

  // /journal/<slug> (Webflow new-site era) → /blog/<slug> when present, else /blog
  // Known new-site blog slugs from client/src/data/blog.json
  {
    pattern: /^\/journal\/([^/?#]+)\/?$/i,
    resolve: (m) => {
      const slug = m[1];
      const knownBlogSlugs = new Set([
        "complete-guide-north-portugal",
        "porto-douro-valley-guide",
      ]);
      // Aliases: /journal/<slug> in the recent migration where <slug> matches a blog post we have
      if (knownBlogSlugs.has(slug)) return `/blog/${slug}`;
      // Otherwise fall back to /blog (preserves session, no 404)
      return "/blog";
    },
  },

  // Old WordPress date archives → /blog
  { pattern: /^\/\d{4}\/\d{2}\/\d{2}\/?$/, resolve: () => "/blog" },
  { pattern: /^\/\d{4}\/\d{2}\/?$/, resolve: () => "/blog" },
  { pattern: /^\/\d{4}\/?$/, resolve: () => "/blog" },

  // /category/* /tag/* /author/* → /blog
  { pattern: /^\/(category|tag|author)\/.+/i, resolve: () => "/blog" },

  // /room-type/* → /homes
  { pattern: /^\/room-type\/.+/i, resolve: () => "/homes" },

  // /hotel-cart, /hotel-checkout, etc → /homes
  { pattern: /^\/hotel-(cart|checkout|search|rooms|account|term-condition|thank-you).*/i, resolve: () => "/homes" },

  // /new/* (preview path during migration) → strip /new/ prefix
  {
    pattern: /^\/new\/(.+)$/,
    resolve: (m, originalPath) => {
      // Recursively try the path without /new/ prefix
      return resolvePath(`/${m[1]}`) ?? "/";
    },
  },

  // Joomla index.php with page params → home
  { pattern: /^\/index\.php(\?|\/|$)/i, resolve: () => "/" },

  // /wp-login, /wp-admin → home (these were never legitimate user URLs)
  { pattern: /^\/wp-(login|admin).*/i, resolve: () => "/" },

  // Legacy *.html / *.php pages without specific redirect → home
  { pattern: /^\/[^/]+\.(html|php)$/i, resolve: () => "/" },

  // Old slug-only blog posts (e.g. /viana-do-castelo-one-of-the-most-welcoming-cities/)
  // These were WP posts. If we have an exact slug match in blog.json, redirect; else /blog.
  {
    pattern: /^\/([a-z0-9-]+)\/?$/i,
    resolve: (m) => {
      const slug = m[1];
      // Don't catch single-segment paths that are first-class routes in the new SPA
      const reservedSegments = new Set([
        "homes", "blog", "about", "contact", "services", "experiences",
        "adventures", "destinations", "events", "owners", "careers",
        "concierge", "faq", "login", "account", "admin", "legal",
        "owners-portal", "404", "booking", "activities",
      ]);
      // Don't catch locale-only paths (LocaleRouter handles those)
      const supportedLocales = new Set([
        "en", "pt", "fr", "es", "it", "fi", "de", "nl", "sv",
      ]);
      if (reservedSegments.has(slug)) return null as unknown as string; // pass through
      if (supportedLocales.has(slug)) return null as unknown as string; // pass through
      return "/blog";
    },
  },
];

// === HELPER ===============================================================
/**
 * Resolve a path through the redirect tables. Returns the target path or null
 * if no redirect applies (caller should pass through).
 */
function resolvePath(path: string): string | null {
  // Strip trailing slash for normalization (except root)
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  // 1) Exact static match
  if (STATIC_REDIRECTS[path]) return STATIC_REDIRECTS[path];
  if (STATIC_REDIRECTS[normalized]) return STATIC_REDIRECTS[normalized];

  // 2) Pattern rules
  for (const rule of PATTERN_REDIRECTS) {
    const m = path.match(rule.pattern);
    if (m) {
      const target = rule.resolve(m, path);
      if (target) return target;
    }
  }

  return null;
}

/**
 * Express middleware. Mount BEFORE static file handler and SPA catch-all.
 * Issues 301 redirects for legacy URLs from the Webflow / WordPress / Joomla eras.
 *
 * Skips:
 *  - non-GET / non-HEAD requests
 *  - paths that already exist on disk (let static handler win)
 *  - paths starting with /api, /trpc, /admin, /__, /sitemap.xml (server routes)
 */
export function legacyRedirects(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const path = req.path;

  // Skip server-internal paths
  if (
    path.startsWith("/api/") ||
    path.startsWith("/trpc/") ||
    path.startsWith("/__") ||
    path === "/sitemap.xml" ||
    path === "/robots.txt"
  ) {
    return next();
  }

  const target = resolvePath(path);
  if (!target) return next();

  // Don't redirect to self
  if (target === path) return next();

  // Preserve query string (e.g., utm_*) on redirect
  const query = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  res.redirect(301, `${target}${query}`);
}

// Export for tests
export const __testing = {
  resolvePath,
  PROPERTY_REDIRECTS,
  EXPERIENCE_REDIRECTS,
  SERVICE_REDIRECTS,
  LOCATION_REDIRECTS,
  STATIC_REDIRECTS,
  PATTERN_REDIRECTS,
};
