#!/usr/bin/env tsx
/**
 * Cleaning-fee sync CLI.
 *
 *   pnpm tsx scripts/cleaning-fees.ts audit
 *     → read-only drift report (JSON + human table). Never writes.
 *
 *   pnpm tsx scripts/cleaning-fees.ts apply [--listing=<id>] [--apply]
 *     → without --apply: dry-run (logs intended PUTs, no write).
 *     → with --apply: executes PUT against Guesty Open API.
 *     → optional --listing=<id> restricts to one listing (e.g. Madorra).
 *
 * Reads GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET from env. Run in Render
 * shell (where prod creds live) or add the creds temporarily to .env.local.
 */

import "dotenv/config";
import { auditCleaningFeeDrift, applyCleaningFeeFix } from "../server/services/cleaning-fee-sync.ts";

const args = process.argv.slice(2);
const cmd = args[0];
const flagApply = args.includes("--apply");
const listingFilter = args.find((a) => a.startsWith("--listing="))?.split("=")[1];

function fmt(n: number): string {
  return n.toFixed(2).padStart(7);
}

function printTable(rows: Array<Record<string, any>>): void {
  if (rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(keys));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const r of rows) console.log(line(keys.map((k) => String(r[k] ?? ""))));
}

async function main() {
  if (cmd === "audit") {
    console.log("Scanning all active listings + their rate plans...\n");
    const res = await auditCleaningFeeDrift();
    console.log(`Scanned ${res.scannedListings} listings → ${res.scannedRatePlans} rate plans`);
    console.log(`  in sync : ${res.inSync.length}`);
    console.log(`  drift   : ${res.outOfSync.length}`);
    console.log(`  errors  : ${res.errors.length}\n`);

    if (res.outOfSync.length > 0) {
      console.log("=== Out of sync (rate plan ≠ listing) ===");
      printTable(
        res.outOfSync.map((e) => ({
          listing: e.listingTitle.slice(0, 30),
          "listing fee": fmt(e.listingCleaningFee),
          "rate plan": e.ratePlanName.slice(0, 28),
          "plan fee": fmt(e.ratePlanCleaningFee),
          drift: fmt(e.driftAmount),
        })),
      );
      console.log("");
    }

    if (res.errors.length > 0) {
      console.log("=== Errors ===");
      for (const e of res.errors) console.log(`  listing=${e.listingId}  ${e.error}`);
      console.log("");
    }

    process.exit(0);
  }

  if (cmd === "apply") {
    const dryRun = !flagApply;
    console.log(
      `\nMode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY (writing to Guesty)"}` +
        (listingFilter ? `  •  Filter: listingId=${listingFilter}` : "") +
        "\n",
    );
    const res = await applyCleaningFeeFix({
      dryRun,
      listingId: listingFilter,
      onStep: (m) => console.log(m),
    });
    console.log("");
    console.log(`Scanned   : ${res.scannedListings} listings / ${res.scannedRatePlans} rate plans`);
    console.log(`Out of sync (matching filter): ${res.attempted}`);
    console.log(`${dryRun ? "Would update" : "Updated"}     : ${res.succeeded}`);
    console.log(`Failed       : ${res.failed.length}`);
    if (res.failed.length > 0) {
      console.log("\n=== Failures ===");
      for (const f of res.failed) {
        console.log(`  ${f.entry.listingTitle} / ${f.entry.ratePlanName}: ${f.error}`);
      }
    }
    if (dryRun && res.attempted > 0) {
      console.log("\nRe-run with --apply to execute the PUTs above.");
    }
    process.exit(res.failed.length > 0 ? 1 : 0);
  }

  console.error(
    "Usage:\n" +
      "  tsx scripts/cleaning-fees.ts audit\n" +
      "  tsx scripts/cleaning-fees.ts apply [--listing=<id>] [--apply]\n",
  );
  process.exit(2);
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  if (err?.details) console.error("  details:", err.details);
  process.exit(1);
});
