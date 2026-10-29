/**
 * Properties store — reads from Guesty sync file or static JSON fallback.
 * Priority: runtime sync file > static fallback (which is now also
 * auto-updated by the sync process via GitHub API).
 */

import { localitySlug } from "../../shared/destinationNavigation";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withPartnerDefaults, normalizePartnerAmenities } from "./tripwix";
import { normalizePublicPropertyGeography } from "./property-geography";

const SYNC_PATH = join(process.cwd(), "data", "properties-synced.json");
const FALLBACK_PATH = join(process.cwd(), "client", "src", "data", "properties.json");

/**
 * Third-party inventory from the Tripwix partnership (see
 * scripts/tripwix-import.mjs). These are not our listings: Tripwix has to
 * approve every stay by email before we can confirm to a guest, so each one
 * carries `bookingMode: "request"` and must never reach the instant-book path.
 *
 * On wherever the data file is present. Set TRIPWIX_INVENTORY=0 to switch the
 * whole partnership off without a deploy — the kill switch if anything about
 * this inventory needs to come down in a hurry.
 *
 * The file lives under client/src/data (not data/, which is gitignored) so it
 * ships with the build; Render's disk is ephemeral.
 */
const TRIPWIX_PATH = join(process.cwd(), "client", "src", "data", "tripwix-properties.json");
const DESTINATIONS_PATH = join(process.cwd(), "client", "src", "data", "destinations.json");

/** The files the store reads. A variable, not constants, so tests can point
 *  it at temporary files (__testing.setPaths). */
const paths = { sync: SYNC_PATH, fallback: FALLBACK_PATH, tripwix: TRIPWIX_PATH, destinations: DESTINATIONS_PATH };

/**
 * Which version of a file is on disk: changes whenever the file is rewritten
 * (the Guesty sync writes data/properties-synced.json in place; a deploy ships
 * new copies of the others). "-" when the file is missing.
 */
async function fileVersion(path: string): Promise<string> {
  try {
    const s = await stat(path);
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    return "-";
  }
}

/* Parsed once per version of the files (auditoria out/2026,
 * performance-05-origin-ssr-reparse): getPropertiesForSite() is called by
 * about 30 places, several times per page render, and used to read and
 * JSON.parse the 1.6 MB catalogue (plus the 240 KB partner file) on every
 * call. Now a call costs three stat()s; the files are read again only when
 * one of them changes, and the "Loaded N properties" log line is printed once
 * per load instead of once per call. */
let snapshot: { version: string; list: any[] } | null = null;
let loading: { version: string; promise: Promise<any[]> } | null = null;
let loadCount = 0;

async function storeVersion(): Promise<string> {
  const [sync, fallback, tripwix] = await Promise.all([fileVersion(paths.sync), fileVersion(paths.fallback), fileVersion(paths.tripwix)]);
  return [sync, fallback, tripwix, process.env.TRIPWIX_INVENTORY === "0" ? "partner-off" : "partner-on"].join("|");
}

/** JSON files read through the same version check (destinations.json). */
const jsonFiles = new Map<string, { version: string; value: unknown }>();
async function readJsonFile(path: string): Promise<unknown> {
  const version = await fileVersion(path);
  const hit = jsonFiles.get(path);
  if (hit && hit.version === version) return hit.value;
  const value = JSON.parse(await readFile(path, "utf-8"));
  jsonFiles.set(path, { version, value });
  return value;
}

async function getTripwixProperties(): Promise<any[]> {
  if (process.env.TRIPWIX_INVENTORY === "0") {
    console.info("[Properties] Tripwix partner inventory disabled via TRIPWIX_INVENTORY=0.");
    return [];
  }
  if (!existsSync(paths.tripwix)) return [];
  try {
    const data = JSON.parse(await readFile(paths.tripwix, "utf-8"));
    if (!Array.isArray(data) || data.length === 0) return [];
    console.info(`[Properties] Loaded ${data.length} Tripwix partner properties.`);
    return data.map(withPartnerDefaults);
  } catch (err) {
    console.error("[Properties] Failed to read Tripwix inventory:", err);
    return [];
  }
}

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

/** Every amenity string our own homes publish — the vocabulary partner homes must fit. */
function siteAmenityVocabulary(own: any[]): Set<string> {
  const vocab = new Set<string>();
  for (const p of own) {
    const a = p?.amenities;
    const list = Array.isArray(a) ? a : Object.values(a || {}).flat();
    for (const s of list) if (typeof s === "string" && s.trim()) vocab.add(s.trim());
  }
  return vocab;
}

/** Partner homes get amenities in our vocabulary; nothing raw from the feed reaches a page. */
function normalizePartner(partner: any[], own: any[]): any[] {
  if (partner.length === 0) return partner;
  const vocab = siteAmenityVocabulary(own);
  return partner.map((p) => ({ ...p, amenities: normalizePartnerAmenities(p.amenities, vocab) }));
}

/**
 * Every public property (own homes + partner inventory). Cached per version
 * of the source files; each call gets its own array (the records themselves
 * are shared, as they already were through the SSR slug cache — callers read
 * them, never write to them).
 */
export async function getPropertiesForSite(): Promise<any[]> {
  const version = await storeVersion();
  if (snapshot && snapshot.version === version) return snapshot.list.slice();
  if (!loading || loading.version !== version) {
    const promise = loadPropertiesFromDisk().then((list) => {
      snapshot = { version, list };
      return list;
    });
    const entry = { version, promise };
    loading = entry;
    promise.finally(() => { if (loading === entry) loading = null; }).catch(() => {});
  }
  return (await loading.promise).slice();
}

async function loadPropertiesFromDisk(): Promise<any[]> {
  loadCount++;
  const partner = await getTripwixProperties();

  // 1. Prefer runtime sync file (freshest data from current server session)
  if (existsSync(paths.sync)) {
    try {
      const raw = await readFile(paths.sync, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        console.info(`[Properties] Loaded ${data.length} properties from runtime sync.`);
        return filterPublicProperties([...data, ...normalizePartner(partner, data)]);
      }
    } catch {
      // fall through to fallback
    }
  }

  // 2. Fallback: static file (now auto-updated by GitHub commits from sync)
  try {
    const raw = await readFile(paths.fallback, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      const real = hasRealData(data);
      console.info(
        `[Properties] Loaded ${data.length} properties from static fallback (real data: ${real}).`,
      );
      return filterPublicProperties([...data, ...normalizePartner(partner, data)]);
    }
  } catch {
    // fall through
  }

  if (partner.length > 0) {
    console.warn("[Properties] Only partner inventory available.");
    return filterPublicProperties(partner);
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
  "test-guesty-test", // Guesty's own test listing — never public (auditoria set/2026, N10)
];

/** Hard exclusions: no page at all. Empty on purpose (see below). */
const EXCLUDED_GUESTY_IDS = new Set<string>([]);

/**
 * Off the catalogue, still findable by name (Ricardo, 24–26 Sep 2026).
 *
 * In June 18 homes left www to protect the luxury positioning, and their
 * pages 404'd. Shoreline Escape and Coastal Horizon came back into the
 * listings on 21 Oct 2026 (Ricardo), at the end of the default order; the
 * 16 below stay off. But many direct bookings come from guests who saw a home
 * on an OTA and search its name, so each keeps a page: 200, "index, follow",
 * in sitemap.xml. What they don't get is a place in anything that *lists*
 * homes: /homes, the homepage, collections, destinations, the search picker,
 * similar homes, blog "where to stay" and the recovery-email alternatives.
 * Use catalogProperties() for those; getPropertiesForSite() stays complete.
 */
export const CATALOG_HIDDEN_GUESTY_IDS = new Set<string>([
  "6965338ed1c09900156e8502", // Calejo House
  "696532fa6d209c001510d5ee", // Ocean view Cabedelo Beach Duplex
  "696533762def930014e917bf", // Seabreeze Duplex
  "696533616cff760015e28965", // Tide Terrace Duplex
  "6a341163c50f210012f12b80", // Douro Garden
  "6a0359b4e343150013abc14d", // Atlas Hideway
  "696533752def930014e9167c", // Seaside Urban Retreat
  "6965332c6d209c001510e1c1", // Slow Living Countryside House
  "696532f3753fb0001424a570", // Countryside House near the Beach
  "696533af4fe6a100145fecb6", // White Charm by the Sea
  "69ca869e5b0a0500158b7d5a", // River View
  "6965333104b96f00147f5428", // Bandeira Retreat
  "696533794fe6a100145fe4bf", // Ocean Bliss
  "6965335df1c3a8001597c8e4", // Divine Waves Duplex
  "6965337d2def930014e919c6", // Urban Reflections
  "6a3a63f9e19cb0001db6a05e", // Saltwind Studio
]);

export function isHiddenFromCatalog(p: any): boolean {
  const gid = p?.guestyId || p?.listingId || "";
  return !!gid && CATALOG_HIDDEN_GUESTY_IDS.has(gid);
}

/** The homes the site may list. Pages and the sitemap use the full set. */
export function catalogProperties<T>(properties: T[]): T[] {
  return properties.filter((p) => !isHiddenFromCatalog(p));
}

function isExcluded(p: any): boolean {
  const gid = p.guestyId || p.listingId || "";
  if (gid && EXCLUDED_GUESTY_IDS.has(gid)) return true;
  const slug = (p.slug || "").toLowerCase();
  if (!slug) return false;
  return EXCLUDED_SLUG_PATTERNS.some(pattern => slug.includes(pattern));
}

/** Filter out test listings, properties below minimum price threshold, and manual exclusions */
export function filterPublicProperties(properties: any[]): any[] {
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
  }).map(normalizePublicPropertyGeography);
}

/** Mirror of the client's slugifyLocality (client/src/lib/utils.ts) so the
 *  option values produced here match what the PLP's `location` filter expects. */
function slugifyLocality(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * The destination options for the search dropdowns — derived from the SAME
 * public property list the site renders, so it can never offer a place with no
 * results. Tiny payload (~15 entries) so it can be prefetched into the SSR HTML
 * and the dropdown is usable on first paint, instead of waiting for the ~1.3 MB
 * full property list to load (which left the picker empty on mobile).
 */
export async function getSiteLocalities(): Promise<
  Array<{ label: string; value: string; group?: string; groupSlug?: string }>
> {
  const properties = catalogProperties(await getPropertiesForSite());

  // destination slug → display name + order, so the picker can group the raw
  // municipalities under the regions guests actually recognise.
  const destName = new Map<string, string>();
  const destOrder = new Map<string, number>();
  try {
    const arr = await readJsonFile(paths.destinations);
    if (Array.isArray(arr)) {
      arr.forEach((d: any, i: number) => {
        if (d?.slug && d?.name) {
          destName.set(d.slug, d.name);
          destOrder.set(d.slug, typeof d.sortOrder === "number" ? d.sortOrder : i);
        }
      });
    }
  } catch {
    /* no destinations file — fall back to a flat, ungrouped list */
  }

  const map = new Map<string, { label: string; dest?: string }>();
  for (const p of properties) {
    if (p?.isActive && p?.locality) {
      const slug = slugifyLocality(p.locality);
      if (!map.has(slug)) map.set(slug, { label: p.locality, dest: p.destination });
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => {
      const oa = destOrder.get(a[1].dest ?? "") ?? 999;
      const ob = destOrder.get(b[1].dest ?? "") ?? 999;
      if (oa !== ob) return oa - ob;
      return a[1].label.localeCompare(b[1].label, "pt");
    })
    .map(([value, { label, dest }]) => ({
      label,
      value,
      // group = English display name (legacy), groupSlug = key for the client's
      // i18n label (destinations.<slug>) so the picker reads in the page language.
      ...(dest && destName.has(dest) ? { group: destName.get(dest), groupSlug: dest } : {}),
    }));
}

/* ── Destination pages ──────────────────────────────────────────────────── */

async function readDestinations(): Promise<Array<{ slug: string; region: string; status?: string; comingSoon?: boolean }>> {
  try {
    const raw = await readJsonFile(paths.destinations);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Fields a destination page needs for its cards and count — a fraction of the record. */
const CARD_FIELDS = [
  "id", "guestyId", "supplierUid", "slug", "name", "title", "tagline", "tier", "destination", "locality",
  "bedrooms", "bathrooms", "maxGuests", "priceFrom", "pricePerNight", "currency", "petsAllowed",
  "tags", "isActive", "source", "bookingMode", "sortOrder", "averageRating", "reviewCount",
  "propertyType", "minNights", "groupId", "unitOf", "style",
] as const;

function toCard(p: any): any {
  const out: any = {};
  for (const k of CARD_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  out.images = Array.isArray(p.images) ? p.images.slice(0, 4) : [];
  return out;
}

/**
 * The homes a destination page lists, derived from the same public list the
 * site renders — own homes and partner inventory alike (auditoria set/2026,
 * I2: the pages said "0 private hotels" because the count only existed
 * client-side, and destinations.json carried a stale propertyCount).
 *
 * A region hub (slug === region: minho, porto, algarve…) lists every home
 * whose destination belongs to that region, spokes included (douro → porto).
 * A spoke with homes of its own (douro) lists those. A town spoke whose homes
 * are tagged by region but carry the town as their locality (viana-do-castelo,
 * caminha, esposende) lists the homes in that locality. Only a spoke with
 * neither falls back to its region.
 *
 * Slim records (~1.5 KB each) so the list can be SSR-prefetched and the
 * cards and the count are in the served HTML.
 */
export async function getPropertiesForDestination(slug: string): Promise<any[]> {
  const dests = await readDestinations();
  const d = dests.find((x) => x.slug === slug);
  if (!d) return [];
  const regionOf = (dest: string) => dests.find((x) => x.slug === dest)?.region ?? dest;
  const all = catalogProperties(await getPropertiesForSite()).filter((p) => p.isActive !== false);
  const own = all.filter((p) => p.destination === slug);
  const isHub = d.slug === d.region;
  const inLocality = all.filter((p) => localitySlug(p.locality) === slug);
  const list = isHub
    ? all.filter((p) => regionOf(p.destination) === d.region)
    : own.length > 0 ? own
    : inLocality.length > 0 ? inLocality
    : all.filter((p) => p.destination === d.region);
  return list.map(toCard);
}

/* ── Test hooks ─────────────────────────────────────────────────────────── */
export const __testing = {
  /** Point the store at other files (tests); returns the previous paths. */
  setPaths(next: Partial<typeof paths>): typeof paths {
    const prev = { ...paths };
    Object.assign(paths, next);
    snapshot = null;
    loading = null;
    jsonFiles.clear();
    return prev;
  },
  /** How many times the catalogue was read from disk and parsed. */
  loadCount: () => loadCount,
  reset(): void {
    snapshot = null;
    loading = null;
    jsonFiles.clear();
    loadCount = 0;
  },
};
