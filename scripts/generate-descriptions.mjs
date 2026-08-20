#!/usr/bin/env node
/**
 * Brand-copy generator for property descriptions.
 *
 * The first 15 curated homes were written by hand into
 * client/src/data/descriptions.overrides.json (the sync applies overrides on
 * every run, so Guesty never clobbers approved copy). This script drafts the
 * remaining homes — and any future ones — in the same house style, WITHOUT
 * overwriting entries that already exist: review the diff, edit what you
 * dislike, commit.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-descriptions.mjs           # all missing
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-descriptions.mjs --limit=5
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-descriptions.mjs --slug=<slug>
 */
import { readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("Missing ANTHROPIC_API_KEY."); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, "").split("=")));
const LIMIT = args.limit ? Number(args.limit) : Infinity;

const PROPS = JSON.parse(readFileSync("client/src/data/properties.json", "utf8"));
const OUT_PATH = "client/src/data/descriptions.overrides.json";
let overrides = {};
try { overrides = JSON.parse(readFileSync(OUT_PATH, "utf8")); } catch { /* first run */ }

const STYLE = `You write property descriptions for Portugal Active, a Portuguese company that
operates luxury private homes ("private hotels") end to end with its own local team.
HOUSE STYLE — non-negotiable:
- Structure: 4 short paragraphs — (1) the house itself, concrete and specific;
  (2) the place around it, with real distances/names from the source; (3) a
  small ritual of a day there (mornings, evenings — sensory, specific);
  (4) who it is for + the team/concierge, one sentence.
- 120–170 words total. Plus a tagline of at most 110 characters.
- Ground EVERY claim in the source facts provided. Never invent amenities,
  views, distances or history. If the source is thin, write less.
- BANNED: "gateway to", "redefines", "epitome of", "paradise", "nestled",
  "breathtaking", "unforgettable", "where X meets Y", "luxury living",
  "home away from home", exclamation marks, and starting with "Welcome to".
- Voice: confident, warm, economical. British English. The reader is booking
  a €3–15k stay; respect their intelligence.
Return STRICT JSON: {"tagline": "...", "description": "para1\\n\\npara2\\n\\npara3\\n\\npara4"}`;

async function draft(home) {
  const amenities = Object.values(home.amenities || {}).flat().join(", ");
  const src = `NAME: ${home.name}
LOCATION: ${home.locality}, ${home.destination} region
CAPACITY: ${home.bedrooms} bedrooms, ${home.bathrooms} bathrooms, up to ${home.maxGuests} guests
TYPE: ${home.propertyType}
AMENITIES: ${amenities}
CURRENT DESCRIPTION (source of facts — extract, do not copy the prose):
${(home.description || "").slice(0, 2200)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 900,
      system: STYLE,
      messages: [{ role: "user", content: src }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

const queue = PROPS.filter(h =>
  h.guestyId && h.isActive !== false && !overrides[h.guestyId] &&
  !/test/i.test(h.name) && (!args.slug || h.slug === args.slug),
).slice(0, LIMIT);

console.log(`${queue.length} homes to draft (existing overrides untouched: ${Object.keys(overrides).length})`);
for (const home of queue) {
  try {
    const copy = await draft(home);
    if (!copy.description || !copy.tagline) throw new Error("incomplete JSON");
    overrides[home.guestyId] = copy;
    writeFileSync(OUT_PATH, JSON.stringify(overrides, null, 2) + "\n");
    console.log(`  ✓ ${home.name.slice(0, 50)}`);
  } catch (err) {
    console.warn(`  ✗ ${home.name.slice(0, 50)}: ${err.message}`);
  }
}
console.log(`\nDone. Review the diff of ${OUT_PATH}, edit freely, commit. The next Guesty sync applies it.`);
