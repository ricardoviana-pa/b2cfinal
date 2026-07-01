/**
 * Properties store — reads from Guesty sync file or static JSON fallback.
 * Priority: runtime sync file > static fallback (which is now also
 * auto-updated by the sync process via GitHub API).
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SYNC_PATH = join(process.cwd(), "data", "properties-synced.json");
const FALLBACK_PATH = join(process.cwd(), "client", "src", "data", "properties.json");

/** Basic sanity check: does this dataset have real images (not just stock Unsplash)? */
function hasRealData(properties: any[]): boolean {
  if (!Array.isArray(properties) || properties.length === 0) return false;
  // Check if at least one property has non-stock images (Guesty CDN URLs)
  const withRealImages = properties.filter(
    (p) =>
      Array.isArray(p.images) &&
      p.images.length > 0 &&
      p.images.some((img: string) => !img.includes("unsplash.com")),
  );
  return withRealImages.length > 0;
}

export async function getPropertiesForSite(): Promise<any[]> {
  // 1. Prefer runtime sync file (freshest data from current server session)
  if (existsSync(SYNC_PATH)) {
    try {
      const raw = await readFile(SYNC_PATH, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        console.info(`[Properties] Loaded ${data.length} properties from runtime sync.`);
        return filterPublicProperties(data);
      }
    } catch {
      // fall through to fallback
    }
  }

  // 2. Fallback: static file (now auto-updated by GitHub commits from sync)
  try {
    const raw = await readFile(FALLBACK_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      const real = hasRealData(data);
      console.info(
        `[Properties] Loaded ${data.length} properties from static fallback (real data: ${real}).`,
      );
      return filterPublicProperties(data);
    }
  } catch {
    // fall through
  }

  console.warn("[Properties] No property data available.");
  return [];
}

/**
 * Manual exclusion list — properties to hide from the public site regardless
 * of their state in Guesty. Match by slug substring (case-insensitive) so we
 * catch both the legacy short slug and the current `-by-portugal-active-XXXX`
 * variants. To re-list, simply remove from this array.
 */
const EXCLUDED_SLUG_PATTERNS: string[] = [
  "villa-luzia", // Removed per CEO request (2026-05-06)
];

/**
 * Brand-cleanup exclusions (2026-06-28) — weaker listings kept OFF the primary
 * site (www.portugalactive.com) to protect the luxury positioning. They REMAIN
 * live on the OTAs and on the secondary direct site (booking.portugalactive.com,
 * the Guesty Booking Engine), which are unaffected by this filter. Matched by
 * Guesty listing id so it survives re-syncs and slug changes. To re-list, remove
 * the id here.
 */
const EXCLUDED_GUESTY_IDS = new Set<string>([
  "6965338ed1c09900156e8502", // Calejo House
  "696532fa6d209c001510d5ee", // Ocean view Cabedelo Beach Duplex
  "696533762def930014e917bf", // Seabreeze Duplex
  "696533616cff760015e28965", // Tide Terrace Duplex
  "6a341163c50f210012f12b80", // Douro Garden
  "6a0359b4e343150013abc14d", // Atlas Hideway
  "696533d2ec19770014fd1b52", // Coastal Horizon
  "696533752def930014e9167c", // Seaside Urban Retreat
  "6965332c6d209c001510e1c1", // Slow Living Countryside House
  "696532f3753fb0001424a570", // Countryside House near the Beach
  "696533af4fe6a100145fecb6", // White Charm by the Sea
  "69ca869e5b0a0500158b7d5a", // River View
  "6965333104b96f00147f5428", // Bandeira Retreat
  "696533794fe6a100145fe4bf", // Ocean Bliss
  "6965335df1c3a8001597c8e4", // Divine Waves Duplex
  "6965337d2def930014e919c6", // Urban Reflections
  "696533cf4b583900135cfb02", // Shoreline Escape
  "6a3a63f9e19cb0001db6a05e", // Saltwind Studio
]);

function isExcluded(p: any): boolean {
  const gid = p.guestyId || p.listingId || "";
  if (gid && EXCLUDED_GUESTY_IDS.has(gid)) return true;
  const slug = (p.slug || "").toLowerCase();
  if (!slug) return false;
  return EXCLUDED_SLUG_PATTERNS.some(pattern => slug.includes(pattern));
}

/** Filter out test listings, properties below minimum price threshold, and manual exclusions */
function filterPublicProperties(properties: any[]): any[] {
  return properties.filter(p => {
    // Manual exclusion list (slug-based, survives Guesty re-syncs)
    if (isExcluded(p)) {
      console.debug(`[Properties] Filtered out excluded listing: ${p.slug}`);
      return false;
    }
    // Exclude properties with 'test' in title/name (case-insensitive)
    const propName = p.title || p.name || '';
    if (/test/i.test(propName)) {
      console.debug(`[Properties] Filtered out test listing: ${propName}`);
      return false;
    }
    // Exclude properties with base price below €20/night
    const basePrice = p.basePrice || p.pricePerNight || p.priceFrom || 0;
    if (basePrice > 0 && basePrice < 20) {
      console.debug(`[Properties] Filtered out low-price listing: ${propName} (€${basePrice}/night)`);
      return false;
    }
    return true;
  });
}
