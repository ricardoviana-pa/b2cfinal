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

/** Filter out test listings and properties below minimum price threshold */
function filterPublicProperties(properties: any[]): any[] {
  return properties.filter(p => {
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
