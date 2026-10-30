/**
 * Every i18n key the code asks for exists in all nine languages.
 *
 * scripts/sync-i18n.mjs and i18n-locale-completeness.test.ts check that the
 * other eight languages have every key en.json has. A key missing from
 * en.json itself passed both, and i18next then shows the key: the
 * catalogue's ItemList JSON-LD was named "nav.homes" in all nine languages
 * and the corporate page's first breadcrumb "nav.home" (verificação em
 * produção, 29 out 2026, Broad P2). A key that only lived as an English
 * default, t('k', 'English'), passed too, and showed English in the other
 * eight languages.
 *
 * So: every literal t('ns.key') in client/src and shared — with or without a
 * default — must resolve in every locale file. Plural forms (_one/_other)
 * and object nodes (returnObjects) count as present. Dynamic keys
 * (t(`bedType.${x}`)) cannot be checked statically and are skipped, as is a
 * prefix that ends in a dot.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const PLURAL = ["_zero", "_one", "_two", "_few", "_many", "_other"];
const read = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/i18n/locales", `${lang}.json`), "utf8"));
const get = (obj: any, key: string) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const present = (bundle: any, key: string) =>
  get(bundle, key) !== undefined || PLURAL.some((sfx) => get(bundle, key + sfx) !== undefined);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") sourceFiles(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

/** t('key'), t("key"), t(`key`), i18n.t('key'), props.t('key'): the literal
 *  must be the whole first argument (a `,` or `)` follows it). */
const CALL = /(?<![A-Za-z0-9_$])(?:[A-Za-z0-9_$]+\.)?t\(\s*(['"`])([A-Za-z0-9_.:-]+)\1\s*(?=[,)])/g;

interface Use { key: string; where: string }

function literalKeys(): Use[] {
  const uses: Use[] = [];
  for (const dir of ["client/src", "shared"]) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(CALL)) {
        const key = m[2];
        if (key.startsWith(".") || key.endsWith(".") || key.includes("..")) continue;
        const line = src.slice(0, m.index).split("\n").length;
        uses.push({ key, where: `${path.relative(ROOT, file)}:${line}` });
      }
    }
  }
  return uses;
}

describe("every i18n key the code uses exists in every language", () => {
  const uses = literalKeys();

  it("the scan sees the site's calls (sanity)", () => {
    expect(uses.length).toBeGreaterThan(1000);
    expect(uses.some((u) => u.key === "property.priceOnRequest")).toBe(true);
  });

  for (const lang of LANGS) {
    it(`${lang}.json has every key client/src and shared ask for`, () => {
      const bundle = read(lang);
      const missing: Record<string, string[]> = {};
      for (const u of uses) {
        if (present(bundle, u.key)) continue;
        (missing[u.key] ??= []).push(u.where);
      }
      expect(missing).toEqual({});
    });
  }
});

describe("the structured data of the catalogue and the corporate page is named from the translations", () => {
  const src = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

  it("Homes.tsx: the ItemList name and the breadcrumb names are t() calls, not English literals", () => {
    const homes = src("client/src/pages/Homes.tsx");
    expect(homes).toMatch(/'@type': 'ItemList',\s*name: t\(/);
    // buildBreadcrumbSchema([{ name: 'Home', item: '/' }, { name: 'Homes' }]) shipped English in nine languages.
    expect(homes).not.toMatch(/\{\s*name:\s*['"][A-Za-z ]+['"]/);
  });

  it("CorporateRetreats.tsx: the first breadcrumb is a key that exists", () => {
    const corporate = src("client/src/pages/CorporateRetreats.tsx");
    const key = corporate.match(/buildBreadcrumbSchema\(\[\{ name: t\('([^']+)'\)/)?.[1];
    expect(key).toBeTruthy();
    for (const lang of LANGS) expect(typeof get(read(lang), key!), `${lang}: ${key}`).toBe("string");
  });
});
