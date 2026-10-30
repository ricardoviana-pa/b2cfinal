/**
 * Merge client/src/data/reviews.manual.json into client/src/data/properties.json.
 *
 * The Guesty sync does this on every run, but it only runs where the Guesty
 * credentials live (Render). This applies the same merge to the committed
 * fallback so curated reviews go live on the next deploy instead of waiting
 * for the nightly sync — and so the effect is visible before publishing.
 *
 * Every rating counts (29 out 2026): nothing is purged by rating, and the
 * aggregate is the real one over the merged set (shared/reviewStats.ts).
 *
 *   npm run reviews:audit    report only
 *   npm run reviews:apply    write properties.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mergeManualReviews } from "../server/services/guesty-sync";
import { publishableReviews, reviewAggregate } from "../shared/reviewStats";

const ROOT = process.cwd();
const PROPS = join(ROOT, "client", "src", "data", "properties.json");
const MANUAL = join(ROOT, "client", "src", "data", "reviews.manual.json");
const APPLY = process.argv.includes("--apply");

/** Mirrors the PDP filter (shared/reviewStats.ts, publishableReviews). */
const displayable = (reviews: any[]): number => publishableReviews(reviews).length;
const avg = (reviews: any[]) => reviewAggregate(reviews).average?.toFixed(2) ?? "—";

const props = JSON.parse(await readFile(PROPS, "utf-8")) as any[];
const manualRaw = JSON.parse(await readFile(MANUAL, "utf-8")) as Record<string, unknown>;
const manual = Object.fromEntries(
  Object.entries(manualRaw).filter(([k, v]) => !k.startsWith("_") && Array.isArray(v)),
) as Record<string, any[]>;

const curatedTotal = Object.values(manual).reduce((n, a) => n + a.length, 0);
console.log(`Curated file: ${curatedTotal} reviews across ${Object.keys(manual).length} keys.\n`);

let changed = 0;
let added = 0;
const rows: string[] = [];

for (const p of props) {
  const curated = manual[p.guestyId] ?? manual[p.slug];
  if (!curated?.length) continue;

  const before = (p.reviews ?? []) as any[];
  const merged = mergeManualReviews(before, curated);
  const gained = merged.length - before.length;
  if (gained === 0) {
    rows.push(`  = ${p.name} — nothing new (all ${curated.length} already present)`);
    continue;
  }

  changed++;
  added += gained;
  rows.push(
    `  + ${p.name}: ${displayable(before)} → ${displayable(merged)} shown ` +
      `(${before.length} → ${merged.length} total, avg ${p.averageRating ?? "—"} → ${avg(merged)})`,
  );

  if (APPLY) {
    // Same contract as the sync: cards are capped, the aggregate is not.
    const aggregate = reviewAggregate(merged);
    p.reviews = merged.slice(0, 40);
    p.averageRating = aggregate.average;
    p.reviewCount = aggregate.count;
  }
}

console.log(rows.join("\n") || "  (no curated reviews to merge yet)");
console.log(`\n${changed} homes would gain ${added} reviews.`);

if (APPLY && changed) {
  await writeFile(PROPS, JSON.stringify(props, null, 2) + "\n", "utf-8");
  console.log(`\nWrote ${PROPS}`);
} else if (!APPLY && changed) {
  console.log("\nDry run — re-run with `npm run reviews:apply` to write.");
}
