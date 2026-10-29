/**
 * performance-08-non-en-hydration-waterfall: the browser no longer downloads
 * en.json as a fallback on non-English pages (client/src/i18n/index.ts), while
 * the server still renders with English as fallbackLng (entry-server.tsx).
 * That is only safe while every language has every key en.json has — the same
 * rule scripts/sync-i18n.mjs enforces at build time. These tests pin it, and
 * check that every string resolves the same with and without the fallback, so
 * the server HTML and the hydrated page cannot differ.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";

const LOCALES = ["pt", "fr", "es", "it", "fi", "de", "nl", "sv"] as const;
const read = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "client/src/i18n/locales", `${lang}.json`), "utf8"));
const en = read("en");

type Leaf = { key: string; value: unknown };
function leaves(obj: Record<string, unknown>, prefix = ""): Leaf[] {
  const out: Leaf[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leaves(v as Record<string, unknown>, key));
    else out.push({ key, value: v });
  }
  return out;
}
const get = (obj: any, key: string) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

async function instance(lng: string, withEnglish: boolean) {
  const i = i18next.createInstance();
  await i.init({
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: { [lng]: { translation: read(lng) }, ...(withEnglish ? { en: { translation: en } } : {}) },
  });
  return i;
}

const enLeaves = leaves(en);
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe("every language carries every English key", () => {
  for (const lang of LOCALES) {
    it(`${lang}: no key of en.json is missing, empty or of another shape`, () => {
      const loc = read(lang);
      const problems: string[] = [];
      for (const { key, value } of enLeaves) {
        const v = get(loc, key);
        if (v === undefined || v === null) problems.push(`missing ${key}`);
        else if (v === "") problems.push(`empty ${key}`);
        else if (Array.isArray(v) !== Array.isArray(value) || typeof v !== typeof value) problems.push(`shape ${key}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

describe("the English fallback never changes a string (server renders with it, the browser without)", () => {
  for (const lang of LOCALES) {
    it(`${lang}: t() is identical with and without en loaded`, async () => {
      const withEn = await instance(lang, true);
      const withoutEn = await instance(lang, false);
      const diffs: string[] = [];
      const plainKeys = enLeaves.filter((l) => !PLURAL.test(l.key)).map((l) => l.key);
      const pluralBases = [...new Set(enLeaves.filter((l) => PLURAL.test(l.key)).map((l) => l.key.replace(PLURAL, "")))];
      for (const key of plainKeys) {
        const a = withEn.t(key, { returnObjects: true });
        const b = withoutEn.t(key, { returnObjects: true });
        if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(key);
      }
      for (const key of pluralBases) {
        for (const count of [0, 1, 2, 3, 5, 7, 12, 21, 100, 1000]) {
          const a = withEn.t(key, { count, num: String(count), name: "X", price: "1" });
          const b = withoutEn.t(key, { count, num: String(count), name: "X", price: "1" });
          if (a !== b) diffs.push(`${key} (count ${count})`);
        }
      }
      expect(diffs).toEqual([]);
    });
  }

  it("the browser bootstrap no longer awaits en.json on other languages", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "client/src/i18n/index.ts"), "utf8");
    expect(src).not.toMatch(/await loaders\.en\(\)/);
    // …while a later switch to English still loads it on demand.
    expect(src).toMatch(/const mod = await loaders\[lng as Lang\]\(\)/);
  });
});
