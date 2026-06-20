#!/usr/bin/env tsx
/**
 * Multi-unit investigation: does the Guesty Open API expose a parent/child
 * (complex / multi-unit) relationship on individual listings?
 *
 *   pnpm tsx scripts/multiunit-investigate.ts
 *
 * Re-fetches every active+listed listing with all candidate fields included,
 * then reports per-listing which fields are populated and groups listings
 * that share the same complexId / multiUnitListingId / etc.
 *
 * Output answers the question for Task 3 Fase 0: Caso A (native parent/child
 * via complexId) or Caso B (no native grouping — manual map required).
 */

import "dotenv/config";
import { guestyClient } from "../server/lib/guesty.ts";

const CANDIDATE_FIELDS = [
  "complexId",
  "complex",
  "listingType",
  "multiUnitListingId",
  "parentListingId",
  "parentId",
  "rootListingId",
  "isMultiUnit",
  "isComplex",
  "siblingListingIds",
  "unifiedCalendar",
  "unifiedCalendarBlocked",
];

async function listAll(): Promise<any[]> {
  const pageSize = 100;
  const out: any[] = [];
  let skip = 0;
  while (true) {
    const res: any = await guestyClient.getListings({
      limit: pageSize,
      skip,
      active: true,
      listed: true,
      fields: ["title", "address", "bedrooms", "bathrooms", ...CANDIDATE_FIELDS].join(" "),
    });
    const items: any[] = res?.results ?? res?.data ?? res?.items ?? [];
    out.push(...items);
    if (items.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

async function main() {
  console.log("Re-fetching all listings with multi-unit candidate fields...\n");
  const listings = await listAll();
  console.log(`Total listings: ${listings.length}\n`);

  // Per-field population stats
  console.log("=== Field population (candidates that came back populated) ===\n");
  const fieldHits: Record<string, number> = {};
  for (const field of CANDIDATE_FIELDS) {
    const populated = listings.filter((l) => l[field] !== undefined && l[field] !== null && l[field] !== "");
    fieldHits[field] = populated.length;
    if (populated.length > 0) {
      console.log(`  ${field.padEnd(25)} : populated on ${populated.length}/${listings.length} listings`);
      // Show one sample value
      const sample = populated[0];
      const v = sample[field];
      const preview = typeof v === "string" ? v : JSON.stringify(v).slice(0, 80);
      console.log(`     sample (${sample.title.slice(0, 40)}): ${preview}`);
    }
  }
  const populated = Object.entries(fieldHits).filter(([, n]) => n > 0);
  if (populated.length === 0) {
    console.log("  (none — the Guesty Open API doesn't return any of the candidate fields for this account)");
  }

  // Group by complexId / multiUnitListingId / parentListingId
  console.log("\n=== Possible clusters from native fields ===\n");
  const clusterCandidates = ["complexId", "multiUnitListingId", "parentListingId", "rootListingId"];
  let foundAny = false;
  for (const field of clusterCandidates) {
    const byVal: Record<string, any[]> = {};
    for (const l of listings) {
      const v = l[field];
      if (v === undefined || v === null || v === "") continue;
      const key = String(v);
      byVal[key] = byVal[key] || [];
      byVal[key].push(l);
    }
    const groups = Object.entries(byVal).filter(([, arr]) => arr.length >= 2);
    if (groups.length > 0) {
      foundAny = true;
      console.log(`Field "${field}" forms ${groups.length} groups:\n`);
      for (const [val, members] of groups) {
        console.log(`  ${field}=${val}:`);
        for (const m of members) {
          console.log(`    • ${m.title.slice(0, 60)}  (id=${m._id})`);
        }
      }
    }
  }
  if (!foundAny) {
    console.log("  (no native field forms a cluster — multi-unit grouping is NOT exposed)");
  }

  // Fallback: cluster by shared address (proxy for the same physical complex)
  console.log("\n=== Clusters by shared full address (fallback) ===\n");
  const byAddr: Record<string, any[]> = {};
  for (const l of listings) {
    const a = String(l.address?.full ?? l.address?.street ?? "").toLowerCase().trim();
    if (!a) continue;
    byAddr[a] = byAddr[a] || [];
    byAddr[a].push(l);
  }
  for (const [addr, members] of Object.entries(byAddr).sort((a, b) => b[1].length - a[1].length)) {
    if (members.length < 2) continue;
    console.log(`📍 ${addr.slice(0, 80)}`);
    for (const m of members) {
      console.log(`   • ${(m.title || "(untitled)").slice(0, 60)}  (${m.bedrooms}br/${m.bathrooms}ba, id=${m._id})`);
    }
    console.log("");
  }

  // VERDICT
  console.log("\n========================================");
  console.log("VERDICT");
  console.log("========================================\n");
  if (foundAny) {
    console.log("CASO A: Guesty exposes native parent/child grouping. Use the populated cluster field.");
  } else {
    console.log("CASO B: No native parent/child grouping. Manual map required — use the shared-address");
    console.log("clusters above (or curate by hand) as the grouping source. Add the mapping to");
    console.log("src/config/propertyGroups.ts before building Task 3 Fases 1-3.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
