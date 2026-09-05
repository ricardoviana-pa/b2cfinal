/**
 * i18n guard — every key in en.json must exist in the other eight locales.
 *
 * This used to copy English into any locale that lacked a key, silently: a
 * page would ship in English in eight languages and nobody would notice
 * (auditoria set/2026, N12). Now it FAILS with the list — add the translation
 * (with `--fix` it fills the gaps with the English text, marked in the log,
 * for a deliberate stop-gap only).
 *
 *   node scripts/sync-i18n.mjs          # check, exit 1 with the list
 *   node scripts/sync-i18n.mjs --fix    # copy EN into the gaps (explicit)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../client/src/i18n/locales");
const FIX = process.argv.includes("--fix");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

function walk(target, source, prefix, missing) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    const full = prefix ? `${prefix}.${key}` : key;
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv)) {
      if (!tv || typeof tv !== "object") { if (FIX) target[key] = {}; else { missing.push(full + ".*"); continue; } }
      walk(FIX ? target[key] : (tv ?? {}), sv, full, missing);
    } else if (!(key in target)) {
      missing.push(full);
      if (FIX) target[key] = sv;
    }
  }
}

let failed = false;
for (const lang of ["pt", "fr", "es", "it", "fi", "de", "nl", "sv"]) {
  const p = path.join(localesDir, `${lang}.json`);
  const loc = JSON.parse(fs.readFileSync(p, "utf8"));
  const missing = [];
  walk(loc, en, "", missing);
  if (missing.length === 0) { console.log(`i18n ${lang}: ok`); continue; }
  if (FIX) {
    fs.writeFileSync(p, JSON.stringify(loc, null, 2) + "\n");
    console.log(`i18n ${lang}: ${missing.length} key(s) filled with ENGLISH — translate them: ${missing.join(", ")}`);
  } else {
    failed = true;
    console.error(`i18n ${lang}: ${missing.length} key(s) missing — ${missing.join(", ")}`);
  }
}
if (failed) {
  console.error("\nsync-i18n: translations missing. Add them to the locale files (or run with --fix for a deliberate English stop-gap).");
  process.exit(1);
}
