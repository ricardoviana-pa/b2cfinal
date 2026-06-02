#!/usr/bin/env tsx
/**
 * Refundable rate-plan coverage audit.
 *
 *   pnpm tsx scripts/refundable-plan-audit.ts
 *
 * Lists every active Guesty listing and reports which ones DO and DO NOT
 * have a "Refundable" rate plan published to the Booking Engine channel.
 *
 * Output: a table showing the rate plan inventory per listing + a final
 * list of listings that need a Refundable plan added in the Guesty UI.
 *
 * Heuristic for "refundable plan exists":
 *   - Rate plan name contains "refund" (case-insensitive)
 *     AND does NOT contain "non" / "não"
 *   - OR cancellation policy is "flexible" / "moderate" / "firm"
 * Heuristic for "non-refundable plan exists":
 *   - Rate plan name contains "non" + "refund" OR "não" + "reembols"
 *   - OR cancellation policy is "super_strict" / "strict"
 *
 * Read-only. Never writes to Guesty.
 */

import "dotenv/config";
import { guestyClient } from "../server/lib/guesty.ts";

interface PlanSummary {
  name: string;
  id: string;
  policy: string;
  cleaningFee: number;
  classification: "refundable" | "non-refundable" | "unknown";
}

interface ListingReport {
  id: string;
  title: string;
  plans: PlanSummary[];
  hasRefundable: boolean;
  hasNonRefundable: boolean;
  needsAction: boolean;
}

function readPlanField(rp: any, key: string): any {
  return rp?.[key] ?? rp?.ratePlan?.[key];
}

function classify(name: string, policy: string): PlanSummary["classification"] {
  const n = name.toLowerCase();
  const p = policy.toLowerCase();
  if (n.includes("non") && n.includes("refund")) return "non-refundable";
  if (n.includes("não") && n.includes("reembols")) return "non-refundable";
  if (p === "super_strict" || p === "strict") return "non-refundable";
  if (n.includes("refund")) return "refundable";
  if (n.includes("flex") || n.includes("free cancel")) return "refundable";
  if (p === "flexible" || p === "moderate" || p === "firm") return "refundable";
  return "unknown";
}

async function listAllActiveListings(): Promise<Array<{ id: string; title: string }>> {
  const pageSize = 100;
  const out: Array<{ id: string; title: string }> = [];
  let skip = 0;
  let total = Infinity;
  while (skip < total) {
    const res: any = await guestyClient.getListings({
      limit: pageSize,
      skip,
      active: true,
      listed: true,
      fields: "title",
    });
    const items: any[] = res?.results ?? res?.data ?? res?.items ?? [];
    if (skip === 0) total = Number(res?.count ?? res?.total ?? items.length) || items.length;
    for (const it of items) {
      out.push({ id: String(it._id ?? it.id ?? ""), title: String(it.title ?? "(untitled)") });
    }
    if (items.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

async function buildReport(): Promise<ListingReport[]> {
  const listings = await listAllActiveListings();
  const out: ListingReport[] = [];
  for (const l of listings) {
    let plans: PlanSummary[] = [];
    try {
      const res: any = await guestyClient.getListingRatePlans(l.id);
      const arr: any[] = res?.results ?? res?.data ?? res?.ratePlans ?? res ?? [];
      plans = arr.map((rp) => {
        const name = String(readPlanField(rp, "name") ?? "(unnamed)");
        const policy = String(readPlanField(rp, "cancellationPolicy") ?? "");
        const money = readPlanField(rp, "money") ?? {};
        const cleaningFee = Number(money.fareCleaning ?? money.cleaningFee ?? 0) || 0;
        const id = String(readPlanField(rp, "_id") ?? readPlanField(rp, "id") ?? "");
        return { name, id, policy, cleaningFee, classification: classify(name, policy) };
      });
    } catch (err: any) {
      console.error(`  ERROR fetching rate plans for ${l.title}: ${err?.message ?? err}`);
    }
    const hasRefundable = plans.some((p) => p.classification === "refundable");
    const hasNonRefundable = plans.some((p) => p.classification === "non-refundable");
    out.push({
      id: l.id,
      title: l.title,
      plans,
      hasRefundable,
      hasNonRefundable,
      needsAction: !hasRefundable,
    });
  }
  return out;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

async function main() {
  console.log("Scanning all active listings + their rate plans...\n");
  const report = await buildReport();

  console.log("=== Rate plan inventory ===\n");
  console.log(pad("Listing", 38) + "  " + pad("Refundable?", 14) + "  " + pad("Non-Refundable?", 18) + "  Plans");
  console.log("-".repeat(38) + "  " + "-".repeat(14) + "  " + "-".repeat(18) + "  " + "-".repeat(40));
  for (const r of report) {
    const planNames = r.plans.map((p) => `${p.name}(${p.classification})`).join("; ");
    console.log(
      pad(r.title, 38) +
        "  " +
        pad(r.hasRefundable ? "✓ yes" : "✗ MISSING", 14) +
        "  " +
        pad(r.hasNonRefundable ? "✓ yes" : "—", 18) +
        "  " +
        planNames,
    );
  }

  const needsAction = report.filter((r) => r.needsAction);
  console.log("");
  console.log(`Total listings scanned : ${report.length}`);
  console.log(`Have Refundable plan   : ${report.length - needsAction.length}`);
  console.log(`MISSING Refundable     : ${needsAction.length}`);
  console.log("");

  if (needsAction.length > 0) {
    console.log("=== Listings that need a Refundable plan added ===\n");
    for (const r of needsAction) {
      console.log(`  • ${r.title}`);
      console.log(`    listingId: ${r.id}`);
      console.log(`    Existing plans: ${r.plans.map((p) => p.name).join(", ") || "(none)"}`);
    }
    console.log("");
    console.log("→ Follow the cowork prompt in scripts/REFUNDABLE_PLAN_COWORK_PROMPT.md");
    console.log("  to create the Refundable plan in the Guesty dashboard for each.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
