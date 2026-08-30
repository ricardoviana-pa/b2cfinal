/**
 * Merge client/src/data/reviews.manual.json into client/src/data/properties.json.
 *
 * The Guesty sync does this on every run, but it only runs where the Guesty
 * credentials live (Render). This applies the same merge to the committed
 * fallback so curated reviews go live on the next deploy instead of waiting
 * for the nightly sync — and so the effect is visible before publishing.
 *
 *   npm run reviews:audit    report only
 *   npm run reviews:apply    write properties.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mergeManualReviews } from "../server/services/guesty-sync";

const ROOT = process.cwd();
const PROPS = join(ROOT, "client", "src", "data", "properties.json");
const MANUAL = join(ROOT, "client", "src", "data", "reviews.manual.json");
const APPLY = process.argv.includes("--apply");

/** Mirrors the PDP filter in client/src/components/property/ReviewsSection.tsx. */
const CHANNEL_RE = /\bairbnb\b|booking\.com|\bvrbo\b|\bexpedia\b|homeaway/i;
function displayable(reviews: any[]): number {
  return reviews.filter((r) => {
    const text = String(r.text || "").trim();
    const letters = text.replace(/[^\p{L}]/gu, "").length;
    return Math.round(r.rating) === 5 && letters >= 3 && !CHANNEL_RE.test(text);
  }).length;
}

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

let purged = 0;
for (const p of props) {
  // 5★ only: drop anything the old 4★-era sync left behind, whether or not
  // this home has curated reviews, so averageRating/reviewCount are rebuilt
  // from the published set alone.
  const kept = (p.reviews ?? []).filter((r: any) => Math.round(Number(r.rating)) === 5);
  if (kept.length !== (p.reviews ?? []).length) {
    purged += (p.reviews ?? []).length - kept.length;
    if (APPLY) {
      p.reviews = kept;
      p.reviewCount = kept.length;
      p.averageRating = kept.length ? 5 : null;
    }
  }

  const curated = manual[p.guestyId] ?? manual[p.slug];
  if (!curated?.length) continue;

  const before = kept;
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
      `(${before.length} → ${merged.length} total, avg ${p.averageRating ?? "—"} → ` +
      `${(Math.round((merged.reduce((s, r) => s + r.rating, 0) / merged.length) * 100) / 100).toFixed(2)})`,
  );

  if (APPLY) {
    // Same contract as the sync: cards are capped, the aggregate is not.
    p.reviews = merged.slice(0, 40);
    p.averageRating = Math.round((merged.reduce((s, r) => s + r.rating, 0) / merged.length) * 100) / 100;
    p.reviewCount = merged.length;
  }
}

console.log(rows.join("\n") || "  (no curated reviews to merge yet)");
console.log(`\n${changed} homes would gain ${added} reviews.`);
if (purged) console.log(`${purged} sub-5★ reviews dropped (site publishes 5★ only).`);

if (APPLY && (changed || purged)) {
  await writeFile(PROPS, JSON.stringify(props, null, 2) + "\n", "utf-8");
  console.log(`\nWrote ${PROPS}`);
} else if (!APPLY && changed) {
  console.log("\nDry run — re-run with `npm run reviews:apply` to write.");
}
