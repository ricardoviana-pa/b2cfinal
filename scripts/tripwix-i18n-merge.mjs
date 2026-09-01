#!/usr/bin/env node
/**
 * Merge the authored partner-home translations into the per-language property
 * override files the site actually reads.
 *
 * Authored source: content/tripwix-i18n/<lang>.json, keyed by slug.
 * Live target:     client/src/data/properties.i18n/<lang>.json — the same file
 * the client's mergePropertyOverrides() and the server's loadI18nOverrides()
 * both load. Guesty homes are keyed there by guestyId; partner homes have no
 * guestyId, and both lookups fall back to the slug, so the two keyspaces share
 * one file without colliding.
 *
 * Kept as a separate authored source (not edited in place) so the big
 * generated files can be regenerated without eating the partner copy.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "content", "tripwix-i18n");
const DST = join(process.cwd(), "client", "src", "data", "properties.i18n");

for (const file of readdirSync(SRC).filter((f) => f.endsWith(".json"))) {
  const lang = file.replace(".json", "");
  const authored = JSON.parse(readFileSync(join(SRC, file), "utf-8"));
  const target = join(DST, file);
  const existing = existsSync(target) ? JSON.parse(readFileSync(target, "utf-8")) : {};

  let added = 0;
  for (const [slug, fields] of Object.entries(authored)) {
    if (slug.startsWith("_")) continue;
    existing[slug] = fields;
    added++;
  }
  writeFileSync(target, JSON.stringify(existing, null, 2) + "\n");
  console.log(`${lang}: ${added} partner entries merged (${Object.keys(existing).length} total)`);
}
