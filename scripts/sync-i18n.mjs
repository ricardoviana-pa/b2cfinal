/**
 * Merge missing keys from en.json into all other locale files (preserves existing translations).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../client/src/i18n/locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

function deepMergeMissing(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv)) {
      if (!tv || typeof tv !== "object") target[key] = {};
      deepMergeMissing(target[key], sv);
    } else if (!(key in target)) {
      target[key] = sv;
    }
  }
}

for (const lang of ["pt", "fr", "es", "it", "fi", "de", "nl", "sv"]) {
  const p = path.join(localesDir, `${lang}.json`);
  const loc = JSON.parse(fs.readFileSync(p, "utf8"));
  deepMergeMissing(loc, en);
  fs.writeFileSync(p, JSON.stringify(loc, null, 2) + "\n");
}
console.log("i18n: merged missing keys from en into pt, fr, es, it, fi, de, nl, sv");
