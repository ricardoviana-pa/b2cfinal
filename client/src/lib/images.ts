/**
 * Central image registry — Portugal Active photography only (auditoria set/2026, N17).
 */

export const IMAGES = {
  // Hero images
  // Homepage cover — Carcavelos Manor House: the 18th-century estate with its
  // lap pool and mature grounds.
  heroMain: '/hero/home-cliff-villa.webp',
  // Auto-hospedada: o CDN da plataforma original (d2xsxph8kpxj0f.cloudfront.net)
  // comecou a devolver 403/503 em 24 ago 2026 e nao volta — qualquer imagem
  // que la ficasse desaparece assim que a cache de edge expira.
  heroHomes: '/hero/home-pool-twilight.webp',

  // Destination images
  destinationMinho: '/destinations/minho-coast.webp',

  // Experience images — real Portugal Active photography
  expGastronomy: '/experiences/pa-chef-cooking.webp',
  expWellness: '/experiences/exp-wellness.webp',
  expAdventure: '/experiences/sup-river.webp',
  expMobility: '/experiences/pa-mobility-maybach.webp',

  // About page — hero housekeeping scene. The wide crop frames both team
  // members on desktop; the portrait crop keeps BOTH in frame on narrow
  // phones (a single centred cover-crop would drop the right-hand one).
  aboutHero: '/hero/about-cleaning-suite.webp',
  aboutHeroMobile: '/hero/about-cleaning-suite-mobile.webp',
  aboutStory: '/hero/about-team-suite.webp',

  // Contact page — a Portugal Active villa at blue hour, warm light pouring
  // from every window, infinity pool and full deck: "arrive to everything
  // ready", the right note for "Let us plan your stay."
  contactHero: '/experiences/pa-contact-villa-twilight.webp',

  // Logo
  logoWhite: '/brand/pa-logo-white.webp',
  logoColor: '/brand/pa-logo-dark.webp',

  // Press logos
  pressForbes: '/press/forbes.webp',
  pressTheTimes: '/press/the-times.webp',
  pressTheGuardian: '/press/the-guardian.webp',
  pressTimeOut: '/press/time-out.webp',
  pressMensHealth: '/press/mens-health.webp',
  pressArquitectura: '/press/arquitectura.webp',
} as const;

/**
 * Fallback carousel for a home that has no photos of its own yet. Every
 * published home has Guesty or partner photos, so this is only reached by
 * drafts; the set is Portugal Active photography, never stock.
 */
const FALLBACK_PROPERTY_IMAGES: string[] = [
  "/hero/home-cliff-villa.webp",
  "/hero/home-pool-twilight.webp",
  "/experiences/pa-contact-villa-twilight.webp",
];

export function getPropertyImages(_slug: string): string[] {
  return FALLBACK_PROPERTY_IMAGES;
}

/**
 * Optimise a Guesty image URL via Cloudinary transforms.
 *
 * Guesty serves property photos through Cloudinary (assets.guesty.com/image/
 * upload/...). Inserting `w_<width>,q_auto,f_auto` resizes the image and lets
 * Cloudinary serve WebP/AVIF to supporting browsers — a ~30–60% byte saving.
 * Non-Guesty URLs (Unsplash, CloudFront) and already-transformed URLs are
 * returned untouched.
 */
export function optimizeGuestyImage(url: string | undefined | null, width = 900): string {
  if (!url || !url.includes('assets.guesty.com/image/upload/')) return url || '';
  // Already has a transform segment (starts with `x_` right after /upload/).
  if (/\/image\/upload\/[a-z]{1,3}_/.test(url)) return url;
  return url.replace('/image/upload/', `/image/upload/w_${width},q_auto,f_auto/`);
}

/**
 * Build a responsive `srcSet` for a Guesty image at several widths, so the
 * browser (guided by the element's `sizes`) downloads a variant matched to the
 * display size × DPR — small on phones, full-res on retina desktops. Returns ""
 * for non-Guesty or already-transformed URLs (in which case just use `src`).
 */
export function guestySrcSet(url: string | undefined | null, widths: number[]): string {
  if (!url || !url.includes('assets.guesty.com/image/upload/')) return '';
  if (/\/image\/upload\/[a-z]{1,3}_/.test(url)) return '';
  return widths
    .map((w) => `${url.replace('/image/upload/', `/image/upload/w_${w},q_auto,f_auto/`)} ${w}w`)
    .join(', ');
}

/**
 * Resize a Bókun CDN image (imgcdn.bokun.tools) to `w` px wide. Bókun photos are
 * stored at a fixed width (e.g. ?w=1600), so a gallery/lightbox that shows them
 * at every context downloads full-size images on each scroll/click. This sets a
 * context-appropriate width; non-Bókun URLs (local, Guesty) pass through.
 */
export function bokunResize(url: string | undefined | null, w: number): string {
  if (!url) return '';
  if (!url.includes('imgcdn.bokun.tools')) return url;
  return `${url.split('?')[0]}?w=${w}`;
}

/** Responsive srcSet for a Bókun CDN image. Returns "" for non-Bókun URLs. */
export function bokunSrcSet(url: string | undefined | null, widths: number[]): string {
  if (!url || !url.includes('imgcdn.bokun.tools')) return '';
  const base = url.split('?')[0];
  return widths.map((w) => `${base}?w=${w} ${w}w`).join(', ');
}

/**
 * Return a width→url resizer for any image host we can resize on the fly
 * (Guesty, Bókun, Unsplash, Pexels), or null for hosts we can't (local files,
 * CloudFront, Webflow) — those keep their single original size.
 */
function cdnVariant(url?: string | null): ((w: number) => string) | null {
  if (!url) return null;
  if (url.includes('assets.guesty.com/image/upload/') && !/\/image\/upload\/[a-z]{1,3}_/.test(url))
    return (w) => url.replace('/image/upload/', `/image/upload/w_${w},q_auto,f_auto/`);
  if (url.includes('imgcdn.bokun.tools')) { const b = url.split('?')[0]; return (w) => `${b}?w=${w}`; }
  if (url.includes('images.pexels.com')) { const b = url.split('?')[0]; return (w) => `${b}?auto=compress&cs=tinysrgb&w=${w}`; }
  return null;
}

/** Context-appropriate src for any resizable host; passes non-resizable urls through. */
export function cdnResize(url: string | undefined | null, w: number): string {
  const v = cdnVariant(url);
  return v ? v(w) : (url || '');
}

/** Responsive srcSet across all resizable hosts. "" when the host can't resize. */
export function cdnSrcSet(url: string | undefined | null, widths: number[]): string {
  const v = cdnVariant(url);
  return v ? widths.map((w) => `${v(w)} ${w}w`).join(', ') : '';
}
