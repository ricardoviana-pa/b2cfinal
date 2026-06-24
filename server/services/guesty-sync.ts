/**
 * GUESTY SYNC — Pulls listings (photos, texts, pricing) from Guesty.
 * Writes to data/properties-synced.json (runtime) AND commits to GitHub
 * so data persists across Render deploys (ephemeral filesystem).
 */

import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { guestyClient, isGuestyConfigured } from "../lib/guesty";

// GitHub persistence config (set via env vars on Render)
const GITHUB_PAT = process.env.GITHUB_PAT || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "ricardoviana-pa/b2cfinal";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_FILE_PATH = "client/src/data/properties.json";

/** Fetch all listings with full details */
async function fetchAllListings(): Promise<any[]> {
  const results: any[] = [];
  let skip = 0;
  const limit = 50;
  const fields =
    "title publicDescription publicDescriptions description pictures address accommodates bedrooms bathrooms prices terms amenities amenitiesNotIncluded customFields listingRooms propertyType defaultCheckInTime defaultCheckOutTime areaSquareFeet";

  while (true) {
    const data = await guestyClient.getListings({
      limit,
      skip,
      active: true,
      listed: true,
      fields,
    });
    const items = data.results || [];
    if (items.length === 0) break;
    results.push(...items);
    if (items.length < limit) break;
    skip += limit;
  }
  console.log(`[Guesty Sync] Fetched ${results.length} listings with address data`);
  return results;
}

/** Combine publicDescriptions into full description */
function buildDescription(desc: any, legacyDescription?: string): string {
  if (!desc || typeof desc !== "object") return legacyDescription || "";
  const parts = [
    desc.summary,
    desc.space,
    desc.neighborhood,
    desc.access,
    desc.transit,
    desc.notes,
  ].filter((s) => typeof s === "string" && s.trim().length > 0);
  const combined = parts.join("\n\n");
  if (
    combined.length < 100 &&
    legacyDescription &&
    legacyDescription.length > combined.length
  ) {
    return legacyDescription;
  }
  return combined || legacyDescription || "";
}

/** Content-quality metrics for the structured descriptions, accumulated across
 *  a sync run and logged at the end so we can track the editorial cleanup of
 *  the ~25-35 older listings over time. Reset at the start of runSync. */
const descMetrics = { notesUpsellFiltered: 0, spaceDeduped: 0, gettingAroundGarbage: 0 };

/** Markers of the commercial upsell block ("Exclusive Concierge Services /
 *  Adventure Experiences") that was copy-pasted into "Other things to note"
 *  on older listings. That content belongs in the site's own Services /
 *  Experiences sections, not the property description. */
const NOTES_UPSELL_MARKERS = [
  "exclusive concierge services",
  "adventure experiences",
  "enhance your stay with our exclusive services",
  "portugal active, your private hotel",
];

/** Drop the "Other things to note" block when it's the migrated upsell or
 *  garbage; else return the trimmed text. */
function cleanOtherNotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.replace(/[^a-zA-Z0-9]/g, "").length < 10) return ""; // "", "/", stray punctuation
  const lower = trimmed.toLowerCase();
  if (NOTES_UPSELL_MARKERS.some((m) => lower.includes(m))) {
    descMetrics.notesUpsellFiltered++;
    return "";
  }
  return trimmed;
}

/** Hide "The space" when it just repeats the Summary opening (older listings
 *  copy-pasted Summary into Space). Distinct content (e.g. Carcavelos) passes. */
function dedupSpace(summary: string, space: string): string {
  const s = space.trim();
  if (!s) return "";
  const summaryHead = summary.slice(0, 80).toLowerCase().trim();
  const spaceHead = s.slice(0, 80).toLowerCase().trim();
  if (summaryHead && spaceHead === summaryHead) {
    descMetrics.spaceDeduped++;
    return "";
  }
  return s;
}

/** Expose Guesty's public-description sub-fields as separate, cleaned sections
 *  so the PDP can render them as titled blocks ("The space", "The
 *  neighbourhood", "Getting around", "Good to know") instead of one merged
 *  paragraph. Cleaning lives here (not the React component) so the frontend
 *  stays business-rule-agnostic and the filtering is metric-tracked per sync.
 *  Only `notes` (upsell/garbage) and `space` (Summary duplicate) are filtered;
 *  summary / access / neighborhood / interaction are passed through. */
function buildDescriptionSections(desc: any): Record<string, string> {
  if (!desc || typeof desc !== "object") return {};
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const summary = pick(desc.summary);
  const gettingAroundRaw = pick(desc.transit);
  const gettingAround = gettingAroundRaw.replace(/[^a-zA-Z0-9]/g, "").length < 10 ? "" : gettingAroundRaw;
  if (gettingAroundRaw && !gettingAround) descMetrics.gettingAroundGarbage++;
  return {
    summary,
    space: dedupSpace(summary, pick(desc.space)),
    access: pick(desc.access),
    neighborhood: pick(desc.neighborhood),
    gettingAround,
    notes: cleanOtherNotes(pick(desc.notes)),
    interaction: pick(desc.interaction ?? desc.interactionWithGuests),
  };
}

/** Build tagline from description — ensure it's always populated */
function buildTagline(desc: any, legacyDescription?: string): string {
  const summary = desc?.summary || desc?.space || desc?.neighborhood || "";
  if (summary.trim().length > 0) {
    return summary.slice(0, 150) + (summary.length > 150 ? "…" : "");
  }
  // Fallback: use first 150 chars of full description
  const fullDesc = buildDescription(desc, legacyDescription);
  if (fullDesc.trim().length > 0) {
    return fullDesc.slice(0, 150) + (fullDesc.length > 150 ? "…" : "");
  }
  return "";
}

function slugify(title: string, id: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "property";
  return `${base}-${id.slice(-6)}`;
}

/**
 * Build a stable guestyId → slug map from previously-synced data.
 *
 * Slugs are title-derived, so renaming a listing in Guesty regenerates a
 * different slug and silently breaks the indexed URL. To prevent that, once
 * a listing has a slug we PIN it: future syncs reuse the existing slug for
 * that guestyId and never regenerate it. Only brand-new listings get a
 * freshly slugified URL (once).
 *
 * Reads the runtime sync file first (freshest) then the committed fallback.
 */
async function loadExistingSlugMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const candidates = [
    join(process.cwd(), "data", "properties-synced.json"),
    join(process.cwd(), "client", "src", "data", "properties.json"),
  ];
  for (const path of candidates) {
    try {
      const raw = await readFile(path, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const p of data) {
          if (p?.guestyId && p?.slug && !map.has(p.guestyId)) {
            map.set(p.guestyId, p.slug);
          }
        }
      }
    } catch {
      // File missing or unreadable — skip, fall through to next candidate.
    }
  }
  return map;
}

/** Fetch all reviews from Guesty, paginated */
async function fetchAllReviews(): Promise<any[]> {
  const results: any[] = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    try {
      const resp = await guestyClient.getReviews({ limit, skip });
      // Guesty reviews API returns { data: [...], limit, skip }
      const items = resp.data || resp.results || [];
      if (!Array.isArray(items) || items.length === 0) break;
      results.push(...items);
      if (items.length < limit) break;
      skip += limit;
    } catch (err: any) {
      console.warn(`[Guesty Sync] Reviews fetch error at skip=${skip}: ${err.message}`);
      break;
    }
  }
  console.log(`[Guesty Sync] Fetched ${results.length} reviews`);
  return results;
}

/** First name only — warmer for the premium tier, and avoids exposing full
 *  guest names. Returns null when the payload carries no name at all (this
 *  Guesty account's Airbnb-style reviews only expose opaque reviewer_id /
 *  guestId, no name/photo/location), so the frontend can show a neutral
 *  "Verified guest" label instead of a fake one. */
function reviewerFirstName(review: any, raw: any): string | null {
  const explicit =
    raw.reviewer_first_name ?? raw.reviewerFirstName ??
    raw.reviewer?.first_name ?? raw.reviewer?.firstName ??
    review.guest?.firstName ?? review.guestFirstName;
  if (explicit) return String(explicit).trim();
  const full =
    review.guestName ?? raw.reviewer_name ?? raw.reviewerName ??
    raw.reviewer?.name ?? raw.author?.name ?? "";
  const first = String(full).trim().split(/\s+/)[0];
  return first || null;
}

/** Avatar URL if the channel delivered one, else null. Airbnb almost always
 *  has it; Booking.com rarely does. Render-time decides the fallback. */
function reviewerPhoto(review: any, raw: any): string | null {
  const url =
    raw.reviewer_picture_url ?? raw.reviewerPictureUrl ??
    raw.reviewer?.picture_url ?? raw.reviewer?.picture ?? raw.reviewer?.avatar ??
    review.guest?.picture ?? review.guest?.avatar ?? review.guest?.pictureUrl ?? null;
  return url ? String(url) : null;
}

/** Guest location ("London, UK") if present, else null. */
function reviewerLocation(review: any, raw: any): string | null {
  const loc =
    raw.reviewer_location ?? raw.reviewerLocation ??
    raw.reviewer?.location ?? review.guest?.location ?? review.guest?.city ?? null;
  return loc ? String(loc).trim() : null;
}

/** Group reviews by listingId. Filters: guest-to-host only, public only,
 *  rating >= 4 (normalised to a 5-star scale), non-empty text. Sorted newest
 *  first. Exposes a privacy-safe payload (first name, optional photo/location;
 *  never the channel or full name). */
function buildReviewsByListing(reviews: any[]): Map<string, any[]> {
  const byListing = new Map<string, any[]>();
  let loggedSample = false;

  for (const review of reviews) {
    const listingId = review.listingId;
    if (!listingId) continue;

    const raw = review.rawReview || review;

    // One-time diagnostic so the exact channel field names (avatar, location,
    // type, private flag) are visible in the sync log. Lets us confirm the
    // defensive extraction below hit the right fields once real data flows.
    if (!loggedSample) {
      loggedSample = true;
      console.info("[Guesty Sync] Review sample — top-level keys:", Object.keys(review).join(","));
      console.info("[Guesty Sync] Review sample — rawReview keys:", Object.keys(raw).join(","));
    }

    // Only guest-to-host reviews — exclude host-to-guest. The real payload
    // carries reviewer_role ("guest" | "host"), not a top-level `type`. If
    // reviewer_role is present and not "guest", drop it; if absent, keep.
    const reviewerRole = String(raw.reviewer_role ?? review.type ?? "").toLowerCase();
    if (reviewerRole && reviewerRole !== "guest" && reviewerRole !== "guest-to-host") continue;

    // Exclude hidden / private / unsubmitted reviews (real fields: `hidden`,
    // `submitted`), plus the earlier defensive flags.
    if (raw.hidden === true || raw.submitted === false) continue;
    const isPrivate =
      review.private === true || review.isPrivate === true ||
      raw.private === true || raw.is_private === true ||
      String(review.status ?? "").toLowerCase() === "private";
    if (isPrivate) continue;

    // overall_rating is a 1-5 Airbnb-style score here; the >5 guard only kicks
    // in for channels that hand back a 10-point scale.
    let rating = Number(raw.overall_rating ?? raw.overallRating ?? raw.rating ?? review.rating ?? 0);
    if (rating > 5) rating = rating / 2;
    rating = Math.round(rating * 10) / 10;

    const text = (raw.public_review || raw.publicReview || raw.comments || "").trim();

    if (rating < 4 || !text) continue;

    // Build category ratings from flat fields (Guesty v1 format)
    const categories: Array<{ name: string; score: number }> = [];
    for (const cat of ["cleanliness", "accuracy", "checkin", "communication", "location", "value"]) {
      const score = Number(raw[`category_ratings_${cat}`] ?? 0);
      if (score > 0) categories.push({ name: cat, score });
    }

    const firstName = reviewerFirstName(review, raw); // null when not in payload
    const mapped = {
      rating,
      text: text.slice(0, 500),
      // Privacy-safe identity. The review payload itself is anonymised, so
      // these start null/empty; resolveGuestNames() then fills the first name
      // (+ photo) from the guest record. `_guestId` is the resolver's key and
      // is stripped before the data is written.
      guestDisplayName: firstName,
      guestName: firstName ?? "",
      guestPhoto: reviewerPhoto(review, raw),
      guestLocation: reviewerLocation(review, raw),
      date: review.createdAt || raw.submitted_at || review.date || raw.created_at || "",
      categories,
      _guestId: review.guestId ?? null,
    };

    if (!byListing.has(listingId)) byListing.set(listingId, []);
    byListing.get(listingId)!.push(mapped);
  }

  // Sort each listing's reviews newest first
  for (const [, arr] of Array.from(byListing.entries())) {
    arr.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return byListing;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract a profile photo URL from a Guesty guest's `pictures` field
 *  (shape varies: array of {original,thumbnail}, an object, or a string). */
function guestPictureUrl(guest: any): string | null {
  const p = guest?.pictures ?? guest?.picture;
  if (!p) return null;
  const one = Array.isArray(p) ? p[0] : p;
  if (typeof one === "string") return one;
  return one?.original || one?.large || one?.thumbnail || null;
}

/**
 * Resolve the first name (and photo, if any) for each review's guest via
 * GET /v1/guests/{id}. The review payload is anonymised (opaque ids only),
 * but the guest record exposes firstName/lastName/fullName + pictures —
 * confirmed by scripts/test-guest-name.ts.
 *
 * Privacy: only the FIRST name is attached (never last/full). Resilient:
 * dedupes by guestId, throttles to stay well under Guesty's 275/min Open
 * API limit, and on any failure leaves the review as the neutral
 * "Verified guest" card. Mutates the reviews in place and strips _guestId.
 */
async function resolveGuestNames(byListing: Map<string, any[]>): Promise<void> {
  // Collect unique guestIds across all reviews (only those still anonymous).
  const ids = new Set<string>();
  for (const arr of Array.from(byListing.values())) {
    for (const r of arr) {
      if (r._guestId && !r.guestDisplayName) ids.add(String(r._guestId));
    }
  }
  if (ids.size === 0) {
    // Nothing to resolve — still strip the helper key.
    for (const arr of Array.from(byListing.values())) for (const r of arr) delete r._guestId;
    return;
  }

  console.log(`[Guesty Sync] Resolving ${ids.size} unique guest names…`);
  const nameById = new Map<string, { firstName: string | null; photo: string | null }>();

  // Throttled sequential resolve (~4/sec → ~240/min, under the 275/min cap).
  let done = 0;
  let failed = 0;
  for (const id of Array.from(ids)) {
    try {
      const g: any = await guestyClient.request("GET", `/v1/guests/${id}`);
      const first = typeof g?.firstName === "string" ? g.firstName.trim() : "";
      nameById.set(id, { firstName: first || null, photo: guestPictureUrl(g) });
    } catch (err: any) {
      failed++;
      nameById.set(id, { firstName: null, photo: null });
      // Back off a little harder on rate-limit responses.
      if (err?.status === 429) await sleep(2000);
    }
    done++;
    await sleep(220); // ~4.5 req/s ceiling
  }
  console.log(`[Guesty Sync] Guest names resolved: ${done - failed}/${done} ok, ${failed} failed`);

  // Attach + strip helper key.
  for (const arr of Array.from(byListing.values())) {
    for (const r of arr) {
      const resolved = r._guestId ? nameById.get(String(r._guestId)) : undefined;
      if (resolved?.firstName) {
        r.guestDisplayName = resolved.firstName;
        r.guestName = resolved.firstName;
      }
      if (resolved?.photo && !r.guestPhoto) r.guestPhoto = resolved.photo;
      delete r._guestId;
    }
  }
}

function mapGuestyAmenities(listing: any) {
  const out = { property: [] as string[], bedrooms: [] as string[], kitchen: [] as string[], services: [] as string[] };
  const raw = listing.amenities ?? listing.customFields?.amenities ?? [];
  if (Array.isArray(raw) && raw.length > 0) {
    out.property = raw.filter((x: unknown) => typeof x === "string");
  }
  return out;
}

function inferDestination(addr: any): string {
  const city = (addr.city || '').toLowerCase();
  const region = (addr.region || '').toLowerCase();
  const state = (addr.state || '').toLowerCase();
  const full = `${city} ${region} ${state}`;

  // Porto & Douro — check BEFORE Minho because region "Norte" covers both
  if (state === 'porto' ||
      city.includes('porto') || city.includes('gaia') || city.includes('matosinhos') ||
      city.includes('maia') || city.includes('gondomar') ||
      region.includes('douro') || city.includes('peso da régua') || city.includes('lamego') ||
      city.includes('pinhão') || city.includes('pinhao') ||
      state.includes('vila real') || state.includes('viseu')) return 'porto';

  // Minho Coast — Viana do Castelo district + northern towns
  if (state.includes('viana do castelo') || state.includes('viana') ||
      city.includes('viana') || city.includes('caminha') || city.includes('moledo') ||
      city.includes('âncora') || city.includes('ancora') || city.includes('afife') ||
      city.includes('carreço') || city.includes('carreco') ||
      city.includes('arcos de valdevez') || city.includes('ponte de lima') ||
      city.includes('ponte da barca') || city.includes('monção') || city.includes('moncao') ||
      city.includes('valença') || city.includes('valenca') ||
      city.includes('paredes de coura') ||
      region.includes('minho') || region.includes('norte')) return 'minho';

  // Minho Coast — Braga district (close enough to Minho Coast for our purposes)
  if (state.includes('braga') ||
      city.includes('braga') || city.includes('guimarães') || city.includes('guimaraes') ||
      city.includes('famalicão') || city.includes('famalicao') ||
      city.includes('barcelos') || city.includes('esposende') ||
      city.includes('fafe') || city.includes('vizela')) return 'minho';

  // Lisbon + Silver Coast / Centro-Oeste. The site has no dedicated "Centro"
  // or "Silver Coast" destination, so the Leiria/Oeste coastal belt (Nazaré,
  // Alcobaça, Pataias, Óbidos, Caldas, Peniche, …) maps to Lisbon — it's the
  // closest marketed region (≈1h, Silver Coast day-trips from Lisbon) and was
  // previously falling through to Minho (≈2h north — geographically wrong).
  if (state.includes('lisboa') || state.includes('setúbal') || state.includes('setubal') ||
      city.includes('lisboa') || city.includes('lisbon') || city.includes('sintra') ||
      city.includes('cascais') || city.includes('oeiras') || city.includes('estoril') ||
      city.includes('almada') || city.includes('sesimbra') || city.includes('arrábida') ||
      region.includes('lisboa') ||
      // Leiria district / Oeste / Silver Coast
      state.includes('leiria') || state.includes('santarém') || state.includes('santarem') ||
      city.includes('nazaré') || city.includes('nazare') ||
      city.includes('alcobaça') || city.includes('alcobaca') || city.includes('pataias') ||
      city.includes('óbidos') || city.includes('obidos') ||
      city.includes('caldas da rainha') || city.includes('peniche') ||
      city.includes('marinha grande') || city.includes('bombarral') ||
      city.includes('foz do arelho') || city.includes('são martinho do porto') ||
      city.includes('sao martinho do porto') || city.includes('leiria')) return 'lisbon';

  // Alentejo
  if (state.includes('évora') || state.includes('evora') ||
      state.includes('beja') || state.includes('portalegre') ||
      city.includes('évora') || city.includes('evora') ||
      city.includes('ferreira do alentejo') || city.includes('comporta') ||
      city.includes('alcácer') || city.includes('grândola') || city.includes('grandola') ||
      city.includes('santiago do cacém') || city.includes('mértola') ||
      region.includes('alentejo')) return 'alentejo';

  // Algarve
  if (state.includes('faro') ||
      city.includes('faro') || city.includes('albufeira') || city.includes('lagos') ||
      city.includes('portimão') || city.includes('portimao') || city.includes('tavira') ||
      city.includes('vilamoura') || city.includes('loulé') || city.includes('loule') ||
      city.includes('olhão') || city.includes('olhao') || city.includes('silves') ||
      city.includes('lagoa') || city.includes('aljezur') || city.includes('sagres') ||
      city.includes('vila real de santo antónio') ||
      region.includes('algarve')) return 'algarve';

  // Fallback — log warning and default to minho (most properties are there)
  console.warn(`[inferDestination] Unknown location: city="${addr.city}", region="${addr.region}", state="${addr.state}" — defaulting to minho`);
  return 'minho';
}

function mapListingToProperty(
  listing: any,
  reviews: any[] = [],
  existingSlugMap?: Map<string, string>,
) {
  const id = listing._id || listing.listingId || "";
  const title = listing.title || "Untitled";
  // Pin slugs: reuse the existing slug for this guestyId if we have one,
  // so a Guesty title change never breaks the indexed URL.
  const slug = existingSlugMap?.get(id) || slugify(title, id);
  const desc = listing.publicDescription || listing.publicDescriptions;
  const fullDesc = buildDescription(desc, listing.description);
  const tagline = buildTagline(desc, listing.description);
  const summary = desc?.summary || desc?.space || desc?.neighborhood || "";
  const pictures = listing.pictures || [];
  const images = pictures
    .filter((p: any) => p.original || p.thumbnail)
    .map((p: any) => p.original || p.thumbnail);
  const addr = listing.address || {};
  const locality = addr.city || addr.region || addr.country || "";
  const accommodates = listing.accommodates ?? 0;
  const bedrooms = listing.bedrooms ?? 0;
  const bathrooms = listing.bathrooms ?? 0;
  const prices = listing.prices || {};
  const basePrice = prices.basePrice ?? 0;
  const cleaningFee = prices.cleaningFee ?? 0;
  const currency = prices.currency || "EUR";
  const terms = listing.terms || {};
  const minNights = terms.minNights ?? terms.minNight ?? 1;
  const amenities = mapGuestyAmenities(listing);

  // Extract full address data from Guesty
  const addressData = {
    full: addr.address || "",
    street: addr.street || "",
    city: addr.city || "",
    state: addr.state || addr.region || "",
    zipcode: addr.zipCode || addr.postalCode || "",
    country: addr.country || "Portugal",
    lat: addr.lat ? Number(addr.lat) : undefined,
    lng: addr.lng ? Number(addr.lng) : undefined,
  };

  // Extract room/bedroom data
  const rooms = (listing.listingRooms ?? [])
    .filter((r: any) => r.beds?.length > 0)
    .map((r: any, i: number) => ({
      name: `Bedroom ${i + 1}`,
      beds: (r.beds ?? []).map((b: any) => ({
        type: b.type || "BED",
        quantity: b.quantity ?? 1
      }))
    })) || [];

  return {
    id: `guesty-${id}`,
    slug,
    name: title,
    tagline,
    tier: "select",
    destination: inferDestination(addr),
    locality: locality || "Portugal",
    bedrooms: Number(bedrooms) || 0,
    bathrooms: Number(bathrooms) || 0,
    maxGuests: Number(accommodates) || 0,
    priceFrom: Math.round(Number(basePrice) || 0),
    pricePerNight: Math.round(Number(basePrice) || 0),
    cleaningFee: Math.round(Number(cleaningFee) || 0),
    minNights: Number(minNights) || 1,
    currency,
    images,
    description: fullDesc || summary || `Welcome to ${title}.`,
    descriptionSections: buildDescriptionSections(desc),
    amenities,
    stayIncludes: [],
    style: "",
    tags: [],
    occasions: [],
    bookingUrl: "",
    guestyId: id,
    guestyUrl: "",
    whatsappMessage: `Hi, I am interested in ${title}`,
    sortOrder: 0,
    isActive: true,
    seoTitle: `${title} — Portugal Active`,
    seoDescription: summary.slice(0, 160) || `${title} in Portugal.`,
    address: addressData,
    rooms,
    propertyType: listing.propertyType || "Villa",
    checkInTime: listing.defaultCheckInTime || "16:00",
    checkOutTime: listing.defaultCheckOutTime || "11:00",
    areaSquareFeet: listing.areaSquareFeet || null,
    // Ship up to 20 review cards, but averageRating/reviewCount reflect the
    // FULL filtered subset (4★+5★, guest-to-host, public) — never the sliced
    // 20 and never the listing's global average. 2-decimal precision (4.87).
    reviews: reviews.slice(0, 20),
    averageRating: reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 100) / 100
      : null,
    reviewCount: reviews.length,
  };
}

/**
 * Persist synced properties to GitHub so the fallback file always
 * contains real data — survives Render's ephemeral filesystem.
 *
 * IMPORTANT: Compares content hash before committing to avoid triggering
 * Render auto-deploy loops (sync → commit → deploy → sync → commit …).
 */
async function commitToGitHub(jsonContent: string): Promise<boolean> {
  if (!GITHUB_PAT) {
    console.warn("[Guesty Sync] GITHUB_PAT not set — skipping GitHub persistence.");
    return false;
  }

  try {
    const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
    const headers = {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "PortugalActive-GuestySync/1.0",
    };

    // Get current file SHA and content hash (required for updates)
    let sha: string | undefined;
    let existingContentBase64: string | undefined;
    try {
      const getResponse = await fetch(`${apiBase}?ref=${GITHUB_BRANCH}`, { headers });
      if (getResponse.ok) {
        const fileData = (await getResponse.json()) as { sha: string; content?: string };
        sha = fileData.sha;
        existingContentBase64 = fileData.content?.replace(/\n/g, "");
      }
    } catch {
      // File may not exist yet — that's fine, we'll create it
    }

    // Encode content as base64
    const contentBase64 = Buffer.from(jsonContent, "utf-8").toString("base64");

    // Skip commit if content is identical — avoids Render auto-deploy loops
    if (existingContentBase64 && contentBase64 === existingContentBase64) {
      console.info("[Guesty Sync] GitHub file already up-to-date — skipping commit (no deploy loop).");
      return false;
    }

    const body: Record<string, string> = {
      message: `[auto-sync] Update properties from Guesty (${new Date().toISOString().slice(0, 10)})`,
      content: contentBase64,
      branch: GITHUB_BRANCH,
    };
    if (sha) {
      body.sha = sha;
    }

    const putResponse = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (putResponse.ok) {
      console.log("[Guesty Sync] ✓ Properties committed to GitHub — data will persist across deploys.");
      return true;
    }

    const errorText = await putResponse.text();
    console.warn(`[Guesty Sync] GitHub commit failed (${putResponse.status}): ${errorText.slice(0, 200)}`);
    return false;
  } catch (err: any) {
    console.warn(`[Guesty Sync] GitHub commit error: ${err.message}`);
    return false;
  }
}

export async function runSync(): Promise<string> {
  if (!isGuestyConfigured()) {
    throw new Error("Guesty is not configured. Set GUESTY_CLIENT_ID/GUESTY_CLIENT_SECRET.");
  }

  // Reset per-run content-quality counters.
  descMetrics.notesUpsellFiltered = 0;
  descMetrics.spaceDeduped = 0;
  descMetrics.gettingAroundGarbage = 0;

  console.log("[Guesty Sync] Fetching listings and reviews...");
  const [listings, allReviews] = await Promise.all([
    fetchAllListings(),
    fetchAllReviews().catch((err) => {
      console.warn(`[Guesty Sync] Reviews fetch failed (non-blocking): ${err.message}`);
      return [] as any[];
    }),
  ]);
  console.log(`[Guesty Sync] Got ${listings.length} listings, ${allReviews.length} reviews`);

  // Diagnostic: log the exact field names on the first fetched review so we can
  // confirm where guestPhoto / guestLocation live in this account's payload.
  // Logged here (right after fetch, on the raw array) — guaranteed to run even
  // if every review is later filtered out by buildReviewsByListing.
  if (allReviews.length > 0) {
    console.log("[Guesty Sync] Review sample — top-level keys:", Object.keys(allReviews[0]));
    console.log("[Guesty Sync] Review sample — rawReview keys:", Object.keys(allReviews[0].rawReview ?? {}));
  }

  if (listings.length === 0) {
    console.warn("[Guesty Sync] No listings returned — keeping existing data.");
    return "skipped (0 listings)";
  }

  const reviewsByListing = buildReviewsByListing(allReviews);
  // Enrich each review with the guest's first name (+ photo) from the guest
  // record. Non-blocking: any failure leaves "Verified guest" cards intact.
  try {
    await resolveGuestNames(reviewsByListing);
  } catch (err: any) {
    console.warn(`[Guesty Sync] Guest-name resolution failed (non-blocking): ${err?.message ?? err}`);
  }
  const existingSlugMap = await loadExistingSlugMap();
  console.log(`[Guesty Sync] Loaded ${existingSlugMap.size} pinned slugs from existing data`);
  const properties = listings.map((listing) => {
    const rawId = listing._id || listing.listingId || "";
    const listingReviews = reviewsByListing.get(rawId) || [];
    return mapListingToProperty(listing, listingReviews, existingSlugMap);
  });

  // Content-quality report — tracks the editorial cleanup of older listings.
  console.log(
    `[Guesty Sync] Description hygiene — notes upsell filtered: ${descMetrics.notesUpsellFiltered}, ` +
      `space deduped: ${descMetrics.spaceDeduped}, getting-around garbage: ${descMetrics.gettingAroundGarbage}`,
  );

  const jsonContent = JSON.stringify(properties, null, 2);

  // 1. Write to local runtime file (fast reads during this server's lifetime)
  const outDir = join(process.cwd(), "data");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "properties-synced.json");
  await writeFile(outPath, jsonContent, "utf-8");
  console.log(`[Guesty Sync] Wrote ${properties.length} properties to ${outPath}`);

  // 2. Also update the static fallback in the repo via GitHub API
  //    This ensures data survives Render redeploys (ephemeral filesystem)
  await commitToGitHub(jsonContent);

  return outPath;
}
