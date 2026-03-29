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
    "title publicDescriptions description pictures address accommodates bedrooms bathrooms prices terms amenities amenitiesNotIncluded customFields";

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

function slugify(title: string, id: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "property";
  return `${base}-${id.slice(-6)}`;
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
  const c = (addr.city || "").toLowerCase();
  const r = (addr.region || "").toLowerCase();
  if (c.includes("viana") || c.includes("porto") || r.includes("norte") || r.includes("minho")) return "minho";
  if (c.includes("porto") || r.includes("douro")) return "porto";
  if (c.includes("faro") || c.includes("albufeira") || c.includes("lagos") || r.includes("algarve")) return "algarve";
  if (c.includes("lisboa") || r.includes("lisboa")) return "lisbon";
  return "algarve";
}

function mapListingToProperty(listing: any) {
  const id = listing._id || listing.listingId || "";
  const title = listing.title || "Untitled";
  const slug = slugify(title, id);
  const desc = listing.publicDescriptions;
  const fullDesc = buildDescription(desc, listing.description);
  const summary = desc?.summary || desc?.space || desc?.neighborhood || "";
  const tagline = summary.slice(0, 150) + (summary.length > 150 ? "…" : "");
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

  console.log("[Guesty Sync] Fetching listings...");
  const listings = await fetchAllListings();
  console.log(`[Guesty Sync] Got ${listings.length} listings`);

  if (listings.length === 0) {
    console.warn("[Guesty Sync] No listings returned — keeping existing data.");
    return "skipped (0 listings)";
  }

  const properties = listings.map(mapListingToProperty);
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
