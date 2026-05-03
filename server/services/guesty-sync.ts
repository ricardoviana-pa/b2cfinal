/**
 * GUESTY SYNC — Pulls listings (photos, texts, pricing) from Guesty.
 * Writes to data/properties-synced.json (runtime) AND commits to GitHub
 * so data persists across Render deploys (ephemeral filesystem).
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
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

/** Group reviews by listingId, filter rating >= 4, sort newest first */
function buildReviewsByListing(reviews: any[]): Map<string, any[]> {
  const byListing = new Map<string, any[]>();

  for (const review of reviews) {
    const listingId = review.listingId;
    if (!listingId) continue;

    const raw = review.rawReview || review;
    const rating = Number(raw.overall_rating ?? raw.overallRating ?? raw.rating ?? 0);
    const text = (raw.public_review || raw.publicReview || raw.comments || "").trim();

    // Only include reviews with rating >= 4 and non-empty text
    if (rating < 4 || !text) continue;

    // Build category ratings from flat fields (Guesty v1 format)
    const categories: Array<{ name: string; score: number }> = [];
    for (const cat of ["cleanliness", "accuracy", "checkin", "communication", "location", "value"]) {
      const score = Number(raw[`category_ratings_${cat}`] ?? 0);
      if (score > 0) categories.push({ name: cat, score });
    }

    const mapped = {
      rating,
      text: text.slice(0, 500),
      guestName: review.guestName || raw.reviewer_name || "Guest",
      date: review.createdAt || review.date || "",
      categories,
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

  // Lisbon
  if (state.includes('lisboa') || state.includes('setúbal') || state.includes('setubal') ||
      city.includes('lisboa') || city.includes('lisbon') || city.includes('sintra') ||
      city.includes('cascais') || city.includes('oeiras') || city.includes('estoril') ||
      city.includes('almada') || city.includes('sesimbra') || city.includes('arrábida') ||
      region.includes('lisboa')) return 'lisbon';

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

function mapListingToProperty(listing: any, reviews: any[] = []) {
  const id = listing._id || listing.listingId || "";
  const title = listing.title || "Untitled";
  const slug = slugify(title, id);
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
    reviews: reviews.slice(0, 20), // Cap at 20 most recent reviews per property
    averageRating: reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
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

  console.log("[Guesty Sync] Fetching listings and reviews...");
  const [listings, allReviews] = await Promise.all([
    fetchAllListings(),
    fetchAllReviews().catch((err) => {
      console.warn(`[Guesty Sync] Reviews fetch failed (non-blocking): ${err.message}`);
      return [] as any[];
    }),
  ]);
  console.log(`[Guesty Sync] Got ${listings.length} listings, ${allReviews.length} reviews`);

  if (listings.length === 0) {
    console.warn("[Guesty Sync] No listings returned — keeping existing data.");
    return "skipped (0 listings)";
  }

  const reviewsByListing = buildReviewsByListing(allReviews);
  const properties = listings.map((listing) => {
    const rawId = listing._id || listing.listingId || "";
    const listingReviews = reviewsByListing.get(rawId) || [];
    return mapListingToProperty(listing, listingReviews);
  });
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
