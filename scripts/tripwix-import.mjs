#!/usr/bin/env node
/**
 * Tripwix partner API → Portugal Active property import.
 *
 * Pulls the properties we have been granted access to, plus their seasonal
 * rates, and maps them onto our own property shape so they can be rendered
 * alongside the Guesty inventory.
 *
 * Two things to know before touching this:
 *
 * 1. The API hands back Tripwix's own published copy — `content`, `seo_title`
 *    and `seo_description` are byte-identical to the canonical pages on
 *    tripwix.com. Shipping it verbatim would put 35 duplicate pages on our
 *    site. We import it so DEV renders with realistic text lengths; it has to
 *    be rewritten before any of this goes near production.
 *
 * 2. Their `latitude` and `longitude` are swapped (every property comes back
 *    with the longitude in the latitude field). We correct that here rather
 *    than downstream, so nothing else has to know.
 *
 * Usage:  TRIPWIX_API_KEY=... node scripts/tripwix-import.mjs
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const API_KEY = process.env.TRIPWIX_API_KEY;
const BASE = process.env.TRIPWIX_API_BASE
  ?? "https://admin.worldeluxevillas.com/api/v1/partner";

const DATA_DIR = join(process.cwd(), "data");
// The raw pull is a large scratch cache and stays out of git.
const RAW_PATH = join(DATA_DIR, "tripwix-raw.json");
// The mapped output IS committed, next to properties.json — Render's disk is
// ephemeral and `data/` is gitignored, so anything left there is absent in
// production. This mirrors how the Guesty sync ships its data.
const OUT_PATH = join(process.cwd(), "client", "src", "data", "tripwix-properties.json");
// Copy we wrote ourselves, merged over whatever the API returns. Kept separate
// so re-syncing prices and availability never overwrites authored text.
const COPY_PATH = join(process.cwd(), "content", "tripwix-copy.json");
// Local WebP paths produced by scripts/tripwix-images.py. When a property has
// been through that, we serve our own copies instead of hotlinking theirs.
const IMAGES_PATH = join(process.cwd(), "content", "tripwix-images.json");

/**
 * The partner tier is 100 requests/hour. A full pull is 1 list + 35 details +
 * 35 rate calls, so we pace ourselves rather than getting throttled halfway
 * through and ending up with a partial dataset.
 */
const PACE_MS = Number(process.env.TRIPWIX_PACE_MS ?? 1200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "X-Partner-API-Key": API_KEY },
    });

    if (res.status === 429) {
      // The throttle response tells us how long to wait; trust it.
      const body = await res.json().catch(() => ({}));
      const wait = Number(String(body.detail ?? "").match(/(\d+)\s*second/)?.[1] ?? 15);
      console.warn(`  throttled on ${path}, waiting ${wait}s`);
      await sleep((wait + 1) * 1000);
      continue;
    }

    if (!res.ok) {
      if (attempt === retries) {
        throw new Error(`${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
      }
      await sleep(2000);
      continue;
    }

    return res.json();
  }
  throw new Error(`exhausted retries on ${path}`);
}

/** Their location names → our destination slugs. */
const DESTINATIONS = {
  "Douro Valley": "douro",
  "Algarve": "algarve",
  "Comporta Area": "alentejo",
  "Cascais Sintra Estoril": "lisbon",
  "Lisbon Area": "lisbon",
};

function slugify(s) {
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Their sublocations are shouted, and some are a whole list of villages
 * ("CENTRAL ALGARVE - PORCHES, BENAGIL, CARVOEIRO, FERRAGUDO"). Keep the
 * leading region and title-case it, so the PLP has something short to show.
 */
function localityName(sublocation, fallback) {
  const raw = sublocation?.name ?? "";
  const head = raw ? raw.split("-")[0].split(",")[0].trim() : "";
  const chosen = head || fallback || "";
  if (!chosen) return "";
  return titleCasePlace(chosen);
}

/**
 * Places are named for guests, not copied from their back office. Their
 * regions carry filing-cabinet suffixes ("Comporta Area", "Lisbon Area",
 * "Douro Valley") and their sublocations are shouted; both become the plain
 * place name — Comporta, Lisbon, Douro.
 */
function titleCasePlace(name) {
  // Portuguese connectives stay lowercase unless they open the name, so we get
  // "Quinta do Lago" rather than "Quinta Do Lago".
  const minor = new Set(["do", "da", "de", "dos", "das", "e", "of", "the"]);
  return String(name)
    .replace(/\s+(area|region|valley)$/i, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && minor.has(word) ? word : word.replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase()),
    )
    .join(" ");
}

/**
 * Their amenities arrive as a flat list with a `category` on each entry; ours
 * are grouped by category. Preserve their grouping rather than flattening,
 * since the PDP renders them per section.
 */
function groupAmenities(amenities) {
  const grouped = {};
  for (const a of amenities ?? []) {
    const key = slugify(a.category || "other");
    (grouped[key] ??= []).push(a.name);
  }
  return grouped;
}

/**
 * `website_sales_value` is a nightly rate per season period. We surface the
 * cheapest as the "from" price, matching how the rest of the site reads.
 */
function priceFromRates(rates) {
  const values = (rates ?? [])
    .map((r) => Number(r.website_sales_value))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return { priceFrom: 0, pricePerNight: 0 };
  // Round the display price; their rates carry cents that read oddly as a
  // "from" figure.
  const low = Math.round(Math.min(...values));
  return { priceFrom: low, pricePerNight: low };
}

function minNights(rates) {
  const values = (rates ?? [])
    .map((r) => Number(r.minimum_nights))
    .filter((n) => Number.isFinite(n) && n > 0);
  return values.length ? Math.min(...values) : 1;
}

function mapProperty(detail, rates) {
  const { priceFrom, pricePerNight } = priceFromRates(rates);

  // Their latitude field holds the longitude and vice versa. Portugal sits at
  // roughly lat 37–42, lon -6 to -9, so the swap is unambiguous — but only
  // correct it when the values actually look transposed, in case they fix it
  // upstream at some point.
  let lat = Number(detail.latitude);
  let lon = Number(detail.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) < Math.abs(lon)) {
    [lat, lon] = [lon, lat];
  }

  const destination = DESTINATIONS[detail.location?.name ?? detail.location] ?? "lisbon";
  const photos = [...(detail.photos ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    id: `tripwix-${detail.reference}`,
    slug: `${slugify(detail.title)}-${detail.reference.toLowerCase()}`,
    name: detail.title,
    tagline: detail.tagline ?? "",
    // Matches the rest of the portfolio. Deliberately NOT "signature": that
    // tier renders a "High demand" badge on the card and the PDP, which would
    // be an invented scarcity claim — we hold no demand data for homes we
    // neither own nor manage. Partner inventory is distinguished by `source`
    // and `bookingMode`, not by a tier that carries marketing meaning.
    tier: "select",
    destination,
    locality: localityName(detail.sublocation, detail.location?.name),
    bedrooms: Number(detail.bedrooms) || 0,
    bathrooms: Number(detail.bathrooms) || 0,
    maxGuests: Number(detail.max_guests) || 0,
    priceFrom,
    pricePerNight,
    // Tripwix does not expose a cleaning fee; their rates are all-in.
    cleaningFee: 0,
    minNights: minNights(rates),
    currency: "EUR",

    // Hotlinked from Tripwix's CDN. Fine for DEV; these must be re-hosted
    // through our own image pipeline before production, both for image SEO
    // and so their CDN logs stop seeing our traffic.
    images: photos.map((p) => p.url),
    imageAlts: photos.map((p) => p.alt_text ?? ""),

    // Tripwix's own copy — placeholder until rewritten. See header note.
    description: detail.content ?? "",
    descriptionSections: null,
    seoTitle: detail.seo_title ?? detail.title,
    seoDescription: detail.seo_description ?? "",

    amenities: groupAmenities(detail.amenities),
    petsAllowed: (detail.amenities ?? []).some((a) => /pet/i.test(a.name)),
    stayIncludes: [],
    style: "",
    tags: [],
    occasions: [],
    bookingUrl: "",
    whatsappMessage: `Hi, I am interested in ${detail.title}`,
    sortOrder: 0,
    isActive: Boolean(detail.is_active),
    isPortfolio: false,

    address: {
      full: detail.address ?? "",
      street: detail.address ?? "",
      city: localityName(detail.sublocation, detail.location?.name),
      state: detail.location?.name ?? "",
      zipcode: "",
      country: "Portugal",
      lat,
      lng: lon,
    },

    licenseNumber: null,
    // No bed configuration, property type, check-in/out times or floor area
    // come through the partner API.
    rooms: [],
    propertyType: "Villa",
    checkInTime: "",
    checkOutTime: "",
    areaSquareFeet: 0,

    // These launch with no social proof of their own.
    reviews: [],
    averageRating: 0,
    reviewCount: 0,

    // Everything below marks this as third-party inventory. `bookingMode`
    // matters most: Tripwix has to approve every stay by email before we can
    // confirm to a guest, so this can never use the instant-book path.
    source: "tripwix",
    bookingMode: "request",
    supplierReference: detail.reference,
    // Needed to call their calendar/rates endpoints at runtime for live pricing.
    supplierUid: detail.uid,
    supplierCommission: detail.partner_commission ?? "",
    lastModified: new Date().toISOString().slice(0, 10),
  };
}

async function main() {
  if (!API_KEY) {
    console.error("TRIPWIX_API_KEY is not set.");
    process.exit(1);
  }
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });

  // Reuse a previous raw pull when present, so iterating on the mapping does
  // not burn the hourly request budget.
  let raw;
  if (existsSync(RAW_PATH) && !process.env.TRIPWIX_REFRESH) {
    raw = JSON.parse(await readFile(RAW_PATH, "utf-8"));
    console.info(`Reusing cached pull of ${raw.length} properties (TRIPWIX_REFRESH=1 to refetch).`);
  } else {
    const list = await api("/properties/?limit=100");
    console.info(`Listing returned ${list.total} properties.`);

    raw = [];
    for (const [i, summary] of list.results.entries()) {
      console.info(`  [${i + 1}/${list.results.length}] ${summary.reference} ${summary.title}`);
      const detail = await api(`/properties/${summary.uid}/`);
      await sleep(PACE_MS);
      const rates = await api(`/properties/${summary.uid}/rates/`);
      await sleep(PACE_MS);
      raw.push({ detail, rates });
    }
    await writeFile(RAW_PATH, JSON.stringify(raw, null, 2));
    console.info(`Raw pull cached to ${RAW_PATH}`);
  }

  let copy = {};
  if (existsSync(COPY_PATH)) {
    copy = JSON.parse(await readFile(COPY_PATH, "utf-8"));
  }

  let localImages = {};
  if (existsSync(IMAGES_PATH)) {
    localImages = JSON.parse(await readFile(IMAGES_PATH, "utf-8"));
  }

  const mapped = raw.map(({ detail, rates }) => {
    const base = mapProperty(detail, rates);
    // Prefer our own WebP copies. Falling back per-property rather than
    // per-image keeps a half-finished conversion from mixing hosts on one page.
    const local = localImages[base.supplierReference];
    if (local && local.length === base.images.length) {
      base.images = local;
      base.imagesSelfHosted = true;
    }

    const authored = copy[base.supplierReference];
    if (!authored) return base;

    // Authored text wins over the supplier's. `imageAlts` is positional and
    // only as long as we have written it, so pad from whatever the API gave.
    const merged = { ...base, ...authored, hasAuthoredCopy: true };

    // Where we override the name — a couple of theirs carry back-office notes
    // like "- PDF now LIVE" — the slug has to follow, or the URL keeps
    // publishing the noise we just removed from the page.
    if (authored.name) {
      merged.slug = `${slugify(authored.name)}-${base.supplierReference.toLowerCase()}`;
    }
    if (authored.imageAlts) {
      merged.imageAlts = base.images.map(
        (_, i) => authored.imageAlts[i] ?? base.imageAlts[i] ?? "",
      );
    }
    return merged;
  });

  const authoredCount = mapped.filter((p) => p.hasAuthoredCopy).length;
  console.info(`Authored copy applied to ${authoredCount}/${mapped.length} properties.`);
  const localCount = mapped.filter((p) => p.imagesSelfHosted).length;
  console.info(`Self-hosted images on ${localCount}/${mapped.length} properties.`);
  mapped.sort((a, b) => a.priceFrom - b.priceFrom);

  await writeFile(OUT_PATH, JSON.stringify(mapped, null, 2));

  const byDest = {};
  for (const p of mapped) byDest[p.destination] = (byDest[p.destination] ?? 0) + 1;

  console.info(`\nWrote ${mapped.length} properties to ${OUT_PATH}`);
  console.info(`By destination: ${JSON.stringify(byDest)}`);
  console.info(`Price range: EUR ${mapped[0]?.priceFrom} – ${mapped.at(-1)?.priceFrom}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
