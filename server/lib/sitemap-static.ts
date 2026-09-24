/**
 * Fixed routes listed in /sitemap.xml for every language. Only final URLs
 * belong here: a route that 301s ("/adventures" → "/experiences", auditoria
 * set/2026) tells Google the sitemap is stale. The sitemap handler also drops
 * anything redirectTarget() would redirect, and sitemap-static.test.ts checks
 * this list against it.
 */
export const STATIC_SITEMAP_PAGES: { loc: string; priority: string; changefreq: string }[] = [
  { loc: "/", priority: "1.0", changefreq: "daily" },
  { loc: "/homes", priority: "0.9", changefreq: "daily" },
  { loc: "/destinations", priority: "0.9", changefreq: "monthly" },
  { loc: "/collections/villas-with-private-pool", priority: "0.8", changefreq: "weekly" },
  { loc: "/collections/sea-view-villas", priority: "0.8", changefreq: "weekly" },
  { loc: "/collections/large-group-villas", priority: "0.8", changefreq: "weekly" },
  { loc: "/collections/pet-friendly-villas", priority: "0.8", changefreq: "weekly" },
  { loc: "/collections/villas-with-jacuzzi", priority: "0.8", changefreq: "weekly" },
  { loc: "/collections/beach-villas", priority: "0.8", changefreq: "weekly" },
  { loc: "/services", priority: "0.8", changefreq: "monthly" },
  { loc: "/experiences", priority: "0.8", changefreq: "monthly" },
  { loc: "/events", priority: "0.8", changefreq: "monthly" },
  { loc: "/corporate-retreats", priority: "0.8", changefreq: "monthly" },
  { loc: "/blog", priority: "0.8", changefreq: "weekly" },
  { loc: "/about", priority: "0.7", changefreq: "monthly" },
  { loc: "/contact", priority: "0.7", changefreq: "monthly" },
  { loc: "/owners", priority: "0.7", changefreq: "monthly" },
  { loc: "/faq", priority: "0.7", changefreq: "monthly" },
  { loc: "/careers", priority: "0.7", changefreq: "monthly" },
  { loc: "/best-rate-guarantee", priority: "0.5", changefreq: "yearly" },
  { loc: "/legal/privacy", priority: "0.3", changefreq: "yearly" },
  { loc: "/legal/terms", priority: "0.3", changefreq: "yearly" },
  { loc: "/legal/cookies", priority: "0.3", changefreq: "yearly" },
  { loc: "/legal/cancellation-policy", priority: "0.3", changefreq: "yearly" },
];
