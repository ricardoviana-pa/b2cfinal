#!/usr/bin/env node
/**
 * i18n audit — keys the code uses that the locale files do not have.
 *
 * Auditoria set/2026 (N12): ~225 keys existed only as English defaults in
 * the components (t('account.x', 'English')), so the eight translations
 * silently showed English. This lists every t('key') / t("key") / i18n key
 * used in client/src and reports, per locale, the ones missing.
 *
 * Usage:
 *   node scripts/i18n-missing.mjs            # report, exit 1 if EN is missing keys
 *   node scripts/i18n-missing.mjs --all      # report every locale, exit 1 if any is missing keys
 *   node scripts/i18n-missing.mjs --json     # machine-readable { key: defaultValue }
 *
 * Dynamic keys (t(`checkout.extras.${sku}.name`)) cannot be resolved
 * statically and are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const LOCALES_DIR = path.join(ROOT, "client", "src", "i18n", "locales");
const LANGS = ["en", "pt", "es", "fr", "it", "de", "nl", "sv", "fi"];
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const JSON_OUT = args.includes("--json");

const files = execSync('find client/src -name "*.tsx" -o -name "*.ts"', { cwd: ROOT }).toString().trim().split("\n");

/** key → default value (or null) as used in code */
const used = new Map();
const CALL_RE = /\bt\(\s*(['"])([a-zA-Z0-9_.-]+)\1\s*(?:,\s*(?:(['"])((?:\\.|(?!\3).)*)\3|\{[^)]*?defaultValue:\s*(['"])((?:\\.|(?!\5).)*)\5))?/g;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of src.matchAll(CALL_RE)) {
    const key = m[2];
    if (!key.includes(".")) continue;
    const def = m[4] ?? m[6] ?? null;
    if (!used.has(key) || (def && !used.get(key))) used.set(key, def);
  }
}

const get = (o, k) => k.split(".").reduce((a, x) => (a == null ? undefined : a[x]), o);
const bundles = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${l}.json`), "utf8"))]));

const report = {};
for (const lang of ALL ? LANGS : ["en"]) {
  const missing = [];
  for (const [key, def] of used) {
    if (key.endsWith(".")) continue; // dynamic prefix (t(`bedType.${x}`)) — not resolvable statically
    const b = bundles[lang];
    const present = get(b, key) !== undefined || ["_one", "_other", "_zero", "_few", "_many"].some((sfx) => get(b, key + sfx) !== undefined);
    if (!present) missing.push([key, def]);
  }
  report[lang] = missing;
}

if (JSON_OUT) {
  console.log(JSON.stringify(Object.fromEntries(report.en.map(([k, d]) => [k, d])), null, 2));
  process.exit(report.en.length ? 1 : 0);
}

let failed = false;
for (const [lang, missing] of Object.entries(report)) {
  if (!missing.length) { console.log(`${lang}: ok (${used.size} keys used)`); continue; }
  failed = true;
  const groups = {};
  for (const [k] of missing) { const g = k.split(".")[0]; groups[g] = (groups[g] || 0) + 1; }
  console.log(`${lang}: ${missing.length} keys used in code but absent — ` + Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}.* (${n})`).join(", "));
  for (const [k, d] of missing) console.log(`  ${k}${d ? `  ← "${d.slice(0, 60)}${d.length > 60 ? "…" : ""}"` : ""}`);
}
process.exit(failed ? 1 : 0);
