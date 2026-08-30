/**
 * Convert a raw Airbnb host-dashboard review dump into reviews.manual.json.
 *
 * Input: JSON array of { guest, dates, listing, rating, text } as read from
 * airbnb.pt/performance/quality/overall/reviews. Airbnb truncates listing
 * names at ~50 chars and localises them (PT on the dashboard, EN on the site),
 * so listings are matched by token overlap with an alias table for the rest.
 *
 *   npm run reviews:import -- <dump.json>            report only
 *   npm run reviews:import -- <dump.json> --apply    write reviews.manual.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const PROPS = join(ROOT, "client", "src", "data", "properties.json");
const MANUAL = join(ROOT, "client", "src", "data", "reviews.manual.json");
const APPLY = process.argv.includes("--apply");
const dumpPath = process.argv[2];
if (!dumpPath || dumpPath.startsWith("--")) {
  console.error("usage: npm run reviews:import -- <dump.json> [--apply]");
  process.exit(1);
}

/** Airbnb PT listing names that token-matching cannot reach on its own. */
const ALIASES: Record<string, string> = {
  "quinta rural alentejana com piscina aquecida e pri": "alentejo-rural-farmhouse-with-pool-and-total-privacy-9a3c37",
  "casa de campo slow living da portugal active": "slow-living-countryside-house-by-portugal-active-10e1c1",
  "portugal ativo bluegreen beach apartment": "portugal-active-bluegreen-beach-apartment-92fdbb",
  "alvarinho villa — 5 suites com piscina aquecida": "alvarinho-villa-5-suites-heated-pool-4854c5",
  "lima river - casa s. silvestre": "lima-river-s-silvestre-house-e28802",
  "lima river - casa s. salvador": "lima-river-s-salvador-house-5cef22",
  "quinta de praia - piscina e jacuzzi com vista para": "beach-farm-pool-and-jacuzzi-with-sea-view-83ef5f",
  "sunset beach lodge | piscina aquecida": "portugal-active-sunset-beach-lodge-heated-pool-5ceb91",
  "portugal active eben lodge | piscina aquecida": "portugal-active-eben-lodge-heated-pool-10ecfe",
  "azenha historica · acesso a praia fluvial": "historic-riverfront-watermill-private-beach-access-47452c",
  "azenha histórica · acesso à praia fluvial": "historic-riverfront-watermill-private-beach-access-47452c",
  "casa do moinho · acesso privado a praia": "riverside-watermill-house-private-beach-access-7188ad",
  "casa do moinho · acesso privado à praia": "riverside-watermill-house-private-beach-access-7188ad",
  "loft u2 by portugal active": "u2-loft-at-the-riverside-watermill-1bed48",
  "dunes beach house — piscina & praia": "dunes-beach-house-with-ocean-views-cb71c9",
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
   .replace(/[^a-z0-9]+/g, " ").trim();

/** Words that appear in almost every listing name and so carry no signal. */
const STOP = new Set(["by", "portugal", "active", "ativo", "i", "the", "and", "with", "de", "da", "e", "com", "a", "of"]);
const tokens = (s: string) => norm(s).split(" ").filter(t => t.length > 1 && !STOP.has(t));

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** "27–30 de ago. de 2026" / "27 de fev. – 1 de mar. de 2026" → checkout ISO date. */
function parseCheckout(dates: string): string {
  const s = dates.replace(/–|—/g, "-");
  const months = [...s.matchAll(/\b([a-zç]{3})\.?/gi)].map(m => m[1].toLowerCase()).filter(m => m in MONTHS);
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
  const days = [...s.matchAll(/\b(\d{1,2})\b(?!\d)/g)].map(m => Number(m[1])).filter(d => d >= 1 && d <= 31);
  const month = MONTHS[months[months.length - 1]] ?? 1;
  const year = years[years.length - 1] ?? new Date().getFullYear();
  const day = days[days.length - 1] ?? 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const props = JSON.parse(await readFile(PROPS, "utf-8")) as any[];
const candidates = props
  .filter(p => !/^Test_/i.test(p.name || ""))
  .map(p => ({ slug: p.slug, name: p.name, toks: new Set(tokens(p.name)) }));

function matchSlug(listing: string): string | null {
  const alias = ALIASES[norm(listing).replace(/\s+/g, " ")] ?? ALIASES[listing.toLowerCase().trim()];
  if (alias) return alias;
  const t = tokens(listing);
  if (!t.length) return null;
  let best: { slug: string; score: number } | null = null;
  for (const c of candidates) {
    // Airbnb truncates, so score by how much of the SHORTER name is covered.
    const hits = t.filter(x => c.toks.has(x)).length;
    const score = hits / Math.min(t.length, c.toks.size || 1);
    if (!best || score > best.score) best = { slug: c.slug, score };
  }
  return best && best.score >= 0.6 ? best.slug : null;
}

const raw = JSON.parse(await readFile(dumpPath, "utf-8")) as any[];
console.log(`Dump: ${raw.length} reviews.\n`);

const bySlug = new Map<string, any[]>();
const unmatched = new Map<string, number>();
let dropped = { lowRating: 0, noText: 0, channel: 0 };
const CHANNEL_RE = /\bairbnb\b|booking\.com|\bvrbo\b|\bexpedia\b|homeaway/i;

/** Airbnb prefixes a body with the trip type; it is chrome, not the guest's words.
 *  Matched exactly — a real review may legitimately open with "Estadia incrível". */
const TRIP_LABEL = /^(Estadia com crianças|Estadia com um animal de estimação|Estadia com bebé|Estadia em família|Estadia romântica|Viagem em grupo|Viagem de negócios|Viagem a solo)\s+/;

/** The reviewer's city sometimes lands where the name should be ("Seattle,"). */
const looksLikeCity = (n: string) => /,$/.test(n.trim());

for (const r of raw) {
  const rating = Number(r.rating || 0);
  const text = String(r.text || "").trim().replace(TRIP_LABEL, "").trim();
  if (rating < 5) { dropped.lowRating++; continue; }
  if (text.replace(/[^\p{L}]/gu, "").length < 12) { dropped.noText++; continue; }
  if (CHANNEL_RE.test(text)) { dropped.channel++; continue; }
  const slug = matchSlug(String(r.listing || ""));
  if (!slug) { unmatched.set(r.listing, (unmatched.get(r.listing) ?? 0) + 1); continue; }
  if (!bySlug.has(slug)) bySlug.set(slug, []);
  bySlug.get(slug)!.push({
    rating: 5,
    text,
    // Blank rather than wrong: an unnamed card reads as a verified guest.
    guestName: looksLikeCity(String(r.guest || "")) ? "" : (String(r.guest || "").trim().split(/\s+/)[0] || ""),
    // Pre-normalised ISO date wins; otherwise parse Airbnb's stay range.
    date: /^20\d\d-\d\d-\d\d$/.test(String(r.date || "")) ? String(r.date) : parseCheckout(String(r.dates || "")),
  });
}

console.log(`Dropped: ${dropped.lowRating} below 5★, ${dropped.noText} too short, ${dropped.channel} name a channel.`);
if (unmatched.size) {
  console.log(`\nUNMATCHED listings (add to ALIASES):`);
  for (const [l, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}×  ${l}`);
}

const out: Record<string, any> = JSON.parse(await readFile(MANUAL, "utf-8"));
let total = 0;
console.log(`\nMatched:`);
for (const [slug, reviews] of [...bySlug.entries()].sort((a, b) => b[1].length - a[1].length)) {
  reviews.sort((a, b) => b.date.localeCompare(a.date));
  const capped = reviews.slice(0, 25);   // 25 is well past what any PDP renders
  total += capped.length;
  const p = props.find(x => x.slug === slug);
  console.log(`  ${String(capped.length).padStart(3)}  ${p?.name ?? slug}`);
  if (APPLY) out[slug] = capped;
}
console.log(`\n${total} five-star reviews across ${bySlug.size} homes.`);

if (APPLY) {
  await writeFile(MANUAL, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`\nWrote ${MANUAL} — now run: npm run reviews:apply`);
} else {
  console.log(`\nDry run — add --apply to write reviews.manual.json.`);
}
