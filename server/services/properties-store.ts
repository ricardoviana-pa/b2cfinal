/**
 * Properties store — reads from Guesty sync file or static JSON fallback.
 * Priority: runtime sync file > static fallback (which is now also
 * auto-updated by the sync process via GitHub API).
 */

import { isLocalityDestination, localitySlug } from "../../shared/destinationNavigation";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withPartnerDefaults, normalizePartnerAmenities } from "./tripwix";
import { PARTNER_SOURCE } from "../../shared/partnerHome";
import { PARTNER_PHOTO_ROOT, isPublicPhotoFolder, publicPhotoUrl } from "../lib/partnerPhotos";
import { stripBrandSignoff } from "../../shared/descriptionSignoff";
import { normalizePublicPropertyGeography } from "./property-geography";
import { normalizePropertyCapacityCopy } from "./property-capacity-copy";

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

/**
 * What the partner feed says about the supplier, kept on the server: their
 * reference for the home (ops needs it on a paid request) and the commission
 * agreed with them. Keyed by supplier uid. Neither value is part of a public
 * record (Ricardo, 14 nov 2026: shared/partnerHome.ts).
 */
const partnerSupplier = new Map<string, { reference: string; commission: string }>();

/**
 * The catalogue id of a partner home: `partner-<slug>`. It used to be the
 * import's own id with the prefix swapped ("partner-PT0009"), which left the
 * supplier's reference for the home in the id the site publishes (the API,
 * the page state, the JSON-LD identifier, the GA4 item id). Nothing looks a
 * home up by this id across a deploy: favourites, partner requests and
 * payments use the slug, calendars and prices the uid. The homepage strip
 * (HOME_FEATURED_ORDER) lists the same ids and ships with the same build.
 * A record without a slug has no page; its id falls back to the start of the
 * uid, never to the reference.
 */
export function publicPartnerId(p: { slug?: unknown; supplierUid?: unknown }): string {
  const slug = String(p?.slug ?? "").trim();
  if (isPublicPhotoFolder(slug)) return `partner-${slug}`;
  const uid = String(p?.supplierUid ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  return `partner-${uid || "home"}`;
}

/**
 * The imported partner record → the record the site may publish. The
 * supplier's name leaves the source; their reference leaves the id and the
 * photo addresses (the files sit in a folder named after it: see
 * lib/partnerPhotos.ts); the reference and the commission stay behind in
 * `partnerSupplier`. Everything that reaches a browser is built from what
 * this returns.
 */
export function toPublicPartner(p: any): any {
  const { supplierReference, supplierCommission, ...rest } = p ?? {};
  const reference = String(supplierReference ?? "").trim();
  if (rest.supplierUid) {
    partnerSupplier.set(String(rest.supplierUid), {
      reference,
      commission: String(supplierCommission ?? "").trim(),
    });
  }
  const slug = String(rest.slug ?? "").trim();
  const images = Array.isArray(rest.images)
    ? { images: rest.images.map((url: unknown) => publicPhotoUrl(url, reference, slug)) }
    : {};
  return { ...rest, ...images, id: publicPartnerId(rest), source: PARTNER_SOURCE };
}

/**
 * The folder on disk behind a public photo folder: /homes/photos/<slug>/…
 * is served from /homes/photos/<supplier reference>/… (lib/partnerPhotos.ts).
 * null for a folder that is not a partner home's. Read from the data file
 * itself, not from the published list: a photo linked from a destination or
 * a Journal article keeps loading with the partner inventory switched off
 * (TRIPWIX_INVENTORY=0). Server use only.
 */
export async function partnerPhotoFolder(publicFolder: string): Promise<string | null> {
  if (!isPublicPhotoFolder(publicFolder) || !existsSync(paths.tripwix)) return null;
  try {
    const version = await fileVersion(paths.tripwix);
    if (!photoFolders || photoFolders.version !== version) {
      const data = await readJsonFile(paths.tripwix);
      const map = new Map<string, string>();
      for (const p of Array.isArray(data) ? data : []) {
        const slug = String(p?.slug ?? "").trim();
        const reference = String(p?.supplierReference ?? "").trim();
        const first = Array.isArray(p?.images) ? p.images[0] : null;
        // Only homes whose photos really are in the folder named after the reference.
        if (isPublicPhotoFolder(slug) && /^[A-Za-z0-9_-]+$/.test(reference) && typeof first === "string" && first.startsWith(`${PARTNER_PHOTO_ROOT}${reference}/`)) {
          map.set(slug, reference);
        }
      }
      photoFolders = { version, map };
    }
    return photoFolders.map.get(publicFolder) ?? null;
  } catch {
    return null;
  }
}
let photoFolders: { version: string; map: Map<string, string> } | null = null;

/** The supplier's own reference for a partner home ("" when unknown). Server use only. */
export async function partnerSupplierReference(supplierUid: string | null | undefined): Promise<string> {
  if (!supplierUid) return "";
  if (!partnerSupplier.has(supplierUid)) await getPropertiesForSite();
  return partnerSupplier.get(supplierUid)?.reference ?? "";
}

/**
 * The description a page may publish: without the old "Book your stay.
 * Portugal Active, your private hotel." sign-off that ten listings still
 * carry from Guesty (the product is a villa, never a "private hotel").
 */
export function withoutBrandSignoff(p: any): any {
  if (typeof p?.description !== "string") return p;
  const description = stripBrandSignoff(p.description);
  return description === p.description ? p : { ...p, description };
}

/**
 * The location a page may publish: town, region, country and coordinates
 * rounded to three decimals (about 100 m). The property page says
 * "approximate area — the exact address is shared after booking", and the
 * availability calendar is public, so street, door and postcode never leave
 * the server (auditoria 14 nov 2026).
 */
export function withPublicAddress(p: any): any {
  const a = p?.address;
  if (!a || typeof a !== "object") return p;
  const round = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(3)) : undefined);
  const out: Record<string, unknown> = {};
  for (const key of ["city", "state", "country"] as const) if (a[key]) out[key] = a[key];
  const lat = round(a.lat);
  const lng = round(a.lng);
  if (lat !== undefined && lng !== undefined) { out.lat = lat; out.lng = lng; }
  return { ...p, address: out };
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
    return data.map(withPartnerDefaults).map(toPublicPartner);
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

/** Confirmed retired by Ricardo, 5 Nov 2026: no public page, even if a sync reintroduces them. */
const EXCLUDED_GUESTY_IDS = new Set<string>([
  "6965338ed1c09900156e8502", // Calejo House
  "696533794fe6a100145fe4bf", // Ocean Bliss
  "6a3a63f9e19cb0001db6a05e", // Saltwind Studio
]);

/**
 * Off the catalogue, still findable by name (Ricardo, 24–26 Sep 2026).
 *
 * In June 18 homes left www to protect the luxury positioning, and their
 * pages 404'd. Shoreline Escape and Coastal Horizon came back into the
 * listings on 21 Oct 2026 (Ricardo), at the end of the default order; the
 * 13 below stay off. Calejo House, Ocean Bliss and Saltwind Studio were confirmed
 * retired on 5 Nov 2026 and are excluded entirely above. Many direct bookings come
 * from guests who saw a home on an OTA and search its name, so each of the
 * remaining homes keeps a page: 200, "index, follow",
 * in sitemap.xml. What they don't get is a place in anything that *lists*
 * homes: /homes, the homepage, collections, destinations, the search picker,
 * similar homes, blog "where to stay" and the recovery-email alternatives.
 * Use catalogProperties() for those; getPropertiesForSite() stays complete.
 */
export const CATALOG_HIDDEN_GUESTY_IDS = new Set<string>([
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
  "6965335df1c3a8001597c8e4", // Divine Waves Duplex
  "6965337d2def930014e919c6", // Urban Reflections
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
    // Manual exclusions by stable listing ID or slug, surviving Guesty re-syncs.
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
  }).map(normalizePublicPropertyGeography).map(normalizePropertyCapacityCopy).map(withoutBrandSignoff).map(withPublicAddress);
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
 * neither falls back to its region unless its search link uses an exact
 * locality: those pages stay empty rather than show a different area.
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
    : inLocality.length > 0 || isLocalityDestination(slug) ? inLocality
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
    photoFolders = null;
    jsonFiles.clear();
    return prev;
  },
  /** How many times the catalogue was read from disk and parsed. */
  loadCount: () => loadCount,
  reset(): void {
    snapshot = null;
    loading = null;
    photoFolders = null;
    jsonFiles.clear();
    loadCount = 0;
  },
};
