#!/usr/bin/env node
/**
 * Blog-post generator — the content engine for a one-person marketing team.
 *
 * Drafts one seasonal, booking-oriented article grounded in REAL homes from
 * the live catalogue: every post names 2–3 bookable homes (with links), a
 * season hook, and practical local substance. Appends to blog.json as a
 * draft-reviewable entry; run scripts/refresh-translations.mjs --type=blog
 * afterwards to fan it out to the 9 locales, commit, and the deploy ships it.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-blog-post.mjs \
 *     --topic="Where to stay for the Douro harvest" \
 *     --slugs=alvarinho-villa-...,carcavelos-house-...   (optional home slugs)
 *     --category=destinations                            (default: destinations)
 *     --date=2026-09-01                                  (default: today)
 */
import { readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("Missing ANTHROPIC_API_KEY."); process.exit(1); }
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=")];
}));
if (!args.topic) { console.error("Missing --topic."); process.exit(1); }

const PROPS = JSON.parse(readFileSync("client/src/data/properties.json", "utf8"))
  .filter(p => p.isActive !== false && !/test/i.test(p.name));
const wanted = args.slugs ? args.slugs.split(",") : [];
const homes = (wanted.length
  ? PROPS.filter(p => wanted.includes(p.slug))
  : PROPS.sort(() => 0).slice(0, 3)   // caller usually passes slugs; fallback: first 3
).slice(0, 3);

const homeFacts = homes.map(h =>
  `- ${h.name} (/homes/${h.slug}): ${h.locality}, ${h.bedrooms}br/${h.maxGuests} guests. ${String(h.description || "").slice(0, 300)}`
).join("\n");

const SYSTEM = `You write for the journal of Portugal Active, a company operating luxury
private homes in Portugal. British English. Confident, specific, warm — never
listicle-speak, never "hidden gem", "bucket list", "nestled", "breathtaking".
The reader is affluent and time-poor. 700–900 words, markdown with ## headings.
Weave in the provided homes naturally (markdown links to their paths) — the
article exists to convert readers into direct bookings without reading like an ad.
End with one short practical section (getting there / when to go).
Return STRICT JSON:
{"title": "...", "slug": "kebab-case-slug", "excerpt": "1-2 sentences",
 "seoTitle": "≤60 chars", "seoDescription": "≤155 chars", "content": "markdown",
 "readTime": <minutes int>, "tags": ["...","..."]}`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model: "claude-sonnet-5", max_tokens: 4000, system: SYSTEM,
    messages: [{ role: "user", content: `TOPIC: ${args.topic}\n\nHOMES TO FEATURE:\n${homeFacts}` }],
  }),
});
if (!res.ok) { console.error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const data = await res.json();
const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
// Escape raw control characters the model sometimes leaves inside string
// literals (valid outside strings, fatal inside them).
function repairJson(str) {
  let out = "", inStr = false, esc = false;
  for (const ch of str) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      if (ch < " ") continue;
      out += ch; continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}
const rawJson = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
let post;
try { post = JSON.parse(rawJson); } catch { post = JSON.parse(repairJson(rawJson)); }

const blogFile = JSON.parse(readFileSync("client/src/data/blog.json", "utf8"));
const blog = Array.isArray(blogFile) ? blogFile : blogFile.articles;
if (blog.some(a => a.slug === post.slug)) { console.error(`Slug exists: ${post.slug}`); process.exit(1); }
const maxId = Math.max(...blog.map(a => Number(a.id) || 0));
blog.unshift({
  id: String(maxId + 1),
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  content: post.content,
  category: args.category || "destinations",
  destinationTag: homes[0]?.destination || null,
  tags: post.tags || [],
  // Shape must match existing articles — BlogArticle reads author.name/.role.
  author: { id: "ba1", name: "Portugal Active Team", photo: "", bio: "The team behind Portugal Active.", role: "Editorial Team" },
  publishDate: args.date || new Date().toISOString().slice(0, 10),
  readTime: post.readTime || 5,
  status: "published",
  isFeatured: false,
  coverImage: homes[0]?.images?.[0] || null,
  featuredImage: homes[0]?.images?.[0] || null,
  seoTitle: post.seoTitle,
  seoDescription: post.seoDescription,
});
const out = Array.isArray(blogFile) ? blog : { ...blogFile, articles: blog };
writeFileSync("client/src/data/blog.json", JSON.stringify(out, null, 2) + "\n");
console.log(`✓ "${post.title}" → /blog/${post.slug}`);
console.log("Next: node scripts/refresh-translations.mjs --type=blog  → review diff → commit.");
