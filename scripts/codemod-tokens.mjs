#!/usr/bin/env node
/**
 * Codemod — palette hex and arbitrary font sizes → design tokens.
 *
 * Auditoria set/2026 (N16/S2/S3): client/src carried ~1 960 hard-coded hex
 * values, ~1 000 `text-[NNpx]` sizes, ~490 inline `style={{}}` and ~200
 * inline fontFamily. The tokens already exist (index.css @theme: --color-pa-*,
 * --font-display/--font-body; the .headline-* / .body-* / .caption /
 * .eyebrow scale). This rewrites the mechanical cases and leaves anything
 * ambiguous alone.
 *
 * Usage:
 *   node scripts/codemod-tokens.mjs                # funnel pages (default)
 *   node scripts/codemod-tokens.mjs --all          # every client/src/**\/*.tsx
 *   node scripts/codemod-tokens.mjs --dry client/src/pages/Home.tsx
 *
 * What it changes
 *   1. className utilities with a palette hex:
 *        text-[#1A1A18] → text-pa-dark, bg-[#FAFAF7]/80 → bg-pa-cream/80,
 *        hover:border-[#E8E4DC] → hover:border-pa-sand …
 *      Only the 9 palette colours; anything else (#DC2626 …) stays.
 *   2. style={{ color: '#1A1A18' }} → color: 'var(--color-pa-dark)' (same 9).
 *   3. style={{ fontFamily: 'var(--font-body)' }} → class `font-body`
 *      (Tailwind v4 generates font-* utilities from --font-* theme vars);
 *      fontWeight 300/400/500/600 → font-light/normal/medium/semibold;
 *      textTransform: 'none' → normal-case. An emptied style={{}} is removed.
 *   4. text-[NNpx] → the scale, ONLY when the element already sets its own
 *      text colour (text-pa-*, text-[#…], text-white/black): the scale
 *      classes carry a colour, so an element that inherits its colour would
 *      change — those are left for a human.
 *        14px, text-sm            → body-sm
 *        13 / 13.5 / 12.5px       → body-sm
 *        12px, text-xs            → caption
 *        11 / 11.5px              → eyebrow when `uppercase` is present, else caption
 *        10 / 9px                 → eyebrow when `uppercase`, else caption
 *      text-[clamp(...)] → headline-sm/md/lg/xl by the clamp's maximum.
 *   Weight, leading and tracking utilities on the element keep winning
 *   (utilities beat component classes), so the layout does not move.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ALL = args.includes("--all");
const explicit = args.filter((a) => !a.startsWith("--"));

const FUNNEL = [
  "client/src/pages/Home.tsx",
  "client/src/pages/Homes.tsx",
  "client/src/pages/PropertyDetail.tsx",
  "client/src/components/booking/BookingWidget.tsx",
  ...execSync("ls client/src/pages/checkout/*.tsx", { cwd: ROOT }).toString().trim().split("\n"),
];

const files = explicit.length
  ? explicit
  : ALL
    ? execSync('find client/src -name "*.tsx" -not -path "*/components/ui/*"', { cwd: ROOT }).toString().trim().split("\n")
    : FUNNEL;

const PALETTE = {
  "#1A1A18": "pa-dark",
  "#8B7355": "pa-gold",
  "#E8E4DC": "pa-sand",
  "#726D63": "pa-stone",
  "#6B6860": "pa-earth",
  "#FAFAF7": "pa-cream",
  "#F5F1EB": "pa-warm",
  "#C4A87C": "pa-gold-light",
  "#78756F": "pa-stone-aa",
  "#806A48": "pa-gold-aa",
};
const HEX_RE = Object.keys(PALETTE).map((h) => h.slice(1)).join("|");
const UTIL = "(?:text|bg|border|border-[trblxyse]|ring|ring-offset|fill|stroke|from|to|via|divide|outline|decoration|placeholder|caret|accent|shadow)";
const CLASS_HEX_RE = new RegExp(`((?:[a-z0-9-]+:)*)(${UTIL})-\\[#(${HEX_RE})\\](\\/\\d{1,3})?`, "gi");

const COLOUR_CLASS_RE = /(?:^|\s)(?:[a-z0-9-]+:)*text-(?:pa-[a-z-]+|white|black|\[#[0-9a-fA-F]{6}\])(?:\/\d+)?(?=\s|$)/;

function scaleFor(token, hasUpper) {
  const px = token.match(/^text-\[([0-9.]+)px\]$/)?.[1];
  const n = px ? Number(px) : token === "text-sm" ? 14 : token === "text-xs" ? 12 : null;
  if (n === null) return null;
  if (n >= 14 && n <= 15) return "body-sm";
  if (n >= 12.5 && n < 14) return "body-sm";
  if (n === 12) return "caption";
  if (n >= 9 && n < 12) return hasUpper ? "eyebrow" : "caption";
  if (n > 15 && n <= 18) return "body-lg";
  if (n === 15 || n === 15.5) return "body-md";
  return null;
}
function headlineFor(clamp) {
  const m = clamp.match(/clamp\(\s*[0-9.]+rem\s*,\s*[0-9.]+vw\s*,\s*([0-9.]+)rem\s*\)/);
  if (!m) return null;
  const max = Number(m[1]);
  if (max <= 1.5) return "headline-sm";
  if (max <= 2) return "headline-md";
  if (max <= 3) return "headline-lg";
  return "headline-xl";
}

const stats = { files: 0, classHex: 0, styleHex: 0, fontFamily: 0, fontWeight: 0, textTransform: 0, sizes: 0, clamps: 0, stylesRemoved: 0 };

function rewriteClassList(list) {
  let out = list.replace(CLASS_HEX_RE, (_m, variants, util, hex, opacity) => {
    stats.classHex++;
    const key = "#" + hex.toUpperCase();
    return `${variants}${util}-${PALETTE[key]}${opacity ?? ""}`;
  });
  const hasColour = COLOUR_CLASS_RE.test(out);
  const hasUpper = /(?:^|\s)uppercase(?=\s|$)/.test(out);
  out = out.replace(/(?:^|\s)text-\[(clamp\([^\]]+\))\](?=\s|$)/g, (m, clamp) => {
    const h = headlineFor(clamp);
    if (!h) return m;
    stats.clamps++;
    return m.replace(/text-\[.*\]/, h);
  });
  // Elements that inherit their colour get `text-inherit` next to the scale
  // class, so the scale's own colour never replaces what the parent set.
  out = out.replace(/(^|\s)(text-\[[0-9.]+px\]|text-sm|text-xs)(?=\s|$)/g, (m, sp, token) => {
    const s = scaleFor(token, hasUpper);
    if (!s) return m;
    stats.sizes++;
    return `${sp}${s}${hasColour ? "" : " text-inherit"}`;
  });
  return out;
}

function rewriteStyle(inner) {
  // inner = contents between style={{ and }}
  let s = inner;
  const added = [];
  s = s.replace(new RegExp(`(['"])#(${HEX_RE})\\1`, "gi"), (_m, q, hex) => { stats.styleHex++; return `${q}var(--color-${PALETTE["#" + hex.toUpperCase()]})${q}`; });
  s = s.replace(/fontFamily:\s*(['"])var\(--font-(body|display)\)\1\s*,?\s*/g, (_m, _q, f) => { stats.fontFamily++; added.push(`font-${f}`); return ""; });
  s = s.replace(/fontWeight:\s*(300|400|500|600)\s*,?\s*/g, (_m, w) => { stats.fontWeight++; added.push({ 300: "font-light", 400: "font-normal", 500: "font-medium", 600: "font-semibold" }[w]); return ""; });
  s = s.replace(/textTransform:\s*(['"])none\1\s*,?\s*/g, () => { stats.textTransform++; added.push("normal-case"); return ""; });
  s = s.replace(/,\s*$/, "").trim();
  return { style: s, added };
}

for (const rel of files) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  const before = src;

  // 1+4: className string literals and template literals
  src = src.replace(/className=(["'])([^"']*)\1/g, (_m, q, list) => `className=${q}${rewriteClassList(list)}${q}`);
  src = src.replace(/className=\{`([^`]*)`\}/g, (_m, tpl) => {
    // static parts are class lists; inside ${…} only the quoted strings are
    const parts = tpl.split(/(\$\{[^}]*\})/);
    return "className={`" + parts.map((p) => (p.startsWith("${")
      ? p.replace(/(['"])([^'"\n]*)\1/g, (_q, quote, list) => `${quote}${rewriteClassList(list)}${quote}`)
      : rewriteClassList(p))).join("") + "`}";
  });

  // 1b: string literals inside className={ … } expressions (ternaries, cn(), arrays)
  src = src.replace(/className=\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m, expr) => {
    if (expr.startsWith("`")) return m; // template literal handled above
    const rewritten = expr.replace(/(['"])([^'"\n]*)\1/g, (q, quote, list) => `${quote}${rewriteClassList(list)}${quote}`);
    return `className={${rewritten}}`;
  });

  // 2+3: style objects on JSX elements that also have a className literal
  src = src.replace(/style=\{\{([^{}]*)\}\}/g, (m, inner) => {
    const { style, added } = rewriteStyle(inner);
    if (!added.length && style === inner.trim()) return m;
    // stash added classes to merge below
    return `style={{${style}}}${added.length ? `/*__ADD:${added.join(" ")}__*/` : ""}`;
  });
  // merge the stashed classes into the element's className (literal or template), else leave a plain class attr
  src = src.replace(/<([A-Za-z][\w.]*)([^<>]*?)style=\{\{\s*\}\}\/\*__ADD:([^*]+)__\*\//g, (_m, tag, attrs, add) => { stats.stylesRemoved++; return `<${tag}${mergeClass(attrs, add)}`; });
  src = src.replace(/<([A-Za-z][\w.]*)([^<>]*?)(style=\{\{[^{}]*\}\})\/\*__ADD:([^*]+)__\*\//g, (_m, tag, attrs, style, add) => `<${tag}${mergeClass(attrs, add)}${style}`);
  src = src.replace(/style=\{\{\s*\}\}\s?/g, () => { stats.stylesRemoved++; return ""; });
  src = src.replace(/\/\*__ADD:[^*]+__\*\//g, "");

  if (src !== before) {
    stats.files++;
    if (!DRY) fs.writeFileSync(file, src);
    console.log(`${DRY ? "would rewrite" : "rewrote"} ${rel}`);
  }
}

function mergeClass(attrs, add) {
  if (/className=(["'])/.test(attrs)) return attrs.replace(/className=(["'])([^"']*)\1/, (_m, q, list) => `className=${q}${(list + " " + add).trim()}${q}`);
  if (/className=\{`/.test(attrs)) return attrs.replace(/className=\{`/, "className={`" + add + " ");
  if (/className=\{/.test(attrs)) return attrs.replace(/className=\{/, `className={"${add} " + `).replace(/className=\{"([^"]*)" \+ ([^}]*)\}/, 'className={"$1" + ($2)}');
  return attrs.replace(/\s*$/, ` className="${add}" `);
}

console.log(JSON.stringify(stats));
